import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Storage } from "@google-cloud/storage";
import { OAuth2Client } from "google-auth-library";

const app = express();
const PORT = process.env.PORT || 3001;

// Configuracion nombre bucket Google Cloud Storage.
const BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
if (!BUCKET_NAME) {
  console.warn("GCS_BUCKET_NAME no definido. Endpoints de audio deshabilitados temporalmente.");
}
if (!GOOGLE_CLIENT_ID) {
  console.warn("GOOGLE_CLIENT_ID no definido. Login con Google deshabilitado.");
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
const storage = BUCKET_NAME ? new Storage() : null;
const bucket = BUCKET_NAME ? storage.bucket(BUCKET_NAME) : null;
const googleAuthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

function slugify(s = "") {
  return s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "_");
}

function isInstitutionalEmail(value = "") {
  return value.toLowerCase().endsWith(".eadic@gmail.com");
}

app.post("/api/auth/google", async (req, res) => {
  try {
    if (!googleAuthClient || !GOOGLE_CLIENT_ID) {
      return res.status(503).json({ ok: false, error: "Login con Google no configurado en servidor" });
    }

    const { credential } = req.body || {};
    if (!credential) {
      return res.status(400).json({ ok: false, error: "credential es requerido" });
    }

    const ticket = await googleAuthClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ ok: false, error: "Token de Google invalido" });
    }

    const email = (payload.email || "").toLowerCase().trim();
    if (!payload.email_verified || !email) {
      return res.status(401).json({ ok: false, error: "Google no devolvio un correo verificado" });
    }

    if (!isInstitutionalEmail(email)) {
      return res.status(403).json({
        ok: false,
        error: "Solo se permiten correos institucionales que terminen en .eadic@gmail.com",
      });
    }

    const fullName = (payload.name || email.split("@")[0] || "").trim();
    return res.json({
      ok: true,
      user: {
        email,
        fullName,
        picture: payload.picture || "",
        googleId: payload.sub || "",
      },
    });
  } catch (err) {
    console.error("Google auth error:", err.message);
    return res.status(401).json({ ok: false, error: "No se pudo validar el login de Google" });
  }
});

// Creacion Signed URL para subir desde React a Google Cloud Storage
app.post("/api/uploads/signed-url", async (req, res) => {
  try {
    if (!bucket || !BUCKET_NAME) {
      return res.status(503).json({ ok: false, error: "Uploads deshabilitados: falta GCS_BUCKET_NAME" });
    }

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

// 2) (Opcional) Confirmacion de subida / registro
app.post("/api/uploads/complete", async (req, res) => {
  try {
    if (!bucket || !BUCKET_NAME) {
      return res.status(503).json({ ok: false, error: "Uploads deshabilitados: falta GCS_BUCKET_NAME" });
    }

    const { objectPath } = req.body;
    if (!objectPath) return res.status(400).json({ ok: false, error: "objectPath requerido" });

    // Verifica que exista en GCS
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).json({ ok: false, error: "Objeto no encontrado en GCS" });

    // Aqui es donde luego guardarias en DB: userId, fecha, gcs_uri, status...
    return res.json({ ok: true, message: "Subida confirmada", objectPath });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
  if (BUCKET_NAME) {
    console.log(`Bucket: ${BUCKET_NAME}`);
  } else {
    console.log("Bucket no configurado (modo solo login)");
  }
});
