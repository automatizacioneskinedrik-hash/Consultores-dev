export function slugify(s = "") {
  return s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "_");
}

export function normalizeEmailValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function sanitizeEmailArray(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((email) => normalizeEmailValue(email))
    .filter(Boolean);
  return [...new Set(cleaned)];
}

export function isValidEmailValue(email = "") {
  const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return BASIC_EMAIL_REGEX.test(String(email || "").trim());
}
