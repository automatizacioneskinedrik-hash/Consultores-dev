import test from "node:test";
import assert from "node:assert/strict";
import { computeRulesScore, GENERAL_GROUP_ID, MULETILLAS_RULE_ID, NOT_APPLICABLE, POINTS_TEMPLATE, talkRatioLevel, validatePointsSpeech } from "./speechRules.js";
import { validateSpeechConfig, DEFAULT_SPEECH } from "./speechConfig.js";

const template = () => structuredClone(POINTS_TEMPLATE);

test("la plantilla por puntos es válida y suma 100", () => {
  const speech = validatePointsSpeech(template());
  assert.equal(speech.rules.reduce((sum, rule) => sum + rule.points, 0) + speech.talkRatio.points + speech.muletillas.points, 100);
  assert.ok(!speech.rules.some((rule) => rule.phaseId === GENERAL_GROUP_ID));
  assert.ok(speech.muletillas.count.includes("en el momento") && speech.muletillas.ignore.includes("entonces"));
  assert.ok(MULETILLAS_RULE_ID);
});

test("rechaza reglas que no suman 100, fases inexistentes e IDs repetidos", () => {
  const short = template();
  short.rules[0].points += 1;
  assert.throws(() => validatePointsSpeech(short), /deben sumar 100; ahora suman 101/);

  const orphan = template();
  orphan.rules[0].phaseId = "NO_EXISTE";
  assert.throws(() => validatePointsSpeech(orphan), /fase existente/);

  const duplicated = template();
  duplicated.rules[1].id = duplicated.rules[0].id;
  assert.throws(() => validatePointsSpeech(duplicated), /identificadores de regla/);

  const fractional = template();
  fractional.rules[0].points = 4.5;
  assert.throws(() => validatePointsSpeech(fractional), /número entero/);
});

test("una palabra no puede ser muletilla e ignorada a la vez", () => {
  const speech = template();
  speech.muletillas = { count: ["vale"], ignore: ["Vale"] };
  assert.throws(() => validatePointsSpeech(speech), /a la vez/);
});

test("el editor acepta ambos formatos según el campo format", () => {
  assert.equal(validateSpeechConfig(template()).format, "points");
  assert.equal(validateSpeechConfig({ ...DEFAULT_SPEECH }).format, undefined);
});

test("una llamada que cumple todo de forma excelente llega a 100", () => {
  const { rules } = validatePointsSpeech(template());
  const result = computeRulesScore(rules, rules.map((rule) => ({ ruleId: rule.id, level: "excelente" })));
  assert.equal(result.score, 100);
});

test("los cinco niveles reparten los puntos y no aplica se excluye del total", () => {
  const rules = [
    { id: "a", points: 40, allowNotApplicable: false },
    { id: "b", points: 40, allowNotApplicable: false },
    { id: "c", points: 20, allowNotApplicable: true },
  ];
  const result = computeRulesScore(rules, [
    { ruleId: "a", level: "bien" },
    { ruleId: "b", level: "debil" },
    { ruleId: "c", level: NOT_APPLICABLE },
  ]);
  // (30 + 10) / 80 = 50 %
  assert.equal(result.score, 50);
  assert.equal(result.possible, 80);
  assert.equal(result.items[2].level, NOT_APPLICABLE);
});

test("no aplica solo se acepta si la regla lo permite y las reglas sin evaluar cuentan 0", () => {
  const rules = [{ id: "a", points: 50, allowNotApplicable: false }, { id: "b", points: 50, allowNotApplicable: false }];
  const result = computeRulesScore(rules, [{ ruleId: "a", level: NOT_APPLICABLE }]);
  assert.equal(result.score, 0);
  assert.equal(result.items[0].level, "no_lo_hizo");
  assert.equal(result.items[1].missing, true);
});

test("una venta vale 100 pero conserva el desglose por reglas", () => {
  const rules = [{ id: "a", points: 100, allowNotApplicable: false }];
  const result = computeRulesScore(rules, [{ ruleId: "a", level: "regular" }], { isSale: true });
  assert.equal(result.score, 100);
  assert.equal(result.rulesScore, 50);
  assert.equal(result.saleOverride, true);
});

test("un borrador puede estar incompleto, pero no se puede publicar así", () => {
  const draft = template();
  draft.rules[0].title = "";
  draft.rules[0].points += 3;
  draft.phases[0].objective = "";
  assert.equal(validatePointsSpeech(draft, { draft: true }).rules[0].title, "");
  assert.throws(() => validatePointsSpeech(draft), /obligatorio|sumar 100/);
});

test("el ratio de habla usa cuatro límites para cinco niveles", () => {
  const config = { limits: [65, 70, 75, 80], points: 6 };
  assert.equal(talkRatioLevel(40, config), "excelente");
  assert.equal(talkRatioLevel(65, config), "excelente");
  assert.equal(talkRatioLevel(68, config), "bien");
  // Caso real de prueba: consultora al 75 % queda en Regular.
  assert.equal(talkRatioLevel(75, config), "regular");
  assert.equal(talkRatioLevel(79, config), "debil");
  assert.equal(talkRatioLevel(81, config), "no_lo_hizo");
});

test("un borrador con el formato anterior del ratio toma los límites por defecto", () => {
  const speech = template();
  speech.talkRatio = { consultantMin: 35, consultantMax: 45, margin: 5, points: 6 };
  assert.deepEqual(validatePointsSpeech(speech).talkRatio, { limits: [65, 70, 75, 80], points: 6 });
});

test("el ratio suma sus puntos medidos y se omite si no se pudo medir", () => {
  const rules = [{ id: "a", points: 94, allowNotApplicable: false }];
  const config = { limits: [65, 70, 75, 80], points: 6 };
  const measured = computeRulesScore(rules, [{ ruleId: "a", level: "excelente" }], { talkRatio: { config, consultantPct: 68 } });
  assert.equal(measured.items[0].level, "bien");
  assert.equal(measured.earned, 94 + 4.5);
  const unmeasured = computeRulesScore(rules, [{ ruleId: "a", level: "excelente" }], { talkRatio: { config, consultantPct: null } });
  assert.equal(unmeasured.score, 100);
});

test("los límites del ratio deben ir de menor a mayor", () => {
  const speech = template();
  speech.talkRatio = { ...speech.talkRatio, limits: [65, 60, 75, 80] };
  assert.throws(() => validatePointsSpeech(speech), /de menor a mayor/);
});

test("ya no se aceptan reglas sueltas fuera de una fase", () => {
  const speech = template();
  speech.rules[0].phaseId = GENERAL_GROUP_ID;
  assert.throws(() => validatePointsSpeech(speech), /fase existente/);
});
