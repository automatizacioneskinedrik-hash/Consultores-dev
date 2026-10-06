import { db } from "../config/firebase.js";
import { v4 as uuidv4 } from "uuid";
import { GoogleIdentityError, verifyGoogleCredential } from "../utils/googleIdentity.js";

export const login = async (req, res) => {
  try {
    const googleCredential = typeof req.body.credential === "string" ? req.body.credential : "";
    const googleProfile = googleCredential ? await verifyGoogleCredential(googleCredential) : null;
    const submittedEmail = (req.body.email || "").trim().toLowerCase();
    if (googleProfile && submittedEmail && submittedEmail !== googleProfile.email) {
      return res.status(401).json({ ok: false, error: "El correo no coincide con la cuenta de Google validada." });
    }
    const email = googleProfile?.email || submittedEmail;
    const password = req.body.password;
    if (!googleCredential && !password) {
      return res.status(401).json({ ok: false, error: "Inicia sesión con Google o con las credenciales de administrador." });
    }
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

    let picture = user.picture || "";
    if (googleProfile?.picture && googleProfile.picture !== picture) {
      picture = googleProfile.picture;
      await userDoc.ref.update({ picture });
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
        picture,
      },
    });
  } catch (err) {
    if (err instanceof GoogleIdentityError) {
      return res.status(err.statusCode).json({ ok: false, error: err.message });
    }
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error validando usuario" });
  }
};
