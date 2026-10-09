import { openai } from "../config/openai.js";
import { DEFAULT_AI_MODEL, getActiveModel } from "../prompts/aiModelConfig.js";

const isMissingModel = (error) => error?.status === 404 || error?.code === "model_not_found";
// Some models (e.g. reasoning ones) reject sampling settings; those are dropped and the call retried.
const OPTIONAL_PARAMS = ["temperature", "seed"];
const rejectedParam = (error) => error?.status === 400
  ? OPTIONAL_PARAMS.find((param) => error.param === param || String(error.message || "").includes(`'${param}'`))
  : undefined;

async function complete(prompt, model) {
  const params = {
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0,
    seed: 42,
  };
  let completion;
  for (let attempt = 0; !completion; attempt++) {
    try {
      completion = await openai.chat.completions.create(params);
    } catch (error) {
      const param = rejectedParam(error);
      if (!param || !(param in params) || attempt >= OPTIONAL_PARAMS.length) throw error;
      delete params[param];
    }
  }
  const usage = completion.usage || {};
  return {
    json: JSON.parse(completion.choices[0].message.content),
    // Exact tokens per call, kept on each session for real cost tracking.
    usage: {
      model: completion.model || model,
      inputTokens: usage.prompt_tokens || 0,
      cachedTokens: usage.prompt_tokens_details?.cached_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
    },
  };
}

// Uses the model chosen in Configuración avanzada (or an explicit one for tests). If that model
// is no longer available, falls back to the default so the analysis still completes.
export async function askGpt(prompt, { model } = {}) {
  if (!openai) throw new Error("OpenAI no está configurado en el servidor.");
  const chosen = model || await getActiveModel();
  try {
    return { ...(await complete(prompt, chosen)), fallbackFrom: null };
  } catch (error) {
    if (model || chosen === DEFAULT_AI_MODEL || !isMissingModel(error)) throw error;
    console.error(`Modelo ${chosen} no disponible; se usa ${DEFAULT_AI_MODEL}.`, error.message);
    return { ...(await complete(prompt, DEFAULT_AI_MODEL)), fallbackFrom: chosen };
  }
}
