import admin, { db } from "../config/firebase.js";

const COLLECTION = "audit_log";

// Every change made from the app is recorded with the profile that made it.
// A failed write never blocks the change itself; it is only reported in the server log.
export async function logChange(requester, action, summary, details = {}) {
  try {
    await db.collection(COLLECTION).add({
      action,
      summary,
      details,
      changedBy: requester?.email || "",
      changedByName: requester?.user?.name || "",
      changedByCargo: requester?.cargo?.id || "",
      changedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("No se pudo registrar el cambio en el historial:", err.message);
  }
}

// Route middleware: records the change once the handler answers { ok: true }. Needs req.requester.
export const audited = (action, summary) => (req, res, next) => {
  const send = res.json.bind(res);
  res.json = (body) => {
    if (body?.ok) logChange(req.requester, action, typeof summary === "function" ? summary(req, body) : summary, { params: req.params });
    return send(body);
  };
  next();
};

export async function listChanges(limit = 200) {
  const snapshot = await db.collection(COLLECTION).orderBy("changedAt", "desc").limit(limit).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, ...data, changedAt: data.changedAt?.toDate?.().toISOString() || null };
  });
}
