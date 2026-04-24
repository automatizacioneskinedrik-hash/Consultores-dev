import express from "express";
import * as uploadController from "../controllers/uploadController.js";
import { isAuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(async (req, res, next) => {
  const authorized = await isAuthRequest(req);
  if (!authorized) return res.status(401).json({ ok: false, error: "No autorizado. Inicia sesión nuevamente." });
  next();
});

router.post("/signed-url", uploadController.getSignedUrl);
router.post("/complete", uploadController.completeUpload);

export default router;
