import express from "express";
import { getRequester } from "../middleware/auth.js";
import { coachMetrics } from "../services/coachMetrics.js";

const router = express.Router();

// Every role sees Métricas; the service limits own-scope roles to their own calls.
router.use(async (req, res, next) => {
  const requester = await getRequester(req);
  if (!requester) return res.status(401).json({ ok: false, error: "No autorizado" });
  req.requester = requester;
  next();
});

router.get("/coach", async (req, res) => {
  try {
    const { consultant, versionId } = req.query;
    res.json(await coachMetrics({ requester: req.requester, consultant, versionId }));
  } catch (error) {
    console.error("Error en métricas Coach:", error);
    res.status(500).json({ ok: false, error: "No se pudieron calcular las métricas." });
  }
});

export default router;
