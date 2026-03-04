import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Storage } from "@google-cloud/storage";
import admin from "firebase-admin";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import fs from "fs-extra";
import os from "os";

// Initialize Firebase Admin
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 3001;

const BUCKET_NAME = process.env.GCS_BUCKET_NAME;
if (!BUCKET_NAME) {
  console.warn("ADVERTENCIA: GCS_BUCKET_NAME no detectado. Las funciones de subida de archivos estarán deshabilitadas.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || "587"),
  secure: process.env.EMAIL_PORT === "465",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log("CORS bloqueó el origen:", origin);
        callback(new Error("No permitido por CORS"));
      }
    },
    credentials: true,
  })
);

app.use(morgan("dev"));
app.use(express.json());

// Global error handler for middleware errors (like CORS)
app.use((err, req, res, next) => {
  if (err.message === "No permitido por CORS") {
    return res.status(403).json({ ok: false, error: err.message });
  }
  console.error("Error global:", err);
  res.status(500).json({ ok: false, error: "Error interno del servidor" });
});

let storage;
let bucket;
if (BUCKET_NAME) {
  storage = new Storage({
    projectId: process.env.GCP_PROJECT_ID,
    credentials: serviceAccount,
  });
  bucket = storage.bucket(BUCKET_NAME);
}

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

    // Query Firestore for authorized users
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("email", "==", email).limit(1).get();

    if (snapshot.empty) {
      return res.status(401).json({ ok: false, error: "No estás registrado en la plataforma. Por favor, escribe al administrador para que te registre." });
    }

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    // In a real app, you might check for an 'active' status or similar
    // For now, if they are in the 'users' collection, they are authorized.

    return res.json({
      ok: true,
      user: {
        id: userDoc.id,
        email: user.email,
        name: user.name || "",
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
});

app.post("/api/uploads/complete", async (req, res) => {
  try {
    const { objectPath, userEmail } = req.body;
    if (!objectPath) return res.status(400).json({ ok: false, error: "objectPath requerido" });

    if (!bucket) {
      return res.status(503).json({ ok: false, error: "Servicio de almacenamiento no configurado" });
    }
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).json({ ok: false, error: "Objeto no encontrado en GCS" });

    // Respond immediately to the client
    res.json({ ok: true, message: "Subida confirmada, procesando transcripción y análisis..." });

    // Background process: Transcription, Analysis, Save to Firestore, Send Email
    processAudioAnalysis(objectPath, userEmail).catch(err => {
      console.error("Error in background analysis process:", err);
    });

  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
});

async function processAudioAnalysis(objectPath, userEmail) {
  console.log(`Starting analysis for ${objectPath} (User: ${userEmail})`);
  const tempFilePath = path.join(os.tmpdir(), `audio_${uuidv4()}${path.extname(objectPath)}`);

  try {
    // 1. Download file from GCS
    await bucket.file(objectPath).download({ destination: tempFilePath });
    console.log("File downloaded to temp path:", tempFilePath);

    // 2. Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
    });
    console.log("Transcription completed");

    // 3. Analyze with GPT-4o
    const prompt = `Analiza la siguiente transcripción de una reunión de ventas y devuelve un JSON estructurado con los siguientes campos:
{
  "nombre_cliente": "Nombre del cliente identificado en la reunión",
  "temperatura": "FRÍO / TIBIO / CALIENTE (determinado por el tono y palabras)",
  "resumen": "Resumen ejecutivo de 3-4 líneas",
  "participacion": {
    "consultor_pct": "porcentaje %",
    "cliente_pct": "porcentaje %",
    "duracion_total": "duración en minutos/segundos"
  },
  "necesidades": ["lista de necesidades detectadas"],
  "objeciones": ["lista de objeciones o dudas"],
  "proximos_pasos": {
    "consultor": ["qué debe hacer el consultor"],
    "cliente": ["qué debe hacer el cliente"],
    "fechas_mencionadas": ["fechas si se dijeron"]
  },
  "alertas": ["cosas críticas: competidores, presupuestos fuertes, etc."]
}

Transcripción:
${transcription.text}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    console.log("GPT-4o Analysis completed");

    // 4. Save to Firestore
    const analysisData = {
      userEmail,
      objectPath,
      transcription: transcription.text,
      analysis,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection("meetings_analysis").add(analysisData);
    console.log("Analysis saved to Firestore");

    // 5. Send Email
    if (userEmail && userEmail !== "anonymous") {
      const clienteNome = analysis.nombre_cliente || userEmail.split('@')[0];
      const mailOptions = {
        from: process.env.EMAIL_FROM || "Kinedrik <no-reply@kinedrik.com>",
        to: userEmail,
        subject: `📋 Resumen reunión — ${clienteNome} — ${new Date().toLocaleDateString()}`,
        html: `
          <h1>Resumen de la Reunión</h1>
          <p><strong>🌡️ Temperatura del cliente:</strong> ${analysis.temperatura}</p>
          <hr/>
          <h3>📋 Resumen ejecutivo</h3>
          <p>${analysis.resumen}</p>
          
          <h3>⏱️ Participación</h3>
          <ul>
            <li>Consultor: ${analysis.participacion.consultor_pct}</li>
            <li>Cliente: ${analysis.participacion.cliente_pct}</li>
            <li>Duración total: ${analysis.participacion.duracion_total}</li>
          </ul>

          <h3>🎯 Necesidades detectadas</h3>
          <ul>${analysis.necesidades.map(n => `<li>${n}</li>`).join('')}</ul>

          <h3>🚨 Objeciones del cliente</h3>
          <ul>${analysis.objeciones.map(o => `<li>${o}</li>`).join('')}</ul>

          <h3>✅ Próximos pasos acordados</h3>
          <p><strong>Consultor:</strong></p>
          <ul>${analysis.proximos_pasos.consultor.map(p => `<li>${p}</li>`).join('')}</ul>
          <p><strong>Cliente:</strong></p>
          <ul>${analysis.proximos_pasos.cliente.map(p => `<li>${p}</li>`).join('')}</ul>
          ${analysis.proximos_pasos.fechas_mencionadas.length > 0 ? `<p><strong>Fechas:</strong> ${analysis.proximos_pasos.fechas_mencionadas.join(', ')}</p>` : ''}

          <h3>⚠️ Alertas importantes</h3>
          <ul>${analysis.alertas.map(a => `<li>${a}</li>`).join('')}</ul>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log("Email sent to", userEmail);
    }

  } catch (err) {
    console.error("Error processing analysis:", err);
    throw err;
  } finally {
    // Clean up temp file
    if (await fs.pathExists(tempFilePath)) {
      await fs.remove(tempFilePath);
    }
  }
}

// --- ENDPOINTS PARA ADMIN (Gestión de Usuarios) ---

// Obtener todos los usuarios
app.get("/api/admin/users", async (req, res) => {
  try {
    const snapshot = await db.collection("users").orderBy("createdAt", "desc").get();
    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return res.json({ ok: true, users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al obtener usuarios" });
  }
});

// Agregar un usuario
app.post("/api/admin/users", async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!email) return res.status(400).json({ ok: false, error: "Email requerido" });

    const newUser = {
      name: name || "",
      email: email.trim().toLowerCase(),
      role: role || "user",
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection("users").add(newUser);
    return res.json({ ok: true, id: docRef.id, user: newUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al agregar usuario" });
  }
});

// Editar un usuario
app.put("/api/admin/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;

    await db.collection("users").doc(id).update({
      name: name || "",
      email: email.trim().toLowerCase(),
      role: role || "user"
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al editar usuario" });
  }
});

// Eliminar un usuario
app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const requesterRole = req.headers["x-admin-role"]; // Role of the person performing the deletion

    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const userData = userDoc.data();

    // Restriction: Admins cannot delete other Admins, only Superadmins can.
    if (userData.role === "admin" && requesterRole !== "superadmin") {
      return res.status(403).json({ ok: false, error: "No tienes permisos para eliminar a otro Administrador" });
    }

    await db.collection("users").doc(id).delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al eliminar usuario" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend con Firebase Firestore corriendo en puerto ${PORT}`);
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`CORS_ORIGIN: ${allowedOrigins.join(", ")}`);
});
