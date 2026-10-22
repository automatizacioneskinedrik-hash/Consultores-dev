import { db } from "../config/firebase.js";
import { sanitizeEmailArray } from "../utils/helpers.js";

// Configuración avanzada → Correos: who receives the daily recordings alert. Before the alert existed this
// document held the CC/BCC copies of the old report email, so those people are the starting list.
export async function getEmailConfigFromFirestore() {
  try {
    const configDoc = await db.collection("settings").doc("email_config").get();
    const data = configDoc.exists ? configDoc.data() || {} : {};
    const alertEmails = Array.isArray(data.alertEmails)
      ? sanitizeEmailArray(data.alertEmails)
      : [...new Set([...sanitizeEmailArray(data.ccEmails), ...sanitizeEmailArray(data.bccEmails)])];
    return { alertEmails, updatedAt: data.updatedAt || null, updatedBy: data.updatedBy || "" };
  } catch (error) {
    console.error("Error loading settings/email_config:", error);
    return { alertEmails: [], updatedAt: null, updatedBy: "" };
  }
}
