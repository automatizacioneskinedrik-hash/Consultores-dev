import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Storage } from "@google-cloud/storage";
import { BigQuery } from "@google-cloud/bigquery";

const bigquery = new BigQuery({ projectId: process.env.GCP_PROJECT_ID });
const app = express();
const PORT = process.env.PORT || 3001;

const BUCKET_NAME = process.env.GCS_BUCKET_NAME;
if (!BUCKET_NAME) {
  console.error("Missing GCS_BUCKET_NAME in environment variables");
  process.exit(1);
}

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(morgan("dev"));
app.use(express.json());

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

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: "Email requerido" });

    const query = `
      SELECT email, estado
      FROM \`${process.env.GCP_PROJECT_ID}.${process.env.BQ_DATASET}.${process.env.BQ_TABLE}\`
      WHERE LOWER(email) = @email
      LIMIT 1
    `;

    const options = { query, params: { email } };
    const [rows] = await bigquery.query(options);

    if (!rows.length) {
      return res.status(401).json({ ok: false, error: "Correo no autorizado" });
    }

    const user = rows[0];
    if (!user.estado) {
      return res.status(403).json({ ok: false, error: "Usuario inactivo" });
    }

    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error validando usuario" });
  }
});

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

    const objectPath = `audios/${safeUser}/${yyyy}/${mm}/${dd}/${safeMeeting}/${id}${ext}`;
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
});

app.post("/api/uploads/complete", async (req, res) => {
  try {
    const { objectPath } = req.body;
    if (!objectPath) return res.status(400).json({ ok: false, error: "objectPath requerido" });

    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).json({ ok: false, error: "Objeto no encontrado en GCS" });

    return res.json({ ok: true, message: "Subida confirmada", objectPath });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en puerto ${PORT}`);
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`CORS_ORIGIN: ${allowedOrigins.join(", ")}`);
});
