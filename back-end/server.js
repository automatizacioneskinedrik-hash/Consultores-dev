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
import followUpRoutes from "./src/routes/followUpRoutes.js";
import aiConfigRoutes from "./src/routes/aiConfigRoutes.js";
import costRoutes from "./src/routes/costRoutes.js";
import metricsRoutes from "./src/routes/metricsRoutes.js";
import apiV1Routes from "./src/routes/apiV1Routes.js";
import devRoutes from "./src/routes/devRoutes.js";
import { ensureUploadAlert } from "./src/services/uploadAlert.js";

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
// The daily recordings alert goes out with the first request after 7 a.m. (Colombia) on working days.
app.use("/api", (req, res, next) => {
  const timeout = new Promise((resolve) => setTimeout(resolve, 10000));
  Promise.race([ensureUploadAlert(), timeout]).catch((error) => console.error("Alerta de grabaciones:", error.message)).finally(() => next());
});

app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/prompts", promptRoutes);
app.use("/api/followups", followUpRoutes);
app.use("/api/ai-config", aiConfigRoutes);
app.use("/api/costs", costRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/v1", apiV1Routes);
app.use("/api/dev", devRoutes);

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ ok: false, error: "Something went wrong!" });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Allowed origins: ${allowedOrigins.join(", ")}`);
});

// Disable Node.js socket and request timeouts — long audio analysis can take 20-30 min.
// Cloud Run request timeout must also be set to 3600s in the GCP console.
server.setTimeout(0);
server.requestTimeout = 0;
