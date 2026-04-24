import OpenAI from "openai";

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();

export const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

if (!openai) {
  console.warn("ADVERTENCIA: OPENAI_API_KEY no configurada.");
}
