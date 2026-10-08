import test from "node:test";
import assert from "node:assert/strict";
import { buildPointsPrompt, countMuletillas, scorePointsAnalysis, swapSpeakerLabels } from "./pointsEngine.js";
import { POINTS_TEMPLATE, validatePointsSpeech } from "./speechRules.js";

const speech = validatePointsSpeech(structuredClone(POINTS_TEMPLATE));
const transcript = [
  "CONSULTOR: Listo, vale, en el momento te cuento. Directamente en el momento lo vemos.",
  "CLIENTE: Listo, perfecto.",
  "[SILENCIO 3s]",
  "CONSULTOR: Exactamente, digamos por ejemplo el máster. ¿Me envías los documentos? Listo.",
].join("\n");

test("cuenta las muletillas solo en las líneas del consultor, como palabras completas", () => {
  const result = countMuletillas(transcript, ["listo", "en el momento", "directamente", "digamos por ejemplo", "momento"], { minutes: 2 });
  const byWord = Object.fromEntries(result.byWord.map((entry) => [entry.word, entry.count]));
  assert.equal(byWord.listo, 2);
  assert.equal(byWord["en el momento"], 2);
  assert.equal(byWord.directamente, 1);
  assert.equal(byWord["digamos por ejemplo"], 1);
  assert.equal(byWord.momento, undefined);
  assert.equal(result.total, 6);
  assert.equal(result.perMinute, 3);
});

test("intercambia las etiquetas de hablante sin tocar el resto", () => {
  const swapped = swapSpeakerLabels(transcript);
  assert.match(swapped, /^CLIENTE: Listo, vale/m);
  assert.match(swapped, /^CONSULTOR: Listo, perfecto\./m);
  assert.match(swapped, /^\[SILENCIO 3s\]$/m);
});

test("el prompt se arma con las fases y reglas del speech publicado", () => {
  const custom = structuredClone(speech);
  custom.phases.push({ id: "F6", name: "Seguimiento", objective: "Acordar el siguiente paso." });
  custom.rules.push({ id: "seguimiento-fecha", phaseId: "F6", title: "Acuerda una fecha concreta de contacto", guidance: "", points: 1, allowNotApplicable: false });
  const prompt = buildPointsPrompt({ speech: custom, durationStr: "10:00", transcriptionText: transcript, followupInstruction: "Mensaje breve", muletillas: { total: 0, perMinute: 0, byWord: [] } });
  assert.match(prompt, /FASE 6: Seguimiento — Objetivo: Acordar el siguiente paso\./);
  assert.match(prompt, /\[seguimiento-fecha\] Acuerda una fecha concreta de contacto/);
  assert.match(prompt, /\[cierre-objeciones\].*puede ser "no_aplica"/);
  assert.match(prompt, /"F6"/);
  assert.doesNotMatch(prompt, /score de muletillas|Number \(0-100\), "contexto"/i);
});

test("la nota la calcula el sistema con los niveles de GPT, el ratio medido y la retroalimentación", () => {
  const reglas = speech.rules.map((rule) => ({ id: rule.id, nivel: "excelente", frase: "cita", que_paso: "bien hecho", como_mejorar: "no debería salir", proxima_llamada: "" }));
  reglas[0] = { id: reglas[0].id, nivel: "regular", frase: "“…”", que_paso: "a medias", como_mejorar: "di esto", proxima_llamada: "haz esto" };
  reglas.push({ id: "muletillas", nivel: "excelente", frase: "", que_paso: "fluido" });
  reglas.push({ id: "inventada", nivel: "excelente" });
  const scoring = scorePointsAnalysis({ reglas, muletillas_no_listadas: ["como tal"] }, speech, { consultantPct: 75, muletillas: { total: 3, perMinute: 1.5, byWord: [] } });
  const first = scoring.items.find((item) => item.ruleId === speech.rules[0].id);
  // Primera regla (5 pts) regular = 2,5; ratio al 75 % = Regular = 3 de 6; muletillas y resto completos.
  assert.equal(scoring.earned, 100 - 2.5 - 3);
  assert.equal(scoring.score, 94.5);
  assert.equal(first.como_mejorar, "di esto");
  assert.equal(scoring.items.find((item) => item.ruleId === speech.rules[1].id).como_mejorar, "");
  assert.ok(!scoring.items.some((item) => item.ruleId === "inventada"));
  assert.deepEqual(scoring.muletillas.notListed, ["como tal"]);
});

test("las muletillas se califican como indicador y el prompt explica que los conectores no cuentan", () => {
  const prompt = buildPointsPrompt({ speech, durationStr: "10:00", transcriptionText: transcript, followupInstruction: "x", muletillas: countMuletillas(transcript, speech.muletillas.count, { minutes: 2 }) });
  assert.match(prompt, /INDICADOR DE MULETILLAS — evalúalo como la regla \[muletillas\]/);
  assert.match(prompt, /"en el momento" 2 veces/);
  assert.match(prompt, /"el", "es", "de", "que"/);
  assert.doesNotMatch(prompt, /TODA LA LLAMADA/);
  const missing = scorePointsAnalysis({ reglas: [] }, speech, { consultantPct: 50, muletillas: { total: 0, perMinute: 0, byWord: [] } });
  assert.equal(missing.items.find((item) => item.ruleId === "muletillas").points, 3);
});
