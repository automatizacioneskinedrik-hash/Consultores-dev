import path from "path";
import { v4 as uuidv4 } from "uuid";
import { bucket, BUCKET_NAME } from "../config/storage.js";
import { db } from "../config/firebase.js";
import { normalizeEmailValue, slugify } from "../utils/helpers.js";
import { logChange } from "../services/auditLog.js";
import { processAudioAnalysis } from "../services/analysisService.js";
import { startAnalysisStatus } from "../services/analysisStatus.js";

export const getSignedUrl = async (req, res) => {
  try {
    const { originalName, contentType, userId, meetingType } = req.body;

    if (!originalName || !contentType) {
      return res.status(400).json({ ok: false, error: "originalName y contentType son requeridos" });
    }

    if (!contentType.startsWith("audio/")) {
      return res.status(400).json({ ok: false, error: "Solo se permiten archivos de audio" });
    }

    const safeUser = slugify(userId || "anonymous");
    const safeMeeting = slugify(meetingType || "general");
    const ext = path.extname(originalName) || "";
    const id = uuidv4();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    if (!bucket) {
      return res.status(503).json({ ok: false, error: "Servicio de almacenamiento no configurado" });
    }
    const objectPath = `audios/${safeUser}/${yyyy}/${mm}/${dd}/${id}${ext}`;
    const file = bucket.file(objectPath);

    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 10 * 60 * 1000,
      contentType,
    });

    return res.json({
      ok: true,
      uploadUrl,
      bucket: BUCKET_NAME,
      objectPath,
      gcsUri: `gs://${BUCKET_NAME}/${objectPath}`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

export const completeUpload = async (req, res) => {
  try {
    const { objectPath } = req.body;
    if (!objectPath) return res.status(400).json({ ok: false, error: "objectPath requerido" });

    // The call belongs to whoever uploads it, unless a role that sees everyone uploads it for someone else.
    const uploadedBy = req.requester.email;
    let userEmail = uploadedBy;
    let ownerName = req.requester.user?.name || "";
    const requestedOwner = normalizeEmailValue(req.body.ownerEmail);
    if (requestedOwner && requestedOwner !== uploadedBy) {
      if (!req.requester.cargo.seesAll) {
        return res.status(403).json({ ok: false, error: "Tu rol no permite subir llamadas a nombre de otra persona." });
      }
      const owner = await db.collection("users").where("email", "==", requestedOwner).limit(1).get();
      if (owner.empty) return res.status(400).json({ ok: false, error: "La persona elegida no está registrada." });
      userEmail = requestedOwner;
      ownerName = owner.docs[0].data().name || requestedOwner;
      await logChange(req.requester, "session.upload_for", `Subió una llamada a nombre de ${owner.docs[0].data().name || requestedOwner}`, { objectPath, ownerEmail: requestedOwner });
    }

    if (!bucket) {
      return res.status(503).json({ ok: false, error: "Servicio de almacenamiento no configurado" });
    }
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).json({ ok: false, error: "Objeto no encontrado en GCS" });

    await startAnalysisStatus(objectPath, { fileName: req.body.fileName, userEmail, uploadedBy, ownerName });

    const [metadata] = await file.getMetadata();
    const fileSizeBytes = parseInt(metadata.size || 0);
    // ~30 MB ≈ 45 minutes at typical voice recording bitrates (64-96 kbps)
    const isLargeFile = fileSizeBytes > 30 * 1024 * 1024;

    if (isLargeFile) {
      // Long audio: return immediately so Cloud Run doesn't hit the request timeout.
      // Processing continues in the background container.
      processAudioAnalysis(objectPath, userEmail, { uploadedBy }).catch((err) => {
        console.error("Background analysis error:", err);
      });
      return res.json({ ok: true, isLargeFile: true });
    }

    // Short audio: wait for completion so the frontend can show the report immediately.
    const report = await processAudioAnalysis(objectPath, userEmail, { uploadedBy });
    return res.json({ ok: true, isLargeFile: false, report: report || null });
  } catch (err) {
    console.error("Error en complete:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
