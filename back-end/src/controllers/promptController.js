import admin, { db } from "../config/firebase.js";

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
