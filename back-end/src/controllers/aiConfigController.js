import { activateModel, getAiConfig, setVisibleModels } from "../prompts/aiModelConfig.js";

function fail(res, error, status = 400) {
  console.error("AI config error:", error?.message || error);
  return res.status(status).json({ ok: false, error: error?.message || "No se pudo completar la operación." });
}

const requester = (req) => String(req.headers["x-admin-email"] || "").trim().toLowerCase();

export async function getConfig(req, res) {
  try { return res.json({ ok: true, ...(await getAiConfig()) }); }
  catch (error) { return fail(res, error, 500); }
}

export async function putVisibleModels(req, res) {
  try {
    await setVisibleModels(req.body.models);
    return res.json({ ok: true });
  } catch (error) { return fail(res, error); }
}

export async function postActivate(req, res) {
  try {
    await activateModel(String(req.body.model || ""), requester(req));
    return res.json({ ok: true });
  } catch (error) { return fail(res, error); }
}
