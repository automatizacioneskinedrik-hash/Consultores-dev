import test from "node:test";
import assert from "node:assert/strict";
import { dueDay, workingDaysSince } from "./workingDays.js";

// Times in UTC; Colombia is UTC-5, so 12:00Z is 7 a.m. there.
test("de martes a viernes, desde las 7 a. m., cubre el día anterior", () => {
  assert.equal(dueDay(new Date("2026-10-21T12:00:00Z")), "2026-10-20");
  assert.equal(dueDay(new Date("2026-10-23T22:00:00Z")), "2026-10-22");
});

test("el lunes cubre el viernes", () => {
  assert.equal(dueDay(new Date("2026-10-26T12:30:00Z")), "2026-10-23");
});

test("antes de las 7 a. m. y en fin de semana no hay alerta", () => {
  assert.equal(dueDay(new Date("2026-10-21T11:59:00Z")), null);
  assert.equal(dueDay(new Date("2026-10-24T15:00:00Z")), null);
  assert.equal(dueDay(new Date("2026-10-25T15:00:00Z")), null);
  // 11 p. m. del viernes en Colombia ya es sábado en UTC, pero sigue siendo viernes allá.
  assert.equal(dueDay(new Date("2026-10-24T04:00:00Z")), "2026-10-22");
});

test("cuenta los días hábiles seguidos sin subir", () => {
  // Última grabación el miércoles 15; el informe es del martes 21: jueves, viernes, lunes y martes.
  assert.equal(workingDaysSince(Date.parse("2026-10-15T20:00:00Z"), "2026-10-21"), 4);
  assert.equal(workingDaysSince(Date.parse("2026-10-20T20:00:00Z"), "2026-10-21"), 1);
  // 10 p. m. del lunes 20 en Colombia es martes en UTC: sigue contando como lunes.
  assert.equal(workingDaysSince(Date.parse("2026-10-21T03:00:00Z"), "2026-10-21"), 1);
});
