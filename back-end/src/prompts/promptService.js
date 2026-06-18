import admin, { db } from "../config/firebase.js";
import { getAnalysisPrompt } from "./templates/analysisPrompt.js";
import { DEFAULT_FOLLOWUP_INSTRUCTION } from "./templates/followupPrompt.js";

export { DEFAULT_FOLLOWUP_INSTRUCTION };

const FOLLOWUP_COL = () => db.collection("followupPrompts");

// ─── Analysis prompt builder ──────────────────────────────────────────────────

/**
 * Builds the complete analysis prompt for a session.
 * Reads the active additional instructions and the active followup prompt from Firestore.
 */
export async function buildAnalysisPrompt(durationStr, transcriptionText) {
  const [additionalInstructions, customFollowupInstruction] = await Promise.all([
    loadAdditionalInstructions(),
    loadActiveFollowupInstruction(),
  ]);
  return getAnalysisPrompt(durationStr, additionalInstructions, transcriptionText, customFollowupInstruction);
}

async function loadAdditionalInstructions() {
  const snap = await db.collection("prompts").where("isActive", "==", true).limit(1).get();
  if (snap.empty) return "";
  return snap.docs[0].data().content || "";
}

async function loadActiveFollowupInstruction() {
  await ensureDefaultExists();
  const snap = await FOLLOWUP_COL().where("isActive", "==", true).limit(1).get();
  if (snap.empty) return DEFAULT_FOLLOWUP_INSTRUCTION;
  return snap.docs[0].data().instruction || DEFAULT_FOLLOWUP_INSTRUCTION;
}

// ─── Followup prompts CRUD ────────────────────────────────────────────────────

/**
 * Returns all followup prompts ordered by creation date.
 * Ensures the default prompt exists before returning.
 */
export async function getFollowupPrompts() {
  await ensureDefaultExists();
  const snap = await FOLLOWUP_COL().orderBy("createdAt", "asc").get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    instruction: doc.data().instruction || "",
    isActive: doc.data().isActive || false,
    isDefault: doc.data().isDefault || false,
    createdAt: doc.data().createdAt,
    createdBy: doc.data().createdBy || "",
  }));
}

/**
 * Creates a new followup prompt and activates it immediately.
 */
export async function createFollowupPrompt(instruction, createdBy = "") {
  await deactivateAll();
  const ref = await FOLLOWUP_COL().add({
    instruction: instruction.trim(),
    isActive: true,
    isDefault: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy,
  });
  return ref.id;
}

/**
 * Activates a prompt by id, deactivating the rest.
 */
export async function activateFollowupPrompt(id) {
  const doc = await FOLLOWUP_COL().doc(id).get();
  if (!doc.exists) throw new Error("Prompt no encontrado");
  await deactivateAll();
  await FOLLOWUP_COL().doc(id).update({ isActive: true });
}

/**
 * Deletes a prompt. The default prompt cannot be deleted.
 */
export async function deleteFollowupPrompt(id) {
  const doc = await FOLLOWUP_COL().doc(id).get();
  if (!doc.exists) throw new Error("Prompt no encontrado");
  if (doc.data().isDefault) throw new Error("El prompt original no puede eliminarse");

  const wasActive = doc.data().isActive;
  await FOLLOWUP_COL().doc(id).delete();

  // If the deleted prompt was active, fall back to default
  if (wasActive) {
    const defaultSnap = await FOLLOWUP_COL().where("isDefault", "==", true).limit(1).get();
    if (!defaultSnap.empty) {
      await defaultSnap.docs[0].ref.update({ isActive: true });
    }
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function deactivateAll() {
  const snap = await FOLLOWUP_COL().where("isActive", "==", true).get();
  const batch = db.batch();
  snap.forEach((doc) => batch.update(doc.ref, { isActive: false }));
  await batch.commit();
}

/**
 * Seeds the default prompt if the collection is empty.
 */
async function ensureDefaultExists() {
  const snap = await FOLLOWUP_COL().where("isDefault", "==", true).limit(1).get();
  if (!snap.empty) return;
  await FOLLOWUP_COL().add({
    instruction: DEFAULT_FOLLOWUP_INSTRUCTION,
    isActive: true,
    isDefault: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: "system",
  });
}
