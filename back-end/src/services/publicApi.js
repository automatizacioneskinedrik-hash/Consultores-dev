// Read-only views of Speech data for other systems (/api/v1). Field names are English and stable:
// changing one breaks whoever consumes it, so new fields are added and old ones are never renamed.
import { db } from "../config/firebase.js";
import { cargoOf } from "../roles.js";
import { getActiveSpeech, getSpeechVersion } from "../prompts/speechConfig.js";
import { getCosts } from "./costReport.js";
import { buildUploadReport } from "./uploadAlert.js";

const sessions = db.collection("meetings_analysis");
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CHECK_STATE = { si: "yes", parcial: "partial", no: "no" };
const SPECIAL_ITEMS = new Set(["talk-ratio", "muletillas"]);

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const iso = (value) => value?.toDate?.().toISOString() || null;
const email = (value) => String(value || "").trim().toLowerCase();

function dayParam(value, name) {
  if (value == null || value === "") return null;
  if (!DAY_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ApiError(400, "invalid_parameter", `${name} debe tener el formato AAAA-MM-DD.`);
  }
  return value;
}

function leadChecks(analysis = {}) {
  const source = analysis.validaciones_lead || {};
  const check = (entry) => {
    const state = CHECK_STATE[String(entry?.estado || "").toLowerCase()];
    return state ? { state, reason: entry.motivo || "" } : null;
  };
  return { product: check(source.producto), price: check(source.precio), agreements: check(source.acuerdos) };
}

async function usersByEmail() {
  const snap = await db.collection("users").get();
  return new Map(snap.docs.map((doc) => doc.data()).filter((user) => user.email).map((user) => [email(user.email), user]));
}

function sessionSummary(doc, users) {
  const data = doc.data();
  const analysis = data.analysis || {};
  const owner = users.get(email(data.userEmail));
  return {
    id: doc.id,
    consultantEmail: email(data.userEmail),
    consultantName: owner?.name || null,
    uploadedBy: email(data.uploadedBy || data.userEmail),
    createdAt: iso(data.createdAt),
    duration: analysis.participacion?.duracion_total || null,
    clientName: analysis.nombre_cliente || null,
    leadId: data.leadId || null,
    score: data.generalScore ?? null,
    scoreFormat: data.scoring?.format === "points" ? "points" : "legacy",
    speechVersionId: data.speechVersionId || null,
    interest: analysis.probabilidades?.interes_cliente ?? null,
    closeProximity: analysis.probabilidades?.proximidad_cierre ?? null,
    closeStage: analysis.probabilidades?.estado_cierre || null,
    commitment: analysis.tipo_compromiso_cierre || null,
    leadChecks: leadChecks(analysis),
    aiModel: data.aiUsage?.model || null,
  };
}

const SUMMARY_FIELDS = ["userEmail", "uploadedBy", "createdAt", "generalScore", "scoring.format", "speechVersionId", "leadId", "aiUsage.model",
  "analysis.participacion.duracion_total", "analysis.nombre_cliente", "analysis.probabilidades", "analysis.tipo_compromiso_cierre", "analysis.validaciones_lead"];

export async function listSessions({ from, to, consultant, limit, cursor }) {
  const fromDay = dayParam(from, "from");
  const toDay = dayParam(to, "to");
  const size = limit == null || limit === "" ? 50 : Number(limit);
  if (!Number.isInteger(size) || size < 1 || size > 200) throw new ApiError(400, "invalid_parameter", "limit debe ser un número entero entre 1 y 200.");

  let query = sessions;
  if (consultant) query = query.where("userEmail", "==", email(consultant));
  if (fromDay) query = query.where("createdAt", ">=", new Date(`${fromDay}T00:00:00Z`));
  if (toDay) query = query.where("createdAt", "<", new Date(Date.parse(`${toDay}T00:00:00Z`) + 24 * 60 * 60 * 1000));
  query = query.orderBy("createdAt", "desc");
  if (cursor) {
    const last = await sessions.doc(String(cursor)).get();
    if (!last.exists) throw new ApiError(400, "invalid_parameter", "cursor no corresponde a ninguna sesión. Usa el valor nextCursor de la respuesta anterior.");
    query = query.startAfter(last);
  }
  const [snap, users] = await Promise.all([query.select(...SUMMARY_FIELDS).limit(size + 1).get(), usersByEmail()]);
  const page = snap.docs.slice(0, size);
  return { data: page.map((doc) => sessionSummary(doc, users)), nextCursor: snap.docs.length > size ? page[page.length - 1].id : null };
}

export async function getSession(id, { includeTranscript = false } = {}) {
  const doc = await sessions.doc(String(id)).get();
  if (!doc.exists) throw new ApiError(404, "not_found", "No existe una sesión con ese id.");
  const data = doc.data();
  const analysis = data.analysis || {};
  const snapshotRules = new Map((data.speechSnapshot?.rules || []).map((rule) => [rule.id, rule]));
  const phases = new Map((data.speechSnapshot?.phases || []).map((phase) => [phase.id, phase.name]));
  const items = Array.isArray(data.scoring?.items) ? data.scoring.items : [];
  const item = (id) => items.find((entry) => entry.ruleId === id);
  const ratio = item("talk-ratio");
  const muletillas = item("muletillas");

  return {
    ...sessionSummary(doc, await usersByEmail()),
    summary: analysis.resumen || null,
    rules: items.filter((entry) => !SPECIAL_ITEMS.has(entry.ruleId)).map((entry) => {
      const rule = snapshotRules.get(entry.ruleId);
      return {
        ruleId: entry.ruleId,
        title: rule?.title || null,
        phaseId: rule?.phaseId || null,
        phaseName: phases.get(rule?.phaseId) || null,
        level: entry.level,
        points: entry.points ?? null,
        earned: entry.earned ?? null,
        quote: entry.frase || null,
        whatHappened: entry.que_paso || null,
        howToImprove: entry.como_mejorar || null,
      };
    }),
    talkRatio: ratio || data.scoring?.talkRatio ? {
      consultantPct: data.scoring?.talkRatio?.consultantPct ?? null,
      level: ratio?.level || null,
      points: ratio?.points ?? null,
      earned: ratio?.earned ?? null,
    } : null,
    muletillas: muletillas || data.scoring?.muletillas ? {
      perMinute: data.scoring?.muletillas?.perMinute ?? null,
      level: muletillas?.level || null,
      points: muletillas?.points ?? null,
      earned: muletillas?.earned ?? null,
      words: (data.scoring?.muletillas?.timeline?.words || data.scoring?.muletillas?.byWord || [])
        .map((entry) => ({ word: entry.word, count: entry.count ?? entry.times?.length ?? 0 })),
    } : null,
    needs: Array.isArray(analysis.necesidades) ? analysis.necesidades : [],
    objections: (analysis.objeciones || []).map((entry) => ({ description: entry.descripcion || "", category: entry.categoria || null, resolved: entry.resuelta ?? null })),
    nextSteps: analysis.proximos_pasos?.consultor || [],
    // Calls graded before the points speech have four section scores instead of rules.
    legacyScorecard: data.scoring?.format === "points" ? null : legacyScorecard(analysis.scorecard),
    ...(includeTranscript ? { transcript: typeof data.transcription === "string" ? data.transcription : null } : {}),
  };
}

const LEGACY_SECTIONS = { muletillas: "fillerWords", cierre_negociacion: "closingNegotiation", manejo_objeciones: "objectionHandling", propuesta_valor: "valueProposition" };
function legacyScorecard(scorecard) {
  if (!scorecard) return null;
  return Object.fromEntries(Object.entries(LEGACY_SECTIONS).filter(([key]) => scorecard[key]).map(([key, name]) => [name, {
    score: scorecard[key].score ?? null,
    ...(scorecard[key].count != null ? { count: scorecard[key].count } : {}),
    comment: scorecard[key].contexto || null,
  }]));
}

function speechView(speech) {
  if (speech.legacy || !Array.isArray(speech.rules)) return { id: speech.id, name: speech.name || null, format: "legacy", phases: [], rules: [] };
  return {
    id: speech.id,
    name: speech.name,
    format: "points",
    phases: speech.phases.map((phase) => ({
      id: phase.id, name: phase.name, objective: phase.objective || null,
      points: speech.rules.filter((rule) => rule.phaseId === phase.id).reduce((sum, rule) => sum + rule.points, 0),
    })),
    rules: speech.rules.map((rule) => ({ id: rule.id, phaseId: rule.phaseId, title: rule.title, points: rule.points, allowNotApplicable: Boolean(rule.allowNotApplicable) })),
    talkRatio: speech.talkRatio ? { points: speech.talkRatio.points, limits: speech.talkRatio.limits } : null,
    muletillas: speech.muletillas ? { points: speech.muletillas.points } : null,
  };
}

export async function activeSpeech() {
  return speechView(await getActiveSpeech());
}

export async function speechVersion(id) {
  try {
    return speechView(await getSpeechVersion(String(id)));
  } catch {
    throw new ApiError(404, "not_found", "No existe una versión del speech con ese id.");
  }
}

export async function listUsers() {
  const snap = await db.collection("users").get();
  return snap.docs.map((doc) => doc.data()).filter((user) => user.email).map((user) => {
    const cargo = cargoOf(user);
    return { email: email(user.email), name: user.name || null, role: cargo.id, roleLabel: cargo.label, picture: user.picture || null };
  }).sort((a, b) => a.email.localeCompare(b.email));
}

export async function dailyUploads(date) {
  const day = dayParam(date, "date");
  if (!day) throw new ApiError(400, "missing_parameter", "date es obligatorio, con el formato AAAA-MM-DD.");
  const report = await buildUploadReport(day);
  const row = (entry, status) => ({ email: entry.email, name: entry.name, role: entry.cargo, status, recordings: entry.count, lastRecordingAt: entry.last ? new Date(entry.last).toISOString() : null });
  return {
    date: day,
    totalRecordings: report.total,
    people: [...report.missing.map((entry) => row(entry, "missing")), ...report.uploaded.map((entry) => row(entry, "uploaded")), ...report.inactive.map((entry) => row(entry, "inactive"))],
  };
}

export async function dailyCosts(from, to) {
  const fromDay = dayParam(from, "from");
  const toDay = dayParam(to, "to");
  if (!fromDay || !toDay) throw new ApiError(400, "missing_parameter", "from y to son obligatorios, con el formato AAAA-MM-DD.");
  const costs = await getCosts(fromDay, toDay);
  return {
    currency: "USD",
    collectedAt: costs.collectedAt,
    days: costs.days.map((day) => {
      const providers = Object.fromEntries(Object.entries(day.providers || {}).map(([id, entry]) => [id, entry.amount || 0]));
      const total = Math.round(Object.values(providers).reduce((sum, amount) => sum + amount, 0) * 100) / 100;
      return { date: day.date, total, providers, transcriptions: day.transcriptions || 0, audioSeconds: day.audioSeconds || 0 };
    }),
  };
}
