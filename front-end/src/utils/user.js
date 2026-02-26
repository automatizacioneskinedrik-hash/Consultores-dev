// Utility helpers to get/set the current user in localStorage.
// This centralizes the logic so later it can be swapped for an API/database.

const NAME_KEY = "kinedrix_name";
const EMAIL_KEY = "kinedrix_email";
const LOGIN_EMAIL_KEY = "kinedrix_login_email";

let loginEmailCache = "";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function setCurrentLoginEmail(email) {
  const cleanEmail = normalizeEmail(email);
  loginEmailCache = cleanEmail;
  try {
    if (cleanEmail) {
      localStorage.setItem(LOGIN_EMAIL_KEY, cleanEmail);
    } else {
      localStorage.removeItem(LOGIN_EMAIL_KEY);
    }
  } catch (e) {
    // ignore storage errors for now
  }
}

export function getCurrentLoginEmail() {
  if (loginEmailCache) return loginEmailCache;
  try {
    const savedEmail = normalizeEmail(localStorage.getItem(LOGIN_EMAIL_KEY));
    if (savedEmail) {
      loginEmailCache = savedEmail;
      return savedEmail;
    }

    // backward compatibility while old key is still in use
    const legacyEmail = normalizeEmail(localStorage.getItem(EMAIL_KEY));
    if (legacyEmail) {
      loginEmailCache = legacyEmail;
      localStorage.setItem(LOGIN_EMAIL_KEY, legacyEmail);
      return legacyEmail;
    }
  } catch (e) {
    return loginEmailCache;
  }
  return "";
}

export function clearCurrentLoginEmail() {
  loginEmailCache = "";
  try {
    localStorage.removeItem(LOGIN_EMAIL_KEY);
  } catch (e) {
    // ignore storage errors for now
  }
}

export function getUser() {
  try {
    const fullName = localStorage.getItem(NAME_KEY) || "";
    const email = localStorage.getItem(EMAIL_KEY) || "";
    return { fullName, email };
  } catch (e) {
    return { fullName: "", email: "" };
  }
}

export function setUser(user) {
  try {
    if (user.fullName != null) localStorage.setItem(NAME_KEY, user.fullName);
    if (user.email != null) localStorage.setItem(EMAIL_KEY, user.email);
    setCurrentLoginEmail(user.email);
  } catch (e) {
    // ignore storage errors for now
  }
}

export function clearUser() {
  try {
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(EMAIL_KEY);
    clearCurrentLoginEmail();
  } catch (e) {}
}

export default {
  getUser,
  setUser,
  clearUser,
  getCurrentLoginEmail,
  setCurrentLoginEmail,
  clearCurrentLoginEmail,
};
