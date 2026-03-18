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

// Inicializar Firebase Admin
import { createRequire } from "module";
const require = createRequire(import.meta.url);

let adminConfig = {};
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

    return res.json({
      ok: true,
      user: {
        id: userDoc.id,
        email: user.email,
        name: user.name || "",
        role: user.role || "user",
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

    // Proceso síncrono para que el front-end sepa cuándo termina
    await processAudioAnalysis(objectPath, userEmail);

    return res.json({ ok: true, message: "Análisis completado y correo enviado." });

  } catch (err) {
    console.error("Error en complete:", err);
    return res.status(500).json({ ok: false, error: err.message });
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

    // 2. Transcribir con Whisper (JSON detallado para obtener la duración exacta)
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(finalAudioPath),
      model: "whisper-1",
      response_format: "verbose_json",
    });
    console.log("Transcription completed");

    // Obtener la duración exacta
    const totalSeconds = transcription.duration || 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // 3. Análisis con GPT-4o con un prompt centrado en el consultor
    const prompt = `Analiza la siguiente transcripción de una reunión de ventas, con especial énfasis en los tiempos y porcentaje de habla de cada participante, y devuelve un JSON estructurado. El objetivo es calcular de manera precisa cuánto habla el cliente y cuánto habla el consultor, basándote en el tiempo total y la transcripción. Asegúrate de que el porcentaje de habla sea lo más preciso posible.

IMPORTANTE: 
- El destinatario del reporte es el CONSULTOR. Todo el feedback (aspectos positivos, puntos de mejora y fortalezas) debe ir dirigido a EVALUAR Y ELOGIAR EL DESEMPEÑO DEL CONSULTOR en su interacción con el cliente. No analices solo al cliente, analiza cómo el consultor manejó la sesión.
- Genere al menos cinco puntos de mejora  basada en la transcripción, tenga en cuenta uso de: Romperhielos, buen presentación del producto y un cierre adeacuado que indique un posible acuerdo de preventa/adquisición del producto.

Esquema exacto:

{
  "nombre_cliente": "Nombre del cliente",
  "temperatura": "CALIENTE / TIBIO / FRÍO",
  "resumen": "Resumen ejecutivo de 3-4 líneas sobre lo ocurrido, acuerdos y el tono de la reunión.",
  "participacion": {
    "consultor_pct": "X%",
    "cliente_pct": "Y%",
    "duracion_total": "${durationStr}"
  },
  "feedback": {
    "aspectos_positivos": [
      { 
        "titulo": "Habilidad demostrada", 
        "descripcion": "Explica qué hizo bien el consultor para guiar al cliente." 
      }
    ],
    "puntos_mejora": [
      { 
        "titulo": "Área de oportunidad", 
        "descripcion": "Indica qué podría haber hecho mejor el consultor para cerrar o avanzar la venta." 
      }
    ],
    "fortaleza_destacada": { 
      "titulo": "Tu mayor fortaleza hoy", 
      "descripcion": "Un elogio directo al consultor sobre su mejor cualidad en esta sesión." 
    }
  },
  "recomendacion_estrategica": {
    "titulo": "Próximo movimiento maestro",
    "descripcion": "Consejo táctico para que el consultor concrete la venta basado en la psicología del cliente."
  },
  "necesidades": ["necesidad detectada del cliente"],
  "objeciones": ["objeción planteada por el cliente"],
  "proximos_pasos": {
    "consultor": ["acción inmediata del consultor"],
    "cliente": ["qué debe hacer el cliente ahora"],
    "fechas_mencionadas": ["fechas clave acordadas"]
  },
  "alerta_comportamiento": "Solo si el consultor cometió un error crítico de comunicación o escucha, de lo contrario dejar vacío."
}

Transcripción:
${transcription.text}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    // Forzar la duración exacta proveniente de Whisper
    analysis.participacion.duracion_total = durationStr;
    console.log("GPT-4o Analysis completed with exact duration:", durationStr);

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

      const mailOptions = {
        from: process.env.EMAIL_FROM || "Kinedriꓘ <no-reply@kinedrik.com>",
        to: userEmail,
        subject: `📋 Reporte: Reunión con ${clienteNome} — ${dateStr}`,
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
            <td style="padding:20px 40px 10px 40px;" class="px-mobile">
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

          <!-- Aspectos positivos -->
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <div style="color:#2885FF; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">
                Aspectos Positivos
              </div>
            </td>
          </tr>

          ${analysis.feedback.aspectos_positivos.map(item => `
          <tr>
            <td style="padding:0 40px 15px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0FDF4; border:1px solid #DCFCE7; border-radius:18px;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" width="47" style="width:47px;">
                          <div style="width:32px; height:32px; line-height:32px; text-align:center; border-radius:10px; background-color:#8ABC43; color:#FFFFFF; font-weight:900;">✓</div>
                        </td>
                        <td valign="top" class="text-box">
                          <div style="margin:0; color:#0F172A; font-size:15px; font-weight:700; line-height:1.3;">${item.titulo}</div>
                          <div style="margin-top:4px; color:#64748B; font-size:13px; line-height:1.45;">${item.descripcion}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          `).join('')}

          <!-- Puntos de mejora -->
          <tr>
            <td style="padding:20px 40px 10px 40px;" class="px-mobile">
              <div style="color:#FF5900; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">
                Puntos de Mejora
              </div>
            </td>
          </tr>

          ${analysis.feedback.puntos_mejora.map(item => `
          <tr>
            <td style="padding:0 40px 15px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FEFCE8; border:1px solid #FEF08A; border-radius:18px;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" width="47" style="width:47px;">
                          <div style="width:32px; height:32px; line-height:32px; text-align:center; border-radius:10px; background-color:#FBB42A; color:#FFFFFF; font-weight:900;">!</div>
                        </td>
                        <td valign="top" class="text-box">
                          <div style="margin:0; color:#0F172A; font-size:15px; font-weight:700; line-height:1.3;">${item.titulo}</div>
                          <div style="margin-top:4px; color:#64748B; font-size:13px; line-height:1.45;">${item.descripcion}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          `).join('')}

          <!-- Fortaleza -->
          <tr>
            <td style="padding:20px 40px 10px 40px;" class="px-mobile">
              <div style="color:#BB8AFF; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">
                Tus Fortalezas
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 15px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F3FF; border:1px solid #DDD6FE; border-radius:18px;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" width="47" style="width:47px;">
                          <div style="width:32px; height:32px; line-height:32px; text-align:center; border-radius:10px; background-color:#BB8AFF; color:#FFFFFF; font-weight:900;">★</div>
                        </td>
                        <td valign="top" class="text-box">
                          <div style="margin:0; color:#0F172A; font-size:15px; font-weight:700; line-height:1.3;">
                            ${analysis.feedback.fortaleza_destacada.titulo}
                          </div>
                          <div style="margin-top:4px; color:#64748B; font-size:13px; line-height:1.45;">
                            ${analysis.feedback.fortaleza_destacada.descripcion}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Temperatura -->
          <tr>
            <td style="padding:20px 40px 10px 40px;" class="px-mobile">
              <div style="font-size:11px; font-weight:900; text-transform:uppercase; color:#475569; margin-bottom:12px;">
                Temperatura del Cliente
              </div>
              <span style="display:inline-block; background-color:#FF5900; color:#FFFFFF; padding:4px 12px; border-radius:20px; font-size:10px; font-weight:900; margin-bottom:15px;">
                ${analysis.temperatura}
              </span>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 25px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC; border:1px solid #F1F5F9; border-radius:20px;">
                <tr>
                  <td style="padding:25px; color:#475569; font-size:14px; line-height:1.6; font-style:italic;">
                    "${analysis.resumen}"
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer grid -->
          <tr>
            <td style="padding:0 40px 35px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #F1F5F9; border-radius:20px; overflow:hidden;" class="footer-col">
                <tr>
                  <td valign="top" width="50%" style="padding:20px; border-top:4px solid #8ABC43; background-color:#FAFDFB; border-right:1px solid #F1F5F9;">
                    <div style="font-size:11px; font-weight:900; color:#8ABC43; margin-bottom:12px;">
                      🎯 Necesidades
                    </div>
                    ${analysis.necesidades.map(n => `<div style="font-size:12px; color:#64748B; margin-bottom:5px; line-height:1.45;">• ${n}</div>`).join('')}
                  </td>
                  <td valign="top" width="50%" style="padding:20px; border-top:4px solid #BB8AFF; background-color:#FBFAFF;">
                    <div style="font-size:11px; font-weight:900; color:#BB8AFF; margin-bottom:12px;">
                      🚀 Próximos Pasos
                    </div>
                    <div style="font-size:9px; font-weight:800; color:#040025; margin-bottom:5px; text-transform:uppercase;">
                      Consultor:
                    </div>
                    ${analysis.proximos_pasos.consultor.map(p => `<div style="font-size:12px; color:#64748B; margin-bottom:3px; line-height:1.45;">- ${p}</div>`).join('')}
                    <div style="font-size:9px; font-weight:800; color:#040025; margin:10px 0 5px 0; text-transform:uppercase;">
                      Cliente:
                    </div>
                    ${analysis.proximos_pasos.cliente.map(p => `<div style="font-size:12px; color:#64748B; margin-bottom:3px; line-height:1.45;">- ${p}</div>`).join('')}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#040025; padding:20px 40px; color:#FFFFFF; font-size:10px; line-height:1.5; opacity:0.85;" class="px-mobile">
              KINEDRIꓘ — Elevating skills, boosting real knowledge
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
    const requesterRole = req.headers["x-admin-role"];
    const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase();

    const isAuthorized = requesterRole === "admin" || requesterRole === "superadmin" || requesterEmail === "adminkinedrik@eadic.com";
    if (!isAuthorized) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para ver la lista de usuarios" });
    }

    const snapshot = await db.collection("users").orderBy("createdAt", "desc").get();
    const users = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter(u => u.role !== "superadmin" && u.email !== "adminkinedrik@eadic.com");

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
    const requesterRole = req.headers["x-admin-role"];
    const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase();

    const isSuperAdmin = requesterRole === "superadmin" || requesterEmail === "adminkinedrik@eadic.com";

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
    const { id } = req.params;
    const { name, email, role } = req.body;
    const requesterRole = req.headers["x-admin-role"];
    const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase();

    const isSuperAdmin = requesterRole === "superadmin" || requesterEmail === "adminkinedrik@eadic.com";

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
    const { id } = req.params;
    const requesterRole = req.headers["x-admin-role"];
    const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase();

    const isSuperAdmin = requesterRole === "superadmin" || requesterEmail === "adminkinedrik@eadic.com";

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

app.listen(PORT, () => {
  console.log(`Backend con Firebase Firestore corriendo en puerto ${PORT} `);
  console.log(`Bucket: ${BUCKET_NAME} `);
  console.log(`CORS_ORIGIN: ${allowedOrigins.join(", ")} `);
});
