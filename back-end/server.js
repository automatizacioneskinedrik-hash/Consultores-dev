import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";

// Importar rutas
import authRoutes from "./src/routes/authRoutes.js";
import uploadRoutes from "./src/routes/uploadRoutes.js";
import sessionRoutes from "./src/routes/sessionRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import promptRoutes from "./src/routes/promptRoutes.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares globales
app.use(morgan("dev"));
app.use(express.json());

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Health check
app.get("/", (req, res) => {
  res.json({ ok: true, message: "Kinedriꓘ Backend API is running", version: "2.0.0" });
});

// Definición de Rutas
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/prompts", promptRoutes);

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ ok: false, error: "Something went wrong!" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Allowed origins: ${allowedOrigins.join(", ")}`);
});
