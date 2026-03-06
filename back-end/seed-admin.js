import admin from "firebase-admin";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function createSuperAdmin() {
    const email = "adminkinedrik@eadic.com";
    const usersRef = db.collection("users");

    // Verificar si el usuario ya existe
    const snapshot = await usersRef.where("email", "==", email).get();

    const userData = {
        name: "Super Admin",
        email: email,
        role: "superadmin",
        password: "123456", // Temporal para pruebas según lo solicitado
        createdAt: new Date().toISOString()
    };

    if (snapshot.empty) {
        await usersRef.add(userData);
        console.log("Super Admin created successfully in Firestore.");
    } else {
        const docId = snapshot.docs[0].id;
        await usersRef.doc(docId).update(userData);
        console.log("Super Admin updated successfully in Firestore.");
    }
    process.exit(0);
}

createSuperAdmin().catch(err => {
    console.error("Error creating Super Admin:", err);
    process.exit(1);
});
