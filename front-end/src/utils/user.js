// Utility helpers to get/set the current user in localStorage.
// This centralizes the logic so later it can be swapped for an API/database.

const NAME_KEY = "kinedrix_name";
const EMAIL_KEY = "kinedrix_email";

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
  } catch (e) {
    // ignore storage errors for now
  }
}

export function clearUser() {
  try {
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(EMAIL_KEY);
  } catch (e) {}
}

export default { getUser, setUser, clearUser };
