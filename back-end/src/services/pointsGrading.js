// Grades a labelled transcription with the published points speech. Shared by the call analysis
// and by the "Probar con una sesión" check in Configuración avanzada.
import { buildPointsPrompt, countMuletillas, muletillaTimeline, scorePointsAnalysis, swapSpeakerLabels } from "../prompts/pointsEngine.js";
import { DEFAULT_MULETILLAS } from "../prompts/speechRules.js";
import { askAi } from "./aiClient.js";

// utterances (with AssemblyAI word timestamps) are only available right after transcription; without them
// the muletillas are judged by their count alone, as in "Probar con una sesión".
export async function gradeWithPoints({ context, durationStr, transcriptionText, consultantPct, consultantMinutes, otherMinutes, model, utterances = null, consultantSpeaker = null, durationSec = 0 }) {
  const { speech } = context;
  const countWords = speech.muletillas?.count || [];
  const gaps = speech.muletillas?.gaps || DEFAULT_MULETILLAS.gaps;
  const timelineFor = (isConsultant) => utterances ? muletillaTimeline(utterances, countWords, { isConsultant, durationSec, gaps }) : null;
  const muletillas = { ...countMuletillas(transcriptionText, countWords, { minutes: consultantMinutes }), timeline: timelineFor((speaker) => speaker === consultantSpeaker) };
  const { json: analysis, usage, fallbackFrom } = await askAi(buildPointsPrompt({ ...context, durationStr, transcriptionText, muletillas }), { model });
  if (analysis.error) return { analysis, scoring: null, usage, fallbackFrom, transcriptionText, consultantPct, rolesSwapped: false, muletillas };

  // GPT flags when the "most words" heuristic labelled the client as the consultant.
  if (analysis.roles_invertidos === true) {
    const swapped = swapSpeakerLabels(transcriptionText);
    const realMuletillas = { ...countMuletillas(swapped, countWords, { minutes: otherMinutes }), timeline: timelineFor((speaker) => speaker !== consultantSpeaker) };
    const realPct = 100 - consultantPct;
    const scoring = scorePointsAnalysis(analysis, speech, { consultantPct: realPct, muletillas: realMuletillas });
    return { analysis, scoring, usage, fallbackFrom, transcriptionText: swapped, consultantPct: realPct, rolesSwapped: true, muletillas: realMuletillas };
  }
  const scoring = scorePointsAnalysis(analysis, speech, { consultantPct, muletillas });
  return { analysis, scoring, usage, fallbackFrom, transcriptionText, consultantPct, rolesSwapped: false, muletillas };
}
