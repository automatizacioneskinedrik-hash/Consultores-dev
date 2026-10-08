import { activateSpeechVersion, discardSpeechDraft, getSpeechEditorData, publishSpeech, saveSpeechDraft } from "../prompts/speechConfig.js";

function fail(res, error) {
  const message = error?.message || "No se pudo actualizar el speech.";
  const status = /otra sesión|no encontrada|antes de publicar|debe|obligatorio|inválid|entre|penalizaciones|identificadores|habilitará|suman/i.test(message) ? 400 : 500;
  return res.status(status).json({ ok: false, error: message });
}

export async function getSpeechConfig(req, res) {
  try { return res.json({ ok: true, ...(await getSpeechEditorData()) }); }
  catch (error) { return fail(res, error); }
}

export async function putSpeechDraft(req, res) {
  try {
    const revision = await saveSpeechDraft(req.body.config, req.body.revision);
    return res.json({ ok: true, revision });
  } catch (error) { return fail(res, error); }
}

export async function deleteSpeechDraft(req, res) {
  try { return res.json({ ok: true, revision: await discardSpeechDraft() }); }
  catch (error) { return fail(res, error); }
}

export async function postSpeechPublish(req, res) {
  try {
    const id = await publishSpeech(req.body.revision, String(req.headers["x-admin-email"] || ""));
    return res.json({ ok: true, id });
  } catch (error) { return fail(res, error); }
}

export async function postSpeechActivate(req, res) {
  try {
    await activateSpeechVersion(req.params.id);
    return res.json({ ok: true });
  } catch (error) { return fail(res, error); }
}
