import path from "path";
import { v4 as uuidv4 } from "uuid";
import { bucket, BUCKET_NAME } from "../config/storage.js";
import { slugify } from "../utils/helpers.js";
import { processAudioAnalysis } from "../services/analysisService.js";

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
    const { objectPath, userEmail } = req.body;
    if (!objectPath) return res.status(400).json({ ok: false, error: "objectPath requerido" });

    if (!bucket) {
      return res.status(503).json({ ok: false, error: "Servicio de almacenamiento no configurado" });
    }
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).json({ ok: false, error: "Objeto no encontrado en GCS" });

    await processAudioAnalysis(objectPath, userEmail);

    return res.json({ ok: true, message: "Análisis completado y correo enviado." });
  } catch (err) {
    console.error("Error en complete:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
