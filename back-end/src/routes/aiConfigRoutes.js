import express from "express";
import * as aiConfigController from "../controllers/aiConfigController.js";
import { isSuperAdminRequest } from "../middleware/auth.js";

const router = express.Router();

// Choosing the AI model changes how every consultant is graded: superadmin only.
router.use(async (req, res, next) => {
  if (!(await isSuperAdminRequest(req))) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
});

router.get("/", aiConfigController.getConfig);
router.put("/visible-models", aiConfigController.putVisibleModels);
router.post("/activate", aiConfigController.postActivate);
router.get("/test-sessions", aiConfigController.getTestSessions);
router.post("/test", aiConfigController.postTest);

export default router;
