import express from "express";
import { getRequester } from "../middleware/auth.js";
import { COSTS_START_DATE, getCosts, utcDay } from "../services/costReport.js";

const router = express.Router();
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Costs are visible to the same cargos as Configuración avanzada.
router.use(async (req, res, next) => {
  const requester = await getRequester(req);
  if (!requester?.cargo.manages) return res.status(403).json({ ok: false, error: "No autorizado" });
  req.requester = requester;
  next();
});

router.get("/", async (req, res) => {
  const fromDay = DAY_PATTERN.test(req.query.from || "") ? req.query.from : COSTS_START_DATE;
  const toDay = DAY_PATTERN.test(req.query.to || "") ? req.query.to : utcDay(Date.now());
  try {
    res.json({ ok: true, ...(await getCosts(fromDay, toDay)) });
  } catch (error) {
    console.error("Error cargando costos:", error);
    res.status(500).json({ ok: false, error: "No se pudieron cargar los costos." });
  }
});

export default router;
