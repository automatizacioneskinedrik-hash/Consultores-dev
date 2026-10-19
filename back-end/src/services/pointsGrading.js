// Grades a labelled transcription with the published points speech. Shared by the call analysis
// and by the "Probar con una sesión" check in Configuración avanzada.
import { buildPointsPrompt, countMuletillas, detectedMuletillas, muletillaTimeline, muletillasLevel, scorePointsAnalysis, swapSpeakerLabels } from "../prompts/pointsEngine.js";
import { DEFAULT_MULETILLAS } from "../prompts/speechRules.js";
import { askAi } from "./aiClient.js";

// The AI names the muletillas; the system counts and times them. utterances (with AssemblyAI word
// timestamps) are only available right after transcription; without them, as in "Probar con una sesión",
// there is no timeline and the AI's own level for muletillas stands.
export async function gradeWithPoints({ context, durationStr, transcriptionText, consultantPct, consultantMinutes, otherMinutes, model, utterances = null, consultantSpeaker = null, durationSec = 0 }) {
  const { speech } = context;
  const { json: analysis, usage, fallbackFrom } = await askAi(buildPointsPrompt({ ...context, durationStr, transcriptionText }), { model });
  if (analysis.error) return { analysis, scoring: null, usage, fallbackFrom, transcriptionText, consultantPct, rolesSwapped: false, muletillas: null };

  const words = detectedMuletillas(analysis, speech.muletillas?.exclude || []);
  const gaps = speech.muletillas?.gaps || DEFAULT_MULETILLAS.gaps;
  function measure(text, minutes, isConsultant) {
    const timeline = utterances ? muletillaTimeline(utterances, words, { isConsultant, durationSec, gaps }) : null;
    return { muletillas: { ...countMuletillas(text, words, { minutes }), timeline }, level: timeline ? muletillasLevel(timeline) : null };
  }

  // GPT flags when the "most words" heuristic labelled the client as the consultant.
  if (analysis.roles_invertidos === true) {
    const swapped = swapSpeakerLabels(transcriptionText);
    const { muletillas, level } = measure(swapped, otherMinutes, (speaker) => speaker !== consultantSpeaker);
    const realPct = 100 - consultantPct;
    const scoring = scorePointsAnalysis(analysis, speech, { consultantPct: realPct, muletillas, muletillasLevel: level });
    return { analysis, scoring, usage, fallbackFrom, transcriptionText: swapped, consultantPct: realPct, rolesSwapped: true, muletillas };
  }
  const { muletillas, level } = measure(transcriptionText, consultantMinutes, (speaker) => speaker === consultantSpeaker);
  const scoring = scorePointsAnalysis(analysis, speech, { consultantPct, muletillas, muletillasLevel: level });
  return { analysis, scoring, usage, fallbackFrom, transcriptionText, consultantPct, rolesSwapped: false, muletillas };
}
