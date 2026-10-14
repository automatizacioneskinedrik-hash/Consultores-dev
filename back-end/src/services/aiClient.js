import Anthropic from "@anthropic-ai/sdk";
import { openai } from "../config/openai.js";
import { anthropic } from "../config/anthropic.js";
import { DEFAULT_AI_MODEL, getActiveModel, providerOf } from "../prompts/aiModelConfig.js";

const isMissingModel = (error) => error?.status === 404 || error?.code === "model_not_found";

// --- OpenAI ---
// Some models (e.g. reasoning ones) reject sampling settings; those are dropped and the call retried.
const OPTIONAL_PARAMS = ["temperature", "seed"];
const rejectedParam = (error) => error?.status === 400
  ? OPTIONAL_PARAMS.find((param) => error.param === param || String(error.message || "").includes(`'${param}'`))
  : undefined;

async function completeWithOpenAi(prompt, model) {
  if (!openai) throw new Error("OpenAI no está configurado en el servidor.");
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

// --- Claude ---
// Current Claude models can decline a request through their safety classifiers; on the models that
// support it, the API retries a declined request on Anthropic's recommended fallback model.
const SERVER_FALLBACK = /^claude-(opus-5|fable-5-1|sonnet-5-5)/;
const JSON_ONLY = "\n\nResponde únicamente con el objeto JSON pedido, sin texto antes ni después y sin bloques de código.";

function parseJsonText(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Claude no devolvió un JSON válido.");
  return JSON.parse(text.slice(start, end + 1));
}

function claudeError(error) {
  if (error instanceof Anthropic.AuthenticationError) return new Error("La clave de Claude no es válida.");
  if (error instanceof Anthropic.BadRequestError && /credit|billing|balance/i.test(error.message)) {
    return new Error("La cuenta de Claude todavía no tiene saldo ni método de pago. Agrega la tarjeta en la consola de Anthropic.");
  }
  return error;
}

async function completeWithClaude(prompt, model) {
  if (!anthropic) throw new Error("La clave de Claude no está configurada en el servidor.");
  const request = { model, max_tokens: 32000, messages: [{ role: "user", content: prompt + JSON_ONLY }] };
  let message;
  try {
    // Streaming keeps long gradings clear of HTTP timeouts; finalMessage() returns the whole answer.
    const stream = SERVER_FALLBACK.test(model)
      ? anthropic.beta.messages.stream({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : anthropic.messages.stream(request);
    message = await stream.finalMessage();
  } catch (error) {
    throw claudeError(error);
  }
  if (message.stop_reason === "refusal") {
    throw new Error(`Claude rechazó calificar esta llamada${message.stop_details?.category ? ` (motivo: ${message.stop_details.category})` : ""}.`);
  }
  if (message.stop_reason === "max_tokens") throw new Error("La respuesta de Claude quedó incompleta por ser demasiado larga.");
  const text = message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
  const usage = message.usage || {};
  return {
    json: parseJsonText(text),
    usage: {
      model: message.model || model,
      inputTokens: (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
      cachedTokens: usage.cache_read_input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
    },
  };
}

const complete = (prompt, model) => (providerOf(model) === "anthropic" ? completeWithClaude(prompt, model) : completeWithOpenAi(prompt, model));

// Uses the model chosen in Configuración avanzada (or an explicit one for tests). If that model
// is no longer available, falls back to the default so the analysis still completes.
export async function askAi(prompt, { model } = {}) {
  const chosen = model || await getActiveModel();
  try {
    return { ...(await complete(prompt, chosen)), fallbackFrom: null };
  } catch (error) {
    if (model || chosen === DEFAULT_AI_MODEL || !isMissingModel(error)) throw error;
    console.error(`Modelo ${chosen} no disponible; se usa ${DEFAULT_AI_MODEL}.`, error.message);
    return { ...(await complete(prompt, DEFAULT_AI_MODEL)), fallbackFrom: chosen };
  }
}
