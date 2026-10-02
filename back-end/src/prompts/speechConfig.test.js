import test from "node:test";
import assert from "node:assert/strict";
import { getDynamicAnalysisPrompt } from "./templates/dynamicAnalysisPrompt.js";
import { applySpeechToAnalysis } from "./speechAnalysis.js";
import { DEFAULT_SPEECH, validateSpeech } from "./speechConfig.js";

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
