// Documentación y API: catalog for the docs page and access keys. Only the Ingeniero cargo.
import express from "express";
import { getRequester } from "../middleware/auth.js";
import { createApiKey, listApiKeys, revokeApiKey } from "../services/apiKeys.js";
import { API_CATALOG } from "../services/apiCatalog.js";
import { logChange } from "../services/auditLog.js";

const router = express.Router();

router.use(async (req, res, next) => {
  const requester = await getRequester(req);
  if (requester?.cargo.id !== "ingeniero") return res.status(403).json({ ok: false, error: "No autorizado" });
  req.requester = requester;
  next();
});

router.get("/catalog", (req, res) => res.json({ ok: true, catalog: API_CATALOG }));

router.get("/keys", async (req, res) => {
  try {
    res.json({ ok: true, keys: await listApiKeys() });
  } catch (error) {
    console.error("Error listando llaves:", error);
    res.status(500).json({ ok: false, error: "No se pudieron cargar las llaves." });
  }
});

router.post("/keys", async (req, res) => {
  try {
    const { key, item } = await createApiKey(req.body?.name, req.requester.email);
    await logChange(req.requester, "api.key.create", `Creó la llave «${item.name}»`, { keyId: item.id });
    res.json({ ok: true, key, item });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ ok: false, error: error.message });
    console.error("Error creando llave:", error);
    res.status(500).json({ ok: false, error: "No se pudo crear la llave." });
  }
});

router.post("/keys/:id/revoke", async (req, res) => {
  try {
    const item = await revokeApiKey(req.params.id, req.requester.email);
    if (!item) return res.status(404).json({ ok: false, error: "Esa llave no existe." });
    await logChange(req.requester, "api.key.revoke", `Revocó la llave «${item.name}»`, { keyId: item.id });
    res.json({ ok: true, item });
  } catch (error) {
    console.error("Error revocando llave:", error);
    res.status(500).json({ ok: false, error: "No se pudo revocar la llave." });
  }
});

export default router;
