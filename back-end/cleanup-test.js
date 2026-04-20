import admin from "firebase-admin";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

let serviceAccount;
try {
  serviceAccount = require("./serviceAccountKey.json");
} catch (e) {
  console.error("Error: No se encontró serviceAccountKey.json en la carpeta back-end.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const TARGET_EMAIL = "adminkinedrik@eadic.com";

async function cleanup() {
  console.log(`>>> Iniciando limpieza para: ${TARGET_EMAIL}...`);

  const snapshot = await db.collection("sessions")
    .where("userEmail", "==", TARGET_EMAIL)
    .get();

  if (snapshot.empty) {
    console.log(">>> No se encontraron sesiones de prueba para este correo.");
    process.exit(0);
  }

  console.log(`>>> Se encontraron ${snapshot.size} sesiones. Eliminando...`);

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(">>> ¡Limpieza completada con éxito! El historial de prueba ha sido borrado.");
  process.exit(0);
}

cleanup().catch(err => {
  console.error(">>> Error fatal durante la limpieza:", err);
  process.exit(1);
});
