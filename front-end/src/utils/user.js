const NAME_KEY = "kinedrix_name";
const EMAIL_KEY = "kinedrix_email";
const USER_DATA_KEY = "kinedrix_user";

export function getUser() {
  try {
    const email = localStorage.getItem(EMAIL_KEY) || "";
    const rawUser = localStorage.getItem(USER_DATA_KEY);
    const userData = rawUser ? JSON.parse(rawUser) : {};

    // Prioritize name from database (Firestore), then fullName, then legacy key
    const fullName = userData.name || userData.fullName || localStorage.getItem(NAME_KEY) || "";

    return { fullName, email, ...userData };
  } catch (e) {
    return { fullName: "", email: "" };
  }
}

export function setUser(user) {
  try {
    if (user.fullName != null) localStorage.setItem(NAME_KEY, user.fullName);
    if (user.email != null) localStorage.setItem(EMAIL_KEY, user.email);
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
  } catch (e) {
    // ignore storage errors for now
  }
}

export function clearUser() {
  try {
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(USER_DATA_KEY);
  } catch (e) { }
}

export default { getUser, setUser, clearUser };
