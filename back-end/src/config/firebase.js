import admin from "firebase-admin";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let adminConfig = {};

try {
  // Intentar cargar desde el directorio raíz del backend
  const serviceAccount = require("../../serviceAccountKey.json");
  adminConfig = {
    credential: admin.credential.cert(serviceAccount),
  };
  console.log("Firebase: Usando serviceAccountKey.json local");
} catch (err) {
  console.log("Firebase: No se encontró serviceAccountKey.json, usando Application Default Credentials");
  adminConfig = {
    credential: admin.credential.applicationDefault(),
    projectId: process.env.GCP_PROJECT_ID,
  };
}

if (!admin.apps.length) {
  admin.initializeApp(adminConfig);
}

export const db = admin.firestore();
export const auth = admin.auth();
export default admin;
