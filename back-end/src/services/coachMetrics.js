// Métricas → Coach. Everything is built from the speech version being measured: its phases, rules and
// "validaciones" (Producto, Precio, Acuerdos…), so it keeps working when the client changes the speech.
import { db } from "../config/firebase.js";
import { getActiveSpeech, getSpeechVersion } from "../prompts/speechConfig.js";

// Mis leads → Producto, Precio, Acuerdos come straight from the AI's reading of the call.
const VALIDATIONS = [["producto", "Producto"], ["precio", "Precio"], ["acuerdos", "Acuerdos"]];
const STATE = { si: "ok", parcial: "pa", no: "pe" };
const BAD = new Set(["debil", "no_lo_hizo"]);
const pct = (earned, possible) => (possible > 0 ? Math.round((earned / possible) * 100) : null);

// Average points per call in each phase, out of what the phase is worth (only calls where the phase applied).
const round1 = (value) => Math.round(value * 10) / 10;
function phaseScores(calls, phases, rulesById) {
  return Object.fromEntries(phases.map((phase) => {
    let earned = 0;
    let possible = 0;
    let evaluated = 0;
    for (const call of calls) {
      const items = call.items.filter((item) => rulesById.get(item.ruleId)?.phaseId === phase.id && item.level !== "no_aplica");
      if (!items.length) continue;
      evaluated += 1;
      for (const item of items) {
        earned += item.earned || 0;
        possible += item.points || 0;
      }
    }
    return [phase.id, evaluated ? { earned: round1(earned / evaluated), possible: round1(possible / evaluated) } : null];
  }));
}
const ratio = (score) => (score && score.possible > 0 ? score.earned / score.possible : null);

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

// Calls analyzed before the AI answered these only have the commitment type, which still gives Acuerdos.
function validationState(id, call) {
  const answer = call.leadChecks?.[id];
  const state = STATE[String(answer?.estado || "").toLowerCase()];
  if (state) return { state, why: answer.motivo || "" };
  if (id !== "acuerdos" || !call.commitment) return null;
  return { state: { firme: "ok", condicionado: "pa" }[call.commitment] || "pe", why: `Compromiso ${call.commitment.replace("_", " ")}.` };
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
    leadChecks: data.analysis?.validaciones_lead || null,
    next: data.analysis?.proximos_pasos?.consultor?.[0] || "",
  };
};

export async function coachMetrics({ requester, consultant = "all", versionId = "" }) {
  const speech = versionId ? await getSpeechVersion(versionId) : await getActiveSpeech();
  if (speech.legacy || !Array.isArray(speech.rules)) return { ok: true, legacy: true };
  const rulesById = new Map(speech.rules.map((rule) => [rule.id, rule]));
  const phases = speech.phases.filter((phase) => speech.rules.some((rule) => rule.phaseId === phase.id));

  const snap = await db.collection("meetings_analysis").where("speechVersionId", "==", speech.id)
    .select("userEmail", "createdAt", "generalScore", "scoring.items", "analysis.nombre_cliente", "analysis.participacion.duracion_total",
      "analysis.probabilidades", "analysis.tipo_compromiso_cierre", "analysis.validaciones_lead", "analysis.proximos_pasos").get();
  const team = snap.docs.map(toCall).filter((call) => call.items.length);
  // Own-scope roles always see themselves; roles that see everyone may pick one consultant.
  const scope = requester.cargo.seesAll ? (consultant && consultant !== "all" ? String(consultant).toLowerCase() : null) : requester.email;
  const mine = scope ? team.filter((call) => call.email === scope) : team;

  const teamScores = phaseScores(team, phases, rulesById);
  const myScores = phaseScores(mine, phases, rulesById);
  const repeated = ruleFailures(mine, rulesById).filter((entry) => entry.failed > 0).slice(0, 5);

  const gaps = phases.map((phase) => ({ ...phase, mine: myScores[phase.id], team: teamScores[phase.id], rate: ratio(myScores[phase.id]), gap: (ratio(myScores[phase.id]) ?? 0) - (ratio(teamScores[phase.id]) ?? 0) }))
    // Against the team when one person is selected; with everyone selected, the lowest phase.
    .filter((phase) => phase.rate != null).sort((a, b) => (scope ? a.gap - b.gap : 0) || a.rate - b.rate);
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
    validations: VALIDATIONS.map(([id]) => validationState(id, call)),
  }));

  return {
    ok: true,
    speech: { id: speech.id, name: speech.name },
    phases: phases.map((phase) => ({ id: phase.id, name: phase.name, points: speech.rules.filter((rule) => rule.phaseId === phase.id).reduce((sum, rule) => sum + rule.points, 0), rules: speech.rules.filter((rule) => rule.phaseId === phase.id).map((rule) => rule.title), mine: myScores[phase.id], team: teamScores[phase.id] })),
    repeated: repeated.map(({ title, pct: share }) => ({ title, pct: share })),
    focus: weakest && focusRule ? { phase: weakest.name, mine: weakest.mine, team: weakest.team, rule: focusRule.title, pct: focusRule.pct, tip: focusTip } : null,
    validations: VALIDATIONS.map(([, label]) => label),
    leads,
    counts: { team: team.length, mine: mine.length },
  };
}
