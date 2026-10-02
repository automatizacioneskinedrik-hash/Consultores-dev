import { randomUUID } from "node:crypto";
import { db } from "../config/firebase.js";

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
    participation: "Calcula la participación por palabras. Objetivo: consultor 35–45%, cliente 55–65%. Si el consultor habla más del 65%, señala la falta de escucha en la fase que corresponda. Más del 75% es grave; también puede afectar la propuesta.",
    closing: "Evalúa cierre_negociacion según las fases de decisión, precio y objeciones. El sí emocional debe preceder al precio. Si hay beca, comunicar fecha real. Ofrecer pago único, luego cuotas y luego reserva. Penaliza ceder ante la primera objeción o crear urgencia falsa. Reconoce como cierre exitoso un pago o reserva acordados para las próximas 24 horas.",
    proposal: "Evalúa propuesta_valor conectando la solución con el dolor específico del cliente. Penaliza listar módulos sin relacionarlos con su necesidad o monopolizar la conversación; premia pausas, comprobación de comprensión y presentar pocos elementos clave. Si el consultor habla más del 80% durante la propuesta, el score no puede superar 50.",
    price: "Detecta la primera cifra económica mencionada por el consultor. Indica la fase donde ocurre o No mencionado. precio_sin_diagnostico_previo es true si no se había explorado presupuesto, ingresos o capacidad de pago; describe brevemente el momento.",
    commitment: "Clasifica el cierre como firme (pago o reserva concreta), condicionado (sujeto a factor externo), aplazado (próximo contacto con fecha) o sin_compromiso (sin acuerdo ni siguiente paso).",
    discovery: "Cuenta solo las preguntas abiertas del consultor anteriores al precio. Marca pregunto_decisor cuando pregunta quién decide y pregunto_presupuesto cuando explora capacidad económica. En temas_cubiertos incluye solo necesidad, presupuesto, decisor, plazo, motivacion y situacion_actual realmente presentes.",
    objections: "Detecta cada objeción del cliente. Clasifica como precio, titulacion, tiempo, decisor, formato, otras_opciones, nivel u otro. Marca resuelta solo si el consultor respondió y el cliente aceptó o no insistió.",
  },
  extraRules: "",
});

const stateRef = () => db.collection("speech_config").doc("state");
const versionsRef = () => db.collection("speech_versions");

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
  const rules = Object.fromEntries(Object.keys(DEFAULT_SPEECH.rules).map((key) => [key, clean(value.rules?.[key], `Regla ${key}`, 4000)]));
  const extraRules = typeof value.extraRules === "string" ? value.extraRules.trim() : "";
  if (extraRules.length > 6000) throw new Error("Las reglas adicionales superan 6000 caracteres.");
  return { name: clean(value.name, "Nombre", 100), description: typeof value.description === "string" ? value.description.trim().slice(0, 500) : "", phases, scoring, rules, extraRules };
}

export async function getActiveSpeech() {
  const state = await stateRef().get();
  const versionId = state.data()?.activeVersionId || LEGACY_VERSION_ID;
  if (versionId === LEGACY_VERSION_ID) return { id: LEGACY_VERSION_ID, ...DEFAULT_SPEECH, legacy: true };
  const version = await versionsRef().doc(versionId).get();
  if (!version.exists) throw new Error(`Versión de speech ${versionId} no encontrada.`);
  return { id: version.id, ...version.data().config, legacy: false };
}

export async function getSpeechVersion(versionId) {
  if (versionId === LEGACY_VERSION_ID) return { id: LEGACY_VERSION_ID, ...DEFAULT_SPEECH, legacy: true };
  const version = await versionsRef().doc(versionId).get();
  if (!version.exists) throw new Error("Versión de speech no encontrada.");
  return { id: version.id, ...version.data().config, legacy: false };
}

export async function getSpeechEditorData() {
  const [state, versions, active] = await Promise.all([
    stateRef().get(), versionsRef().orderBy("publishedAt", "desc").limit(30).get(), getActiveSpeech(),
  ]);
  return {
    active,
    draft: state.data()?.draft || null,
    revision: state.data()?.revision || 0,
    versions: [
      ...versions.docs.map((doc) => ({ id: doc.id, name: doc.data().config.name, publishedAt: doc.data().publishedAt, publishedBy: doc.data().publishedBy, phaseCount: doc.data().config.phases.length })),
      { id: LEGACY_VERSION_ID, name: DEFAULT_SPEECH.name, phaseCount: 5, legacy: true },
    ],
  };
}

export async function saveSpeechDraft(input, expectedRevision) {
  const config = validateSpeech(input);
  return db.runTransaction(async (transaction) => {
    const state = await transaction.get(stateRef());
    const revision = state.data()?.revision || 0;
    if (revision !== expectedRevision) throw new Error("El borrador cambió en otra sesión. Recarga antes de guardar.");
    transaction.set(stateRef(), { draft: config, revision: revision + 1 }, { merge: true });
    return revision + 1;
  });
}

export async function publishSpeech(expectedRevision, publishedBy) {
  const versionId = randomUUID();
  return db.runTransaction(async (transaction) => {
    const state = await transaction.get(stateRef());
    const revision = state.data()?.revision || 0;
    if (revision !== expectedRevision) throw new Error("El borrador cambió en otra sesión. Recarga antes de publicar.");
    if (!state.data()?.draft) throw new Error("Guarda un borrador antes de publicar.");
    const config = validateSpeech(state.data().draft);
    transaction.create(versionsRef().doc(versionId), { config, publishedAt: new Date(), publishedBy });
    transaction.set(stateRef(), { activeVersionId: versionId, draft: null, revision: revision + 1 }, { merge: true });
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
