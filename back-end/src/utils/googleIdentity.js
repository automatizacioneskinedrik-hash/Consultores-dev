const DEFAULT_GOOGLE_CLIENT_ID = "683216209357-k120400vb0pha0t7tfkid9vgkbddb82s.apps.googleusercontent.com";

export class GoogleIdentityError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = "GoogleIdentityError";
    this.statusCode = statusCode;
  }
}

export async function verifyGoogleCredential(credential, {
  fetchImpl = fetch,
  clientId = process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID,
} = {}) {
  if (typeof credential !== "string" || !credential.trim()) {
    throw new GoogleIdentityError("Credencial de Google requerida.");
  }

  const endpoint = new URL("https://oauth2.googleapis.com/tokeninfo");
  endpoint.searchParams.set("id_token", credential);

  let response;
  try {
    response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new GoogleIdentityError("No se pudo validar la cuenta de Google. Intenta de nuevo.", 503);
  }

  if (!response.ok) throw new GoogleIdentityError("La credencial de Google no es válida.");

  let claims;
  try {
    claims = await response.json();
  } catch {
    throw new GoogleIdentityError("Google devolvió una respuesta de identidad inválida.");
  }

  const expiry = Number(claims.exp);
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  const validIssuer = claims.iss === "accounts.google.com" || claims.iss === "https://accounts.google.com";

  if (claims.aud !== clientId || !validIssuer || !email || !emailVerified || !Number.isFinite(expiry) || expiry <= Date.now() / 1000) {
    throw new GoogleIdentityError("No se pudo confirmar la identidad de la cuenta de Google.");
  }

  let picture = "";
  if (typeof claims.picture === "string") {
    try {
      const pictureUrl = new URL(claims.picture);
      if (pictureUrl.protocol === "https:") picture = pictureUrl.toString();
    } catch { /* A malformed avatar URL falls back to initials. */ }
  }

  return { email, name: typeof claims.name === "string" ? claims.name : "", picture };
}
