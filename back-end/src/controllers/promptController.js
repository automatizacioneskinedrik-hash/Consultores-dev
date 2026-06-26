import admin, { db } from "../config/firebase.js";
import {
  getFollowupPrompts,
  createFollowupPrompt,
  activateFollowupPrompt,
  deleteFollowupPrompt,
} from "../prompts/promptService.js";

export const getAllPrompts = async (req, res) => {
  try {
    const snapshot = await db.collection("prompts").orderBy("createdAt", "desc").get();
    const prompts = [];
    snapshot.forEach(doc => prompts.push({ id: doc.id, ...doc.data() }));
    return res.json({ ok: true, prompts });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

export const createPrompt = async (req, res) => {
  try {
    const { name, content, isActive = false, isFavorite = false, isSystem = false } = req.body;
    const newPrompt = {
      name,
      content,
      isActive,
      isFavorite,
      isSystem,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (isActive) {
      const activePrompts = await db.collection("prompts").where("isActive", "==", true).get();
      const batch = db.batch();
      activePrompts.forEach(doc => batch.update(doc.ref, { isActive: false }));
      await batch.commit();
    }

    const docRef = await db.collection("prompts").add(newPrompt);
    return res.json({ ok: true, prompt: { id: docRef.id, ...newPrompt } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

export const activatePrompt = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = db.batch();

    const actSnapshot = await db.collection("prompts").where("isActive", "==", true).get();
    actSnapshot.forEach(doc => batch.update(doc.ref, { isActive: false }));

    const selectedRef = db.collection("prompts").doc(id);
    batch.update(selectedRef, { isActive: true });

    await batch.commit();
    return res.json({ ok: true, message: "Prompt activado correctamente" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

export const toggleFavoritePrompt = async (req, res) => {
  try {
    const { id } = req.params;
    const { isFavorite } = req.body;
    await db.collection("prompts").doc(id).update({ isFavorite });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

export const restoreDefaultPrompt = async (req, res) => {
  try {
    const batch = db.batch();
    const actSnapshot = await db.collection("prompts").where("isActive", "==", true).get();
    actSnapshot.forEach(doc => batch.update(doc.ref, { isActive: false }));

    const sysSnapshot = await db.collection("prompts").where("isSystem", "==", true).limit(1).get();
    if (!sysSnapshot.empty) {
      batch.update(sysSnapshot.docs[0].ref, { isActive: true });
    } else {
      const newRef = db.collection("prompts").doc();
      batch.set(newRef, {
        name: "Prompt Base (Sistema)",
        content: "Actúa según la metodología oficial de KINEDRIK.",
        isActive: true,
        isFavorite: true,
        isSystem: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    await batch.commit();
    return res.json({ ok: true, message: "Prompt por defecto restaurado" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// --- Prompts de mensaje WhatsApp de seguimiento ---

export const listFollowupPrompts = async (req, res) => {
  try {
    const prompts = await getFollowupPrompts();
    return res.json({ ok: true, prompts });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error al obtener los prompts de seguimiento" });
  }
};

export const saveFollowupPrompt = async (req, res) => {
  try {
    const { instruction } = req.body;
    if (typeof instruction !== "string" || !instruction.trim()) {
      return res.status(400).json({ ok: false, error: "instruction es requerida" });
    }
    const createdBy = (req.headers["x-admin-email"] || "").toLowerCase();
    const id = await createFollowupPrompt(instruction, createdBy);
    return res.json({ ok: true, id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error al guardar el prompt" });
  }
};

export const activateFollowup = async (req, res) => {
  try {
    await activateFollowupPrompt(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Error al activar el prompt" });
  }
};

export const deleteFollowup = async (req, res) => {
  try {
    await deleteFollowupPrompt(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || "Error al eliminar el prompt" });
  }
};
