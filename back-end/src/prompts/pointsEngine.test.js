import test from "node:test";
import assert from "node:assert/strict";
import { buildPointsPrompt, countMuletillas, detectedMuletillas, muletillaGapKinds, muletillaTimeline, muletillasLevel, scorePointsAnalysis, swapSpeakerLabels } from "./pointsEngine.js";
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
  const scoring = scorePointsAnalysis({ reglas }, speech, { consultantPct: 75, muletillas: { total: 3, perMinute: 1.5, byWord: [] } });
  const first = scoring.items.find((item) => item.ruleId === speech.rules[0].id);
  // Primera regla (5 pts) regular = 2,5; ratio al 75 % = Regular = 3 de 6; muletillas y resto completos.
  assert.equal(scoring.earned, 100 - 2.5 - 3);
  assert.equal(scoring.score, 94.5);
  assert.equal(first.como_mejorar, "di esto");
  assert.equal(scoring.items.find((item) => item.ruleId === speech.rules[1].id).como_mejorar, "");
  assert.ok(!scoring.items.some((item) => item.ruleId === "inventada"));
});

test("la IA detecta las muletillas y el prompt explica que los conectores no cuentan", () => {
  const prompt = buildPointsPrompt({ speech, durationStr: "10:00", transcriptionText: transcript, followupInstruction: "x" });
  assert.match(prompt, /INDICADOR DE MULETILLAS — regla \[muletillas\]/);
  assert.match(prompt, /"muletillas_detectadas": \["frase"\]/);
  assert.match(prompt, /un conector usado de más/);
  assert.doesNotMatch(prompt, /nunca cuentan como muletilla/);
  const custom = structuredClone(speech);
  custom.muletillas.exclude = ["claro"];
  assert.match(buildPointsPrompt({ speech: custom, durationStr: "10:00", transcriptionText: transcript, followupInstruction: "x" }), /nunca cuentan como muletilla; no las incluyas: claro/);
  assert.doesNotMatch(prompt, /muletillas_no_listadas|Conteo exacto/);
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
  assert.deepEqual(times.listo, [10, 20, 50, 200]);
  assert.deepEqual(times["en el momento"], [12]);
  assert.deepEqual(times.momento, [55]);
  assert.equal(timeline.durationSec, 300);
  assert.deepEqual(timeline.gaps, { tic: 20, normal: 60 });
  assert.equal(muletillaTimeline([], ["listo"], { isConsultant: () => true }), null);
});

test("cada repetición es tic, alerta o normal según el tiempo desde la anterior", () => {
  assert.deepEqual(muletillaGapKinds([10, 20, 50, 200], { tic: 20, normal: 60 }), ["normal", "tic", "alerta", "normal"]);
});

test("el nivel de muletillas sale de los tics por cada 10 minutos", () => {
  const timeline = (times, durationSec = 600) => ({ gaps: { tic: 20, normal: 60 }, durationSec, words: [{ word: "listo", times }] });
  assert.equal(muletillasLevel({ gaps: { tic: 20, normal: 60 }, durationSec: 600, words: [] }), "excelente");
  assert.equal(muletillasLevel(timeline([0, 100, 200])), "excelente");
  assert.equal(muletillasLevel(timeline([0, 10, 20])), "bien");
  assert.equal(muletillasLevel(timeline([0, 5, 10, 15, 20])), "regular");
  assert.equal(muletillasLevel(timeline([0, 5, 10, 15, 20], 4200)), "bien");
  assert.equal(muletillasLevel(timeline(Array.from({ length: 12 }, (_, i) => i * 5))), "no_lo_hizo");
});

test("las muletillas detectadas por la IA se limpian y el nivel medido reemplaza al de la IA", () => {
  assert.deepEqual(detectedMuletillas({ muletillas_detectadas: [" Listo ", "listo", "o sea", 3, ""] }), ["listo", "o sea"]);
  assert.deepEqual(detectedMuletillas({}), []);
  assert.deepEqual(detectedMuletillas({ muletillas_detectadas: ["bueno", "¿Vale?", "claro"] }, ["Claro", "vale"]), ["bueno"]);
  assert.equal(countMuletillas("CONSULTOR: ¿Vale? Te cuento, vale.", ["vale"]).total, 2);
  const reglas = [{ id: "muletillas", nivel: "excelente", que_paso: "x" }];
  const timed = scorePointsAnalysis({ reglas }, speech, { consultantPct: 50, muletillas: { total: 0, byWord: [] }, muletillasLevel: "debil" });
  assert.equal(timed.items.find((item) => item.ruleId === "muletillas").level, "debil");
  const untimed = scorePointsAnalysis({ reglas }, speech, { consultantPct: 50, muletillas: { total: 0, byWord: [] } });
  assert.equal(untimed.items.find((item) => item.ruleId === "muletillas").level, "excelente");
});
