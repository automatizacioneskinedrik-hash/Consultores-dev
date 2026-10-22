// Access keys for other systems (Documentación y API). A key is shown once when created; only its SHA-256
// hash is stored, so nobody can read it back. Each system gets its own key so it can be revoked alone.
import crypto from "node:crypto";
import admin, { db } from "../config/firebase.js";

const keys = db.collection("api_keys");
const PREFIX = "spk_";
const USE_WRITE_EVERY_MS = 60 * 1000;
const lastUseWrite = new Map();

const hashOf = (key) => crypto.createHash("sha256").update(key).digest("hex");
const iso = (value) => value?.toDate?.().toISOString() || null;

const plain = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name,
    hint: `${PREFIX}${data.hint}…`,
    createdBy: data.createdBy || "",
    createdAt: iso(data.createdAt),
    lastUsedAt: iso(data.lastUsedAt),
    revokedAt: iso(data.revokedAt),
    revokedBy: data.revokedBy || "",
  };
};

export async function listApiKeys() {
  const snap = await keys.orderBy("createdAt", "desc").get();
  return snap.docs.map(plain);
}

export async function createApiKey(name, createdBy) {
  const cleanName = String(name || "").trim().slice(0, 60);
  if (!cleanName) throw Object.assign(new Error("Escribe el nombre del sistema que usará la llave."), { status: 400 });
  const secret = crypto.randomBytes(32).toString("base64url");
  const key = `${PREFIX}${secret}`;
  const ref = await keys.add({
    name: cleanName,
    hash: hashOf(key),
    hint: secret.slice(0, 6),
    createdBy,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUsedAt: null,
    revokedAt: null,
    revokedBy: "",
  });
  return { key, item: plain(await ref.get()) };
}

export async function revokeApiKey(id, revokedBy) {
  const ref = keys.doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  if (!snap.data().revokedAt) await ref.update({ revokedAt: admin.firestore.FieldValue.serverTimestamp(), revokedBy });
  return plain(await ref.get());
}

// { id, name, revoked } for a presented key, or null when it does not exist.
export async function verifyApiKey(key) {
  if (!String(key).startsWith(PREFIX)) return null;
  const snap = await keys.where("hash", "==", hashOf(key)).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const revoked = Boolean(doc.data().revokedAt);
  if (!revoked && Date.now() - (lastUseWrite.get(doc.id) || 0) > USE_WRITE_EVERY_MS) {
    lastUseWrite.set(doc.id, Date.now());
    doc.ref.update({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});
  }
  return { id: doc.id, name: doc.data().name, revoked };
}
