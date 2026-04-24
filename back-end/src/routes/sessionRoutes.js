import express from "express";
import * as sessionController from "../controllers/sessionController.js";
import { isAuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(async (req, res, next) => {
  const authorized = await isAuthRequest(req);
  if (!authorized) return res.status(401).json({ ok: false, error: "No autorizado" });
  next();
});

router.get("/recent", sessionController.getRecentSessions);
router.get("/", sessionController.getAllSessions);
router.get("/:id", sessionController.getSessionDetail);
router.post("/resend", sessionController.resendSessionEmail);

export default router;
