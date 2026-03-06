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
    const password = req.body.password; // Receive password from request
    if (!email) return res.status(400).json({ ok: false, error: "Email requerido" });

    // Query Firestore for authorized users
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("email", "==", email).limit(1).get();

    if (snapshot.empty) {
      return res.status(401).json({ ok: false, error: "No estás registrado en la plataforma. Por favor, escribe al administrador para que te registre." });
    }

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    // If password is provided (Admin form), check it
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

    // 2. Transcribe with Whisper (Verbose JSON to get exact duration)
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      response_format: "verbose_json",
    });
    console.log("Transcription completed");

    // Get exact duration
    const totalSeconds = transcription.duration || 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const durationStr = `${minutes} min ${seconds} seg`;

    // 3. GPT-4o Analysis with improved prompt
    const prompt = `Analiza la siguiente transcripción de una reunión de ventas y devuelve un JSON estructurado siguiendo este esquema exacto:
{
  "nombre_cliente": "Nombre del cliente",
  "temperatura": "FRÍO / TIBIO / CALIENTE",
  "resumen": "Resumen ejecutivo de 3-4 líneas enfatizando acuerdos",
  "participacion": {
    "consultor_pct": "X%",
    "cliente_pct": "Y%",
    "duracion_total": "${durationStr}"
  },
  "feedback": {
    "aspectos_positivos": ["Logro 1", "Logro 2"],
    "puntos_mejora": ["Punto 1", "Punto 2"],
    "conclusion_motivadora": "Frase breve y motivadora para el consultor dedicada al éxito de la cuenta"
  },
  "consejos_mejora": [
    { "titulo": "Escucha Activa", "descripcion": "Dedicación a...", "tipo": "escucha" },
    { "titulo": "Asignación Directa", "descripcion": "Nombra un...", "tipo": "asignacion" }
  ],
  "necesidades": ["necesidad 1", "necesidad 2"],
  "objeciones": ["objeción 1", "objeción 2"],
  "proximos_pasos": {
    "consultor": ["paso 1"],
    "cliente": ["paso 1"],
    "fechas_mencionadas": ["fecha 1"]
  },
  "alerta_comportamiento": "Nota breve sobre el comportamiento si se detectó algo crítico (ej: poco tiempo de escucha), si no hay nada, dejar vacío"
}

Transcripción:
${transcription.text}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    // Force the exact duration from Whisper
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

    // 5. Send Email with Premium Design
    if (userEmail && userEmail !== "anonymous") {
      const clienteNome = analysis.nombre_cliente || userEmail.split('@')[0];
      const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

      const mailOptions = {
        from: process.env.EMAIL_FROM || "Kinedrik <no-reply@kinedrik.com>",
        to: userEmail,
        subject: `📋 Reporte: Reunión con ${clienteNome} — ${dateStr}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background-color: #ffffff; color: #333; }
    .container { max-width: 600px; margin: 20px auto; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.12); border: 1px solid #eee; }
    
    /* Header */
    .header { background-color: #040025; padding: 24px; border-bottom: 3px solid #BB8AFF; }
    .logo { font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
    .logo-k { color: #BB8AFF; display: inline-block; transform: scaleX(-1); }
    .badge-confidential { float: right; border: 1.5px solid #BB8AFF; color: #BB8AFF; font-size: 9px; padding: 4px 8px; border-radius: 4px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
    
    /* Title Section */
    .title-section { padding: 24px; border-bottom: 1px solid #eee; }
    .title-section h1 { font-size: 28px; font-weight: 800; color: #040025; margin: 0 0 8px 0; }
    .client-info { font-size: 14px; color: #0040A4; font-weight: 600; }
    .client-info span { color: #2885FF; font-weight: 400; margin-left: 5px; }
    
    /* Metrics */
    .metrics { padding: 0 24px 24px 24px; display: flex; gap: 12px; }
    .card-metric { border-radius: 12px; padding: 16px; position: relative; }
    .duration { flex: 1; background: #040025; color: #E7E7E7; text-align: center; }
    .duration-label { font-size: 10px; font-weight: 800; color: #E7E7E7; letter-spacing: 1px; margin-bottom: 8px; }
    .duration-val { font-size: 32px; font-weight: 800; color: #ffffff; }
    .duration-unit { font-size: 10px; color: #FBB42A; margin-top: 4px; }

    .participation { flex: 1.8; border: 1.5px solid #0040A4; }
    .participation-label { font-size: 10px; font-weight: 800; color: #0040A4; letter-spacing: 2px; margin-bottom: 12px; }
    .metric-table { width: 100%; }
    .metric-col { text-align: center; }
    .metric-col-label { font-size: 8px; color: #777; font-weight: 800; margin-bottom: 4px; }
    .metric-col-val { font-size: 18px; font-weight: 800; }
    .progress-bar { height: 6px; border-radius: 3px; background: #eee; margin: 12px 0 8px 0; overflow: hidden; position: relative; }
    .progress-fill-consultor { height: 100%; background: #BB8AFF; float: left; }
    .progress-fill-cliente { height: 100%; background: #FF5900; float: left; }
    .legend { font-size: 9px; font-weight: 700; color: #666; margin-top: 5px; }
    
    /* Common Section Label */
    .section-label { font-size: 10px; font-weight: 800; color: #0040A4; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 16px; padding: 0 24px; }
    
    /* Feedback cards */
    .feedback-container { padding: 0 24px 24px 24px; }
    .card-feedback { background: #fafafa; padding: 16px; border-radius: 12px; margin-bottom: 12px; border-left: 5px solid transparent; }
    .card-positive { border-left-color: #8ABC43; }
    .card-improvement { border-left-color: #FF5900; }
    .card-motivation { border-left-color: #FBB42A; }
    .card-feedback h3 { font-size: 14px; font-weight: 800; color: #040025; margin: 0 0 8px 0; }
    .card-feedback p, .card-feedback li { font-size: 12px; color: #333; line-height: 1.5; margin: 0; }
    .card-feedback ul { margin: 0; padding-left: 18px; }
    
    /* Tips */
    .tips-container { padding: 0 24px 24px 24px; }
    .card-tip { background: #040025; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
    .card-tip-table { width: 100%; }
    .tip-icon { font-size: 20px; width: 35px; vertical-align: middle; }
    .tip-content {}
    .tip-title { font-size: 14px; font-weight: 800; color: #FBB42A; margin-bottom: 4px; }
    .tip-text { font-size: 12px; color: #E7E7E7; opacity: 0.9; line-height: 1.4; }
    
    /* Temperature */
    .temp-section { padding: 0 24px 24px 24px; }
    .temp-badge { display: inline-block; background: #FF5900; color: #ffffff; font-size: 10px; font-weight: 800; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; margin-bottom: 12px; }
    .temp-card { background: #fafafa; border: 1px solid rgba(187, 138, 255, 0.2); border-radius: 12px; padding: 16px; }
    .temp-card p { font-size: 12px; line-height: 1.6; margin: 0; color: #333; }
    .temp-card strong { color: #0040A4; font-weight: 800; }
    
    /* Columns Needs/Steps */
    .columns-section { padding: 0 24px 24px 24px; }
    .col-table { width: 100%; border-collapse: separate; border-spacing: 12px 0; margin: 0 -12px; }
    .col-item { vertical-align: top; width: 50%; background: #fafafa; border: 1px solid #eee; border-radius: 12px; overflow: hidden; }
    .col-header-green { border-top: 4px solid #8ABC43; padding: 12px; }
    .col-header-purple { border-top: 4px solid #BB8AFF; padding: 12px; }
    .col-title { font-size: 12px; font-weight: 800; margin-bottom: 8px; }
    .col-title-green { color: #8ABC43; }
    .col-title-purple { color: #BB8AFF; }
    .col-list { margin: 0; padding: 0 12px 12px 25px; font-size: 11px; color: #444; line-height: 1.5; }
    
    /* Footer */
    .footer { background: #040025; padding: 40px 24px; text-align: center; border-top: 3px solid #BB8AFF; }
    .tagline { color: #E7E7E7; font-size: 12px; font-style: italic; opacity: 0.75; margin-top: 20px; display: block; }
    
    /* Behavior Alert */
    .behavior-alert { background: #fff5f5; border: 1px solid #feb2b2; border-radius: 12px; padding: 16px; margin: 0 24px 24px 24px; }
    .alert-label { font-size: 9px; font-weight: 800; color: #c53030; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .alert-text { font-size: 12px; color: #9b2c2c; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <!-- HEADER -->
    <div class="header">
      <div class="badge-confidential">Reporte Confidencial</div>
      <div class="logo">
        KINEDRI<span class="logo-k">K</span>
      </div>
    </div>

    <!-- TITLE -->
    <div class="title-section">
      <h1>Análisis de Reunión</h1>
      <div class="client-info">👤 Cliente: <span>${clienteNome}</span></div>
    </div>

    <!-- METRICS -->
    <div class="metrics">
      <!-- Duración a la izquierda -->
      <div class="card-metric duration">
        <div class="duration-label">DURACIÓN TOTAL</div>
        <div class="duration-val">${minutes}:${seconds.toString().padStart(2, '0')}</div>
        <div class="duration-unit">min &middot; seg</div>
      </div>

      <div class="card-metric participation">
        <div class="participation-label">PARTICIPACIÓN</div>
        <table class="metric-table">
          <tr>
            <td class="metric-col">
              <div class="metric-col-label">CONSULTOR</div>
              <div class="metric-col-val" style="color: #BB8AFF;">${analysis.participacion.consultor_pct}</div>
            </td>
            <td width="1" style="background: #eee;"></td>
            <td class="metric-col">
              <div class="metric-col-label">CLIENTE</div>
              <div class="metric-col-val" style="color: #FF5900;">${analysis.participacion.cliente_pct}</div>
            </td>
          </tr>
        </table>
        <div class="progress-bar">
          <div class="progress-fill-consultor" style="width: ${analysis.participacion.consultor_pct}"></div>
          <div class="progress-fill-cliente" style="width: ${analysis.participacion.cliente_pct}"></div>
        </div>
        <div class="legend">🟣 Consultor ${analysis.participacion.consultor_pct} &nbsp; 🟠 Cliente ${analysis.participacion.cliente_pct}</div>
      </div>
    </div>

    <!-- FEEDBACK -->
    <div class="section-label">FEEDBACK DE LA SESIÓN</div>
    <div class="feedback-container">
      <div class="card-feedback card-positive">
        <h3>✅ Aspectos Positivos</h3>
        <ul>
          ${analysis.feedback.aspectos_positivos.map(p => `<li>${p}</li>`).join('')}
        </ul>
      </div>
      <div class="card-feedback card-improvement">
        <h3>⚡ Puntos de Mejora</h3>
        <ul>
          ${analysis.feedback.puntos_mejora.map(m => `<li>${m}</li>`).join('')}
        </ul>
      </div>
      <div class="card-feedback card-motivation">
        <h3>⭐ Conclusión Motivadora</h3>
        <p><em>"${analysis.feedback.conclusion_motivadora}"</em></p>
      </div>
    </div>

    <!-- TIPS -->
    <div class="section-label">CONSEJOS DE MEJORA</div>
    <div class="tips-container">
      ${analysis.consejos_mejora.map(tip => `
        <div class="card-tip">
          <table class="card-tip-table">
            <tr>
              <td class="tip-icon">${tip.tipo === 'escucha' ? '🎧' : '✅'}</td>
              <td class="tip-content">
                <div class="tip-title">${tip.titulo}</div>
                <div class="tip-text">${tip.descripcion}</div>
              </td>
            </tr>
          </table>
        </div>
      `).join('')}
    </div>

    <!-- TEMPERATURE -->
    <div class="section-label">TEMPERATURA DEL CLIENTE</div>
    <div class="temp-section">
      <div class="temp-badge">${analysis.temperatura === 'CALIENTE' ? '🔥 CALIENTE' : analysis.temperatura === 'TIBIO' ? '⚖️ TIBIO' : '❄️ FRÍO'}</div>
      <div class="temp-card">
        <p>${analysis.resumen}</p>
      </div>
    </div>

    <!-- NEEDS & STEPS -->
    <div class="columns-section">
      <table class="col-table">
        <tr>
          <td class="col-item">
            <div class="col-header-green">
              <div class="col-title col-title-green">🎯 Necesidades</div>
            </div>
            <ul class="col-list">
              ${analysis.necesidades.map(n => `<li>${n}</li>`).join('')}
            </ul>
          </td>
          <td class="col-item">
            <div class="col-header-purple">
              <div class="col-title col-title-purple">🚀 Próximos Pasos</div>
            </div>
            <ul class="col-list">
              <li style="list-style: none; font-weight: 700; margin-bottom: 4px; margin-left: -10px;">Consultor:</li>
              ${analysis.proximos_pasos.consultor.map(p => `<li>${p}</li>`).join('')}
              <li style="list-style: none; font-weight: 700; margin-top: 8px; margin-bottom: 4px; margin-left: -10px;">Cliente:</li>
              ${analysis.proximos_pasos.cliente.map(p => `<li>${p}</li>`).join('')}
            </ul>
          </td>
        </tr>
      </table>
    </div>

    ${analysis.alerta_comportamiento ? `
      <!-- BEHAVIOR ALERT -->
      <div class="behavior-alert">
        <div class="alert-label">⚠️ Alerta de Comportamiento</div>
        <div class="alert-text">${analysis.alerta_comportamiento}</div>
      </div>
    ` : ''}

    <!-- FOOTER -->
    <div class="footer">
      <div class="logo" style="margin-bottom: 5px;">
        KINEDRI<span class="logo-k">K</span>
      </div>
      <span class="tagline">"Elevating skills, boosting real knowledge"</span>
      <p style="font-size: 10px; color: #E7E7E7; opacity: 0.5; margin-top: 25px;">
        &copy; ${new Date().getFullYear()} KINEDRIK. Todos los derechos reservados.
      </p>
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

    // Restriction: Admins cannot delete other Admins, only Superadmins can.
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
  console.log(`Backend con Firebase Firestore corriendo en puerto ${PORT}`);
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`CORS_ORIGIN: ${allowedOrigins.join(", ")}`);
});
