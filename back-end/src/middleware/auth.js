import { db } from "../config/firebase.js";
import { normalizeEmailValue } from "../utils/helpers.js";
import { cargoOf, MASTER_ENGINEER_EMAIL } from "../roles.js";

const MASTER_SUPERADMIN_EMAIL = MASTER_ENGINEER_EMAIL;
const USER_CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// Validated requester: { email, user, cargo } or null when the token does not match.
export async function getRequester(req) {
  const email = normalizeEmailValue(req.headers["x-admin-email"]);
  const authToken = req.headers["x-auth-token"];
  if (!email || !authToken) return null;

  try {
    const snapshot = await db.collection("users").where("email", "==", email).limit(1).get();
    if (snapshot.empty) return null;
    const user = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    if (user.authToken !== authToken) return null;
    return { email, user, cargo: cargoOf(user) };
  } catch (err) {
    console.error("Auth validation error:", err);
    return null;
  }
}

export async function isAuthRequest(req) {
  return Boolean(await getRequester(req));
}

// Gestionar usuarios, Speech comercial and Configuración avanzada.
export async function canManageRequest(req) {
  return Boolean((await getRequester(req))?.cargo.manages);
}

export { USER_CACHE, CACHE_TTL, MASTER_SUPERADMIN_EMAIL };
