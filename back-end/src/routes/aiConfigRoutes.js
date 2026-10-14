import express from "express";
import * as aiConfigController from "../controllers/aiConfigController.js";
import { getRequester } from "../middleware/auth.js";
import { audited } from "../services/auditLog.js";

const router = express.Router();

// Choosing the AI model changes how every consultant is graded: only the cargos that manage the app.
router.use(async (req, res, next) => {
  const requester = await getRequester(req);
  if (!requester?.cargo.manages) return res.status(403).json({ ok: false, error: "No autorizado" });
  req.requester = requester;
  next();
});

router.get("/", aiConfigController.getConfig);
router.put("/visible-models", audited("ai.visible_models", "Cambió los modelos de IA que se muestran"), aiConfigController.putVisibleModels);
router.post("/activate", audited("ai.activate", (req) => `Activó el modelo de IA ${req.body?.model || ""}`), aiConfigController.postActivate);

export default router;
