import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();

// Claude grades calls when a Claude model is active in Configuración avanzada.
export const anthropic = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: 15 * 60 * 1000 })
  : null;

if (!anthropic) {
  console.warn("ADVERTENCIA: ANTHROPIC_API_KEY no configurada.");
}
