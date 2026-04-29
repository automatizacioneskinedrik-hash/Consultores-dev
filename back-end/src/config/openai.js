import OpenAI from "openai";

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();

export const openai = OPENAI_API_KEY
  ? new OpenAI({
      apiKey: OPENAI_API_KEY,
      timeout: 30 * 60 * 1000, // 30 minutes — Whisper on 1-hour audio can take 15-25 min
    })
  : null;

if (!openai) {
  console.warn("ADVERTENCIA: OPENAI_API_KEY no configurada.");
}
