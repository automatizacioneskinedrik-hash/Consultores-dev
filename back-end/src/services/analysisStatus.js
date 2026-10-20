// Where each uploaded call is in its analysis, so Subir archivo shows the real step instead of a waiting
// message: queued → transcribing → grading → done, or error with a reason the consultant can act on.
import crypto from "crypto";
import admin, { db } from "../config/firebase.js";

const collection = db.collection("analysis_status");
const idFor = (objectPath) => crypto.createHash("sha1").update(String(objectPath)).digest("hex");
const utcDay = (date) => new Date(date).toISOString().slice(0, 10);
export const ACTIVE_STAGES = ["queued", "transcribing", "grading"];

// A failed status write never stops the analysis itself.
export async function setAnalysisStatus(objectPath, fields) {
  try {
    await collection.doc(idFor(objectPath)).set({ objectPath, ...fields, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error("No se pudo guardar el estado del análisis:", error.message);
  }
}

// Called when the upload finishes; the person and day keys let both the uploader and the owner find it.
// Returns false when the same audio is already being analyzed or finished, so a repeated request from the
// browser cannot start a second analysis (it happened on 2026-10-19 and graded one call twice).
export async function startAnalysisStatus(objectPath, { fileName, userEmail, uploadedBy, ownerName }) {
  const ref = collection.doc(idFor(objectPath));
  const day = utcDay(Date.now());
  try {
    return await db.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      const data = current.exists ? current.data() : null;
      const updatedAt = data?.updatedAt?.toDate?.();
      const running = data && ACTIVE_STAGES.includes(data.stage) && updatedAt && Date.now() - updatedAt.getTime() < 30 * 60 * 1000;
      if (running || data?.stage === "done") return false;
      transaction.set(ref, {
        objectPath,
        fileName: String(fileName || objectPath.split("/").pop()).slice(0, 200),
        userEmail, uploadedBy, ownerName: ownerName || "",
        stage: "queued", error: "", dismissed: false,
        uploaderDay: `${uploadedBy}|${day}`, ownerDay: `${userEmail}|${day}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });
  } catch (error) {
    console.error("No se pudo registrar el inicio del análisis:", error.message);
    return true;
  }
}

export function friendlyAnalysisError(error) {
  const message = String(error?.message || "");
  if (/assemblyai/i.test(message)) return "No se pudo transcribir el audio. Puede estar dañado, en silencio o en un formato no válido: vuelve a subirlo.";
  if (/saldo|cr[eé]dito|billing|quota|insufficient/i.test(message)) return "La IA no tiene saldo disponible en este momento. Avisa al administrador.";
  return "No se pudo analizar la llamada. Vuelve a subirla y, si se repite, avisa al administrador.";
}

const seconds = (from, to) => (from?.toDate && to?.toDate ? Math.max(0, Math.round((to.toDate() - from.toDate()) / 1000)) : null);

const plain = (doc) => {
  const data = doc.data();
  const iso = (value) => value?.toDate?.().toISOString() || null;
  return {
    id: doc.id, objectPath: data.objectPath, fileName: data.fileName, clientName: data.clientName || "", userEmail: data.userEmail, uploadedBy: data.uploadedBy, ownerName: data.ownerName,
    stage: data.stage, error: data.error || "", sessionId: data.sessionId || null, score: data.score ?? null,
    scoreFormat: data.scoreFormat || null, duration: data.duration || "", createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt),
    // Seconds from the end of the upload to the finished report, and per step, for calls since 2026-10-20.
    analysisSeconds: seconds(data.createdAt, data.doneAt),
    stepSeconds: { transcribing: seconds(data.transcribingAt, data.gradingAt), grading: seconds(data.gradingAt, data.doneAt) },
  };
};

// The person's calls since `since` (the start of their local day), uploaded by them or for them.
export async function listAnalysisStatuses(email, since) {
  const sinceDate = since && !Number.isNaN(Date.parse(since)) ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const keys = [...new Set([utcDay(sinceDate), utcDay(Date.now())])].map((day) => `${email}|${day}`);
  const [byUploader, byOwner] = await Promise.all([
    collection.where("uploaderDay", "in", keys).get(),
    collection.where("ownerDay", "in", keys).get(),
  ]);
  const docs = new Map([...byUploader.docs, ...byOwner.docs].map((doc) => [doc.id, doc]));
  // A step that has not moved in 30 minutes means the analysis stopped; say so instead of waiting forever.
  const stuck = (status) => ACTIVE_STAGES.includes(status.stage) && status.updatedAt && Date.now() - Date.parse(status.updatedAt) > 30 * 60 * 1000;
  return [...docs.values()]
    .filter((doc) => !doc.data().dismissed)
    .map(plain)
    .map((status) => (stuck(status) ? { ...status, stage: "error", error: "El análisis se detuvo y no terminó. Vuelve a subir la llamada." } : status))
    .filter((status) => !status.createdAt || Date.parse(status.createdAt) >= sinceDate.getTime())
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Hides a failed call from the list; only the uploader or the owner can do it.
export async function dismissAnalysisStatus(id, email) {
  const ref = collection.doc(id);
  const snap = await ref.get();
  if (!snap.exists || ![snap.data().uploadedBy, snap.data().userEmail].includes(email)) return false;
  await ref.set({ dismissed: true }, { merge: true });
  return true;
}
