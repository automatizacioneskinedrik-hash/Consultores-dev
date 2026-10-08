import { randomUUID } from "node:crypto";
import { db } from "../config/firebase.js";
import { POINTS_FORMAT, POINTS_TEMPLATE, RULE_LEVELS, validatePointsSpeech } from "./speechRules.js";

export const LEGACY_VERSION_ID = "legacy-v1";

export const DEFAULT_SPEECH = Object.freeze({
  name: "Speech comercial actual",
  description: "Metodología de cinco fases vigente antes del editor.",
  phases: [
    { id: "F1", name: "Apertura", objective: "Marcar el marco y la intención; establecer liderazgo, presentar la agenda y conseguir que el cliente hable desde el primer minuto.", detection: "Apertura, presentación o generación de rapport al inicio.", evaluation: "El cliente habla y el consultor escucha." },
    { id: "F2", name: "Diagnóstico", objective: "Explorar evolución de rol, actualización tecnológica, proyección, impacto económico, red profesional y seguridad profesional mediante preguntas abiertas.", detection: "Indagación de necesidades, situación actual, objetivos o presupuesto.", evaluation: "El consultor indaga antes de proponer soluciones; el silencio es su aliado. Si habla más del 65%, señalar la falta de escucha." },
    { id: "F3", name: "Visión", objective: "Construir la visión deseada con las palabras exactas del cliente y presentar el GAP con el radar.", detection: "Transformación esperada, resultado o pregunta de valor.", evaluation: "El cliente debe nombrar su problema antes de que el consultor lo nombre." },
    { id: "F4", name: "Propuesta", objective: "Presentar el programa como vehículo que cierra el GAP, conectando cada elemento con el dolor específico del cliente. Máximo cuatro elementos.", detection: "Presentación del programa o mención de precio, inversión, beca o cuota.", evaluation: "No listar módulos sin conectarlos al dolor. Penalizar presentaciones genéricas o monólogos de más de 3–4 minutos; premiar pausas, comprensión y menos es más. Si el consultor habla más del 80% durante la propuesta, propuesta_valor no puede superar 50." },
    { id: "F5", name: "Cierre", objective: "Cerrar con palabras del cliente, obtener un sí de decisión de fondo, presentar precio y gestionar objeciones validando, anclando al dolor y devolviendo con una pregunta.", detection: "Manejo de objeciones, negociación o intento de compromiso de pago.", evaluation: "Obtener la decisión de fondo antes del precio. Si hay beca, comunicar fecha real. Ofrecer plan de pago de mayor a menor: pago único, cuotas y reserva. Penalizar urgencia artificial o ceder ante la primera objeción." },
  ],
  scoring: { omissionPenalty: 15, inversionPenalty: 10 },
  rules: {
    milestones: "Verifica que el consultor indague el presupuesto antes de dar el precio, haga una pregunta de valor antes de pasar a cifras y ceda la palabra tras presentar la inversión. Las omisiones son puntos de mejora graves.",
    participation: "Valora la distribución de la conversación. Como referencia, el consultor debería hablar aproximadamente 35–45% y el cliente 55–65%. Si el consultor supera el 65%, señala en qué fase faltó escucha; por encima del 75%, considéralo un área grave de mejora y revisa si afectó la presentación de la propuesta.",
    closing: "Evalúa la calidad del cierre y la negociación: el cliente debería expresar su decisión de fondo antes de conocer el precio. Si se ofrece una beca o descuento, debe indicarse una fecha real. Presenta las opciones de pago desde la de mayor importe hasta la reserva. Señala si el consultor cede ante la primera objeción o crea urgencia falsa. Considera exitoso un pago o una reserva acordados para las próximas 24 horas.",
    proposal: "Evalúa si el consultor conecta la propuesta con las necesidades concretas que expresó el cliente. Señala cuando enumera módulos sin relacionarlos con esas necesidades o monopoliza la conversación. Valora las pausas, la comprobación de comprensión y la selección de pocos elementos clave. Si el consultor habla más del 80% durante la propuesta, limita su calificación a 50 puntos.",
    price: "Identifica la primera cifra económica que menciona el consultor e indica en qué fase aparece, o señala que no se mencionó. Indica si presentó el precio antes de explorar el presupuesto, los ingresos o la capacidad de pago del cliente. Describe brevemente el momento.",
    commitment: "Clasifica cómo termina la llamada: firme (pago o reserva concreta), condicionado (depende de un factor externo), aplazado (se acuerda un próximo contacto con fecha) o sin acuerdo ni siguiente paso definido.",
    discovery: "Cuenta únicamente las preguntas abiertas que hace el consultor antes de mencionar el precio. Indica si preguntó quién toma la decisión y si exploró el presupuesto o la capacidad económica. Enumera solo los temas realmente presentes: necesidad, presupuesto, decisor, plazo, motivación y situación actual.",
    objections: "Detecta cada objeción expresada por el cliente y clasifícala como precio, titulación, tiempo, decisor, formato, otras opciones, nivel u otra. Considera una objeción resuelta solo si el consultor respondió y el cliente aceptó la respuesta o no volvió a insistir.",
  },
  extraRules: "",
});

const stateRef = () => db.collection("speech_config").doc("state");
const versionsRef = () => db.collection("speech_versions");

const LEGACY_RULE_TEXT = [
  [/precio_sin_diagnostico_previo\s+es\s+true\s+si\s+no\s+se\s+había\s+explorado\s+presupuesto,\s*ingresos\s+o\s+capacidad\s+de\s+pago/gi, "indica si presentó el precio antes de explorar el presupuesto, los ingresos o la capacidad de pago"],
  [/precio_sin_diagnostico_previo\s*(?:=\s*true|es\s+true)?/gi, "la presentación del precio antes de explorar la situación económica del cliente"],
  [/cierre_negociacion/gi, "la calidad del cierre y la negociación"],
  [/propuesta_valor/gi, "la propuesta de valor"],
  [/sin_compromiso/gi, "sin acuerdo ni siguiente paso"],
  [/pregunto_decisor\s+cuando\s+pregunta\s+qui[eé]n\s+decide/gi, "indica si preguntó quién toma la decisión"],
  [/pregunto_presupuesto\s+cuando\s+explora\s+capacidad\s+econ[oó]mica/gi, "indica si exploró el presupuesto o la capacidad económica"],
  [/temas_cubiertos\s+incluye\s+solo/gi, "enumera únicamente"],
  [/pregunto_decisor/gi, "pregunta sobre quién toma la decisión"],
  [/pregunto_presupuesto/gi, "exploración del presupuesto"],
  [/temas_cubiertos/gi, "temas realmente presentes"],
  [/otras_opciones/gi, "otras opciones"],
  [/situacion_actual/gi, "situación actual"],
  [/motivacion/gi, "motivación"],
  [/\bscore\b/gi, "puntuación"],
];

export function normalizeSpeechRules(rules = {}) {
  return Object.fromEntries(Object.keys(DEFAULT_SPEECH.rules).map((key) => {
    const value = rules?.[key];
    if (typeof value !== "string") return [key, value];
    const normalized = LEGACY_RULE_TEXT.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
    return [key, normalized.replace(/\s+([,.;])/g, "$1")];
  }));
}

export function validateSpeech(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Configuración inválida.");
  const clean = (input, label, max) => {
    if (typeof input !== "string" || !input.trim() || input.length > max) throw new Error(`${label} es obligatorio y debe tener máximo ${max} caracteres.`);
    return input.trim();
  };
  if (!Array.isArray(value.phases) || value.phases.length < 1 || value.phases.length > 12) throw new Error("El speech debe tener entre 1 y 12 fases.");
  const phases = value.phases.map((phase, index) => ({
    id: clean(phase?.id, `ID de fase ${index + 1}`, 64),
    name: clean(phase?.name, `Nombre de fase ${index + 1}`, 100),
    objective: clean(phase?.objective, `Objetivo de fase ${index + 1}`, 2000),
    detection: clean(phase?.detection, `Detección de fase ${index + 1}`, 2000),
    evaluation: clean(phase?.evaluation, `Evaluación de fase ${index + 1}`, 3000),
  }));
  if (phases.some((p) => !/^[A-Za-z0-9_-]+$/.test(p.id)) || new Set(phases.map((p) => p.id)).size !== phases.length) {
    throw new Error("Los identificadores de fase deben ser únicos y alfanuméricos.");
  }
  const scoring = {
    omissionPenalty: Number(value.scoring?.omissionPenalty),
    inversionPenalty: Number(value.scoring?.inversionPenalty),
  };
  if (Object.values(scoring).some((n) => !Number.isInteger(n) || n < 0 || n > 100)) throw new Error("Las penalizaciones deben ser números enteros entre 0 y 100.");
  const normalizedRules = normalizeSpeechRules(value.rules);
  const rules = Object.fromEntries(Object.keys(DEFAULT_SPEECH.rules).map((key) => {
    const rule = clean(normalizedRules[key], `Regla ${key}`, 4000);
    if (/\b[a-záéíóúñ]+_[a-záéíóúñ_]+\b/i.test(rule)) {
      throw new Error(`La regla ${key} debe estar escrita en lenguaje natural, sin nombres técnicos internos.`);
    }
    return [key, rule];
  }));
  const extraRules = typeof value.extraRules === "string" ? value.extraRules.trim() : "";
  if (extraRules.length > 6000) throw new Error("Las reglas adicionales superan 6000 caracteres.");
  return { name: clean(value.name, "Nombre", 100), description: typeof value.description === "string" ? value.description.trim().slice(0, 500) : "", phases, scoring, rules, extraRules };
}

// Legacy text cleanup applies only to the fixed-rules format; points speeches keep their rule list.
function withNormalizedRules(config) {
  return config.format === POINTS_FORMAT ? config : { ...config, rules: normalizeSpeechRules(config.rules) };
}

export function validateSpeechConfig(value, options) {
  return value?.format === POINTS_FORMAT ? validatePointsSpeech(value, options) : validateSpeech(value);
}

// Points drafts live in their own field so editors still running the fixed-rules UI never load them.
const draftField = (config) => config.format === POINTS_FORMAT ? "pointsDraft" : "draft";
const currentDraft = (data) => data?.pointsDraft || data?.draft || null;

export async function getActiveSpeech() {
  const state = await stateRef().get();
  const versionId = state.data()?.activeVersionId || LEGACY_VERSION_ID;
  if (versionId === LEGACY_VERSION_ID) return { id: LEGACY_VERSION_ID, ...DEFAULT_SPEECH, legacy: true };
  const version = await versionsRef().doc(versionId).get();
  if (!version.exists) throw new Error(`Versión de speech ${versionId} no encontrada.`);
  const config = version.data().config;
  return { id: version.id, ...withNormalizedRules(config), legacy: false };
}

export async function getSpeechVersion(versionId) {
  if (versionId === LEGACY_VERSION_ID) return { id: LEGACY_VERSION_ID, ...DEFAULT_SPEECH, legacy: true };
  const version = await versionsRef().doc(versionId).get();
  if (!version.exists) throw new Error("Versión de speech no encontrada.");
  const config = version.data().config;
  return { id: version.id, ...withNormalizedRules(config), legacy: false };
}

export async function getSpeechEditorData() {
  const [state, versions, active] = await Promise.all([
    stateRef().get(), versionsRef().orderBy("publishedAt", "desc").limit(30).get(), getActiveSpeech(),
  ]);
  return {
    active,
    draft: currentDraft(state.data()) ? withNormalizedRules(currentDraft(state.data())) : null,
    revision: state.data()?.revision || 0,
    pointsTemplate: POINTS_TEMPLATE,
    ruleLevels: RULE_LEVELS,
    versions: [
      ...versions.docs.map((doc) => ({ id: doc.id, name: doc.data().config.name, changeNote: doc.data().config.changeNote || "", format: doc.data().config.format || "", publishedAt: doc.data().publishedAt, publishedBy: doc.data().publishedBy, phaseCount: doc.data().config.phases.length })),
      { id: LEGACY_VERSION_ID, name: DEFAULT_SPEECH.name, phaseCount: 5, legacy: true },
    ],
  };
}

export async function saveSpeechDraft(input, expectedRevision) {
  // Drafts may be incomplete while editing; the full checks run on publish.
  const config = validateSpeechConfig(input, { draft: true });
  return db.runTransaction(async (transaction) => {
    const state = await transaction.get(stateRef());
    const revision = state.data()?.revision || 0;
    if (revision !== expectedRevision) throw new Error("El borrador cambió en otra sesión. Recarga antes de guardar.");
    transaction.set(stateRef(), { [draftField(config)]: config, revision: revision + 1 }, { merge: true });
    return revision + 1;
  });
}

export async function discardSpeechDraft() {
  return db.runTransaction(async (transaction) => {
    const state = await transaction.get(stateRef());
    const revision = state.data()?.revision || 0;
    transaction.set(stateRef(), { pointsDraft: null, revision: revision + 1 }, { merge: true });
    return revision + 1;
  });
}

export async function publishSpeech(expectedRevision, publishedBy) {
  const versionId = randomUUID();
  return db.runTransaction(async (transaction) => {
    const state = await transaction.get(stateRef());
    const revision = state.data()?.revision || 0;
    if (revision !== expectedRevision) throw new Error("El borrador cambió en otra sesión. Recarga antes de publicar.");
    const draft = currentDraft(state.data());
    if (!draft) throw new Error("Guarda un borrador antes de publicar.");
    const config = validateSpeechConfig(draft);
    transaction.create(versionsRef().doc(versionId), { config, publishedAt: new Date(), publishedBy });
    transaction.set(stateRef(), { activeVersionId: versionId, [draftField(config)]: null, revision: revision + 1 }, { merge: true });
    return versionId;
  });
}

export async function activateSpeechVersion(versionId) {
  if (versionId !== LEGACY_VERSION_ID) {
    const version = await versionsRef().doc(versionId).get();
    if (!version.exists) throw new Error("Versión de speech no encontrada.");
  }
  await stateRef().set({ activeVersionId: versionId }, { merge: true });
}
