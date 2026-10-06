import test from "node:test";
import assert from "node:assert/strict";
import { getDynamicAnalysisPrompt } from "./templates/dynamicAnalysisPrompt.js";
import { applySpeechToAnalysis } from "./speechAnalysis.js";
import { DEFAULT_SPEECH, normalizeSpeechRules, validateSpeech } from "./speechConfig.js";

test("las reglas editables usan lenguaje natural y limpian las versiones guardadas con claves internas", () => {
  const legacyRules = {
    ...DEFAULT_SPEECH.rules,
    closing: "Evalúa cierre_negociacion según las fases de decisión, precio y objeciones.",
    proposal: "Evalúa propuesta_valor; el score no puede superar 50.",
    price: "precio_sin_diagnostico_previo es true si no se había explorado presupuesto, ingresos o capacidad de pago; describe el momento.",
    commitment: "Clasifica como firme o sin_compromiso.",
    discovery: "Marca pregunto_decisor cuando pregunta quién decide y pregunto_presupuesto cuando explora capacidad económica. En temas_cubiertos incluye motivacion y situacion_actual.",
    objections: "Clasifica como precio u otras_opciones.",
  };
  const normalized = normalizeSpeechRules(legacyRules);
  assert.match(normalized.closing, /calidad del cierre y la negociación/);
  assert.match(normalized.proposal, /puntuación/);
  assert.match(normalized.price, /indica si presentó el precio antes de explorar/i);
  assert.match(normalized.commitment, /sin acuerdo ni siguiente paso/);
  assert.match(normalized.discovery, /quién toma la decisión/);
  assert.match(normalized.objections, /otras opciones/);
  assert.doesNotMatch(JSON.stringify(normalized), /[a-záéíóúñ]+_[a-záéíóúñ_]+/i);
  assert.doesNotMatch(JSON.stringify(DEFAULT_SPEECH.rules), /[a-záéíóúñ]+_[a-záéíóúñ_]+/i);
  const validated = validateSpeech({ ...DEFAULT_SPEECH, rules: legacyRules });
  assert.doesNotMatch(JSON.stringify(validated.rules), /[a-záéíóúñ]+_[a-záéíóúñ_]+/i);
  assert.throws(() => validateSpeech({ ...DEFAULT_SPEECH, rules: { ...DEFAULT_SPEECH.rules, proposal: "Usa una_clave_interna." } }), /lenguaje natural/);
});

test("el editor permite tres o seis fases y rechaza IDs duplicados", () => {
  const three = validateSpeech({ ...DEFAULT_SPEECH, phases: DEFAULT_SPEECH.phases.slice(0, 3) });
  assert.equal(three.phases.length, 3);
  const six = validateSpeech({ ...DEFAULT_SPEECH, phases: [...DEFAULT_SPEECH.phases, { id: "extra", name: "Seguimiento", objective: "Contactar", detection: "Acuerdo", evaluation: "Claridad" }] });
  assert.equal(six.phases.length, 6);
  assert.throws(() => validateSpeech({ ...DEFAULT_SPEECH, phases: [three.phases[0], three.phases[0]] }), /identificadores/);
});

test("el prompt usa solo las fases de la versión elegida", () => {
  const speech = { id: "test", ...validateSpeech({ ...DEFAULT_SPEECH, phases: [
    { id: "A", name: "Inicio", objective: "Abrir", detection: "Saludo", evaluation: "Cordialidad" },
    { id: "B", name: "Explorar", objective: "Preguntar", detection: "Preguntas", evaluation: "Escucha" },
    { id: "C", name: "Acuerdo", objective: "Cerrar", detection: "Compromiso", evaluation: "Claridad" },
  ] }) };
  const prompt = getDynamicAnalysisPrompt("03:00", "", "CONSULTOR: Hola", "Mensaje breve", speech);
  assert.match(prompt, /ID A, Inicio/);
  assert.match(prompt, /ID B, Explorar/);
  assert.match(prompt, /ID C, Acuerdo/);
  assert.doesNotMatch(prompt, /F[1-5]|F0[1-5]|5 fases/);
  const changed = getDynamicAnalysisPrompt("03:00", "", "CONSULTOR: Hola", "Mensaje breve", { ...speech, rules: { ...speech.rules, milestones: "CRITERIO_CAMBIADO" } });
  assert.match(changed, /F\. HITOS DE CONTROL: CRITERIO_CAMBIADO/);
  assert.doesNotMatch(changed, /PRESUPUESTO: Verifica rigurosamente/);
});

test("el análisis descarta fases extrañas y calcula adherencia según la versión", () => {
  const speech = { legacy: false, phases: [{ id: "A" }, { id: "B" }, { id: "C" }], scoring: { omissionPenalty: 25, inversionPenalty: 10 } };
  const result = applySpeechToAnalysis({ fases_alcanzadas: ["C", "A", "X"], feedback: { puntos_mejora: [{ codigo_fase: "X" }] } }, speech);
  assert.deepEqual(result.fases_alcanzadas, ["C", "A"]);
  assert.equal(result.adherencia_guion.orden_correcto, false);
  assert.equal(result.adherencia_guion.score, 65);
  assert.equal(result.feedback.puntos_mejora[0].codigo_fase, "");
});
