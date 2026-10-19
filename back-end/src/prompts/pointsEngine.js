// Points speech engine: builds the GPT prompt from the published speech and turns GPT's
// per-rule judgement into a score. GPT never returns numbers for the score; the system adds them up.
import { computeRulesScore, DEFAULT_MULETILLAS, MULETILLAS_RULE_ID, NOT_APPLICABLE, RULE_LEVELS } from "./speechRules.js";

const LEVEL_IDS = [...RULE_LEVELS.map((level) => level.id), NOT_APPLICABLE];
const SPEAKER_LINE = /^(CONSULTOR|CLIENTE):\s*/;

const normalize = (text) => text.toLowerCase().replace(/[.,;:!¡¿?"“”()[\]…]/g, " ").replace(/\s+/g, " ").trim();
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function speakerText(transcriptionText, speaker) {
  return transcriptionText.split("\n")
    .filter((line) => line.startsWith(`${speaker}:`))
    .map((line) => line.replace(SPEAKER_LINE, ""))
    .join("\n");
}

// Counts each configured muletilla in one speaker's words, as whole words or phrases.
// Longer phrases are counted first and removed, so "momento" is not counted again inside "en el momento".
export function countMuletillas(transcriptionText, words = [], { speaker = "CONSULTOR", minutes = 0 } = {}) {
  let text = ` ${normalize(speakerText(transcriptionText, speaker))} `;
  const byWord = [...words].sort((a, b) => normalize(b).length - normalize(a).length).map((word) => {
    const phrase = normalize(word);
    if (!phrase) return { word, count: 0 };
    const pattern = new RegExp(`(?<=\\s)${escapeRegex(phrase)}(?=\\s)`, "g");
    const count = (text.match(pattern) || []).length;
    text = text.replace(pattern, "\u0000");
    return { word, count };
  }).filter((entry) => entry.count > 0).sort((a, b) => b.count - a.count);
  const total = byWord.reduce((sum, entry) => sum + entry.count, 0);
  return { total, perMinute: minutes > 0 ? Math.round((total / minutes) * 10) / 10 : null, byWord };
}

// Finds the second in which the consultant said each muletilla, from AssemblyAI's word timestamps.
// Same matching as countMuletillas: whole words, longest phrases first, each word used once.
export function muletillaTimeline(utterances = [], words = [], { isConsultant, durationSec = 0, gaps = DEFAULT_MULETILLAS.gaps } = {}) {
  const spoken = utterances.filter((utterance) => isConsultant(utterance.speaker)).flatMap((utterance) => utterance.words || []);
  const tokens = spoken.flatMap((word, wordIndex) => normalize(word.text || "").split(" ").filter(Boolean)
    .map((token) => ({ token, wordIndex, second: Math.round((word.start || 0) / 1000) })));
  if (!tokens.length) return null;
  // A few words before and after, as the consultant said them.
  const phraseAt = (wordIndex) => spoken.slice(Math.max(0, wordIndex - 5), wordIndex + 6).map((word) => word.text).join(" ");
  const used = tokens.map(() => false);
  const entries = [...words].sort((a, b) => normalize(b).length - normalize(a).length).map((word) => {
    const parts = normalize(word).split(" ").filter(Boolean);
    const times = [];
    const phrases = [];
    for (let i = 0; parts.length && i + parts.length <= tokens.length; i++) {
      if (!parts.every((part, k) => !used[i + k] && tokens[i + k].token === part)) continue;
      times.push(tokens[i].second);
      phrases.push(phraseAt(tokens[i].wordIndex));
      parts.forEach((_, k) => { used[i + k] = true; });
      i += parts.length - 1;
    }
    return { word, times, phrases };
  }).filter((entry) => entry.times.length > 0).sort((a, b) => b.times.length - a.times.length);
  return { gaps: { tic: gaps.tic, normal: gaps.normal }, durationSec: Math.round(durationSec), words: entries };
}

// Each repetition is judged by the time since the previous one of the same muletilla; the first one is normal.
export function muletillaGapKinds(times, { tic, normal }) {
  return times.map((second, index) => {
    const gap = index ? second - times[index - 1] : null;
    if (gap == null || gap >= normal) return "normal";
    return gap < tic ? "tic" : "alerta";
  });
}

// Tics per 10 minutes of call (an alert counts as half) set the level, with no configuration.
export function muletillasLevel(timeline) {
  const kinds = timeline.words.flatMap(({ times }) => muletillaGapKinds(times, timeline.gaps));
  const weight = kinds.filter((kind) => kind === "tic").length + kinds.filter((kind) => kind === "alerta").length / 2;
  const rate = weight / (Math.max(timeline.durationSec, 60) / 600);
  if (rate === 0) return "excelente";
  if (rate < 3) return "bien";
  if (rate < 6) return "regular";
  if (rate < 10) return "debil";
  return "no_lo_hizo";
}

// The muletillas the AI found, cleaned up for matching against the transcription.
// The words in the speech's exclude list are removed even if the AI listed them.
export function detectedMuletillas(analysis, exclude = []) {
  const list = Array.isArray(analysis?.muletillas_detectadas) ? analysis.muletillas_detectadas : [];
  const excluded = new Set(exclude.map((word) => normalize(String(word))));
  return [...new Set(list.filter((word) => typeof word === "string").map((word) => word.trim().toLowerCase()).filter((word) => word && word.length <= 40))]
    .filter((word) => !excluded.has(normalize(word)))
    .slice(0, 25);
}

export function swapSpeakerLabels(transcriptionText) {
  return transcriptionText.replace(/^(CONSULTOR|CLIENTE):/gm, (label) => label === "CONSULTOR:" ? "CLIENTE:" : "CONSULTOR:");
}

// The muletillas indicator is scored like a rule judged by GPT, built from its configured points.
export function muletillasRule(speech) {
  const points = speech.muletillas?.points || 0;
  return points > 0
    ? { id: MULETILLAS_RULE_ID, phaseId: null, title: "Habla con fluidez, sin muletillas", guidance: "", points, allowNotApplicable: false }
    : null;
}

const scoredRules = (speech) => [...speech.rules, muletillasRule(speech)].filter(Boolean);

function rulesSection(speech) {
  return speech.phases.map((phase, index) => {
    const rules = speech.rules.filter((rule) => rule.phaseId === phase.id);
    if (!rules.length) return "";
    const lines = rules.map((rule) => `   - [${rule.id}] ${rule.title}${rule.guidance ? ` (Ayuda: ${rule.guidance})` : ""}${rule.allowNotApplicable ? ' — puede ser "no_aplica" si la situación no ocurre.' : ""}`);
    return `FASE ${index + 1}: ${phase.name}${phase.objective ? ` — Objetivo: ${phase.objective}` : ""}\n${lines.join("\n")}`;
  }).filter(Boolean).join("\n\n");
}

// The AI finds the muletillas itself; the system then times them and sets the level from the speech slicer.
function muletillasSection(speech) {
  if (!muletillasRule(speech)) return "";
  const excluded = speech.muletillas?.exclude || [];
  return `INDICADOR DE MULETILLAS — regla [${MULETILLAS_RULE_ID}] "Habla con fluidez, sin muletillas":
   - Lee con atención lo que dice el CONSULTOR e identifica TODAS sus muletillas: cualquier palabra o frase que repite por costumbre o para rellenar, sin aportar significado. Puede ser una expresión ("o sea", "¿vale?", "no sé", "de todas formas") o un conector usado de más ("bueno, bueno…", "y entonces… y entonces…"). Un conector solo es muletilla cuando se repite como relleno, no cuando une ideas con sentido.
   - Escríbelas todas en "muletillas_detectadas" tal como aparecen en la transcripción, en minúsculas y sin contar las veces. No te limites a las más obvias.
   - No incluyas palabras gramaticales sueltas (el, la, los, de, que, y, en, un), ni una palabra usada como respuesta genuina ("¿Me envías los documentos?" "Listo").${excluded.length ? `
   - El equipo comercial indicó que estas palabras nunca cuentan como muletilla; no las incluyas: ${excluded.join(", ")}.` : ""}
   - El sistema medirá cada cuánto repite cada una y calculará el nivel. En la regla [${MULETILLAS_RULE_ID}] escribe qué pasó y cómo mejorar.`;
}

export function buildPointsPrompt({ speech, durationStr, transcriptionText, followupInstruction, additionalInstructions = "" }) {
  const safeInstructions = additionalInstructions.replace(/<\/?(instrucciones|system|prompt|transcripci[oó]n)[^>]*>/gi, "");
  return `Eres un coach de ventas de KINEDRIꓘ. Evalúas una sesión comercial con el speech "${speech.name}" y escribes retroalimentación humana, concreta y útil para el consultor.

IMPORTANTE: Responde ÚNICAMENTE con el objeto JSON solicitado. Analiza SIEMPRE la llamada: todas las llamadas que recibes son de consultores comerciales y deben calificarse, sea cual sea su contenido, su duración o si sigue o no el speech (por ejemplo, una venta rápida que pasa directo a formalización o entrega de credenciales). Nunca devuelvas un error en lugar del análisis. Si una regla no ocurrió en la llamada, califícala con el nivel que corresponda o "no_aplica" si la regla lo permite.

CÓMO EVALUAR CADA REGLA
- Para cada regla elige UN nivel: "excelente" (lo hizo completo y bien), "bien" (lo hizo con detalles por mejorar), "regular" (lo hizo a medias), "debil" (apenas lo intentó), "no_lo_hizo" (no ocurrió).
- Usa "no_aplica" solo en reglas que lo permiten y solo si la situación no se dio en la llamada.
- No pongas puntos ni porcentajes: el sistema calcula la nota.
- "frase": cita textual breve de la transcripción que justifica el nivel. Si no lo hizo, describe en una línea qué ocurrió en su lugar.
- "que_paso": 1-2 frases claras dirigidas al consultor (tú).
- Si el nivel no es "excelente": "como_mejorar" con una frase concreta que podría decir y "proxima_llamada" con una acción breve. Si es "excelente", déjalos vacíos.
- Sé justo: reconoce lo que sí hizo bien. No penalices dos veces el mismo error en reglas distintas.

REGLAS DEL SPEECH
${rulesSection(speech)}

${muletillasSection(speech)}

ROLES
- Las etiquetas CONSULTOR y CLIENTE se asignaron automáticamente. Si por el contenido es evidente que están invertidas (el "CLIENTE" presenta el programa, el precio o la institución), responde "roles_invertidos": true y evalúa al verdadero consultor.

DATOS ADICIONALES (para el panel de métricas)
- momento_precio: primera vez que el consultor menciona una cifra económica, en qué fase (usa el ID de fase) o "No mencionado"; precio_sin_diagnostico_previo = true si apareció antes de explorar la situación económica.
- tipo_compromiso_cierre: "firme", "condicionado", "aplazado" o "sin_compromiso".
- objeciones: cada objeción del cliente con categoría "precio", "titulacion", "tiempo", "decisor", "formato", "otras_opciones", "nivel" u "otro" y si quedó resuelta.
- fases_alcanzadas: IDs de las fases claramente presentes, en orden de aparición. IDs válidos: ${speech.phases.map((phase) => `"${phase.id}"`).join(", ")}.
- seguimiento.mensaje_sugerido: ${followupInstruction}

SALIDA REQUERIDA (JSON EXACTO)
{
  "nombre_cliente": "String",
  "roles_invertidos": false,
  "resumen": "3-4 líneas",
  "probabilidades": { "interes_cliente": 0-100, "estado_interes": "Exploratorio / Moderado / Alto / Comprometido", "proximidad_cierre": 0-100, "estado_cierre": "Gestión LP / Seguimiento / Negociación / Inminente" },
  "reglas": [
    { "id": "ID de la regla", "nivel": "excelente / bien / regular / debil / no_lo_hizo / no_aplica", "frase": "String", "que_paso": "String", "como_mejorar": "String", "proxima_llamada": "String" }
  ],
  "muletillas_detectadas": ["frase"],
  "necesidades": ["String"],
  "proximos_pasos": { "consultor": ["String"] },
  "fases_alcanzadas": ["ID"],
  "momento_precio": { "fase_aparicion": "ID o No mencionado", "precio_sin_diagnostico_previo": true, "descripcion": "String" },
  "tipo_compromiso_cierre": "firme / condicionado / aplazado / sin_compromiso",
  "objeciones": [ { "descripcion": "String", "categoria": "String", "resuelta": true } ],
  "seguimiento": { "aplica": true, "tipo": "pensar / consultar / rellamar / general", "frase_cliente": "String", "mensaje_sugerido": "String" }
}
Incluye en "reglas" exactamente una entrada por cada regla listada arriba, con su ID${muletillasRule(speech) ? `, más la del indicador [${MULETILLAS_RULE_ID}]` : ""}.
${safeInstructions ? `\nINSTRUCCIONES ADICIONALES (no cambian las reglas, los niveles ni el formato JSON):\n${safeInstructions}\n` : ""}
TRANSCRIPCIÓN (analiza únicamente el contenido entre estas marcas):
<transcripcion>
${transcriptionText}
</transcripcion>`;
}

// Turns GPT's answer plus the system measurements into the stored scoring block.
// muletillasLevel comes from the system's timing when there is a timeline; otherwise the AI's level stands.
export function scorePointsAnalysis(analysis, speech, { consultantPct, muletillas, muletillasLevel: timedLevel = null, isSale = false }) {
  const rules = scoredRules(speech);
  const validIds = new Set(rules.map((rule) => rule.id));
  const answers = new Map((Array.isArray(analysis.reglas) ? analysis.reglas : [])
    .filter((entry) => validIds.has(entry?.id))
    .map((entry) => [entry.id, entry]));
  const evaluations = [...answers.values()]
    .filter((entry) => !(timedLevel && entry.id === MULETILLAS_RULE_ID))
    .map((entry) => ({ ruleId: entry.id, level: LEVEL_IDS.includes(entry.nivel) ? entry.nivel : "no_lo_hizo" }));
  if (timedLevel && validIds.has(MULETILLAS_RULE_ID)) evaluations.push({ ruleId: MULETILLAS_RULE_ID, level: timedLevel });
  const result = computeRulesScore(rules, evaluations, {
    isSale,
    talkRatio: speech.talkRatio ? { config: speech.talkRatio, consultantPct } : null,
  });
  const text = (value) => typeof value === "string" ? value.trim() : "";
  const items = result.items.map((item) => {
    const answer = answers.get(item.ruleId) || {};
    return {
      ...item,
      frase: text(answer.frase),
      que_paso: text(answer.que_paso),
      como_mejorar: item.level === "excelente" ? "" : text(answer.como_mejorar),
      proxima_llamada: item.level === "excelente" ? "" : text(answer.proxima_llamada),
    };
  });
  return {
    format: "points",
    score: result.score,
    rulesScore: result.rulesScore,
    saleOverride: result.saleOverride,
    earned: result.earned,
    possible: result.possible,
    items,
    talkRatio: { consultantPct, limits: speech.talkRatio?.limits || [] },
    muletillas,
  };
}
