// Daily cost per provider for the "Costos" section. OpenAI, Anthropic and Google report their own cost;
// AssemblyAI has no cost API, so its cost is the audio sent to it times its rate per hour.
// Days are UTC days, as the providers report them. Collected once a day after 10:00 p. m. Colombia.
import { BigQuery } from "@google-cloud/bigquery";
import admin, { db } from "../config/firebase.js";

export const COSTS_START_DATE = "2026-10-16";
const OPENAI_PROJECT_ID = "proj_RGj0l6my7TKzEFsyGPVecYBk";
const ANTHROPIC_WORKSPACE_ID = "wrkspc_01Y8aP9nCbQPJjbjhG5hFWQV";
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "consultores-dev";
const BILLING_TABLE = `${GCP_PROJECT_ID}.billing_export.gcp_billing_export_v1_*`;
// US$ per audio hour, checked against AssemblyAI's Cost page on 2026-10-16. Update when it changes.
export const ASSEMBLY_RATES = Object.freeze({ "Transcripción (Universal-2)": 0.15, "Separar quién habla": 0.02 });
export const PROVIDER_IDS = ["assembly", "openai", "claude", "google"];
const COLLECT_HOUR_UTC = 3; // 10:00 p. m. in Colombia, early morning in Spain.
const REFRESH_DAYS = 3; // Google can report a day late, so the last days are read again every time.
const DAY_MS = 24 * 60 * 60 * 1000;

const usageRef = (day) => db.collection("assembly_usage").doc(day);
const costsCollection = db.collection("daily_costs");
const metaRef = db.collection("cost_meta").doc("collection");
export const utcDay = (date) => new Date(date).toISOString().slice(0, 10);
const addDays = (day, count) => utcDay(new Date(`${day}T00:00:00Z`).getTime() + count * DAY_MS);
const round = (value) => Math.round(value * 10000) / 10000;

export function daysBetween(fromDay, toDay) {
  const days = [];
  for (let day = fromDay; day <= toDay; day = addDays(day, 1)) days.push(day);
  return days;
}

// Called after each AssemblyAI transcription, so failed analyses and deleted calls still count.
export async function recordAssemblyUsage(audioSeconds) {
  await usageRef(utcDay(Date.now())).set({
    audioSeconds: admin.firestore.FieldValue.increment(Math.max(0, Number(audioSeconds) || 0)),
    transcriptions: admin.firestore.FieldValue.increment(1),
  }, { merge: true });
}

// The latest collection moment that has passed: today at 03:00 UTC, or yesterday's if it is earlier.
export function latestCutoff(now = new Date()) {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), COLLECT_HOUR_UTC));
  return cutoff > now ? new Date(cutoff.getTime() - DAY_MS) : cutoff;
}

// { day: { amount, details: { item: amount } } } helpers.
function addCost(byDay, day, item, amount) {
  if (!Number.isFinite(amount) || amount === 0) return;
  const entry = byDay[day] ||= { amount: 0, details: {} };
  entry.amount += amount;
  entry.details[item] = (entry.details[item] || 0) + amount;
}

async function pagedGet(url, params, headers) {
  const buckets = [];
  for (let page = null, guard = 0; guard < 20; guard++) {
    if (page) params.set("page", page);
    const response = await fetch(`${url}?${params}`, { headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
    buckets.push(...(body.data || []));
    if (!body.has_more || !body.next_page) break;
    page = body.next_page;
  }
  return buckets;
}

async function openAiCosts(fromDay, toDay) {
  const key = (process.env.OPENAI_ADMIN_KEY || "").trim();
  if (!key) throw new Error("Falta el secreto OPENAI_ADMIN_KEY.");
  const params = new URLSearchParams({
    start_time: String(Date.parse(`${fromDay}T00:00:00Z`) / 1000),
    end_time: String(Date.parse(`${addDays(toDay, 1)}T00:00:00Z`) / 1000),
    bucket_width: "1d",
    limit: "31",
  });
  params.append("group_by", "project_id");
  params.append("group_by", "line_item");
  const buckets = await pagedGet("https://api.openai.com/v1/organization/costs", params, { Authorization: `Bearer ${key}` });
  const byDay = {};
  for (const bucket of buckets) {
    const day = utcDay(bucket.start_time * 1000);
    for (const result of bucket.results || []) {
      if (result.project_id !== OPENAI_PROJECT_ID) continue;
      addCost(byDay, day, result.line_item || "Otros", Number(result.amount?.value));
    }
  }
  return byDay;
}

async function claudeCosts(fromDay, toDay) {
  const key = (process.env.ANTHROPIC_ADMIN_KEY || "").trim();
  if (!key) throw new Error("Falta el secreto ANTHROPIC_ADMIN_KEY.");
  const params = new URLSearchParams({
    starting_at: `${fromDay}T00:00:00Z`,
    ending_at: `${addDays(toDay, 1)}T00:00:00Z`,
    bucket_width: "1d",
    limit: "31",
  });
  params.append("group_by[]", "workspace_id");
  params.append("group_by[]", "description");
  const buckets = await pagedGet("https://api.anthropic.com/v1/organizations/cost_report", params, { "x-api-key": key, "anthropic-version": "2023-06-01" });
  const byDay = {};
  for (const bucket of buckets) {
    const day = bucket.starting_at.slice(0, 10);
    for (const result of bucket.results || []) {
      if (result.workspace_id !== ANTHROPIC_WORKSPACE_ID) continue;
      // Anthropic reports cents as a decimal string.
      addCost(byDay, day, result.model || result.description || "Otros", Number(result.amount) / 100);
    }
  }
  return byDay;
}

async function googleCosts(fromDay, toDay) {
  const query = `
    SELECT FORMAT_DATE('%F', DATE(usage_start_time)) AS day, service.description AS service,
      SUM((cost + IFNULL((SELECT SUM(credit.amount) FROM UNNEST(credits) AS credit), 0)) / currency_conversion_rate) AS usd
    FROM \`${BILLING_TABLE}\`
    WHERE project.id = @project AND DATE(usage_start_time) BETWEEN @fromDay AND @toDay
    GROUP BY day, service`;
  try {
    const [rows] = await new BigQuery({ projectId: GCP_PROJECT_ID }).query({ query, params: { project: GCP_PROJECT_ID, fromDay, toDay }, location: "US" });
    const byDay = {};
    for (const row of rows) addCost(byDay, row.day, row.service || "Otros", Number(row.usd));
    return byDay;
  } catch (error) {
    // The export table only appears once Google writes its first day.
    if (/not found|matches no table/i.test(error.message)) return {};
    throw error;
  }
}

async function assemblyCosts(days) {
  const snaps = await db.getAll(...days.map(usageRef));
  const byDay = {};
  const usage = {};
  snaps.forEach((snap, index) => {
    const data = snap.exists ? snap.data() : {};
    const hours = (data.audioSeconds || 0) / 3600;
    usage[days[index]] = { calls: data.transcriptions || 0, audioHours: round(hours) };
    for (const [item, rate] of Object.entries(ASSEMBLY_RATES)) addCost(byDay, days[index], item, hours * rate);
  });
  return { byDay, usage };
}

// Reads the providers from a few days before the last stored day (or from the start) up to the last closed
// day, and stores one document per day. A provider that fails keeps its values and its error is shown.
export async function collectCosts(now = new Date(), lastStoredDay = null) {
  const toDay = utcDay(latestCutoff(now).getTime() - DAY_MS);
  if (toDay < COSTS_START_DATE) return;
  const fromDay = [lastStoredDay ? addDays(lastStoredDay, 1 - REFRESH_DAYS) : COSTS_START_DATE, COSTS_START_DATE].sort().pop();
  const days = daysBetween(fromDay, toDay);
  const { byDay: assembly, usage } = await assemblyCosts(days);
  const fetchers = { openai: openAiCosts, claude: claudeCosts, google: googleCosts };
  const results = await Promise.allSettled(Object.values(fetchers).map((fetcher) => fetcher(fromDay, toDay)));
  const byProvider = { assembly };
  const errors = {};
  Object.keys(fetchers).forEach((id, index) => {
    if (results[index].status === "fulfilled") byProvider[id] = results[index].value;
    else errors[id] = results[index].reason?.message || "Error desconocido";
  });

  const batch = db.batch();
  for (const day of days) {
    const providers = {};
    for (const [id, byDay] of Object.entries(byProvider)) {
      const entry = byDay[day] || { amount: 0, details: {} };
      providers[id] = { amount: round(entry.amount), details: Object.fromEntries(Object.entries(entry.details).map(([item, value]) => [item, round(value)])) };
    }
    batch.set(costsCollection.doc(day), { date: day, ...usage[day], providers, collectedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  batch.set(metaRef, { collectedAt: now, lastDay: toDay, errors });
  await batch.commit();
  if (Object.keys(errors).length) console.warn("Costos: proveedores con error", errors);
}

let running = null;
// Collects when the daily cutoff passed since the last collection, or retries hourly after a provider
// failed. Runs when someone opens Costos, so there is nothing to schedule; concurrent requests share one run.
export async function ensureCollected(now = new Date()) {
  const meta = await metaRef.get();
  const last = meta.exists ? meta.data().collectedAt?.toDate?.() : null;
  const failed = meta.exists && Object.keys(meta.data().errors || {}).length > 0;
  if (last && last >= latestCutoff(now) && (!failed || now - last < 60 * 60 * 1000)) return;
  running ||= collectCosts(now, meta.exists ? meta.data().lastDay : null).finally(() => { running = null; });
  await running;
}

export async function getCosts(fromDay, toDay) {
  await ensureCollected();
  const [snap, latestSnap, meta] = await Promise.all([
    costsCollection.where("date", ">=", fromDay).where("date", "<=", toDay).get(),
    costsCollection.orderBy("date", "desc").limit(1).get(),
    metaRef.get(),
  ]);
  const plain = (doc) => { const { collectedAt, ...day } = doc.data(); return day; };
  const days = snap.docs.map(plain).sort((a, b) => a.date.localeCompare(b.date));
  const metaData = meta.exists ? meta.data() : {};
  return {
    startDate: COSTS_START_DATE,
    days,
    latest: latestSnap.empty ? null : plain(latestSnap.docs[0]),
    collectedAt: metaData.collectedAt?.toDate?.().toISOString() || null,
    errors: metaData.errors || {},
  };
}
