import admin, { db } from "../config/firebase.js";
import { normalizeEmailValue } from "../utils/helpers.js";

export const getFollowUps = async (req, res) => {
  try {
    const email = normalizeEmailValue(req.query.email || "");
    if (!email) return res.status(400).json({ ok: false, error: "email requerido" });

    const snap = await db.collection("followUps")
      .where("consultorEmail", "==", email)
      .where("enviado", "==", false)
      .get();

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const followUps = [];
    snap.forEach((doc) => {
      const data = doc.data();
      const fechaEnvio = data.fechaEnvio?.toDate?.() ?? new Date(data.fechaEnvio);
      if (fechaEnvio <= today) {
        followUps.push({
          id: doc.id,
          ...data,
          fechaEnvio: fechaEnvio.toISOString(),
          fechaSesion: data.fechaSesion?.toDate?.()?.toISOString() ?? null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        });
      }
    });

    followUps.sort((a, b) => new Date(a.fechaEnvio) - new Date(b.fechaEnvio));

    return res.json({ ok: true, followUps });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

export const markAsSent = async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection("followUps").doc(id).update({
      enviado: true,
      fechaEnviado: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

export const savePhone = async (req, res) => {
  try {
    const { id } = req.params;
    const { telefono, codigoPais } = req.body;
    await db.collection("followUps").doc(id).update({ telefono, codigoPais });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
