// Métricas → Coach. Everything is built from the speech version being measured: its phases, rules and
// "validaciones" (Producto, Precio, Acuerdos…), so it keeps working when the client changes the speech.
import { db } from "../config/firebase.js";
import { getActiveSpeech, getSpeechVersion } from "../prompts/speechConfig.js";
import { validationsFor } from "../prompts/speechRules.js";

const GOOD = new Set(["excelente", "bien"]);
const BAD = new Set(["debil", "no_lo_hizo"]);
const DAY = 24 * 60 * 60 * 1000;
const pct = (earned, possible) => (possible > 0 ? Math.round((earned / possible) * 100) : null);

// Period windows in the viewer's local time (tzOffset = minutes from Date.getTimezoneOffset()).
function periodWindow(period, now, tzOffset) {
  const local = new Date(now.getTime() - tzOffset * 60000);
  const startOfLocalDay = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + tzOffset * 60000;
  if (period === "hoy") return { from: startOfLocalDay, length: DAY };
  if (period === "semana") {
    const weekday = (local.getUTCDay() + 6) % 7;
    return { from: startOfLocalDay - weekday * DAY, length: 7 * DAY };
  }
  if (period === "mes") {
    const from = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + tzOffset * 60000;
    const prev = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) + tzOffset * 60000;
    return { from, length: from - prev };
  }
  return null;
}

function phaseScores(calls, phases, rulesById) {
  return Object.fromEntries(phases.map((phase) => {
    let earned = 0;
    let possible = 0;
    for (const call of calls) {
      for (const item of call.items) {
        const rule = rulesById.get(item.ruleId);
        if (!rule || rule.phaseId !== phase.id || item.level === "no_aplica") continue;
        earned += item.earned || 0;
        possible += item.points || 0;
      }
    }
    return [phase.id, pct(earned, possible)];
  }));
}

// Share of calls where each rule came out Débil or No lo hizo.
function ruleFailures(calls, rulesById) {
  const counts = new Map();
  for (const call of calls) {
    for (const item of call.items) {
      if (!rulesById.has(item.ruleId) || item.level === "no_aplica") continue;
      const entry = counts.get(item.ruleId) || { failed: 0, total: 0 };
      entry.total += 1;
      if (BAD.has(item.level)) entry.failed += 1;
      counts.set(item.ruleId, entry);
    }
  }
  return [...counts.entries()]
    .map(([ruleId, { failed, total }]) => ({ ruleId, title: rulesById.get(ruleId).title, phaseId: rulesById.get(ruleId).phaseId, failed, total, pct: pct(failed, total) }))
    .sort((a, b) => b.pct - a.pct || b.failed - a.failed);
}

// ✓ every rule Excelente/Bien, ○ every rule failed, ◑ in between; "Acuerdos" without rules uses the commitment type.
function validationState(validation, call) {
  const items = call.items.filter((item) => validation.ruleIds.includes(item.ruleId) && item.level !== "no_aplica");
  if (!items.length) {
    if (validation.id !== "acuerdos") return null;
    return { firme: "ok", condicionado: "pa" }[call.commitment] || (call.commitment ? "pe" : null);
  }
  if (items.every((item) => GOOD.has(item.level))) return "ok";
  if (items.every((item) => BAD.has(item.level))) return "pe";
  return "pa";
}

function badgesFor(current, previous, team, phases, rulesById, hasPrevious) {
  const badges = [];
  if (!current.length) return badges;
  const now = phaseScores(current, phases, rulesById);
  const before = hasPrevious ? phaseScores(previous, phases, rulesById) : null;
  const teamScores = phaseScores(team, phases, rulesById);
  const name = (id) => phases.find((phase) => phase.id === id)?.name || id;
  if (before && previous.length) {
    for (const phase of phases) {
      if (now[phase.id] != null && before[phase.id] != null && now[phase.id] - before[phase.id] >= 8) {
        badges.push(["+", `Subiste en ${name(phase.id)}`, `De ${before[phase.id]} % a ${now[phase.id]} % frente al periodo anterior.`]);
      }
    }
  }
  const best = phases.map((phase) => ({ id: phase.id, gap: (now[phase.id] ?? -1) - (teamScores[phase.id] ?? 0) })).sort((a, b) => b.gap - a.gap)[0];
  if (best && best.gap >= 5) badges.push(["+", `Tu mejor fase: ${name(best.id)}`, `${now[best.id]} %, por encima del equipo (${teamScores[best.id]} %).`]);
  for (const failure of ruleFailures(current, rulesById).filter((entry) => entry.total >= 2 && entry.pct >= 50).slice(0, 3)) {
    const grave = failure.pct >= 80 && failure.total >= 3;
    badges.push([grave ? "!!" : "!", failure.title, `Se te escapó en ${failure.failed} de ${failure.total} llamadas (${name(failure.phaseId)}).`]);
  }
  return badges;
}

const toCall = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    email: String(data.userEmail || "").toLowerCase(),
    at: data.createdAt?.toDate?.().getTime() || 0,
    score: data.generalScore ?? null,
    items: Array.isArray(data.scoring?.items) ? data.scoring.items : [],
    client: data.analysis?.nombre_cliente || "Cliente",
    duration: data.analysis?.participacion?.duracion_total || "",
    stage: data.analysis?.probabilidades?.estado_cierre || "",
    interest: data.analysis?.probabilidades?.interes_cliente ?? null,
    commitment: data.analysis?.tipo_compromiso_cierre || "",
    next: data.analysis?.proximos_pasos?.consultor?.[0] || "",
  };
};

export async function coachMetrics({ requester, consultant = "all", period = "semana", versionId = "", tzOffset = 0, now = new Date() }) {
  const speech = versionId ? await getSpeechVersion(versionId) : await getActiveSpeech();
  if (speech.legacy || !Array.isArray(speech.rules)) return { ok: true, legacy: true };
  const rulesById = new Map(speech.rules.map((rule) => [rule.id, rule]));
  const phases = speech.phases.filter((phase) => speech.rules.some((rule) => rule.phaseId === phase.id));
  const validations = validationsFor(speech);

  const snap = await db.collection("meetings_analysis").where("speechVersionId", "==", speech.id)
    .select("userEmail", "createdAt", "generalScore", "scoring.items", "analysis.nombre_cliente", "analysis.participacion.duracion_total",
      "analysis.probabilidades", "analysis.tipo_compromiso_cierre", "analysis.proximos_pasos").get();
  const team = snap.docs.map(toCall).filter((call) => call.items.length);
  // Own-scope roles always see themselves; roles that see everyone may pick one consultant.
  const scope = requester.cargo.seesAll ? (consultant && consultant !== "all" ? String(consultant).toLowerCase() : null) : requester.email;
  const mine = scope ? team.filter((call) => call.email === scope) : team;

  const window = periodWindow(period, now, Number(tzOffset) || 0);
  const current = window ? mine.filter((call) => call.at >= window.from) : mine;
  const previous = window ? mine.filter((call) => call.at >= window.from - window.length && call.at < window.from) : [];
  const teamScores = phaseScores(team, phases, rulesById);
  const myScores = phaseScores(mine, phases, rulesById);
  const repeated = ruleFailures(mine, rulesById).filter((entry) => entry.failed > 0).slice(0, 5);

  const gaps = phases.map((phase) => ({ ...phase, mine: myScores[phase.id], team: teamScores[phase.id], gap: (myScores[phase.id] ?? 0) - (teamScores[phase.id] ?? 0) }))
    // Against the team when one person is selected; with everyone selected, the lowest phase.
    .filter((phase) => phase.mine != null).sort((a, b) => (scope ? a.gap - b.gap : 0) || a.mine - b.mine);
  const weakest = gaps[0] || null;
  const focusRule = weakest ? ruleFailures(mine, rulesById).find((entry) => entry.phaseId === weakest.id && entry.failed > 0) : null;
  const focusTip = focusRule
    ? [...mine].sort((a, b) => b.at - a.at).flatMap((call) => call.items).find((item) => item.ruleId === focusRule.ruleId && item.como_mejorar)?.como_mejorar || ""
    : "";

  const shown = [...mine].sort((a, b) => b.at - a.at).slice(0, 100);
  // WhatsApp messages still to send, only for the leads on screen (Firestore "in" takes 30 values at a time).
  const ids = shown.map((call) => call.id);
  const chunks = Array.from({ length: Math.ceil(ids.length / 30) }, (_, i) => ids.slice(i * 30, i * 30 + 30));
  const pendingSnaps = await Promise.all(chunks.map((chunk) => db.collection("followUps").where("sessionId", "in", chunk).get()));
  const pending = new Map(pendingSnaps.flatMap((snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    .filter((data) => !data.enviado && !data.rechazado)
    .map((data) => [data.sessionId, { id: data.id, clienteNombre: data.clienteNombre, mensajeSugerido: data.mensajeSugerido, telefono: data.telefono || "", codigoPais: data.codigoPais || "+34" }]));
  const leads = shown.map((call) => ({
    id: call.id, client: call.client, date: new Date(call.at).toISOString(), duration: call.duration, stage: call.stage,
    interest: call.interest, score: call.score, next: call.next, waPending: pending.has(call.id), followUp: pending.get(call.id) || null,
    validations: validations.map((validation) => validationState(validation, call)),
  }));

  return {
    ok: true,
    speech: { id: speech.id, name: speech.name },
    phases: phases.map((phase) => ({ id: phase.id, name: phase.name, points: speech.rules.filter((rule) => rule.phaseId === phase.id).reduce((sum, rule) => sum + rule.points, 0), rules: speech.rules.filter((rule) => rule.phaseId === phase.id).map((rule) => rule.title), mine: myScores[phase.id], team: teamScores[phase.id] })),
    repeated: repeated.map(({ title, pct: share }) => ({ title, pct: share })),
    badges: badgesFor(current, previous, team, phases, rulesById, Boolean(window)),
    focus: weakest && focusRule ? { phase: weakest.name, mine: weakest.mine, team: weakest.team, rule: focusRule.title, pct: focusRule.pct, tip: focusTip } : null,
    validations: validations.map((validation) => validation.label),
    leads,
    counts: { team: team.length, mine: mine.length, period: current.length },
  };
}
