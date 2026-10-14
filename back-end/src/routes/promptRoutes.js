import express from "express";
import * as promptController from "../controllers/promptController.js";
import * as speechController from "../controllers/speechConfigController.js";
import { getRequester } from "../middleware/auth.js";
import { audited } from "../services/auditLog.js";

const router = express.Router();

router.use(async (req, res, next) => {
  const requester = await getRequester(req);
  if (!requester?.cargo.manages) return res.status(403).json({ ok: false, error: "No autorizado" });
  req.requester = requester;
  next();
});

// Speech comercial. The draft autosaves on every edit, so only discarding it is recorded.
router.get("/speech", speechController.getSpeechConfig);
router.put("/speech/draft", speechController.putSpeechDraft);
router.delete("/speech/draft", audited("speech.discard_draft", "Descartó el borrador del speech comercial"), speechController.deleteSpeechDraft);
router.post("/speech/publish", audited("speech.publish", "Publicó una nueva versión del speech comercial"), speechController.postSpeechPublish);
router.post("/speech/versions/:id/activate", audited("speech.activate", "Volvió a una versión anterior del speech comercial"), speechController.postSpeechActivate);

// Instrucciones adicionales (colección "prompts" en Firestore)
router.get("/", promptController.getAllPrompts);
router.post("/", audited("prompt.create", "Creó una instrucción adicional"), promptController.createPrompt);
router.post("/restore-default", audited("prompt.restore", "Restauró la instrucción por defecto"), promptController.restoreDefaultPrompt);
router.post("/:id/activate", audited("prompt.activate", "Activó una instrucción adicional"), promptController.activatePrompt);
router.post("/:id/favorite", promptController.toggleFavoritePrompt);

// Prompts de mensaje WhatsApp de seguimiento
router.get("/followup", promptController.listFollowupPrompts);
router.post("/followup", audited("followup.save", "Guardó una nueva instrucción del mensaje de WhatsApp"), promptController.saveFollowupPrompt);
router.post("/followup/:id/activate", audited("followup.activate", "Activó otra instrucción del mensaje de WhatsApp"), promptController.activateFollowup);
router.delete("/followup/:id", audited("followup.delete", "Eliminó una instrucción del mensaje de WhatsApp"), promptController.deleteFollowup);

export default router;
