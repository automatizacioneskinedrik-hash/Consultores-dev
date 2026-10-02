export function applySpeechToAnalysis(analysis, speech) {
  if (speech.legacy || analysis.error) return analysis;
  const validIds = new Set(speech.phases.map((phase) => phase.id));
  const reached = Array.isArray(analysis.fases_alcanzadas)
    ? [...new Set(analysis.fases_alcanzadas.filter((id) => validIds.has(id)))]
    : [];
  analysis.fases_alcanzadas = reached;
  const order = new Map(speech.phases.map((phase, index) => [phase.id, index]));
  const correctOrder = reached.every((id, index) => index === 0 || order.get(reached[index - 1]) < order.get(id));
  analysis.adherencia_guion = {
    ...analysis.adherencia_guion,
    orden_correcto: correctOrder,
    score: Math.max(0, 100 - (speech.phases.length - reached.length) * speech.scoring.omissionPenalty - (correctOrder ? 0 : speech.scoring.inversionPenalty)),
  };
  const improvements = analysis.feedback?.puntos_mejora;
  if (Array.isArray(improvements)) {
    for (const item of improvements) {
      if (!validIds.has(item.codigo_fase)) item.codigo_fase = "";
    }
  }
  return analysis;
}
