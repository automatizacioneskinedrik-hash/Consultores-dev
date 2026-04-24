import express from "express";
import * as promptController from "../controllers/promptController.js";
import { isAdminOrSuperadminRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(async (req, res, next) => {
  const authorized = await isAdminOrSuperadminRequest(req);
  if (!authorized) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
});

router.get("/", promptController.getAllPrompts);
router.post("/", promptController.createPrompt);
router.post("/:id/activate", promptController.activatePrompt);
router.post("/:id/favorite", promptController.toggleFavoritePrompt);
router.post("/restore-default", promptController.restoreDefaultPrompt);

export default router;
