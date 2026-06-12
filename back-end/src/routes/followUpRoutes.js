import express from "express";
import { getFollowUps, markAsSent, markAsDismissed, savePhone } from "../controllers/followUpController.js";
import { isAuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(async (req, res, next) => {
  const authorized = await isAuthRequest(req);
  if (!authorized) return res.status(401).json({ ok: false, error: "No autorizado." });
  next();
});

router.get("/", getFollowUps);
router.patch("/:id/enviado", markAsSent);
router.patch("/:id/rechazado", markAsDismissed);
router.patch("/:id/telefono", savePhone);

export default router;
