import test from "node:test";
import assert from "node:assert/strict";
import { buildPointsPrompt, countMuletillas, muletillaGapKinds, muletillaTimeline, scorePointsAnalysis, swapSpeakerLabels } from "./pointsEngine.js";
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
  // Every call is graded: the AI is never allowed to reject a transcription.
  assert.doesNotMatch(prompt, /inválida o insuficiente|devuelve \{"error"/);
  assert.match(prompt, /Analiza SIEMPRE la llamada/);
  const missing = scorePointsAnalysis({ reglas: [] }, speech, { consultantPct: 50, muletillas: { total: 0, perMinute: 0, byWord: [] } });
  assert.equal(missing.items.find((item) => item.ruleId === "muletillas").points, 3);
});

const word = (text, second) => ({ text, start: second * 1000 });
const utterances = [
  { speaker: "A", words: [word("Listo,", 10), word("en", 12), word("el", 12), word("momento", 13), word("listo.", 20)] },
  { speaker: "B", words: [word("Listo.", 25)] },
  { speaker: "A", words: [word("¿Listo?", 50), word("momento", 55), word("listo", 200)] },
];

test("la línea de tiempo ubica cada muletilla del consultor en su segundo", () => {
  const timeline = muletillaTimeline(utterances, ["listo", "en el momento", "momento"], { isConsultant: (speaker) => speaker === "A", durationSec: 300.4, gaps: { tic: 20, normal: 60 } });
  const times = Object.fromEntries(timeline.words.map((entry) => [entry.word, entry.times]));
  assert.deepEqual(times.listo, [10, 20, 200]);
  assert.deepEqual(times["en el momento"], [12]);
  assert.deepEqual(times.momento, [55]);
  assert.equal(timeline.durationSec, 300);
  assert.deepEqual(timeline.gaps, { tic: 20, normal: 60 });
  assert.equal(muletillaTimeline([], ["listo"], { isConsultant: () => true }), null);
});

test("cada repetición es tic, alerta o normal según el tiempo desde la anterior", () => {
  assert.deepEqual(muletillaGapKinds([10, 20, 50, 200], { tic: 20, normal: 60 }), ["normal", "tic", "alerta", "normal"]);
});

test("el prompt incluye la clasificación por tiempo cuando hay línea de tiempo", () => {
  const timeline = { gaps: { tic: 20, normal: 90 }, durationSec: 300, words: [{ word: "listo", times: [10, 20, 200] }] };
  const prompt = buildPointsPrompt({ speech, durationStr: "5:00", transcriptionText: transcript, followupInstruction: "x", muletillas: { total: 3, perMinute: 1, byWord: [{ word: "listo", count: 3 }], timeline } });
  assert.match(prompt, /menos de 20 s es un tic; entre 20 s y 1:30 min, una alerta/);
  assert.match(prompt, /"listo" 3 veces: 1 tics, 0 alertas, 2 normales \(en 0:10, 0:20, 3:20\)/);
  const without = buildPointsPrompt({ speech, durationStr: "5:00", transcriptionText: transcript, followupInstruction: "x", muletillas: { total: 0, perMinute: 0, byWord: [] } });
  assert.doesNotMatch(without, /Momento de cada repetición/);
});
