import express from "express";
import cors from "cors";
import morgan from "morgan";
import multer from "multer";
import path from "path";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3001;

// 1) CORS: permite que tu frontend (vite) llame al backend
app.use(
  cors({
    origin: ["http://localhost:5173"], // cambia si tu front corre en otro puerto/dominio
    credentials: true,
  })
);

app.use(morgan("dev"));

// 2) Carpeta donde guardaremos archivos
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// 3) Config multer: dónde y cómo guardar
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // nombre seguro + timestamp
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safeName}`);
  },
});

function fileFilter(req, file, cb) {
  // Solo permitir audio/*
  if (file.mimetype && file.mimetype.startsWith("audio/")) {
    cb(null, true);
  } else {
    cb(new Error("Solo se permiten archivos de audio."), false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB (ajusta según tus necesidades)
  },
});

// 4) Ruta de upload
app.post("/api/upload-audio", upload.single("audio"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No llegó el archivo." });
    }

    // req.file contiene info del archivo
    return res.json({
      ok: true,
      message: "Archivo recibido correctamente",
      file: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 5) Manejo de errores (multer también cae aquí)
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message?.includes("Solo se permiten")) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ ok: false, error: "Archivo demasiado grande." });
  }
  return res.status(500).json({ ok: false, error: "Error interno." });
});

app.listen(PORT, () => {
  console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
});

