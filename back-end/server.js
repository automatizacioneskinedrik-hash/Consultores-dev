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
import ffmpeg from "fluent-ffmpeg";
import { getSystemPrompt } from "./prompts-master.js";


// Inicializar Firebase Admin
import { createRequire } from "module";
const require = createRequire(import.meta.url);

let adminConfig = {};
const USER_CACHE = new Map(); // Simple cache para roles
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos de vida para la caché
try {
  const serviceAccount = require("./serviceAccountKey.json");
  adminConfig = {
    credential: admin.credential.cert(serviceAccount),
  };
  console.log("Firebase: Usando serviceAccountKey.json local");
} catch (err) {
  console.log("Firebase: No se encontró serviceAccountKey.json, usando Application Default Credentials");
  adminConfig = {
    credential: admin.credential.applicationDefault(),
    projectId: process.env.GCP_PROJECT_ID,
  };
}

admin.initializeApp(adminConfig);

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 3001;

const BUCKET_NAME = process.env.GCS_BUCKET_NAME;
if (!BUCKET_NAME) {
  console.warn("ADVERTENCIA: GCS_BUCKET_NAME no detectado. Las funciones de subida de archivos estarán deshabilitadas.");
}

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;
if (!openai) {
  console.warn("ADVERTENCIA: OPENAI_API_KEY no configurada. El backend inicia, pero el analisis de audio estara deshabilitado.");
}

const emailEnabled = Boolean(
  process.env.EMAIL_HOST &&
  process.env.EMAIL_USER &&
  process.env.EMAIL_PASS
);
const transporter = emailEnabled
  ? nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_PORT === "465",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })
  : null;
if (!transporter) {
  console.warn("ADVERTENCIA: configuracion SMTP incompleta. El envio de correos quedara deshabilitado.");
}

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const MASTER_SUPERADMIN_EMAIL = "adminkinedrik@eadic.com";
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmailValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

function sanitizeEmailArray(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((email) => normalizeEmailValue(email))
    .filter(Boolean);
  return [...new Set(cleaned)];
}

function isValidEmailValue(email = "") {
  return BASIC_EMAIL_REGEX.test(String(email || "").trim());
}

async function isAuthRequest(req) {
  const requesterEmail = normalizeEmailValue(req.headers["x-admin-email"]);
  const authToken = req.headers["x-auth-token"];

  if (!requesterEmail || !authToken) return false;

  try {
    const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    if (userSnapshot.empty) return false;

    const userData = userSnapshot.docs[0].data();
    return userData.authToken === authToken;
  } catch (err) {
    console.error("Auth validation error:", err);
    return false;
  }
}

async function isAdminOrSuperadminRequest(req) {
  const requesterEmail = normalizeEmailValue(req.headers["x-admin-email"]);
  const authToken = req.headers["x-auth-token"];

  if (!requesterEmail || !authToken) return false;

  try {
    const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    if (userSnapshot.empty) return false;

    const userData = userSnapshot.docs[0].data();
    // Validate both token and role (or master email)
    if (userData.authToken !== authToken) return false;

    return (
      userData.role === "admin" ||
      userData.role === "superadmin" ||
      requesterEmail === MASTER_SUPERADMIN_EMAIL
    );
  } catch (err) {
    console.error("Auth validation error:", err);
    return false;
  }
}

async function getEmailConfigFromFirestore() {
  try {
    const configRef = db.collection("settings").doc("email_config");
    const configDoc = await configRef.get();

    if (!configDoc.exists) {
      return {
        ccEmails: [],
        bccEmails: [],
        updatedAt: null,
        updatedBy: "",
      };
    }

    const data = configDoc.data() || {};
    return {
      ccEmails: sanitizeEmailArray(data.ccEmails),
      bccEmails: sanitizeEmailArray(data.bccEmails),
      updatedAt: data.updatedAt || null,
      updatedBy: data.updatedBy || "",
    };
  } catch (error) {
    console.error("Error loading settings/email_config:", error);
    return {
      ccEmails: [],
      bccEmails: [],
      updatedAt: null,
      updatedBy: "",
    };
  }
}

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

// Manejador de errores global para errores de middleware (como CORS)
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
  const storageOptions = {
    projectId: process.env.GCP_PROJECT_ID,
  };

  try {
    const serviceAccount = require("./serviceAccountKey.json");
    storageOptions.credentials = serviceAccount;
    console.log("Storage: Usando serviceAccountKey.json local");
  } catch (err) {
    console.log("Storage: Usando Application Default Credentials del entorno");
  }

  storage = new Storage(storageOptions);
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
    const password = req.body.password; // Recibir la contraseña desde la solicitud
    if (!email) return res.status(400).json({ ok: false, error: "Email requerido" });

    // Consultar Firestore para usuarios autorizados
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("email", "==", email).limit(1).get();

    if (snapshot.empty) {
      return res.status(401).json({ ok: false, error: "No estás registrado en la plataforma. Por favor, escribe al administrador para que te registre." });
    }

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    // Si se proporciona la contraseña (formulario de Admin), verificarla
    if (password) {
      if (user.password !== password) {
        return res.status(401).json({ ok: false, error: "Contraseña incorrecta" });
      }
    }

    const authToken = uuidv4();
    await userDoc.ref.update({ authToken });

    return res.json({
      ok: true,
      user: {
        id: userDoc.id,
        email: user.email,
        name: user.name || "",
        role: user.role || "user",
        authToken,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error validando usuario" });
  }
});

app.post("/api/uploads/signed-url", async (req, res) => {
  try {
    const isAuthorized = await isAuthRequest(req);
    if (!isAuthorized) {
      return res.status(401).json({ ok: false, error: "No autorizado. Inicia sesión nuevamente." });
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
    const isAuthorized = await isAuthRequest(req);
    if (!isAuthorized) {
      return res.status(401).json({ ok: false, error: "No autorizado. Inicia sesión nuevamente." });
    }
    const { objectPath, userEmail } = req.body;
    if (!objectPath) return res.status(400).json({ ok: false, error: "objectPath requerido" });

    if (!bucket) {
      return res.status(503).json({ ok: false, error: "Servicio de almacenamiento no configurado" });
    }
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).json({ ok: false, error: "Objeto no encontrado en GCS" });

    // Proceso síncrono para que el front-end sepa cuándo termina
    await processAudioAnalysis(objectPath, userEmail);

    return res.json({ ok: true, message: "Análisis completado y correo enviado." });

  } catch (err) {
    console.error("Error en complete:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Obtener configuracion de correo (admin y superadmin)
app.get("/api/admin/email-config", async (req, res) => {
  try {
    const isAuthorized = await isAdminOrSuperadminRequest(req);
    if (!isAuthorized) {
      return res.status(403).json({
        ok: false,
        error: "No tienes permisos para ver la configuracion de correo",
      });
    }

    const config = await getEmailConfigFromFirestore();
    return res.json({ ok: true, config });
  } catch (err) {
    console.error("Error fetching email config:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al obtener la configuracion de correo",
    });
  }
});

// Actualizar configuracion de correo (admin y superadmin)
app.put("/api/admin/email-config", async (req, res) => {
  try {
    const isAuthorized = await isAdminOrSuperadminRequest(req);
    if (!isAuthorized) {
      return res.status(403).json({
        ok: false,
        error: "No tienes permisos para actualizar la configuracion de correo",
      });
    }

    if (req.body.ccEmails != null && !Array.isArray(req.body.ccEmails)) {
      return res.status(400).json({
        ok: false,
        error: "ccEmails debe ser un arreglo",
      });
    }

    if (req.body.bccEmails != null && !Array.isArray(req.body.bccEmails)) {
      return res.status(400).json({
        ok: false,
        error: "bccEmails debe ser un arreglo",
      });
    }

    const ccEmails = sanitizeEmailArray(req.body.ccEmails || []);
    const bccEmails = sanitizeEmailArray(req.body.bccEmails || []).filter((email) => !ccEmails.includes(email));
    const invalidEmails = [...ccEmails, ...bccEmails].filter((email) => !isValidEmailValue(email));

    if (invalidEmails.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "Hay correos invalidos en la configuracion",
        invalidEmails,
      });
    }

    const requesterEmail = normalizeEmailValue(req.headers["x-admin-email"]);

    await db.collection("settings").doc("email_config").set(
      {
        ccEmails,
        bccEmails,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: requesterEmail || "",
      },
      { merge: true }
    );

    return res.json({
      ok: true,
      message: "Configuracion de correo actualizada correctamente",
      config: {
        ccEmails,
        bccEmails,
        updatedBy: requesterEmail || "",
      },
    });
  } catch (err) {
    console.error("Error updating email config:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al actualizar la configuracion de correo",
    });
  }
});



async function processAudioAnalysis(objectPath, userEmail) {
  console.log(`Starting analysis for ${objectPath} (User: ${userEmail})`);
  const tempFilePath = path.join(os.tmpdir(), `audio_${uuidv4()}${path.extname(objectPath)}`);
  let filesToClean = [tempFilePath];

  try {
    if (!openai) {
      throw new Error("OPENAI_API_KEY no configurada en el entorno");
    }

    // 1. Descargar el archivo desde GCS
    await bucket.file(objectPath).download({ destination: tempFilePath });
    console.log("File downloaded to temp path:", tempFilePath);

    const stats = await fs.stat(tempFilePath);
    let finalAudioPath = tempFilePath;
    const WHISPER_LIMIT_BYTES = 25 * 1024 * 1024; // 25 MB

    if (stats.size > WHISPER_LIMIT_BYTES) {
      console.log(`Archivo excede los 25MB (${stats.size} bytes). Comprimiendo a MP3 (32kbps)...`);
      const compressedPath = path.join(os.tmpdir(), `compressed_${uuidv4()}.mp3`);

      await new Promise((resolve, reject) => {
        ffmpeg(tempFilePath)
          .audioBitrate('32k')
          .format('mp3')
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .save(compressedPath);
      });
      console.log("Compresión finalizada:", compressedPath);
      finalAudioPath = compressedPath;
      filesToClean.push(compressedPath);
    }

    // 2. Transcribir con Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(finalAudioPath),
      model: "whisper-1",
      response_format: "verbose_json",
    });
    console.log("Transcription completed");

    // 2.5 Lógica de Consistencia (Caché): Si el texto ya existe, no gastar en IA y devolver lo mismo
    try {
      const existingSnapshot = await db.collection("sessions")
        .where("transcription", "==", transcription.text)
        .limit(1)
        .get();
      
      if (!existingSnapshot.empty) {
        console.log("⚠️ Consistencia: Se detectó transcripción idéntica. Usando análisis previo para garantizar mismo score.");
        const cachedAnalysis = existingSnapshot.docs[0].data().analysis;
        const totalSeconds = transcription.duration || 0;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        return { 
          ...cachedAnalysis, 
          participacion: { ...cachedAnalysis.participacion, duracion_total: durationStr } 
        };
      }
    } catch (cacheErr) {
      console.log("Error en búsqueda de caché (continuando normalmente):", cacheErr);
    }

    // Obtener la duración exacta
    const totalSeconds = transcription.duration || 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // 3. Recuperar el prompt activo desde la DB
    let additionalInstructions = "";
    try {
      const promptSnapshot = await db.collection("prompts").where("isActive", "==", true).limit(1).get();
      if (!promptSnapshot.empty) {
        additionalInstructions = promptSnapshot.docs[0].data().content || "";
      }
    } catch (err) {
      console.log("Error al recuperar el prompt activo:", err);
    }

    // 4. Generar Prompt y Análisis con GPT-5.4-mini
    const systemPrompt = getSystemPrompt(durationStr, additionalInstructions, transcription.text);

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: systemPrompt }],
        response_format: { type: "json_object" },
        temperature: 0,
        seed: 42, // Forzar determinismo matemático
      });
    } catch (openAiErr) {
      console.error("OpenAI Error:", openAiErr.message);
      // Fallback simple si falla el prompt personalizado
      if (additionalInstructions) {
        console.log("Reintentando sin instrucciones adicionales...");
        completion = await openai.chat.completions.create({
          model: "gpt-5.4-mini",
          messages: [{ role: "user", content: getSystemPrompt(durationStr, "", transcription.text) }],
          response_format: { type: "json_object" },
          temperature: 0,
          seed: 42,
        });
      } else {
        throw openAiErr;
      }
    }

    const analysis = JSON.parse(completion.choices[0].message.content);

    // Forzar la duración exacta y metadatos
    analysis.participacion.duracion_total = durationStr;
    console.log("AI Analysis completed successfully");

    const analysisData = {
      userEmail,
      objectPath,
      transcription: transcription.text,
      analysis,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("meetings_analysis").add(analysisData);
    console.log("Analysis saved to Firestore");

    // 5. Enviar correo electrónico con diseño premium
    if (transporter && userEmail && userEmail !== "anonymous") {
      // Obtener nombre del consultor desde Firestore
      const userSnapshot = await db.collection("users").where("email", "==", userEmail.trim().toLowerCase()).limit(1).get();
      let consultantName = userEmail.split('@')[0];
      if (!userSnapshot.empty) {
        consultantName = userSnapshot.docs[0].data().name || consultantName;
      }

      const clienteNome = analysis.nombre_cliente || "Cliente";
      const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      const emailConfig = await getEmailConfigFromFirestore();
      const recipientEmail = normalizeEmailValue(userEmail) || userEmail;

      const mailOptions = {
        from: process.env.EMAIL_FROM || "Kinedriꓘ <no-reply@kinedrik.com>",
        to: recipientEmail,
        subject: `Reporte: Reunión con ${clienteNome} — ${dateStr}`,
        html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Kinedrik</title>
  <style>
    body, table, td, div, p, a {
      font-family: Arial, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    @media only screen and (max-width: 820px) {
      .main-card {
        width: 100% !important;
      }
      .px-mobile {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      .metric-stack,
      .metric-stack td {
        display: block !important;
        width: 100% !important;
      }
      .metric-right-mobile {
        padding-top: 15px !important;
      }
      .text-box {
        width: 100% !important;
      }
      .footer-col,
      .footer-col td {
        display: block !important;
        width: 100% !important;
      }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#D9D9D9;">
  
  <!-- Fondo general -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#D9D9D9" style="width:100%; margin:0; padding:0; background-color:#D9D9D9;">
    <tr>
      <td align="center" style="padding:40px 20px; background-color:#D9D9D9;">

        <!-- Tarjeta principal -->
        <table role="presentation" width="850" cellpadding="0" cellspacing="0" border="0" class="main-card" style="width:760px; max-width:760px; background-color:#FFFFFF; border-radius:24px; overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td
              background="https://storage.googleapis.com/kinedrik-imagenes/Banner%20consultores.png"
              bgcolor="#040025"
              style="background-color:#040025; background-image:url('https://storage.googleapis.com/kinedrik-imagenes/Banner%20consultores.png'); background-repeat:no-repeat; background-position:center 35%; background-size:100% auto; padding:100px 40px; border-bottom:4px solid #FF6B00;"
              class="px-mobile"
            >
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="color:#FFFFFF; font-size:26px; font-weight:900; letter-spacing:2px;">
                    KINEDRI<span style="color:#FF6B00;">ꓘ</span>
                  </td>
                  <td align="right">
                    <span style="display:inline-block; border:1px solid #FF6B00; color:#FF6B00; padding:6px 12px; border-radius:6px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1px;">
                      Reporte Confidencial
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="padding:36px 40px 10px 40px;" class="px-mobile">
              <div style="color:#040025; font-size:32px; line-height:1.15; font-weight:900; letter-spacing:-1px; margin:0 0 12px 0;">
                Tu Gran Sesión de Hoy
              </div>
              <div style="color:#64748B; font-size:14px; line-height:1.5; font-weight:500;">
                Un gusto saludarte, <strong style="color:#2885FF;">${consultantName}</strong>
              </div>
            </td>
          </tr>

          <!-- Métricas -->
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="metric-stack">
                <tr>
                  <td width="50%" valign="top" style="padding-right:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg, #0040A4 0%, #2885FF 100%); border-radius:24px;">
                      <tr>
                        <td align="center" style="padding:26px 20px;">
                          <div style="font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:1px; opacity:0.8; color:#FFFFFF; margin-bottom:14px;">
                            Tiempo de Conexión
                          </div>
                          <div style="font-size:42px; line-height:1; font-weight:900; color:#FFFFFF; letter-spacing:-1px; margin-bottom:8px;">
                            ${minutes}:${seconds.toString().padStart(2, '0')}
                          </div>
                          <div style="font-size:10px; line-height:1.4; font-weight:600; color:#FFFFFF; opacity:0.75;">
                            ¡Minutos de puro valor!
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <td width="50%" valign="top" style="padding-left:8px;" class="metric-right-mobile">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border:1px solid #E2E8F0; border-radius:24px;">
                      <tr>
                        <td style="padding:26px 20px;">
                          <div style="font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:#0040A4; margin-bottom:14px; text-align:center;">
                            Diálogo Compartido
                          </div>

                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
                            <tr>
                              <td align="left">
                                <div style="font-size:24px; font-weight:900; color:#BB8AFF;">
                                  ${analysis.participacion.consultor_pct.replace('%', '')}%
                                </div>
                                <div style="font-size:10px; font-weight:800; color:#94A3B8; text-transform:uppercase;">
                                  Tú
                                </div>
                              </td>
                              <td align="right">
                                <div style="font-size:24px; font-weight:900; color:#FF5900;">
                                  ${analysis.participacion.cliente_pct.replace('%', '')}%
                                </div>
                                <div style="font-size:10px; font-weight:800; color:#94A3B8; text-transform:uppercase;">
                                  ${clienteNome}
                                </div>
                              </td>
                            </tr>
                          </table>

                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9; border-radius:10px;">
                            <tr>
                              <td width="${analysis.participacion.consultor_pct}" style="height:8px; background-color:#BB8AFF; border-radius:10px 0 0 10px; font-size:0; line-height:0;">&nbsp;</td>
                              <td width="${analysis.participacion.cliente_pct}" style="height:8px; background-color:#FF5900; border-radius:0 10px 10px 0; font-size:0; line-height:0;">&nbsp;</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sección 1: Barras de probabilidad -->
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border:1px solid #E2E8F0; border-radius:24px;">
                <tr>
                  <td style="padding:26px 20px;">
                    <!-- Barra de Interés -->
                    <div style="font-size:11px; font-weight:900; text-transform:uppercase; color:#0040A4; margin-bottom:8px;">
                      Interés del Cliente <span style="float:right; background-color:#E0E7FF; color:#4338CA; padding:2px 8px; border-radius:12px; font-size:9px;">${analysis.probabilidades?.estado_interes || 'Indeterminado'}</span>
                    </div>
                    <div style="font-size:32px; font-weight:900; color:#1E293B; margin-bottom:8px;">
                      ${analysis.probabilidades?.interes_cliente || 0}%
                    </div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9; border-radius:10px; margin-bottom:24px;">
                      <tr>
                        <td width="${analysis.probabilidades?.interes_cliente || 0}%" style="height:12px; background:linear-gradient(90deg, #3B82F6 0%, #2563EB 100%); border-radius:10px;"></td>
                        <td width="${100 - (analysis.probabilidades?.interes_cliente || 0)}%" style="height:12px; border-radius:0 10px 10px 0;"></td>
                      </tr>
                    </table>

                    <!-- Barra de Proximidad al Cierre -->
                    <div style="font-size:11px; font-weight:900; text-transform:uppercase; color:#EA580C; margin-bottom:8px;">
                      Proximidad al Cierre <span style="float:right; background-color:#FFEDD5; color:#C2410C; padding:2px 8px; border-radius:12px; font-size:9px;">${analysis.probabilidades?.estado_cierre || 'Indeterminado'}</span>
                    </div>
                    <div style="font-size:32px; font-weight:900; color:#1E293B; margin-bottom:8px;">
                      ${analysis.probabilidades?.proximidad_cierre || 0}%
                    </div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9; border-radius:10px;">
                      <tr>
                        <td width="${analysis.probabilidades?.proximidad_cierre || 0}%" style="height:12px; background:linear-gradient(90deg, #F97316 0%, #EA580C 100%); border-radius:10px;"></td>
                        <td width="${100 - (analysis.probabilidades?.proximidad_cierre || 0)}%" style="height:12px; border-radius:0 10px 10px 0;"></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sección 2: Scorecard de la sesión -->
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <div style="color:#0F172A; font-size:14px; font-weight:900; text-transform:uppercase; letter-spacing:1px; margin-bottom:16px;">
                Scorecard de la Sesión
              </div>

              ${(() => {
            const sc = analysis.scorecard || {};
            const scoreValues = Object.values(sc).map(d => d.score || 0);
            const minScore = scoreValues.length > 0 ? Math.min(...scoreValues) : -1;
            let hasBadgeGist = false;

            return Object.entries(sc).map(([key, data]) => {
              const titles = { muletillas: "Muletillas", cierre_negociacion: "Cierre y Negociación", manejo_objeciones: "Manejo de Objeciones", propuesta_valor: "Propuesta de Valor" };
              const title = titles[key] || key;
              const score = data.score || 0;

              let color = "#EF4444";
              if (key === 'muletillas') {
                color = score <= 30 ? "#22C55E" : score <= 60 ? "#EAB308" : "#EF4444";
              } else {
                color = score >= 71 ? "#22C55E" : score >= 41 ? "#EAB308" : "#EF4444";
              }

              let badgeHtml = '';
              if (score === minScore && !hasBadgeGist) {
                badgeHtml = '<span style="background-color:#EF4444; color:#FFFFFF; padding:4px 10px; border-radius:6px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1px;">POR TRABAJAR</span>';
                hasBadgeGist = true;
              }

              return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; margin-bottom:12px;">
                <tr>
                  <td style="padding:20px;">
                    <!-- Top Section -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                      <tr>
                        <td align="left" style="font-size:15px; font-weight:900; color:#0F172A;">${title}</td>
                        <td align="right" style="font-size:22px; font-weight:900; color:${color};">${score}%</td>
                      </tr>
                    </table>
                    
                    <!-- Middle Section: Context -->
                    <div style="font-size:12px; color:#64748B; font-style:italic; line-height:1.4; margin-bottom:12px; min-height:40px;">
                      ${data.contexto || ''}
                    </div>

                    <!-- Bottom Section: Progress Bar with Needle -->
                    <div style="padding-top:4px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:2px;">
                        <tr>
                          ${score > 0 ? `<td width="${score}%" align="right" style="padding-right:2px; font-size:13px; line-height:1; color:${color}; font-weight:900;">▼</td>` : `<td width="1%"></td>`}
                          ${score < 100 && score > 0 ? `<td width="${100 - score}%"></td>` : score === 0 ? `<td width="99%" align="left" style="font-size:13px; line-height:1; color:${color}; font-weight:900;">▼</td>` : ''}
                        </tr>
                      </table>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:4px; height:8px; margin-bottom:2px;">
                        <tr>
                          <td width="30%" style="height:8px; background-color:${key === 'muletillas' ? '#22C55E' : '#EF4444'}; border-radius:4px 0 0 4px;"></td>
                          <td width="40%" style="height:8px; background-color:#EAB308;"></td>
                          <td width="30%" style="height:8px; background-color:${key === 'muletillas' ? '#EF4444' : '#22C55E'}; border-radius:0 4px 4px 0;"></td>
                        </tr>
                      </table>
                    </div>

                    <!-- Badge if any -->
                    ${badgeHtml ? `
                    <div style="margin-top:14px;">
                      ${badgeHtml}
                    </div>
                    ` : ''}
                  </td>
                </tr>
              </table>
              `;
            }).join('');
          })()}
            </td>
          </tr>

          <!-- Sección 3: Aspecto Positivo -->
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <div style="color:#16A34A; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">
                Aspectos Positivos
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 15px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0FDF4; border:1px solid #DCFCE7; border-top:4px solid #22C55E; border-radius:12px; overflow:hidden;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" width="40" style="width:40px;">
                          <div style="width:30px; height:30px; line-height:30px; text-align:center; border-radius:50%; background-color:#22C55E; color:#FFFFFF; font-weight:900;">✓</div>
                        </td>
                        <td valign="top" class="text-box">
                          <div style="margin:0; color:#0F172A; font-size:15px; font-weight:800; line-height:1.3;">${analysis.feedback?.aspecto_positivo?.titulo || 'Buen Trabajo'}</div>
                          <div style="margin-top:4px; color:#475569; font-size:13px; line-height:1.45;">${analysis.feedback?.aspecto_positivo?.descripcion || ''}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sección 4: Puntos de mejora -->
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <div style="color:#EA580C; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">
                Puntos de Mejora
              </div>
            </td>
          </tr>

          ${(analysis.feedback?.puntos_mejora || []).map(item => {
            const fasesMap = {
              'F01': 'F01 — Apertura con Liderazgo',
              'F02': 'F02 — Diagnóstico con Tensión',
              'F03': 'F03 — Visión de Futuro y GAP',
              'F04': 'F04 — El Máster como Vehículo',
              'F05': 'F05 — Precio y Decisión'
            };
            const codigoBase = (item.codigo_fase || '').substring(0, 3).toUpperCase();
            const faseGris = fasesMap[codigoBase] || item.codigo_fase || '';

            return `
          <tr>
            <td style="padding:0 40px 15px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF7ED; border:1px solid #FFEDD5; border-top:4px solid #F97316; border-radius:12px; overflow:hidden;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" width="40" style="width:40px;">
                          <div style="width:30px; height:30px; line-height:30px; text-align:center; border-radius:50%; background-color:#F97316; color:#FFFFFF; font-weight:900; font-size:16px;">!</div>
                        </td>
                        <td valign="top" class="text-box">
                          <div style="margin:0; font-size:15px; line-height:1.3;"><span style="color:#94A3B8; font-weight:700;">${faseGris}</span> <strong style="color:#000000; font-weight:900;">· ${item.titulo_error || item.titulo_fase || 'Oportunidad de Mejora'}</strong></div>
                          <div style="margin-top:12px; color:#475569; font-size:13px; line-height:1.6;">
                            <strong style="color:#000000;">Frase detectada:</strong> <em>"${item.frase_detectada}"</em><br><br>
                            <strong style="color:#F97316;">Problema:</strong> ${item.problema}<br><br>
                            <strong style="color:#EF4444;">Impacto:</strong> ${item.impacto}<br><br>
                            
                            <strong style="color:#166534;">Correcciones Sugeridas:</strong><br>
                            ${(item.correcciones_sugeridas || (item.correccion_sugerida ? [item.correccion_sugerida] : [])).slice(0, 3).map(corr =>
              `<span style="display:inline-block; background-color:#DCFCE7; color:#166534; padding:6px 12px; border-radius:6px; font-weight:600; margin-top:4px; margin-bottom:8px;">"${corr}"</span><br>`
            ).join('')}
                            
                            <div style="background-color:#FFEDD5; padding:10px; border-radius:6px; font-size:12px; border-left:4px solid #EA580C;">
                              <strong>Próxima llamada:</strong> ${item.proxima_llamada}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          `;
          }).join('')}

          <!-- Sección 5: Tus Fortalezas -->
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <div style="color:#8B5CF6; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">
                Tus Fortalezas
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 25px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F3FF; border:1px solid #EDE9FE; border-top:4px solid #8B5CF6; border-radius:12px; overflow:hidden;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" width="40" style="width:40px;">
                          <div style="width:30px; height:30px; line-height:30px; text-align:center; border-radius:50%; background-color:#8B5CF6; color:#FFFFFF; font-weight:900;">★</div>
                        </td>
                        <td valign="top" class="text-box">
                          <div style="margin:0; color:#0F172A; font-size:15px; font-weight:800; line-height:1.3;">
                            ${analysis.feedback?.fortaleza_destacada?.titulo || 'Fortaleza'}
                          </div>
                          <div style="margin-top:12px; padding:12px; background-color:#E0E7FF; color:#4338CA; border-radius:8px; font-size:14px; font-style:italic; line-height:1.5; font-weight:500;">
                            "${analysis.feedback?.fortaleza_destacada?.cita || ''}"
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sección 6: Dos Columnas -->
          <tr>
            <td style="padding:28px 40px 35px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #F1F5F9; border-radius:20px; overflow:hidden;" class="footer-col">
                <tr>
                  <!-- Izquierda -->
                  <td valign="top" width="50%" style="padding:20px; border-top:4px solid #22C55E; background-color:#F8FAFC; border-right:1px solid #F1F5F9;">
                    <div style="font-size:13px; font-weight:900; color:#166534; margin-bottom:12px;">
                      Lo que el lead necesita
                    </div>
                    ${(analysis.necesidades || []).map(n => `
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;">
                      <tr>
                        <td width="15" valign="top" style="color:#22C55E; font-size:14px;">●</td>
                        <td valign="top" style="font-size:13px; color:#475569; line-height:1.4;">${n.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')}</td>
                      </tr>
                    </table>
                    `).join('')}
                  </td>
                  <!-- Derecha -->
                  <td valign="top" width="50%" style="padding:20px; border-top:4px solid #F97316; background-color:#F8FAFC;">
                    <div style="font-size:13px; font-weight:900; color:#C2410C; margin-bottom:12px;">
                      Tus próximos pasos
                    </div>
                    ${(analysis.proximos_pasos?.consultor || []).map((p, i) => {
            return `
                    <div style="background-color:#FFFFFF; border:1px solid #FFEDD5; border-radius:8px; padding:12px; margin-bottom:10px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                        <tr>
                          <td align="left">
                            <span style="font-size:10px; font-weight:900; color:#EA580C; background-color:#FFF7ED; padding:3px 8px; border-radius:12px; text-transform:uppercase;">Paso ${i + 1}</span>
                          </td>
                        </tr>
                      </table>
                      <div style="font-size:13px; color:#334155; line-height:1.4; font-weight:600; margin-bottom:0;">
                        ${p}
                      </div>
                    </div>
                      `;
          }).join('')}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sección 7: Cierre - Puntuación General -->
          ${(() => {
            const sc = analysis.scorecard || {};
            const muletillasScore = sc.muletillas?.score || 0;
            const cierreScore = sc.cierre_negociacion?.score || 0;
            const objecionesScore = sc.manejo_objeciones?.score || 0;
            const valorScore = sc.propuesta_valor?.score || 0;
            const generalScore = Math.round(((100 - muletillasScore) + cierreScore + objecionesScore + valorScore) / 4);
            const generalColor = generalScore >= 71 ? "#22C55E" : generalScore >= 41 ? "#EAB308" : "#EF4444";

            return `
          <tr>
            <td style="padding:10px 40px 40px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#040025; border-radius:24px; overflow:hidden; border:2px solid ${generalColor};">
                <tr>
                  <td style="padding:40px 20px; text-align:center;">
                    <div style="font-size:12px; font-weight:900; color:#94A3B8; text-transform:uppercase; letter-spacing:2px; margin-bottom:12px;">
                      Puntuación General de tu Sesión
                    </div>
                    <div style="font-size:64px; font-weight:900; color:#FFFFFF; line-height:1; margin-bottom:24px;">
                      ${generalScore}<span style="font-size:32px; color:${generalColor};">%</span>
                    </div>
                    
                    <div style="margin:0 auto; max-width:80%;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;">
                        <tr>
                          ${generalScore > 0 ? `<td width="${generalScore}%" align="right" style="padding-right:2px; font-size:14px; line-height:1; color:${generalColor}; font-weight:900;">▼</td>` : `<td width="1%"></td>`}
                          ${generalScore < 100 && generalScore > 0 ? `<td width="${100 - generalScore}%"></td>` : generalScore === 0 ? `<td width="99%" align="left" style="font-size:14px; line-height:1; color:${generalColor}; font-weight:900;">▼</td>` : ''}
                        </tr>
                      </table>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:6px; height:12px;">
                        <tr>
                          <td width="30%" style="height:12px; background-color:#EF4444; border-radius:6px 0 0 6px;"></td>
                          <td width="40%" style="height:12px; background-color:#EAB308;"></td>
                          <td width="30%" style="height:12px; background-color:#22C55E; border-radius:0 6px 6px 0;"></td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
            `;
          })()}

          <!-- Footer -->
          <tr>
            <td style="background-color:#111827; padding:32px 40px; text-align:center;" class="px-mobile">
              <div style="color:#FFFFFF; font-size:16px; font-weight:800; margin-bottom:6px; letter-spacing:0.5px;">KINEDRIꓘ — Elevating skills, boosting real knowledge</div>
              <div style="color:#94A3B8; font-size:12px; font-weight:500;">Desarrolladores Internos</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `
      };

      if (emailConfig.ccEmails.length > 0) {
        mailOptions.cc = emailConfig.ccEmails;
      }

      if (emailConfig.bccEmails.length > 0) {
        mailOptions.bcc = emailConfig.bccEmails;
      }

      await transporter.sendMail(mailOptions);
      console.log("Email sent to", userEmail);
    }

  } catch (err) {
    console.error("Error processing analysis:", err);
    throw err;
  } finally {
    // Limpiar archivos temporales
    for (const f of filesToClean) {
      if (await fs.pathExists(f)) {
        await fs.remove(f);
      }
    }
  }
}

// --- ENDPOINTS PARA ADMIN (Gestión de Usuarios) ---

// Obtener todos los usuarios
app.get("/api/admin/users", async (req, res) => {
  try {
    const isAuthorized = await isAdminOrSuperadminRequest(req);
    if (!isAuthorized) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para ver la lista de usuarios" });
    }

    const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase();
    const userSnapReq = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    const isSuperAdmin = !userSnapReq.empty && (userSnapReq.docs[0].data().role === "superadmin" || requesterEmail === MASTER_SUPERADMIN_EMAIL);

    const snapshot = await db.collection("users").get();
    const users = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
      })
      .filter(u => {
        // El Superadmin puede verlo TODO
        if (isSuperAdmin) return true;
        // El Admin normal no puede ver a los Superadmins
        return u.role !== "superadmin" && u.email !== MASTER_SUPERADMIN_EMAIL;
      });

    return res.json({ ok: true, users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al obtener usuarios" });
  }
});

// Agregar un usuario
app.post("/api/admin/users", async (req, res) => {
  try {
    const isAuthorized = await isAdminOrSuperadminRequest(req);
    if (!isAuthorized) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para agregar usuarios" });
    }

    const { name, email, role } = req.body;
    const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase();

    // Check superadmin for superadmin role creation
    const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    const isSuperAdmin = !userSnapshot.empty && (userSnapshot.docs[0].data().role === "superadmin" || requesterEmail === MASTER_SUPERADMIN_EMAIL);

    if (!email) return res.status(400).json({ ok: false, error: "Email requerido" });

    // Permiso: Solo superadmin puede crear administradores (MODIFICADO: AHORA ADMIN PUEDE)
    // Pero el admin no puede crear un superadmin
    if (role === "superadmin" && !isSuperAdmin) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para crear un Super Admin" });
    }

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
    const isAuthorized = await isAdminOrSuperadminRequest(req);
    if (!isAuthorized) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para editar usuarios" });
    }

    const { id } = req.params;
    const { name, email, role } = req.body;
    const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase();

    const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    const isSuperAdmin = !userSnapshot.empty && (userSnapshot.docs[0].data().role === "superadmin" || requesterEmail === MASTER_SUPERADMIN_EMAIL);

    const userRef = db.collection("users").doc(id);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const existingUser = userDoc.data();

    // Permiso: Admin no puede editar a otros Admins ni al Superadmin
    if ((existingUser.role === "admin" || existingUser.role === "superadmin") && !isSuperAdmin) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para editar a este usuario" });
    }

    // Permiso: Solo superadmin puede asignar el rol de superadmin
    if (role === "superadmin" && existingUser.role !== "superadmin" && !isSuperAdmin) {
      return res.status(403).json({ ok: false, error: "Solo el Super Admin puede nombrar Super Admins" });
    }

    await userRef.update({
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
    const isAuthorized = await isAdminOrSuperadminRequest(req);
    if (!isAuthorized) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para eliminar usuarios" });
    }

    const { id } = req.params;
    const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase();

    const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    const isSuperAdmin = !userSnapshot.empty && (userSnapshot.docs[0].data().role === "superadmin" || requesterEmail === MASTER_SUPERADMIN_EMAIL);

    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const userData = userDoc.data();

    // Restricción: Los Administradores no pueden eliminar a otros Administradores, solo los Superadmins pueden hacerlo.
    if ((userData.role === "admin" || userData.role === "superadmin") && !isSuperAdmin) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para eliminar a este Administrador" });
    }

    await db.collection("users").doc(id).delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al eliminar usuario" });
  }
});

// --- ENDPOINTS PARA GESTOR DE PROMPTS ---
app.get("/api/prompts", async (req, res) => {
  try {
    const snapshot = await db.collection("prompts").orderBy("createdAt", "desc").get();
    const prompts = [];
    snapshot.forEach(doc => prompts.push({ id: doc.id, ...doc.data() }));
    return res.json({ ok: true, prompts });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/prompts", async (req, res) => {
  try {
    const { name, content, isActive = false, isFavorite = false, isSystem = false } = req.body;
    const newPrompt = {
      name,
      content,
      isActive,
      isFavorite,
      isSystem,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (isActive) {
      const activePrompts = await db.collection("prompts").where("isActive", "==", true).get();
      const batch = db.batch();
      activePrompts.forEach(doc => batch.update(doc.ref, { isActive: false }));
      await batch.commit();
    }

    const docRef = await db.collection("prompts").add(newPrompt);
    return res.json({ ok: true, prompt: { id: docRef.id, ...newPrompt } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.put("/api/prompts/:id/active", async (req, res) => {
  try {
    const { id } = req.params;
    const batch = db.batch();

    const actSnapshot = await db.collection("prompts").where("isActive", "==", true).get();
    actSnapshot.forEach(doc => batch.update(doc.ref, { isActive: false }));

    const selectedRef = db.collection("prompts").doc(id);
    batch.update(selectedRef, { isActive: true });

    await batch.commit();
    return res.json({ ok: true, message: "Prompt activado correctamente" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.put("/api/prompts/:id/favorite", async (req, res) => {
  try {
    const { id } = req.params;
    const { isFavorite } = req.body;
    await db.collection("prompts").doc(id).update({ isFavorite });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/prompts/restore-default", async (req, res) => {
  try {
    const batch = db.batch();
    const actSnapshot = await db.collection("prompts").where("isActive", "==", true).get();
    actSnapshot.forEach(doc => batch.update(doc.ref, { isActive: false }));

    let defaultActivated = false;
    const sysSnapshot = await db.collection("prompts").where("isSystem", "==", true).limit(1).get();
    if (!sysSnapshot.empty) {
      batch.update(sysSnapshot.docs[0].ref, { isActive: true });
      defaultActivated = true;
    } else {
      const newRef = db.collection("prompts").doc();
      batch.set(newRef, {
        name: "Prompt Base (Sistema)",
        content: "Actúa según la metodología oficial de KINEDRIK.",
        isActive: true,
        isFavorite: true,
        isSystem: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      defaultActivated = true;
    }

    await batch.commit();
    return res.json({ ok: true, message: "Prompt por defecto restaurado" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// --- ENDPOINTS PARA SESIONES LOCALES DEL CONSULTOR ---

app.get("/api/sessions/recent", async (req, res) => {
  try {
    const isAuthorized = await isAuthRequest(req);
    if (!isAuthorized) {
      return res.status(401).json({ ok: false, error: "No autorizado" });
    }
    const email = (req.query.email || "").toLowerCase().trim();
    if (!email || email === "anonymous") return res.json({ ok: true, sessions: [] });

    const snapshot = await db.collection("meetings_analysis")
      .where("userEmail", "==", email)
      .orderBy("createdAt", "desc")
      .limit(3)
      .get();

    const sessions = snapshot.docs.map(doc => {
      const data = doc.data();
      let filename = "Audio_Cargado";
      if (data.objectPath) {
        const parts = data.objectPath.split("/");
        filename = parts[parts.length - 1];
      }
      return {
        id: doc.id,
        filename: data.analysis?.nombre_cliente ? "Reunión con " + data.analysis.nombre_cliente : filename,
        date: data.createdAt ? data.createdAt.toDate().toISOString() : null,
        duration: data.analysis?.participacion?.duracion_total || "00:00"
      };
    });

    return res.json({ ok: true, sessions });
  } catch (err) {
    console.error("Error fetching recent sessions:", err);
    return res.status(500).json({ ok: false, error: "Error obtaining sessions" });
  }
});

app.post("/api/sessions/resend", async (req, res) => {
  try {
    const isAuthorized = await isAuthRequest(req);
    if (!isAuthorized) {
      return res.status(401).json({ ok: false, error: "No autorizado" });
    }
    const { sessionId, email } = req.body;
    if (!sessionId || !email) return res.status(400).json({ ok: false, error: "Faltan parámetros" });

    const doc = await db.collection("meetings_analysis").doc(sessionId).get();
    if (!doc.exists) return res.status(404).json({ ok: false, error: "Sesión no encontrada" });

    const data = doc.data();
    if (data.userEmail !== email) return res.status(403).json({ ok: false, error: "No autorizado" });

    console.log("Resend requested for session:", sessionId, "to", email);
    return res.json({ ok: true, message: "Correo re-enviado con éxito." });
  } catch (err) {
    console.error("Error resending email:", err);
    return res.status(500).json({ ok: false, error: "Error resending" });
  }
});

// --- NUEVOS ENDPOINTS PARA HISTORIAL Y DASHBOARD (SOLO LECTURA) ---

// 1. Obtener Historial Completo (con filtros)
app.get("/api/sessions", async (req, res) => {
  try {
    const isAuthorized = await isAuthRequest(req);
    if (!isAuthorized) {
      return res.status(401).json({ ok: false, error: "No autorizado" });
    }

    const requesterEmail = normalizeEmailValue(req.headers["x-admin-email"]);
    let userData;

    // Check Cache first
    const cached = USER_CACHE.get(requesterEmail);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      userData = cached.data;
    } else {
      const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
      if (userSnapshot.empty) return res.status(401).json({ ok: false, error: "Usuario no encontrado" });
      userData = userSnapshot.docs[0].data();
      USER_CACHE.set(requesterEmail, { data: userData, timestamp: Date.now() });
    }

    const { filterEmail } = req.query;
    let query = db.collection("meetings_analysis");

    // Seguridad: Si no es admin, solo puede ver sus propios audios
    if (userData.role !== "admin" && userData.role !== "superadmin") {
      query = query.where("userEmail", "==", userData.email.toLowerCase().trim());
    } else if (filterEmail) {
      // Si es admin y filtra por un consultor específico
      query = query.where("userEmail", "==", filterEmail.toLowerCase().trim());
    }

    const snapshot = await query.get();

    // Obtener nombres de usuarios para mapear
    const usersSnapshot = await db.collection("users").get();
    const userNamesMap = {};
    usersSnapshot.forEach(u => {
      const uData = u.data();
      userNamesMap[normalizeEmailValue(uData.email)] = uData.name || "";
    });

    const sessions = snapshot.docs.map(doc => {
      const data = doc.data();
      const sc = data.analysis?.scorecard || {};
      const email = normalizeEmailValue(data.userEmail);

      // Calcular score general (misma formula que el email)
      const muletillasScore = sc.muletillas?.score || 0;
      const cierreScore = sc.cierre_negociacion?.score || 0;
      const objecionesScore = sc.manejo_objeciones?.score || 0;
      const valorScore = sc.propuesta_valor?.score || 0;
      const generalScore = Math.round(((100 - muletillasScore) + cierreScore + objecionesScore + valorScore) / 4);

      return {
        id: doc.id,
        userEmail: data.userEmail,
        userName: userNamesMap[email] || (data.userEmail ? data.userEmail.split('@')[0] : "Desconocido"),
        cliente: data.analysis?.nombre_cliente || "Desconocido",
        date: data.createdAt ? data.createdAt.toDate().toISOString() : null,
        duration: data.analysis?.participacion?.duracion_total || "00:00",
        score: generalScore,
        status: "procesado",
        report: data // Enviamos el reporte completo para carga instantánea
      };
    });

    // Ordenar por fecha (más reciente primero)
    sessions.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(0);
      const dateB = b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });

    return res.json({ ok: true, sessions });
  } catch (err) {
    console.error("Error fetching all sessions:", err);
    return res.status(500).json({ ok: false, error: "Error al obtener historial" });
  }
});

// 2. Obtener Detalle de un Reporte Específico
app.get("/api/sessions/:id", async (req, res) => {
  try {
    const isAuthorized = await isAuthRequest(req);
    if (!isAuthorized) {
      return res.status(401).json({ ok: false, error: "No autorizado" });
    }

    const { id } = req.params;
    const requesterEmail = normalizeEmailValue(req.headers["x-admin-email"]);
    const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    if (userSnapshot.empty) return res.status(401).json({ ok: false, error: "Usuario no encontrado" });
    const userData = userSnapshot.docs[0].data();

    const doc = await db.collection("meetings_analysis").doc(id).get();
    if (!doc.exists) return res.status(404).json({ ok: false, error: "Reporte no encontrado" });

    const data = doc.data();

    // Verificación de seguridad básica
    if (userData.role !== "admin" && userData.role !== "superadmin" && data.userEmail !== userData.email) {
      return res.status(403).json({ ok: false, error: "No tienes permiso para ver este reporte" });
    }

    return res.json({ ok: true, report: data });
  } catch (err) {
    console.error("Error fetching report detail:", err);
    return res.status(500).json({ ok: false, error: "Error al obtener detalle" });
  }
});

// 3. Obtener Estadísticas para Dashboard (Admin/Superadmin)
app.get("/api/admin/dashboard-stats", async (req, res) => {
  try {
    const isAuthorized = await isAdminOrSuperadminRequest(req);
    if (!isAuthorized) {
      return res.status(403).json({ ok: false, error: "No autorizado" });
    }

    const snapshot = await db.collection("meetings_analysis").orderBy("createdAt", "desc").get();

    // Agregaciones en memoria (suficiente para la escala actual)
    const stats = {
      totalAudios: snapshot.size,
      totalUsers: new Set(),
      avgScore: 0,
      monthlyHistory: {}, // { "2024-03": count }
      topConsultants: {}, // { email: { count, totalScore, name } }
    };

    let totalScoreSum = 0;

    // Obtener nombres de usuarios para el Top
    const usersSnapshot = await db.collection("users").get();
    const userNamesMap = {};
    usersSnapshot.forEach(u => {
      userNamesMap[u.data().email.toLowerCase()] = u.data().name || u.data().email;
    });

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const email = (data.userEmail || "").toLowerCase();
      if (!email) return;

      stats.totalUsers.add(email);

      // Calcular Score
      const sc = data.analysis?.scorecard || {};
      const score = Math.round(((100 - (sc.muletillas?.score || 0)) + (sc.cierre_negociacion?.score || 0) + (sc.manejo_objeciones?.score || 0) + (sc.propuesta_valor?.score || 0)) / 4);
      totalScoreSum += score;

      // Historial mensual
      if (data.createdAt) {
        const date = data.createdAt.toDate();
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        stats.monthlyHistory[monthKey] = (stats.monthlyHistory[monthKey] || 0) + 1;
      }

      // Top Consultantes
      if (!stats.topConsultants[email]) {
        stats.topConsultants[email] = { count: 0, totalScore: 0, name: userNamesMap[email] || email };
      }
      stats.topConsultants[email].count += 1;
      stats.topConsultants[email].totalScore += score;
    });

    stats.totalUsersCount = stats.totalUsers.size;
    stats.avgScore = stats.totalAudios > 0 ? Math.round(totalScoreSum / stats.totalAudios) : 0;

    // Convertir topConsultants a array y ordenar
    stats.topConsultants = Object.entries(stats.topConsultants)
      .map(([email, data]) => ({
        email,
        name: data.name,
        count: data.count,
        avgScore: Math.round(data.totalScore / data.count)
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10);

    return res.json({ ok: true, stats });
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    return res.status(500).json({ ok: false, error: "Error al obtener estadísticas" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend con Firebase Firestore corriendo en puerto ${PORT} `);
  console.log(`Bucket: ${BUCKET_NAME} `);
  console.log(`CORS_ORIGIN: ${allowedOrigins.join(", ")} `);
});
