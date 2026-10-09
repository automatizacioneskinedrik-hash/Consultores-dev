import { db } from "../config/firebase.js";
import { activateModel, getAiConfig, setVisibleModels } from "../prompts/aiModelConfig.js";
import { loadAnalysisContext } from "../prompts/promptService.js";
import { POINTS_FORMAT } from "../prompts/speechRules.js";
import { gradeWithPoints } from "../services/pointsGrading.js";

function fail(res, error, status = 400) {
  console.error("AI config error:", error?.message || error);
  return res.status(status).json({ ok: false, error: error?.message || "No se pudo completar la operación." });
}

const requester = (req) => String(req.headers["x-admin-email"] || "").trim().toLowerCase();

export async function getConfig(req, res) {
  try { return res.json({ ok: true, ...(await getAiConfig()) }); }
  catch (error) { return fail(res, error, 500); }
}

export async function putVisibleModels(req, res) {
  try {
    await setVisibleModels(req.body.models);
    return res.json({ ok: true });
  } catch (error) { return fail(res, error); }
}

export async function postActivate(req, res) {
  try {
    await activateModel(String(req.body.model || ""), requester(req));
    return res.json({ ok: true });
  } catch (error) { return fail(res, error); }
}

const parseMinutes = (duration) => {
  const [minutes, seconds] = String(duration || "0:0").split(":").map(Number);
  return (minutes || 0) + (seconds || 0) / 60;
};

// Re-grades a stored session with another model and the published points speech. Nothing is saved.
export async function postTest(req, res) {
  try {
    const { sessionId, model } = req.body || {};
    if (!sessionId || !model) return fail(res, new Error("Elige una sesión y un modelo para la prueba."));
    const doc = await db.collection("meetings_analysis").doc(String(sessionId)).get();
    if (!doc.exists) return fail(res, new Error("La sesión no existe."), 404);
    const session = doc.data();
    if (!session.transcription) return fail(res, new Error("La sesión no tiene transcripción guardada."));

    const context = await loadAnalysisContext();
    if (context.speech.format !== POINTS_FORMAT) {
      return fail(res, new Error("La prueba necesita una versión del speech por puntos publicada."));
    }
    const durationStr = session.analysis?.participacion?.duracion_total || "00:00";
    const consultantPct = Number.parseInt(session.analysis?.participacion?.consultor_pct, 10) || 50;
    const totalMinutes = parseMinutes(durationStr);
    // Stored sessions keep the talk ratio but not per-speaker minutes, so muletillas per minute is approximate.
    const result = await gradeWithPoints({
      context, durationStr, consultantPct, model,
      transcriptionText: session.transcription,
      consultantMinutes: totalMinutes * consultantPct / 100,
      otherMinutes: totalMinutes * (100 - consultantPct) / 100,
    });
    if (!result.scoring) return fail(res, new Error(result.analysis?.error || "El modelo no pudo analizar la sesión."));

    return res.json({
      ok: true,
      test: {
        model: result.usage.model, scoring: result.scoring, usage: result.usage, speechName: context.speech.name,
        ruleTitles: Object.fromEntries(context.speech.rules.map((rule) => [rule.id, rule.title])),
      },
      current: {
        model: session.aiUsage?.model || null,
        // Points sessions: exact points from the stored breakdown (early ones stored a rounded value).
        score: session.scoring?.possible > 0
          ? Math.round((session.scoring.earned / session.scoring.possible) * 10000) / 100
          : session.generalScore ?? null,
        scoring: session.scoring || null,
        usage: session.aiUsage || null,
        speechName: session.speechSnapshot?.name || null,
      },
    });
  } catch (error) { return fail(res, error, 500); }
}

// Recent sessions a superadmin can pick for a test.
export async function getTestSessions(req, res) {
  try {
    const snapshot = await db.collection("meetings_analysis").orderBy("createdAt", "desc").limit(30)
      .select("createdAt", "generalScore", "userEmail", "analysis.nombre_cliente", "analysis.participacion.duracion_total", "scoring.format").get();
    const sessions = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        client: data.analysis?.nombre_cliente || "Cliente",
        consultant: data.userEmail || "",
        date: data.createdAt ? data.createdAt.toDate().toISOString() : null,
        duration: data.analysis?.participacion?.duracion_total || "",
        score: data.generalScore ?? null,
        scoreFormat: data.scoring?.format === POINTS_FORMAT ? "points" : "percent",
      };
    });
    return res.json({ ok: true, sessions });
  } catch (error) { return fail(res, error, 500); }
}
