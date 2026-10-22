// Colombian working days for the daily recordings alert (Monday to Friday; holidays come later with the integration).
const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000; // Colombia has no daylight saving time.
const SEND_FROM_HOUR = 7;
export const DAY = 24 * 60 * 60 * 1000;

const toLocal = (ms) => new Date(ms + COLOMBIA_OFFSET_MS); // read with getUTC*
const dayKey = (local) => local.toISOString().slice(0, 10);
const isWeekday = (local) => local.getUTCDay() >= 1 && local.getUTCDay() <= 5;
export const dayStart = (key) => Date.parse(`${key}T00:00:00Z`) - COLOMBIA_OFFSET_MS;

function previousWorkingDay(local) {
  let day = new Date(local.getTime() - DAY);
  while (!isWeekday(day)) day = new Date(day.getTime() - DAY);
  return day;
}

// The day the alert covers right now: the previous working day, only on working days from 7 a.m.
export function dueDay(now = new Date()) {
  const local = toLocal(now.getTime());
  if (!isWeekday(local) || local.getUTCHours() < SEND_FROM_HOUR) return null;
  return dayKey(previousWorkingDay(local));
}

// Working days after `fromMs` up to and including `key` (how many days in a row without uploading).
export function workingDaysSince(fromMs, key) {
  let count = 0;
  for (let day = toLocal(dayStart(dayKey(toLocal(fromMs))) + DAY); dayKey(day) <= key; day = new Date(day.getTime() + DAY)) {
    if (isWeekday(day)) count += 1;
  }
  return count;
}

export const longDate = (ms) => new Date(ms).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" }).replace(",", "");
