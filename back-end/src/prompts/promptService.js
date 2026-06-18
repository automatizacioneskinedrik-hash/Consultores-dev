import admin, { db } from "../config/firebase.js";
import { getAnalysisPrompt } from "./templates/analysisPrompt.js";
import { DEFAULT_FOLLOWUP_INSTRUCTION } from "./templates/followupPrompt.js";

export { DEFAULT_FOLLOWUP_INSTRUCTION };

const FOLLOWUP_DOC = () => db.collection("settings").doc("followup_prompt");
const FOLLOWUP_VERSIONS = () => FOLLOWUP_DOC().collection("versions");
const MAX_VERSIONS = 20;

/**
 * Builds the complete analysis prompt for a session.
 * Reads dynamic config (additional instructions + followup instruction) from Firestore
 * and injects them into the analysis template.
 */
export async function buildAnalysisPrompt(durationStr, transcriptionText) {
  const [additionalInstructions, customFollowupInstruction] = await Promise.all([
    loadAdditionalInstructions(),
    loadFollowupInstruction(),
  ]);
  return getAnalysisPrompt(durationStr, additionalInstructions, transcriptionText, customFollowupInstruction);
}

/**
 * Returns the currently active additional instructions prompt, or empty string.
 */
async function loadAdditionalInstructions() {
  const snap = await db.collection("prompts").where("isActive", "==", true).limit(1).get();
  if (snap.empty) return "";
  return snap.docs[0].data().content || "";
}

/**
 * Returns the raw custom followup instruction from Firestore (empty string = use default).
 */
async function loadFollowupInstruction() {
  const snap = await FOLLOWUP_DOC().get();
  if (!snap.exists) return "";
  return snap.data().instruction || "";
}

/**
 * Returns the current followup instruction for UI display.
 * Falls back to the hardcoded default if nothing has been saved yet.
 */
export async function getFollowupInstructionForDisplay() {
  const custom = await loadFollowupInstruction();
  return { instruction: custom || DEFAULT_FOLLOWUP_INSTRUCTION, isCustom: !!custom };
}

/**
 * Returns all saved versions of the followup instruction, newest first.
 */
export async function getFollowupVersions() {
  const snap = await FOLLOWUP_VERSIONS().orderBy("savedAt", "desc").limit(MAX_VERSIONS).get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    instruction: doc.data().instruction || "",
    savedAt: doc.data().savedAt,
    savedBy: doc.data().savedBy || "",
  }));
}

/**
 * Persists a new followup instruction.
 * Archives the current value as a version before overwriting.
 */
export async function saveFollowupInstruction(instruction, savedBy = "") {
  const current = await loadFollowupInstruction();

  // Archive current value before overwriting (skip if nothing saved yet)
  if (current.trim()) {
    await FOLLOWUP_VERSIONS().add({
      instruction: current.trim(),
      savedAt: admin.firestore.FieldValue.serverTimestamp(),
      savedBy,
    });
    await pruneOldVersions();
  }

  await FOLLOWUP_DOC().set({
    instruction: instruction.trim(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: savedBy,
  });
}

/**
 * Restores a specific version as the active followup instruction.
 * Saves the current value to history before restoring.
 */
export async function restoreFollowupVersion(versionId, restoredBy = "") {
  const vSnap = await FOLLOWUP_VERSIONS().doc(versionId).get();
  if (!vSnap.exists) throw new Error("Versión no encontrada");

  const versionInstruction = vSnap.data().instruction || "";
  await saveFollowupInstruction(versionInstruction, restoredBy);
}

/**
 * Keeps only the MAX_VERSIONS most recent versions, deletes the rest.
 */
async function pruneOldVersions() {
  const snap = await FOLLOWUP_VERSIONS().orderBy("savedAt", "desc").get();
  if (snap.size <= MAX_VERSIONS) return;

  const batch = db.batch();
  snap.docs.slice(MAX_VERSIONS).forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}
