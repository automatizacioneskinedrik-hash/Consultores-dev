import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Storage } from "@google-cloud/storage";

const app = express();
const PORT = process.env.PORT || 3001;

// Configuración nombre bucket Google Cloud Storage.
const BUCKET_NAME = process.env.GCS_BUCKET_NAME;
if (!BUCKET_NAME) {
  console.error("❌ Falta GCS_BUCKET_NAME en .env");
  process.exit(1);
}

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);

app.use(morgan("dev"));
app.use(express.json());


// Credenciales cliente Google Cloud Storage.
const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);

function slugify(s = "") {
  return s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "_");
}

// Creación Signed URL para subir desde React a Google Cloud Storage
app.post("/api/uploads/signed-url", async (req, res) => {
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

    // Ruta final al bucket de Google Cloud Storage
    const objectPath = `audios/${safeUser}/${yyyy}/${mm}/${dd}/${safeMeeting}/${id}${ext}`;

    const file = bucket.file(objectPath);

    // Signed URL v4 para PUT (subida)
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 10 * 60 * 1000, // 10 minutos
      contentType, // obliga a que el PUT use ese content-type
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
});

// 2) (Opcional) Confirmación de subida / registro
app.post("/api/uploads/complete", async (req, res) => {
  try {
    const { objectPath } = req.body;
    if (!objectPath) return res.status(400).json({ ok: false, error: "objectPath requerido" });

    // Verifica que exista en GCS
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).json({ ok: false, error: "Objeto no encontrado en GCS" });

    // Aquí es donde luego guardarías en DB: userId, fecha, gcs_uri, status...
    return res.json({ ok: true, message: "Subida confirmada", objectPath });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
  console.log(`✅ Bucket: ${BUCKET_NAME}`);
});