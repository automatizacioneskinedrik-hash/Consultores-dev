// Public API for other systems. Access with "Authorization: Bearer <key>" (keys from Documentación y API),
// or with an engineer's session so the "Probar" button works from the docs page.
import express from "express";
import { getRequester } from "../middleware/auth.js";
import { verifyApiKey } from "../services/apiKeys.js";
import { ApiError, activeSpeech, dailyCosts, dailyUploads, getSession, listSessions, listUsers, speechVersion } from "../services/publicApi.js";

const router = express.Router();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;
const usage = new Map();

const sendError = (res, status, code, message) => res.status(status).json({ error: { code, message } });

function overLimit(clientId) {
  const now = Date.now();
  const entry = usage.get(clientId);
  if (!entry || now - entry.start >= RATE_WINDOW_MS) {
    usage.set(clientId, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

router.use(async (req, res, next) => {
  try {
    const header = String(req.headers.authorization || "");
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    if (token) {
      const key = await verifyApiKey(token);
      if (!key) return sendError(res, 401, "invalid_key", "La llave no es válida. Revisa que la copiaste completa.");
      if (key.revoked) return sendError(res, 403, "revoked_key", "Esta llave fue revocada. Crea una nueva en Documentación y API.");
      req.apiClient = { id: `key:${key.id}`, name: key.name };
    } else {
      const requester = await getRequester(req);
      if (requester?.cargo.id !== "ingeniero") return sendError(res, 401, "missing_key", "Falta la cabecera Authorization: Bearer <llave>.");
      req.apiClient = { id: `user:${requester.email}`, name: requester.email };
    }
    if (overLimit(req.apiClient.id)) {
      res.set("Retry-After", "60");
      return sendError(res, 429, "rate_limited", `Superaste el límite de ${RATE_LIMIT} consultas por minuto. Espera un minuto y vuelve a intentarlo.`);
    }
    next();
  } catch (error) {
    next(error);
  }
});

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (error) {
    if (error instanceof ApiError) return sendError(res, error.status, error.code, error.message);
    console.error("API v1:", error);
    sendError(res, 500, "internal_error", "Error interno. Inténtalo de nuevo; si sigue fallando, avisa al equipo de Speech.");
  }
};

router.get("/ping", handle((req) => ({ ok: true, client: req.apiClient.name, time: new Date().toISOString() })));
router.get("/sessions", handle((req) => listSessions(req.query)));
router.get("/sessions/:id", handle((req) => getSession(req.params.id, { includeTranscript: String(req.query.include || "").split(",").includes("transcript") })));
router.get("/speech/active", handle(() => activeSpeech()));
router.get("/speech/versions/:id", handle((req) => speechVersion(req.params.id)));
router.get("/users", handle(async () => ({ data: await listUsers() })));
router.get("/uploads/daily", handle((req) => dailyUploads(req.query.date)));
router.get("/costs", handle((req) => dailyCosts(req.query.from, req.query.to)));

router.use((req, res) => sendError(res, 404, "not_found", "Esa ruta no existe en la API. Revisa la referencia en Documentación y API."));

export default router;
