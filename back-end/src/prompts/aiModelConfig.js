// Which OpenAI model grades the calls. Chosen by a superadmin from the frontend and stored in
// Firestore, so changing models never needs a code change or a deploy.
import { db } from "../config/firebase.js";
import { openai } from "../config/openai.js";

export const DEFAULT_AI_MODEL = (process.env.OPENAI_MODEL || "gpt-5.4-mini").trim();
const CACHE_TTL_MS = 60 * 1000;
const HISTORY_LIMIT = 30;
// Text-generation models only: the account also lists audio, image, embedding and other families.
const NON_TEXT_MODEL = /(audio|realtime|image|transcribe|tts|whisper|embedding|moderation|search|codex|cyber|rosalind|live|dall-e|davinci|babbage|instruct)/i;

const stateRef = () => db.collection("ai_config").doc("state");
let cache = null;

export function isTextModel(id) {
  return typeof id === "string" && /^(gpt-|o\d)/i.test(id) && !NON_TEXT_MODEL.test(id);
}

export async function getActiveModel() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.model;
  const state = await stateRef().get();
  const model = state.data()?.activeModel || DEFAULT_AI_MODEL;
  cache = { model, at: Date.now() };
  return model;
}

export async function listTextModels() {
  if (!openai) throw new Error("OpenAI no está configurado en el servidor.");
  const ids = [];
  for await (const model of openai.models.list()) {
    if (isTextModel(model.id)) ids.push(model.id);
  }
  return ids.sort();
}

export async function getAiConfig() {
  const [state, available] = await Promise.all([stateRef().get(), listTextModels()]);
  const data = state.data() || {};
  const activeModel = data.activeModel || DEFAULT_AI_MODEL;
  return {
    activeModel,
    // Until a superadmin chooses, show the active model only.
    visibleModels: Array.isArray(data.visibleModels) && data.visibleModels.length ? data.visibleModels : [activeModel],
    availableModels: available,
    history: Array.isArray(data.history) ? data.history : [],
  };
}

export async function setVisibleModels(models) {
  const available = new Set(await listTextModels());
  if (!Array.isArray(models) || models.some((id) => !available.has(id))) {
    throw new Error("La lista de modelos contiene modelos que no están disponibles en OpenAI.");
  }
  await stateRef().set({ visibleModels: [...new Set(models)] }, { merge: true });
}

export async function activateModel(model, changedBy) {
  const available = new Set(await listTextModels());
  if (!available.has(model)) throw new Error("Ese modelo no está disponible en la cuenta de OpenAI.");
  await db.runTransaction(async (transaction) => {
    const state = await transaction.get(stateRef());
    const data = state.data() || {};
    const history = [{ model, changedBy, changedAt: new Date() }, ...(data.history || [])].slice(0, HISTORY_LIMIT);
    const visible = new Set(data.visibleModels || [data.activeModel || DEFAULT_AI_MODEL]);
    visible.add(model);
    transaction.set(stateRef(), { activeModel: model, visibleModels: [...visible], history }, { merge: true });
  });
  cache = null;
}
