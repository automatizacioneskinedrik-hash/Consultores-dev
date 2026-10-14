import express from "express";
import * as uploadController from "../controllers/uploadController.js";
import { getRequester } from "../middleware/auth.js";

const router = express.Router();

router.use(async (req, res, next) => {
  const requester = await getRequester(req);
  if (!requester) return res.status(401).json({ ok: false, error: "No autorizado. Inicia sesión nuevamente." });
  req.requester = requester;
  next();
});

router.post("/signed-url", uploadController.getSignedUrl);
router.post("/complete", uploadController.completeUpload);

export default router;
