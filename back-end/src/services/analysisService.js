import path from "path";
import { v4 as uuidv4 } from "uuid";
import fs from "fs-extra";
import os from "os";
import { AssemblyAI } from "assemblyai";
import admin, { db } from "../config/firebase.js";
import { bucket } from "../config/storage.js";
import { openai } from "../config/openai.js";
import { legacyPromptFromContext, loadAnalysisContext } from "../prompts/promptService.js";
import { askAi } from "./aiClient.js";
import { gradeWithPoints } from "./pointsGrading.js";
import { POINTS_FORMAT } from "../prompts/speechRules.js";
import { applySpeechToAnalysis } from "../prompts/speechAnalysis.js";
import { normalizeEmailValue } from "../utils/helpers.js";
import { recordAssemblyUsage } from "./costReport.js";
import { friendlyAnalysisError, setAnalysisStatus } from "./analysisStatus.js";

const assemblyai = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });

const PRICE_REGEX = /\d[\d.,]*\s*(?:€|\$|euros?|d[oó]lares?|usd)\b/i;

function detectCedioPalabraTrasPrice(utterances, consultorSpeaker) {
  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];
    if (u.speaker === consultorSpeaker && PRICE_REGEX.test(u.text)) {
      const next = utterances[i + 1];
      if (!next) return null; // llamada termina en ese turno
      return next.speaker !== consultorSpeaker; // true = cliente habló primero
    }
  }
  return null; // precio nunca mencionado
}

// Fixed-rules speech: GPT returns the four scorecard scores and the general score averages them.
async function runLegacyAnalysis({ context, durationStr, transcriptionText, consultorMinutos }) {
  const { prompt, speech } = legacyPromptFromContext(context, durationStr, transcriptionText);
  const { json, usage } = await askAi(prompt);
  const analysis = applySpeechToAnalysis(json, speech);
  const sc = analysis.scorecard || {};
  const generalScore = Math.round(
    ((100 - (sc.muletillas?.score || 0)) + (sc.cierre_negociacion?.score || 0) + (sc.manejo_objeciones?.score || 0) + (sc.propuesta_valor?.score || 0)) / 4
  );
  const muletillasCount = typeof sc.muletillas?.count === "number" ? sc.muletillas.count : 0;
  const muletillas_por_minuto = consultorMinutos > 0 ? Math.round((muletillasCount / consultorMinutos) * 10) / 10 : null;
  return { analysis, generalScore, muletillas_por_minuto, usage };
}

const speakerMinutes = (utterances, isSpeaker) => utterances
  .filter((u) => isSpeaker(u.speaker))
  .reduce((sum, u) => sum + ((u.end || 0) - (u.start || 0)) / 60000, 0);

// Points speech: GPT judges each rule; the system measures ratio and muletillas and adds the points.
async function runPointsAnalysis({ context, durationStr, durationSec, transcriptionText, consultorPct, consultorMinutos, utterances, consultorSpeaker }) {
  const result = await gradeWithPoints({
    context, durationStr, transcriptionText,
    consultantPct: consultorPct,
    consultantMinutes: consultorMinutos,
    otherMinutes: speakerMinutes(utterances, (speaker) => speaker !== consultorSpeaker),
    utterances, consultantSpeaker: consultorSpeaker, durationSec,
  });
  const { analysis, scoring, usage } = result;
  if (!scoring) return { analysis, generalScore: null, muletillas_por_minuto: null, usage };
  const consultantSpeaker = result.rolesSwapped
    ? utterances.find((u) => u.speaker !== consultorSpeaker)?.speaker ?? consultorSpeaker
    : consultorSpeaker;
  return {
    analysis, scoring, usage,
    generalScore: scoring.score,
    muletillas_por_minuto: result.muletillas.perMinute,
    transcriptionText: result.transcriptionText,
    consultantPct: result.consultantPct,
    consultantSpeaker,
  };
}

async function transcribeWithDiarization(filePath) {
  const transcript = await assemblyai.transcripts.transcribe({
    audio: filePath,
    speaker_labels: true,
    speech_models: ["universal-2"],
    language_detection: true,
    filter_profanity: false,
  });

  if (transcript.status === "error") {
    throw new Error(`AssemblyAI error: ${transcript.error}`);
  }
  // AssemblyAI has no cost API: the Costos section multiplies these seconds by its rate.
  await recordAssemblyUsage(transcript.audio_duration).catch((error) => console.error("No se pudo anotar el uso de AssemblyAI:", error.message));

  const utterances = transcript.utterances || [];

  // Calcular palabras por hablante primero
  const wordCounts = {};
  for (const u of utterances) {
    const wc = u.text.split(/\s+/).filter(Boolean).length;
    wordCounts[u.speaker] = (wordCounts[u.speaker] || 0) + wc;
  }

  // En una llamada de ventas el CONSULTOR siempre habla más que el cliente.
  // Usamos el hablante con más palabras como CONSULTOR en lugar del orden de aparición,
  // porque el cliente/prospecto suele hablar primero con un saludo corto.
  const consultorSpeaker = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || utterances[0]?.speaker || "A";

  const SILENCE_THRESHOLD_MS = 2000; // gaps < 2s son pausas naturales, no se marcan

  const formattedText = utterances.length > 0
    ? utterances
        .map((u, i) => {
          const label = u.speaker === consultorSpeaker ? "CONSULTOR" : "CLIENTE";
          let silenceMarker = "";
          if (i > 0) {
            const gapMs = u.start - utterances[i - 1].end;
            if (gapMs >= SILENCE_THRESHOLD_MS) {
              const gapSec = Math.round(gapMs / 1000);
              silenceMarker = `[SILENCIO ${gapSec}s]\n`;
            }
          }
          return `${silenceMarker}${label}: ${u.text}`;
        })
        .join("\n")
    : (transcript.text || "");

  const totalWords = Object.values(wordCounts).reduce((a, b) => a + b, 0) || 1;
  const consultorWords = wordCounts[consultorSpeaker] || 0;
  const consultorPct = Math.round((consultorWords / totalWords) * 100);

  // Monólogo más largo del consultor (turno ininterrumpido en segundos)
  let monologo_mas_largo_seg = 0;
  let consultorMinutos = 0;
  for (const u of utterances) {
    if (u.speaker === consultorSpeaker) {
      const durSeg = ((u.end || 0) - (u.start || 0)) / 1000;
      if (durSeg > monologo_mas_largo_seg) monologo_mas_largo_seg = durSeg;
      consultorMinutos += durSeg / 60;
    }
  }
  monologo_mas_largo_seg = Math.round(monologo_mas_largo_seg);

  return {
    transcriptionText: formattedText,
    durationSec: transcript.audio_duration || 0,
    consultorPct,
    clientePct: 100 - consultorPct,
    monologo_mas_largo_seg,
    consultorMinutos,
    utterances,
    consultorSpeaker,
  };
}

export async function processAudioAnalysis(objectPath, userEmail, { uploadedBy = userEmail } = {}) {
  console.log(`Starting analysis for ${objectPath} (User: ${userEmail})`);

  // GUARDIA ANTI-DUPLICADOS: si este audio ya fue analizado, no re-procesar.
  const existingSnap = await db.collection("meetings_analysis")
    .where("objectPath", "==", objectPath)
    .limit(1)
    .get();
  if (!existingSnap.empty) {
    console.log(`Audio ya analizado previamente (objectPath: ${objectPath}). Saltando re-análisis.`);
    const existing = existingSnap.docs[0];
    await setAnalysisStatus(objectPath, { stage: "done", sessionId: existing.id, score: existing.data().generalScore ?? null });
    return;
  }

  const tempFilePath = path.join(os.tmpdir(), `audio_${uuidv4()}${path.extname(objectPath)}`);

  try {
    if (!openai) {
      throw new Error("OPENAI_API_KEY no configurada en el entorno");
    }
    if (!process.env.ASSEMBLYAI_API_KEY) {
      throw new Error("ASSEMBLYAI_API_KEY no configurada en el entorno");
    }

    await setAnalysisStatus(objectPath, { stage: "transcribing", transcribingAt: new Date() });
    await bucket.file(objectPath).download({ destination: tempFilePath });
    console.log("Archivo descargado:", tempFilePath);

    console.log("Transcribiendo con AssemblyAI (diarización activada)...");
    const { transcriptionText, durationSec, consultorPct, clientePct, monologo_mas_largo_seg, consultorMinutos, utterances, consultorSpeaker } =
      await transcribeWithDiarization(tempFilePath);
    console.log(`Transcripción completada. Duración: ${durationSec}s`);

    const minutes = Math.floor(durationSec / 60);
    const seconds = Math.floor(durationSec % 60);
    const durationStr = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    await setAnalysisStatus(objectPath, { stage: "grading", gradingAt: new Date() });
    const context = await loadAnalysisContext();
    const { speech } = context;
    const pointsFormat = speech.format === POINTS_FORMAT;
    const result = pointsFormat
      ? await runPointsAnalysis({ context, durationStr, durationSec, transcriptionText, consultorPct, consultorMinutos, utterances, consultorSpeaker })
      : await runLegacyAnalysis({ context, durationStr, transcriptionText, consultorMinutos });
    const { analysis, generalScore, muletillas_por_minuto, scoring = null, usage = null } = result;
    const transcription = result.transcriptionText || transcriptionText;
    const consultantPct = result.consultantPct ?? consultorPct;
    const consultantSpeaker = result.consultantSpeaker ?? consultorSpeaker;

    // Sobrescribir participación con los valores reales calculados desde AssemblyAI
    analysis.participacion = {
      ...(analysis.participacion || {}),
      consultor_pct: `${consultantPct}%`,
      cliente_pct: `${100 - consultantPct}%`,
      duracion_total: durationStr,
    };

    const cedio_palabra_tras_precio = detectCedioPalabraTrasPrice(utterances, consultantSpeaker);

    const now = new Date();
    const analysisData = {
      userEmail,
      uploadedBy: normalizeEmailValue(uploadedBy),
      objectPath,
      transcription,
      analysis,
      speechVersionId: speech.id,
      speechSnapshot: pointsFormat
        ? { format: POINTS_FORMAT, name: speech.name, phases: speech.phases, rules: speech.rules, talkRatio: speech.talkRatio || null, muletillas: speech.muletillas || null }
        : { name: speech.name, phases: speech.phases, scoring: speech.scoring, rules: speech.rules || null, extraRules: speech.extraRules || "" },
      generalScore,
      scoring,
      aiUsage: usage,
      monologo_mas_largo_seg,
      muletillas_por_minuto,
      cedio_palabra_tras_precio,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("meetings_analysis").add(analysisData);
    await setAnalysisStatus(objectPath, { stage: "done", doneAt: new Date(), sessionId: docRef.id, score: generalScore ?? null, scoreFormat: scoring?.format === POINTS_FORMAT ? "points" : "percent", duration: durationStr, clientName: analysis.nombre_cliente || "" });

    if (analysis.seguimiento) {
      const fechaEnvio = new Date();
      await db.collection("followUps").add({
        consultorEmail: normalizeEmailValue(userEmail),
        sessionId: docRef.id,
        clienteNombre: analysis.nombre_cliente || "Cliente",
        tipoSeguimiento: analysis.seguimiento.tipo || "pensar",
        fraseCliente: analysis.seguimiento.frase_cliente || "",
        mensajeSugerido: analysis.seguimiento.mensaje_sugerido || "",
        telefono: "",
        codigoPais: "+34",
        fechaSesion: admin.firestore.FieldValue.serverTimestamp(),
        fechaEnvio,
        enviado: false,
        fechaEnviado: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }


    // Same fields as the stored session (speech snapshot, model, audio path…), so the report shown
    // right after the upload matches the one opened from the history, on screen and in the PDF.
    return {
      id: docRef.id,
      ...analysisData,
      createdAt: { _seconds: Math.floor(now.getTime() / 1000) },
    };
  } catch (err) {
    console.error("Error processing analysis:", err);
    await setAnalysisStatus(objectPath, { stage: "error", error: friendlyAnalysisError(err) });
    throw err;
  } finally {
    if (await fs.pathExists(tempFilePath)) await fs.remove(tempFilePath);
  }
}
