import express from "express";
import * as promptController from "../controllers/promptController.js";
import { isAdminOrSuperadminRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(async (req, res, next) => {
  const authorized = await isAdminOrSuperadminRequest(req);
  if (!authorized) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
});

// Instrucciones adicionales (colección "prompts" en Firestore)
router.get("/", promptController.getAllPrompts);
router.post("/", promptController.createPrompt);
router.post("/restore-default", promptController.restoreDefaultPrompt);
router.post("/:id/activate", promptController.activatePrompt);
router.post("/:id/favorite", promptController.toggleFavoritePrompt);

// Prompts de mensaje WhatsApp de seguimiento
router.get("/followup", promptController.listFollowupPrompts);
router.post("/followup", promptController.saveFollowupPrompt);
router.post("/followup/:id/activate", promptController.activateFollowup);
router.delete("/followup/:id", promptController.deleteFollowup);

export default router;
