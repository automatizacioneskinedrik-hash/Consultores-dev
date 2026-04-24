import { db } from "../config/firebase.js";
import { normalizeEmailValue } from "../utils/helpers.js";

const MASTER_SUPERADMIN_EMAIL = "adminkinedrik@eadic.com";
const USER_CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export async function isAuthRequest(req) {
  const requesterEmail = normalizeEmailValue(req.headers["x-admin-email"]);
  const authToken = req.headers["x-auth-token"];

  if (!requesterEmail || !authToken) return false;

  try {
    const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    if (userSnapshot.empty) return false;

    const userData = userSnapshot.docs[0].data();
    return userData.authToken === authToken;
  } catch (err) {
    console.error("Auth validation error:", err);
    return false;
  }
}

export async function isAdminOrSuperadminRequest(req) {
  const requesterEmail = normalizeEmailValue(req.headers["x-admin-email"]);
  const authToken = req.headers["x-auth-token"];

  if (!requesterEmail || !authToken) return false;

  try {
    const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    if (userSnapshot.empty) return false;

    const userData = userSnapshot.docs[0].data();
    if (userData.authToken !== authToken) return false;

    return (
      userData.role === "admin" ||
      userData.role === "superadmin" ||
      requesterEmail === MASTER_SUPERADMIN_EMAIL
    );
  } catch (err) {
    console.error("Auth validation error:", err);
    return false;
  }
}

export { USER_CACHE, CACHE_TTL, MASTER_SUPERADMIN_EMAIL };
