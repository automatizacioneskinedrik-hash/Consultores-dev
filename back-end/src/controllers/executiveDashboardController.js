import admin, { db } from "../config/firebase.js";
import { normalizeEmailValue } from "../utils/helpers.js";

const DASHBOARD_CACHE = new Map();
const DASHBOARD_TTL_MS = 2 * 60 * 1000; // 2 minutos

function dashboardCacheKey(consultantEmail, startMs, endMs) {
  return `${consultantEmail || "all"}:${startMs ?? ""}:${endMs ?? ""}`;
}

function clampPercent(value) {
  if (value == null || Number.isNaN(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function parsePercent(value) {
  if (value == null) return null;
  if (typeof value === "number") return clampPercent(value);
  if (typeof value === "string") {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    return clampPercent(Number(match[0]));
  }
  return null;
}

function parseDurationSeconds(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const parts = value.split(":").map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return null;

  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function computeGeneralScore(docData) {
  const sc = docData?.analysis?.scorecard || {};
  return Math.round(
    ((100 - (sc.muletillas?.score || 0)) +
      (sc.cierre_negociacion?.score || 0) +
      (sc.manejo_objeciones?.score || 0) +
      (sc.propuesta_valor?.score || 0)) /
      4
  );
}

function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return null;
}

function formatConsultantLabel(email = "") {
  const localPart = String(email || "").split("@")[0] || "";
  const clean = localPart.replace(/[._-]+/g, " ").trim();
  if (!clean) return "Consultor";
  return clean
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function pickBucket(rangeStartMs, rangeEndMs) {
  if (rangeStartMs == null || rangeEndMs == null) return "month";
  const spanMs = rangeEndMs - rangeStartMs;
  if (spanMs <= 2 * 24 * 60 * 60 * 1000) return "hour";
  return "day";
}

function bucketIndex(bucket, bucketStartMs, eventMs) {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * 60 * 60 * 1000;
  const width = bucket === "hour" ? HOUR : DAY;
  return Math.floor((eventMs - bucketStartMs) / width);
}

function bucketStart(bucket, bucketStartMs, idx) {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * 60 * 60 * 1000;
  const width = bucket === "hour" ? HOUR : DAY;
  return bucketStartMs + idx * width;
}

async function loadUserNamesMap() {
  const usersSnapshot = await db.collection("users").get();
  const map = {};
  usersSnapshot.forEach((doc) => {
    const data = doc.data();
    const email = normalizeEmailValue(data.email);
    if (!email) return;
    map[email] = data.name || "";
  });
  return map;
}

async function fetchMeetingsAnalysis({ startMs, endMs }) {
  let query = db.collection("meetings_analysis").orderBy("createdAt", "asc");

  if (Number.isFinite(startMs) && Number.isFinite(endMs) && startMs < endMs) {
    const startTs = admin.firestore.Timestamp.fromMillis(startMs);
    const endTs = admin.firestore.Timestamp.fromMillis(endMs);
    query = query.where("createdAt", ">=", startTs).where("createdAt", "<", endTs);
  }

  query = query.select(
    "createdAt",
    "userEmail",
    "generalScore",
    "analysis.scorecard",
    "analysis.participacion.duracion_total",
    "analysis.participacion.consultor_pct",
    "analysis.participacion.cliente_pct",
    "analysis.probabilidades.proximidad_cierre",
    "analysis.fases_alcanzadas",
    "analysis.adherencia_guion",
    "analysis.momento_precio",
    "cedio_palabra_tras_precio",
    "analysis.tipo_compromiso_cierre",
    "analysis.preguntas_descubrimiento",
    "analysis.objeciones",
    "monologo_mas_largo_seg",
    "muletillas_por_minuto"
  );

  const batchSize = 800;
  const docs = [];
  let lastDoc = null;

  for (;;) {
    let pageQuery = query.limit(batchSize);
    if (lastDoc) pageQuery = pageQuery.startAfter(lastDoc);

    const snapshot = await pageQuery.get();
    docs.push(...snapshot.docs);
    if (snapshot.size < batchSize) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return docs;
}

export const getConsultantAvailableDates = async (req, res) => {
  try {
    const consultantEmail = normalizeEmailValue(req.query.consultantEmail);

    if (!consultantEmail || consultantEmail === "all") {
      return res.json({ ok: true, dates: [] });
    }

    const batchSize = 800;
    const dateSet = new Set();
    let lastDoc = null;

    for (;;) {
      let query = db
        .collection("meetings_analysis")
        .where("userEmail", "==", consultantEmail)
        .orderBy("createdAt", "asc")
        .select("createdAt")
        .limit(batchSize);

      if (lastDoc) query = query.startAfter(lastDoc);

      const snapshot = await query.get();

      for (const doc of snapshot.docs) {
        const ms = toMillis(doc.data().createdAt);
        if (Number.isFinite(ms)) dateSet.add(new Date(ms).toISOString().slice(0, 10));
      }

      if (snapshot.size < batchSize) break;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    return res.json({ ok: true, dates: [...dateSet].sort() });
  } catch (err) {
    console.error("Error loading consultant available dates:", err);
    return res.status(500).json({ ok: false, error: "Error al obtener fechas disponibles" });
  }
};

export const getDashboardConsultants = async (req, res) => {
  try {
    const [usersSnapshot, callsSnapshot] = await Promise.all([
      db.collection("users").get(),
      db.collection("meetings_analysis").select("userEmail").get(),
    ]);

    const activeEmails = new Set(
      callsSnapshot.docs
        .map((doc) => normalizeEmailValue(doc.data().userEmail))
        .filter(Boolean)
    );

    const consultants = usersSnapshot.docs
      .map((doc) => doc.data())
      .map((user) => {
        const email = normalizeEmailValue(user.email);
        if (!email) return null;
        if (!activeEmails.has(email)) return null;
        const label = user.name || formatConsultantLabel(email);
        return { value: email, label };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.label).localeCompare(String(b.label), "es"));

    return res.json({ ok: true, consultants });
  } catch (err) {
    console.error("Error loading consultants:", err);
    return res.status(500).json({ ok: false, error: "Error al obtener consultores" });
  }
};

export const getExecutiveDashboardData = async (req, res) => {
  try {
    const consultantEmail = normalizeEmailValue(req.query.consultantEmail);
    const startMs = req.query.startMs != null ? Number(req.query.startMs) : null;
    const endMs = req.query.endMs != null ? Number(req.query.endMs) : null;

    const cacheKey = dashboardCacheKey(consultantEmail, startMs, endMs);
    const hit = DASHBOARD_CACHE.get(cacheKey);
    if (hit && Date.now() - hit.ts < DASHBOARD_TTL_MS) {
      return res.json(hit.data);
    }

    const [userNamesMap, docs] = await Promise.all([
      loadUserNamesMap(),
      fetchMeetingsAnalysis({ startMs, endMs }),
    ]);

    const bucket = pickBucket(startMs, endMs);
    const bucketAnchor = Number.isFinite(startMs) ? startMs : null;

    const totals = {
      calls: 0,
      scoreSum: 0,
      scoreN: 0,
      durationSumSec: 0,
      durationN: 0,
      closeSum: 0,
      closeN: 0,
      talkConsultantSum: 0,
      talkConsultantN: 0,
      talkClientSum: 0,
      talkClientN: 0,
      sinDiagnosticoN: 0,
      sinDiagnosticoTotal: 0,
      preguntasSum: 0,
      preguntasN: 0,
      monologoSum: 0,
      monologoN: 0,
      muletillasPorMinutoSum: 0,
      muletillasPorMinutoN: 0,
      cedioPalabraT: 0,
      cedioPalabraTotal: 0,
      fasesMap: { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0 },
      adherenciaSum: 0,
      adherenciaN: 0,
      compromisoMap: { firme: 0, condicionado: 0, aplazado: 0, sin_compromiso: 0 },
      objecionesMap: {},
    };

    const seriesAgg = new Map();

    for (const doc of docs) {
      const data = doc.data() || {};
      const email = normalizeEmailValue(data.userEmail);
      if (!email) continue;
      if (consultantEmail && consultantEmail !== "all" && email !== consultantEmail) continue;

      const createdAtMs = toMillis(data.createdAt);
      if (!Number.isFinite(createdAtMs)) continue;

      totals.calls += 1;

      const score = Number.isFinite(data.generalScore) ? data.generalScore : computeGeneralScore(data);
      totals.scoreSum += score;
      totals.scoreN += 1;

      const durationSec = parseDurationSeconds(data.analysis?.participacion?.duracion_total);
      if (Number.isFinite(durationSec)) {
        totals.durationSumSec += durationSec;
        totals.durationN += 1;
      }

      const close = parsePercent(data.analysis?.probabilidades?.proximidad_cierre);
      if (Number.isFinite(close)) {
        totals.closeSum += close;
        totals.closeN += 1;
      }

      const consultantTalk = parsePercent(data.analysis?.participacion?.consultor_pct);
      if (Number.isFinite(consultantTalk)) {
        totals.talkConsultantSum += consultantTalk;
        totals.talkConsultantN += 1;
      }

      const clientTalk = parsePercent(data.analysis?.participacion?.cliente_pct);
      if (Number.isFinite(clientTalk)) {
        totals.talkClientSum += clientTalk;
        totals.talkClientN += 1;
      }

      const key =
        bucket === "month"
          ? `${new Date(createdAtMs).getUTCFullYear()}-${String(new Date(createdAtMs).getUTCMonth() + 1).padStart(2, "0")}`
          : (() => {
              const anchor = bucketAnchor ?? createdAtMs;
              const idx = bucketIndex(bucket, anchor, createdAtMs);
              return String(idx);
            })();

      if (!seriesAgg.has(key)) {
        seriesAgg.set(key, {
          bucket,
          key,
          ts: bucket === "month" ? null : null,
          scoreSum: 0,
          scoreN: 0,
          closeSum: 0,
          closeN: 0,
          clientTalkSum: 0,
          clientTalkN: 0,
        });
      }

      const agg = seriesAgg.get(key);
      agg.scoreSum += score;
      agg.scoreN += 1;

      if (Number.isFinite(close)) {
        agg.closeSum += close;
        agg.closeN += 1;
      }
      if (Number.isFinite(clientTalk)) {
        agg.clientTalkSum += clientTalk;
        agg.clientTalkN += 1;
      }

      // momento_precio
      const momentoPrecio = data.analysis?.momento_precio;
      if (momentoPrecio?.fase_aparicion && momentoPrecio.fase_aparicion !== "No mencionado") {
        totals.sinDiagnosticoTotal += 1;
        if (momentoPrecio.precio_sin_diagnostico_previo === true) {
          totals.sinDiagnosticoN += 1;
        }
      }

      // tipo_compromiso_cierre
      const tipoCompromiso = data.analysis?.tipo_compromiso_cierre;
      if (tipoCompromiso && tipoCompromiso in totals.compromisoMap) {
        totals.compromisoMap[tipoCompromiso] += 1;
      }

      // preguntas_descubrimiento
      const nPreguntas = data.analysis?.preguntas_descubrimiento?.total;
      if (typeof nPreguntas === "number" && Number.isFinite(nPreguntas)) {
        totals.preguntasSum += nPreguntas;
        totals.preguntasN += 1;
      }

      // monologo_mas_largo_seg
      const monologo = data.monologo_mas_largo_seg;
      if (typeof monologo === "number" && Number.isFinite(monologo) && monologo > 0) {
        totals.monologoSum += monologo;
        totals.monologoN += 1;
      }

      // objeciones
      const objeciones = data.analysis?.objeciones;
      if (Array.isArray(objeciones)) {
        for (const obj of objeciones) {
          const cat = obj?.categoria;
          if (cat) totals.objecionesMap[cat] = (totals.objecionesMap[cat] || 0) + 1;
        }
      }

      // fases alcanzadas — solo transcripciones desde el 15 jun 2026
      const FASES_CUTOFF_MS = Date.UTC(2026, 5, 15, 0, 0, 0, 0);
      const fasesAlcanzadas = data.analysis?.fases_alcanzadas;
      if (createdAtMs >= FASES_CUTOFF_MS && Array.isArray(fasesAlcanzadas)) {
        for (const f of fasesAlcanzadas) {
          const code = String(f).match(/^(F[1-5])/i)?.[1]?.toUpperCase();
          if (code && code in totals.fasesMap) totals.fasesMap[code] += 1;
        }
      }

      // adherencia al guion
      const adherenciaScore = data.analysis?.adherencia_guion?.score;
      if (typeof adherenciaScore === "number" && Number.isFinite(adherenciaScore)) {
        totals.adherenciaSum += adherenciaScore;
        totals.adherenciaN += 1;
      }

      // cedió palabra tras precio (calculado desde AssemblyAI, no desde GPT)
      const cedioPalabra = data.cedio_palabra_tras_precio;
      if (cedioPalabra === true || cedioPalabra === false) {
        totals.cedioPalabraTotal += 1;
        if (cedioPalabra === true) totals.cedioPalabraT += 1;
      }

      // muletillas por minuto
      const mpm = data.muletillas_por_minuto;
      if (typeof mpm === "number" && Number.isFinite(mpm)) {
        totals.muletillasPorMinutoSum += mpm;
        totals.muletillasPorMinutoN += 1;
      }
    }

    const series = [...seriesAgg.values()]
      .map((agg) => {
        if (agg.bucket === "month") {
          const [y, m] = String(agg.key).split("-");
          const ts = Date.UTC(Number(y), Number(m) - 1, 1, 0, 0, 0, 0);
          return {
            bucket: "month",
            ts,
            meanScore: agg.scoreN ? agg.scoreSum / agg.scoreN : null,
            meanClose: agg.closeN ? agg.closeSum / agg.closeN : null,
            meanClientTalk: agg.clientTalkN ? agg.clientTalkSum / agg.clientTalkN : null,
          };
        }

        const idx = Number(agg.key);
        const ts = bucketStart(agg.bucket, bucketAnchor ?? 0, idx);
        return {
          bucket: agg.bucket,
          ts,
          meanScore: agg.scoreN ? agg.scoreSum / agg.scoreN : null,
          meanClose: agg.closeN ? agg.closeSum / agg.closeN : null,
          meanClientTalk: agg.clientTalkN ? agg.clientTalkSum / agg.clientTalkN : null,
        };
      })
      .filter((p) => Number.isFinite(p.ts))
      .sort((a, b) => a.ts - b.ts);

    const kpis = {
      callVolumeN: totals.calls,
      meanScore: totals.scoreN ? totals.scoreSum / totals.scoreN : null,
      expectedDurationSec: totals.durationN ? totals.durationSumSec / totals.durationN : null,
      meanCloseProbability: totals.closeN ? totals.closeSum / totals.closeN : null,
      meanConsultantTalkPct: totals.talkConsultantN ? totals.talkConsultantSum / totals.talkConsultantN : null,
      meanClientTalkPct: totals.talkClientN ? totals.talkClientSum / totals.talkClientN : null,
      pctSinDiagnostico: totals.sinDiagnosticoTotal > 0 ? (totals.sinDiagnosticoN / totals.sinDiagnosticoTotal) * 100 : null,
      avgPreguntasDescubrimiento: totals.preguntasN > 0 ? totals.preguntasSum / totals.preguntasN : null,
      avgMonologoSeg: totals.monologoN > 0 ? totals.monologoSum / totals.monologoN : null,
      avgMuletillasPorMinuto: totals.muletillasPorMinutoN > 0 ? totals.muletillasPorMinutoSum / totals.muletillasPorMinutoN : null,
      avgAdherenciaScore: totals.adherenciaN > 0 ? totals.adherenciaSum / totals.adherenciaN : null,
      pctCedioPalabra: totals.cedioPalabraTotal > 0 ? (totals.cedioPalabraT / totals.cedioPalabraTotal) * 100 : null,
    };

    const distributions = {
      compromisoBreakdown: totals.compromisoMap,
      topObjeciones: Object.entries(totals.objecionesMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([categoria, count]) => ({ categoria, count })),
      fasesDistribucion: Object.entries(totals.fasesMap).map(([fase, count]) => ({
        fase,
        count,
        pct: totals.calls > 0 ? Math.round((count / totals.calls) * 100) : 0,
      })),
    };

    const consultantLabel =
      consultantEmail && consultantEmail !== "all"
        ? userNamesMap[consultantEmail] || formatConsultantLabel(consultantEmail)
        : "Todos";

    const responseData = {
      ok: true,
      kpis,
      series,
      distributions,
      meta: {
        consultant: consultantEmail && consultantEmail !== "all" ? { email: consultantEmail, name: consultantLabel } : null,
        startMs: Number.isFinite(startMs) ? startMs : null,
        endMs: Number.isFinite(endMs) ? endMs : null,
        bucket,
        totalDocsScanned: docs.length,
      },
    };

    DASHBOARD_CACHE.set(cacheKey, { ts: Date.now(), data: responseData });
    return res.json(responseData);
  } catch (err) {
    console.error("Error building executive dashboard:", err);
    return res.status(500).json({ ok: false, error: "Error al construir el dashboard" });
  }
};

