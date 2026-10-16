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

// Each section of the app shows only its own changes; the section comes from the action's prefix.
const SECTION_PREFIXES = {
  users: ["user."],
  speech: ["speech.", "prompt."],
  ai: ["ai."],
  whatsapp: ["followup."],
  email: ["email."],
};
export const AUDIT_SECTIONS = Object.keys(SECTION_PREFIXES);

const isoDate = (value) => (value?.toDate ? value.toDate() : value ? new Date(value) : null)?.toISOString() || null;

// Model activations made before the audit log existed are only in the AI config history.
async function earlierModelChanges(logged) {
  const snap = await db.collection("ai_config").doc("state").get();
  const history = snap.exists && Array.isArray(snap.data().history) ? snap.data().history : [];
  return history
    .map((entry, index) => ({ id: `ai-history-${index}`, action: "ai.activate", summary: `Activó el modelo de IA ${entry.model}`, changedBy: entry.changedBy || "", changedAt: isoDate(entry.changedAt) }))
    .filter((entry) => !logged.some((change) => change.action === "ai.activate" && change.summary === entry.summary
      && Math.abs(Date.parse(change.changedAt) - Date.parse(entry.changedAt)) < 2 * 60 * 1000));
}

// Name and photo come from the current user profile, so older entries show the photo too.
export async function listChanges(section, limit = 200) {
  const prefixes = SECTION_PREFIXES[section] || [];
  const [snapshot, usersSnap] = await Promise.all([
    db.collection(COLLECTION).orderBy("changedAt", "desc").limit(1000).get(),
    db.collection("users").get(),
  ]);
  let changes = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((change) => prefixes.some((prefix) => String(change.action || "").startsWith(prefix)))
    .map((change) => ({ ...change, changedAt: isoDate(change.changedAt) }));
  if (section === "ai") {
    changes = [...changes, ...(await earlierModelChanges(changes))].sort((a, b) => String(b.changedAt).localeCompare(String(a.changedAt)));
  }
  const people = new Map(usersSnap.docs.map((doc) => doc.data()).filter((user) => user.email).map((user) => [String(user.email).toLowerCase(), user]));
  return changes.slice(0, limit).map(({ details, ...change }) => {
    const person = people.get(String(change.changedBy || "").toLowerCase()) || {};
    return { ...change, changedByName: change.changedByName || person.name || "", changedByPicture: person.picture || person.photoURL || "" };
  });
}
