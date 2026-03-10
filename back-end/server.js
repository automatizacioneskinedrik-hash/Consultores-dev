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

  try {
    if (!openai) {
      throw new Error("OPENAI_API_KEY no configurada en el entorno");
    }

    // 1. Descargar el archivo desde GCS
    await bucket.file(objectPath).download({ destination: tempFilePath });
    console.log("File downloaded to temp path:", tempFilePath);

    // 2. Transcribir con Whisper (JSON detallado para obtener la duración exacta)
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
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
    const prompt = `Actúa como un Coach de Ventas experto. Analiza la siguiente transcripción de una reunión de ventas y devuelve un JSON estructurado. 
IMPORTANTE: El destinatario del reporte es el CONSULTOR. Todo el feedback (aspectos positivos, puntos de mejora y fortalezas) debe ir dirigido a EVALUAR Y ELOGIAR EL DESEMPEÑO DEL CONSULTOR en su interacción con el cliente. No analices solo al cliente, analiza cómo el consultor manejó la sesión.

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
      { "titulo": "Habilidad demostrada", "descripcion": "Explica qué hizo bien el consultor para guiar al cliente." }
    ],
    "puntos_mejora": [
      { "titulo": "Área de oportunidad", "descripcion": "Indica qué podría haber hecho mejor el consultor para cerrar o avanzar la venta." }
    ],
    "fortaleza_destacada": { "titulo": "Tu mayor fortaleza hoy", "descripcion": "Un elogio directo al consultor sobre su mejor cualidad en esta sesión." }
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
        from: process.env.EMAIL_FROM || "Kinedrik <no-reply@kinedrik.com>",
        to: userEmail,
        subject: `📋 Reporte: Reunión con ${clienteNome} — ${dateStr}`,
        html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
    body { font-family: 'Inter', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
    .header { 
      background: #040025 url('https://storage.googleapis.com/kinedrik-imagenes/Banner%20consultores.png') no-repeat center; 
      background-size: cover; 
      padding: 60px 40px; 
      border-bottom: 4px solid #FF6B00; 
    }
    .logo { color: #ffffff; font-size: 26px; font-weight: 900; letter-spacing: 2px; }
    .badge { border: 1px solid #FF6B00; color: #FF6B00; padding: 5px 12px; border-radius: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
    .hero { padding: 40px 40px 20px 40px; }
    .hero h1 { color: #040025; font-size: 32px; font-weight: 900; margin: 0; letter-spacing: -1px; }
    .greeting { margin-top: 15px; color: #64748b; font-size: 14px; font-weight: 500; }
    .greeting strong { color: #2885FF; }
    .metrics-table { width: 100%; padding: 20px 40px; border-spacing: 15px 0; border-collapse: separate; }
    .metric-card { border-radius: 24px; padding: 25px; text-align: center; vertical-align: middle; }
    .metric-left { background: linear-gradient(135deg, #0040A4 0%, #2885FF 100%); color: #ffffff; width: 50%; }
    .metric-right { background: #ffffff; border: 1px solid #e2e8f0; color: #040025; width: 50%; }
    .label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8; margin-bottom: 15px; display: block; }
    .val-large { font-size: 42px; font-weight: 900; margin: 5px 0; letter-spacing: -1px; }
    .part-stats { margin-bottom: 12px; overflow: hidden; }
    .part-val { font-size: 24px; font-weight: 900; }
    .part-lbl { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; }
    .bar { height: 8px; background: #f1f5f9; border-radius: 10px; overflow: hidden; display: block; margin-top: 5px; }
    .fill-purple { background: #BB8AFF; height: 100%; float: left; }
    .fill-orange { background: #FF5900; height: 100%; float: left; }
    .sec-title { padding: 40px 40px 15px 40px; color: #2885FF; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; }
    .box { margin: 0 40px 15px 40px; padding: 20px; border-radius: 18px; border: 1px solid #f1f5f9; overflow: hidden; }
    .box-pos { background: #f0fdf4; border-color: #dcfce7; }
    .box-imp { background: #fefce8; border-color: #fef08a; }
    .box-str { background: #f5f3ff; border-color: #ddd6fe; }
    .icon { width: 32px; height: 32px; border-radius: 10px; float: left; margin-right: 15px; color: #ffffff; text-align: center; line-height: 32px; font-weight: 900; }
    .txt-cont { float: left; width: 80%; }
    .txt-cont h4 { margin: 0; color: #0f172a; font-size: 15px; }
    .txt-cont p { margin: 3px 0 0 0; color: #64748b; font-size: 13px; font-weight: 400; line-height: 1.4; }
    .quote-sec { padding: 30px 40px; }
    .tag { display: inline-block; background: #FF5900; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 900; margin-bottom: 15px; }
    .quote-card { background: #f8fafc; border: 1px solid #f1f5f9; padding: 25px; border-radius: 20px; font-style: italic; color: #475569; font-size: 14px; }
    .grid-footer { margin: 20px 40px 40px 40px; border-radius: 20px; border: 1px solid #f1f5f9; overflow: hidden; }
    .cell { padding: 20px; vertical-align: top; }
    .footer-note { background: #040025; padding: 20px 40px; color: #ffffff; font-size: 10px; opacity: 0.8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <table width="100%">
        <tr>
          <td class="logo">KINEDRI<span style="transform: scaleX(-1); display: inline-block; color: #FF6B00;">K</span></td>
          <td align="right"><span class="badge">Reporte Confidencial</span></td>
        </tr>
      </table>
    </div>
    
    <div class="hero">
      <h1>Tu Gran Sesión de Hoy</h1>
      <div class="greeting">Un gusto saludarte, <strong>${consultantName}</strong></div>
    </div>

    <table class="metrics-table">
      <tr>
        <td class="metric-card metric-left">
          <span class="label">Tiempo de Conexión</span>
          <div class="val-large">${minutes}:${seconds.toString().padStart(2, '0')}</div>
          <span style="font-size:10px; font-weight:600; opacity:0.7;">¡Minutos de puro valor!</span>
        </td>
        <td class="metric-card metric-right">
          <span class="label" style="color:#0040A4;">Diálogo Compartido</span>
          <table width="100%" class="part-stats">
            <tr>
              <td align="left">
                <div class="part-val" style="color:#BB8AFF;">${analysis.participacion.consultor_pct.replace('%', '')}%</div>
                <div class="part-lbl">Tú</div>
              </td>
              <td align="right">
                <div class="part-val" style="color:#FF5900;">${analysis.participacion.cliente_pct.replace('%', '')}%</div>
                <div class="part-lbl">${clienteNome}</div>
              </td>
            </tr>
          </table>
          <div class="bar">
            <div class="fill-purple" style="width:${analysis.participacion.consultor_pct}"></div>
            <div class="fill-orange" style="width:${analysis.participacion.cliente_pct}"></div>
          </div>
        </td>
      </tr>
    </table>

    <div class="sec-title">Aspectos Positivos</div>
    ${analysis.feedback.aspectos_positivos.map(item => `
    <div class="box box-pos">
      <div class="icon" style="background:#8ABC43;">✓</div>
      <div class="txt-cont">
        <h4>${item.titulo}</h4>
        <p>${item.descripcion}</p>
      </div>
      <div style="clear:both;"></div>
    </div>
    `).join('')}

    <div class="sec-title" style="color:#FF5900;">Puntos de Mejora</div>
    ${analysis.feedback.puntos_mejora.map(item => `
    <div class="box box-imp">
      <div class="icon" style="background:#FBB42A;">!</div>
      <div class="txt-cont">
        <h4>${item.titulo}</h4>
        <p>${item.descripcion}</p>
      </div>
      <div style="clear:both;"></div>
    </div>
    `).join('')}

    <div class="sec-title" style="color:#BB8AFF;">Tus Fortalezas</div>
    <div class="box box-str">
      <div class="icon" style="background:#BB8AFF;">★</div>
      <div class="txt-cont" style="width:85%;">
        <h4>${analysis.feedback.fortaleza_destacada.titulo}</h4>
        <p>${analysis.feedback.fortaleza_destacada.descripcion}</p>
      </div>
      <div style="clear:both;"></div>
    </div>

    <div class="quote-sec">
      <div style="font-size:11px; font-weight:900; text-transform:uppercase; color:#475569; margin-bottom:12px;">Temperatura del Cliente</div>
      <span class="tag">${analysis.temperatura}</span>
      <div class="quote-card">
        "${analysis.resumen}"
      </div>
    </div>

    <table class="grid-footer" width="100%" cellspacing="0">
      <tr>
        <td class="cell" style="border-top:4px solid #8ABC43; background:#fafdfb; border-right:1px solid #f1f5f9; width:50%;">
          <div style="font-size:11px; font-weight:900; color:#8ABC43; margin-bottom:12px;">🎯 Necesidades</div>
          ${analysis.necesidades.map(n => `<div style="font-size:12px; color:#64748b; margin-bottom:5px;">• ${n}</div>`).join('')}
        </td>
        <td class="cell" style="border-top:4px solid #BB8AFF; background:#fbfaff; width:50%;">
          <div style="font-size:11px; font-weight:900; color:#BB8AFF; margin-bottom:12px;">🚀 Próximos Pasos</div>
          <div style="font-size:9px; font-weight:800; color:#040025; margin-bottom:5px; text-transform:uppercase;">Consultor:</div>
          ${analysis.proximos_pasos.consultor.map(p => `<div style="font-size:12px; color:#64748b; margin-bottom:3px;">- ${p}</div>`).join('')}
          <div style="font-size:9px; font-weight:800; color:#040025; margin:10px 0 5px 0; text-transform:uppercase;">Cliente:</div>
          ${analysis.proximos_pasos.cliente.map(p => `<div style="font-size:12px; color:#64748b; margin-bottom:3px;">- ${p}</div>`).join('')}
        </td>
      </tr>
    </table>

    <div class="footer-note">
      KINEDRIK — Elevating skills, boosting real knowledge
    </div>
  </div>
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
    // Limpiar el archivo temporal
    if (await fs.pathExists(tempFilePath)) {
      await fs.remove(tempFilePath);
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
