// Points-based speech format: one list of rules grouped by phase whose points add up to 100.
// The AI only picks a level per rule; the score is always computed here.

export const POINTS_FORMAT = "points";
export const TOTAL_POINTS = 100;
export const GENERAL_GROUP_ID = "GENERAL";
export const NOT_APPLICABLE = "no_aplica";

export const RULE_LEVELS = Object.freeze([
  { id: "excelente", label: "Excelente", factor: 1 },
  { id: "bien", label: "Bien", factor: 0.75 },
  { id: "regular", label: "Regular", factor: 0.5 },
  { id: "debil", label: "Débil", factor: 0.25 },
  { id: "no_lo_hizo", label: "No lo hizo", factor: 0 },
]);

const LEVEL_FACTORS = new Map(RULE_LEVELS.map((level) => [level.id, level.factor]));
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// Muletillas indicator: the system counts the "count" words in the consultant's lines and GPT judges
// them in context. Starting lists come from the analysis of 946 stored transcriptions (2026-10-08).
export const MULETILLAS_RULE_ID = "muletillas";
export const DEFAULT_MULETILLAS = Object.freeze({
  points: 3,
  count: Object.freeze([
    "digamos", "digamos por ejemplo", "o sea", "realmente", "exactamente", "efectivamente", "directamente",
    "obviamente", "prácticamente", "claramente", "básicamente", "de pronto", "ahorita mismo", "en el momento",
    "en este caso", "como tal", "a nivel de", "el tema de", "¿vale?", "¿listo?", "¿de acuerdo?", "¿verdad?",
    "¿cierto?", "¿me entiendes?", "listo", "ok", "okay", "vale", "perfecto", "genial", "súper", "fenomenal",
  ]),
  ignore: Object.freeze(["entonces", "pues", "este", "sí", "bueno", "claro", "mira", "a ver", "tipo", "correcto", "por ejemplo"]),
});

// Talk ratio is measured by the system (words per speaker), never judged by the AI.
// Four "up to" limits on the consultant's share split it into five levels: Excelente … No lo hizo.
// Defaults follow the current methodology (over 65 % improvement point, over 75 % serious, over 80 % very serious).
export const DEFAULT_TALK_RATIO = Object.freeze({ limits: Object.freeze([65, 70, 75, 80]), points: 6 });

const phase = (id, name, objective) => ({ id, name, objective });
const rule = (id, phaseId, title, points, guidance = "", allowNotApplicable = false) => ({ id, phaseId, title, guidance, points, allowNotApplicable });

export const POINTS_TEMPLATE = Object.freeze({
  format: POINTS_FORMAT,
  name: "Speech comercial por puntos",
  description: "Plantilla inicial basada en la metodología de cinco fases.",
  phases: [
    phase("F1", "Apertura", "Marcar el marco y la intención, presentar la agenda y conseguir que el cliente hable desde el primer minuto."),
    phase("F2", "Diagnóstico", "Explorar la situación profesional y económica del cliente con preguntas abiertas, sin proponer soluciones."),
    phase("F3", "Visión", "Construir la visión deseada con las palabras del cliente y mostrar la distancia con su situación actual."),
    phase("F4", "Propuesta", "Presentar el programa como el vehículo que cierra esa distancia, conectado con el dolor del cliente."),
    phase("F5", "Cierre", "Obtener la decisión de fondo, presentar el precio y gestionar las objeciones."),
  ],
  rules: [
    rule("apertura-agenda", "F1", "Presenta la agenda y el objetivo de la llamada", 5),
    rule("apertura-cliente-habla", "F1", "El cliente habla desde el primer minuto", 5),
    rule("diagnostico-preguntas", "F2", "Hace preguntas abiertas sobre la situación profesional del cliente", 8, "Rol, actualización, proyección, impacto económico, red profesional y seguridad."),
    rule("diagnostico-presupuesto", "F2", "Explora el presupuesto o la capacidad económica antes de dar el precio", 8),
    rule("diagnostico-decisor", "F2", "Pregunta quién toma la decisión", 5),
    rule("vision-cliente-nombra", "F3", "El cliente nombra su problema con sus propias palabras", 8),
    rule("vision-gap", "F3", "Presenta la visión deseada usando las palabras del cliente", 7),
    rule("propuesta-dolor", "F4", "Conecta cada elemento del programa con el dolor del cliente", 10),
    rule("propuesta-foco", "F4", "Presenta como máximo cuatro elementos clave, sin recorrer todo el temario", 4),
    rule("propuesta-pausas", "F4", "Hace pausas y comprueba que el cliente entiende, sin monólogos de más de 3–4 minutos", 6),
    rule("cierre-si-antes-precio", "F5", "Obtiene el sí de decisión de fondo antes de presentar el precio", 8),
    rule("cierre-silencio", "F5", "Guarda silencio después de presentar la inversión", 4),
    rule("cierre-plan-pago", "F5", "Ofrece las opciones de pago de mayor a menor: pago único, cuotas y reserva", 4),
    rule("cierre-objeciones", "F5", "Gestiona las objeciones: valida, ancla al dolor y devuelve con una pregunta", 6, "", true),
    rule("cierre-beca", "F5", "Si ofrece beca o descuento, indica una fecha real sin urgencia artificial", 3, "", true),
  ],
  talkRatio: DEFAULT_TALK_RATIO,
  muletillas: DEFAULT_MULETILLAS,
});

function text(input, label, max, { required = true } = {}) {
  if (input == null || input === "") {
    if (required) throw new Error(`${label} es obligatorio.`);
    return "";
  }
  if (typeof input !== "string" || input.length > max) throw new Error(`${label} debe ser un texto de máximo ${max} caracteres.`);
  const value = input.trim();
  if (required && !value) throw new Error(`${label} es obligatorio.`);
  return value;
}

function wordList(input, label) {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 50) throw new Error(`${label} debe tener máximo 50 elementos.`);
  return [...new Set(input.map((word, index) => text(word, `${label} ${index + 1}`, 40).toLowerCase()))];
}

// Drafts (draft: true) may have empty texts and a total other than 100; publishing requires both.
export function validatePointsSpeech(value, { draft = false } = {}) {
  const required = !draft;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Configuración inválida.");
  if (!Array.isArray(value.phases) || value.phases.length < 1 || value.phases.length > 12) throw new Error("El speech debe tener entre 1 y 12 fases.");
  const phases = value.phases.map((entry, index) => ({
    id: text(entry?.id, `ID de fase ${index + 1}`, 64),
    name: text(entry?.name, `Nombre de fase ${index + 1}`, 100),
    objective: text(entry?.objective, `Objetivo de fase ${index + 1}`, 2000, { required }),
  }));
  const phaseIds = new Set(phases.map((entry) => entry.id));
  if (phases.some((entry) => !ID_PATTERN.test(entry.id) || entry.id === GENERAL_GROUP_ID) || phaseIds.size !== phases.length) {
    throw new Error("Los identificadores de fase deben ser únicos y alfanuméricos.");
  }

  if (!Array.isArray(value.rules) || value.rules.length < (draft ? 0 : 1) || value.rules.length > 60) throw new Error("El speech debe tener entre 1 y 60 reglas.");
  const rules = value.rules.map((entry, index) => {
    const label = `Regla ${index + 1}`;
    const points = Number(entry?.points);
    if (!Number.isInteger(points) || points < 1 || points > TOTAL_POINTS) throw new Error(`${label}: los puntos deben ser un número entero entre 1 y ${TOTAL_POINTS}.`);
    const phaseId = text(entry?.phaseId, `${label}: fase`, 64);
    if (!phaseIds.has(phaseId)) throw new Error(`${label}: debe pertenecer a una fase existente.`);
    return {
      id: text(entry?.id, `${label}: ID`, 64),
      phaseId,
      title: text(entry?.title, `${label}: qué debe pasar`, 200, { required }),
      guidance: text(entry?.guidance, `${label}: detalle`, 1500, { required: false }),
      points,
      allowNotApplicable: entry?.allowNotApplicable === true,
    };
  });
  if (rules.some((entry) => !ID_PATTERN.test(entry.id)) || new Set(rules.map((entry) => entry.id)).size !== rules.length) {
    throw new Error("Los identificadores de regla deben ser únicos y alfanuméricos.");
  }
  const talkRatio = validateTalkRatio(value.talkRatio ?? DEFAULT_TALK_RATIO);
  const muletillasPoints = Number(value.muletillas?.points ?? DEFAULT_MULETILLAS.points);
  if (!Number.isInteger(muletillasPoints) || muletillasPoints < 0 || muletillasPoints > TOTAL_POINTS) throw new Error(`Muletillas: los puntos deben ser un número entero entre 0 y ${TOTAL_POINTS}.`);
  const muletillas = {
    points: muletillasPoints,
    count: wordList(value.muletillas?.count, "Muletilla"),
    ignore: wordList(value.muletillas?.ignore, "Palabra ignorada"),
  };
  if (muletillas.count.some((word) => muletillas.ignore.includes(word))) throw new Error("Una palabra no debe estar a la vez en muletillas y en palabras ignoradas.");

  const total = rules.reduce((sum, entry) => sum + entry.points, 0) + talkRatio.points + muletillas.points;
  if (!draft && total !== TOTAL_POINTS) throw new Error(`Los puntos de las reglas, el ratio de habla y las muletillas deben sumar ${TOTAL_POINTS}; ahora suman ${total}.`);

  return {
    format: POINTS_FORMAT,
    name: text(value.name, "Nombre", 100),
    description: text(value.description, "Descripción", 500, { required: false }),
    changeNote: text(value.changeNote, "Qué cambiaste", 300, { required: false }),
    phases,
    rules,
    talkRatio,
    muletillas,
  };
}

function validateTalkRatio(value) {
  // Drafts saved with the earlier range-based shape fall back to the default limits.
  const limits = (Array.isArray(value?.limits) ? value.limits : DEFAULT_TALK_RATIO.limits).map(Number);
  const points = Number(value?.points);
  const increasing = limits.every((limit, index) => Number.isInteger(limit) && limit >= 1 && limit <= 100 && (index === 0 || limit > limits[index - 1]));
  if (limits.length !== RULE_LEVELS.length - 1 || !increasing) {
    throw new Error("Ratio de habla: los cuatro límites deben ser porcentajes enteros de menor a mayor, entre 1 y 100.");
  }
  if (!Number.isInteger(points) || points < 0 || points > TOTAL_POINTS) throw new Error(`Ratio de habla: los puntos deben ser un número entero entre 0 y ${TOTAL_POINTS}.`);
  return { limits, points };
}

// The first limit the consultant's share does not exceed sets the level; beyond the last one, no points.
export function talkRatioLevel(consultantPct, { limits }) {
  const index = limits.findIndex((limit) => consultantPct <= limit);
  return RULE_LEVELS[index === -1 ? RULE_LEVELS.length - 1 : index].id;
}

// evaluations: [{ ruleId, level }] as returned by the AI. A sale always scores 100,
// but the per-rule breakdown is kept so the consultant can see how the sale happened.
// talkRatio: { config, consultantPct } measured by the system; skipped when it could not be measured.
export function computeRulesScore(rules, evaluations = [], { isSale = false, talkRatio = null } = {}) {
  const byRule = new Map((Array.isArray(evaluations) ? evaluations : []).map((entry) => [entry?.ruleId, entry]));
  let earned = 0;
  let possible = 0;
  const ratioItems = [];
  if (talkRatio?.config?.points > 0 && Number.isFinite(talkRatio.consultantPct)) {
    const level = talkRatioLevel(talkRatio.consultantPct, talkRatio.config);
    const ratioEarned = talkRatio.config.points * LEVEL_FACTORS.get(level);
    earned += ratioEarned;
    possible += talkRatio.config.points;
    ratioItems.push({ ruleId: "talk-ratio", level, points: talkRatio.config.points, earned: ratioEarned, missing: false, consultantPct: talkRatio.consultantPct });
  }
  const items = rules.map((entry) => {
    const evaluation = byRule.get(entry.id);
    const notApplicable = evaluation?.level === NOT_APPLICABLE && entry.allowNotApplicable;
    const factor = LEVEL_FACTORS.get(evaluation?.level) ?? 0;
    const ruleEarned = notApplicable ? 0 : entry.points * factor;
    if (!notApplicable) {
      earned += ruleEarned;
      possible += entry.points;
    }
    return {
      ruleId: entry.id,
      level: notApplicable ? NOT_APPLICABLE : LEVEL_FACTORS.has(evaluation?.level) ? evaluation.level : "no_lo_hizo",
      points: entry.points,
      earned: ruleEarned,
      missing: !evaluation,
    };
  });
  // Points out of 100 with two decimals; "no aplica" rules are left out and the rest scaled back to 100.
  const rulesScore = possible > 0 ? Math.round((earned / possible) * 100 * 100) / 100 : null;
  return { score: isSale ? 100 : rulesScore, rulesScore, saleOverride: isSale, earned, possible, items: [...ratioItems, ...items] };
}
