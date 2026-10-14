// Which AI model grades the calls, from OpenAI or Anthropic (Claude). Chosen from Configuración
// avanzada and stored in Firestore, so changing models never needs a code change or a deploy.
import { db } from "../config/firebase.js";
import { openai } from "../config/openai.js";
import { anthropic } from "../config/anthropic.js";

export const DEFAULT_AI_MODEL = (process.env.OPENAI_MODEL || "gpt-5.4-mini").trim();
const CACHE_TTL_MS = 60 * 1000;
const HISTORY_LIMIT = 30;
// Text-generation models only: the OpenAI account also lists audio, image, embedding and other families.
const NON_TEXT_MODEL = /(audio|realtime|image|transcribe|tts|whisper|embedding|moderation|search|codex|cyber|rosalind|live|dall-e|davinci|babbage|instruct)/i;

const stateRef = () => db.collection("ai_config").doc("state");
let cache = null;

export const providerOf = (model) => (/^claude-/i.test(String(model)) ? "anthropic" : "openai");

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

async function listOpenAiModels() {
  if (!openai) throw new Error("OpenAI no está configurado en el servidor.");
  const ids = [];
  for await (const model of openai.models.list()) {
    if (isTextModel(model.id)) ids.push(model.id);
  }
  return ids.sort();
}

async function listClaudeModels() {
  if (!anthropic) throw new Error("La clave de Claude no está configurada en el servidor.");
  const ids = [];
  for await (const model of anthropic.models.list()) ids.push(model.id);
  return ids.sort();
}

// Each provider is listed on its own: if one fails (no key, no billing yet), the other still works.
export async function listProviders() {
  const [gpt, claude] = await Promise.allSettled([listOpenAiModels(), listClaudeModels()]);
  const entry = (id, label, result) => ({
    id,
    label,
    models: result.status === "fulfilled" ? result.value : [],
    error: result.status === "rejected" ? result.reason?.message || "No disponible" : null,
  });
  return [entry("openai", "OpenAI", gpt), entry("anthropic", "Claude", claude)];
}

async function availableModelSet() {
  return new Set((await listProviders()).flatMap((provider) => provider.models));
}

export async function getAiConfig() {
  const [state, providers] = await Promise.all([stateRef().get(), listProviders()]);
  const data = state.data() || {};
  const activeModel = data.activeModel || DEFAULT_AI_MODEL;
  return {
    activeModel,
    activeProvider: providerOf(activeModel),
    // Until someone chooses, show the active model only.
    visibleModels: Array.isArray(data.visibleModels) && data.visibleModels.length ? data.visibleModels : [activeModel],
    providers,
    availableModels: providers.flatMap((provider) => provider.models),
    history: Array.isArray(data.history) ? data.history : [],
  };
}

export async function setVisibleModels(models) {
  const available = await availableModelSet();
  if (!Array.isArray(models) || models.some((id) => !available.has(id))) {
    throw new Error("La lista contiene modelos que no están disponibles.");
  }
  await stateRef().set({ visibleModels: [...new Set(models)] }, { merge: true });
}

export async function activateModel(model, changedBy) {
  const available = await availableModelSet();
  if (!available.has(model)) throw new Error("Ese modelo no está disponible en la cuenta del proveedor.");
  await db.runTransaction(async (transaction) => {
    const state = await transaction.get(stateRef());
    const data = state.data() || {};
    const history = [{ model, provider: providerOf(model), changedBy, changedAt: new Date() }, ...(data.history || [])].slice(0, HISTORY_LIMIT);
    const visible = new Set(data.visibleModels || [data.activeModel || DEFAULT_AI_MODEL]);
    visible.add(model);
    transaction.set(stateRef(), { activeModel: model, visibleModels: [...visible], history }, { merge: true });
  });
  cache = null;
}
