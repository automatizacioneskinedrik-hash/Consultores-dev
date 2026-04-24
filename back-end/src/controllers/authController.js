import { db } from "../config/firebase.js";
import { v4 as uuidv4 } from "uuid";

export const login = async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password;
    if (!email) return res.status(400).json({ ok: false, error: "Email requerido" });

    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("email", "==", email).limit(1).get();

    if (snapshot.empty) {
      return res.status(401).json({ ok: false, error: "No estás registrado en la plataforma. Por favor, escribe al administrador para que te registre." });
    }

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    if (password) {
      if (user.password !== password) {
        return res.status(401).json({ ok: false, error: "Contraseña incorrecta" });
      }
    }

    let authToken = user.authToken;
    if (!authToken) {
      authToken = uuidv4();
      await userDoc.ref.update({ authToken });
    }

    return res.json({
      ok: true,
      user: {
        id: userDoc.id,
        email: user.email,
        name: user.name || "",
        role: user.role || "user",
        authToken,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error validando usuario" });
  }
};
