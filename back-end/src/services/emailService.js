import { db } from "../config/firebase.js";
import { sanitizeEmailArray } from "../utils/helpers.js";

export async function getEmailConfigFromFirestore() {
  try {
    const configRef = db.collection("settings").doc("email_config");
    const configDoc = await configRef.get();

    if (!configDoc.exists) {
      return {
        ccEmails: [],
        bccEmails: [],
        updatedAt: null,
        updatedBy: "",
      };
    }

    const data = configDoc.data() || {};
    return {
      ccEmails: sanitizeEmailArray(data.ccEmails),
      bccEmails: sanitizeEmailArray(data.bccEmails),
      updatedAt: data.updatedAt || null,
      updatedBy: data.updatedBy || "",
    };
  } catch (error) {
    console.error("Error loading settings/email_config:", error);
    return {
      ccEmails: [],
      bccEmails: [],
      updatedAt: null,
      updatedBy: "",
    };
  }
}
