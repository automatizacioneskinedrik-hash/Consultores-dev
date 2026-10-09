// Grades a labelled transcription with the published points speech. Shared by the call analysis
// and by the "Probar con una sesión" check in Configuración avanzada.
import { buildPointsPrompt, countMuletillas, scorePointsAnalysis, swapSpeakerLabels } from "../prompts/pointsEngine.js";
import { askGpt } from "./gptClient.js";

export async function gradeWithPoints({ context, durationStr, transcriptionText, consultantPct, consultantMinutes, otherMinutes, model }) {
  const { speech } = context;
  const countWords = speech.muletillas?.count || [];
  const muletillas = countMuletillas(transcriptionText, countWords, { minutes: consultantMinutes });
  const { json: analysis, usage, fallbackFrom } = await askGpt(buildPointsPrompt({ ...context, durationStr, transcriptionText, muletillas }), { model });
  if (analysis.error) return { analysis, scoring: null, usage, fallbackFrom, transcriptionText, consultantPct, rolesSwapped: false, muletillas };

  // GPT flags when the "most words" heuristic labelled the client as the consultant.
  if (analysis.roles_invertidos === true) {
    const swapped = swapSpeakerLabels(transcriptionText);
    const realMuletillas = countMuletillas(swapped, countWords, { minutes: otherMinutes });
    const realPct = 100 - consultantPct;
    const scoring = scorePointsAnalysis(analysis, speech, { consultantPct: realPct, muletillas: realMuletillas });
    return { analysis, scoring, usage, fallbackFrom, transcriptionText: swapped, consultantPct: realPct, rolesSwapped: true, muletillas: realMuletillas };
  }
  const scoring = scorePointsAnalysis(analysis, speech, { consultantPct, muletillas });
  return { analysis, scoring, usage, fallbackFrom, transcriptionText, consultantPct, rolesSwapped: false, muletillas };
}
