import admin, { db } from "../config/firebase.js";
import { normalizeEmailValue, sanitizeEmailArray, isValidEmailValue } from "../utils/helpers.js";
import { getEmailConfigFromFirestore } from "../services/emailService.js";
import { MASTER_SUPERADMIN_EMAIL } from "../middleware/auth.js";

// --- Gestión de Usuarios ---

export const getAllUsers = async (req, res) => {
  try {
    const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase();
    const userSnapReq = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    const isSuperAdmin = !userSnapReq.empty && (userSnapReq.docs[0].data().role === "superadmin" || requesterEmail === MASTER_SUPERADMIN_EMAIL);

    const snapshot = await db.collection("users").get();
    const users = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
      })
      .filter(u => {
        if (isSuperAdmin) return true;
        return u.role !== "superadmin" && u.email !== MASTER_SUPERADMIN_EMAIL;
      });

    return res.json({ ok: true, users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al obtener usuarios" });
  }
};

export const addUser = async (req, res) => {
  try {
    const { name, email, role } = req.body;
    const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase();

    const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    const isSuperAdmin = !userSnapshot.empty && (userSnapshot.docs[0].data().role === "superadmin" || requesterEmail === MASTER_SUPERADMIN_EMAIL);

    if (!email) return res.status(400).json({ ok: false, error: "Email requerido" });

    if (role === "superadmin" && !isSuperAdmin) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para crear un Super Admin" });
    }

    const newUser = {
      name: name || "",
      email: email.trim().toLowerCase(),
      role: role || "user",
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection("users").add(newUser);
    return res.json({ ok: true, id: docRef.id, user: newUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al agregar usuario" });
  }
};

export const editUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;
    const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase();

    const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    const isSuperAdmin = !userSnapshot.empty && (userSnapshot.docs[0].data().role === "superadmin" || requesterEmail === MASTER_SUPERADMIN_EMAIL);

    const userRef = db.collection("users").doc(id);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const existingUser = userDoc.data();

    if ((existingUser.role === "admin" || existingUser.role === "superadmin") && !isSuperAdmin) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para editar a este usuario" });
    }

    if (role === "superadmin" && existingUser.role !== "superadmin" && !isSuperAdmin) {
      return res.status(403).json({ ok: false, error: "Solo el Super Admin puede nombrar Super Admins" });
    }

    await userRef.update({
      name: name || "",
      email: email.trim().toLowerCase(),
      role: role || "user"
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al editar usuario" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase();

    const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    const isSuperAdmin = !userSnapshot.empty && (userSnapshot.docs[0].data().role === "superadmin" || requesterEmail === MASTER_SUPERADMIN_EMAIL);

    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const userData = userDoc.data();

    if ((userData.role === "admin" || userData.role === "superadmin") && !isSuperAdmin) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para eliminar a este Administrador" });
    }

    await db.collection("users").doc(id).delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al eliminar usuario" });
  }
};

// --- Configuración de Correo ---

export const getEmailConfig = async (req, res) => {
  try {
    const config = await getEmailConfigFromFirestore();
    return res.json({ ok: true, config });
  } catch (err) {
    console.error("Error fetching email config:", err);
    return res.status(500).json({ ok: false, error: "Error al obtener la configuracion de correo" });
  }
};

export const updateEmailConfig = async (req, res) => {
  try {
    if (req.body.ccEmails != null && !Array.isArray(req.body.ccEmails)) {
      return res.status(400).json({ ok: false, error: "ccEmails debe ser un arreglo" });
    }
    if (req.body.bccEmails != null && !Array.isArray(req.body.bccEmails)) {
      return res.status(400).json({ ok: false, error: "bccEmails debe ser un arreglo" });
    }

    const ccEmails = sanitizeEmailArray(req.body.ccEmails || []);
    const bccEmails = sanitizeEmailArray(req.body.bccEmails || []).filter((email) => !ccEmails.includes(email));
    const invalidEmails = [...ccEmails, ...bccEmails].filter((email) => !isValidEmailValue(email));

    if (invalidEmails.length > 0) {
      return res.status(400).json({ ok: false, error: "Hay correos invalidos en la configuracion", invalidEmails });
    }

    const requesterEmail = normalizeEmailValue(req.headers["x-admin-email"]);

    await db.collection("settings").doc("email_config").set(
      {
        ccEmails,
        bccEmails,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: requesterEmail || "",
      },
      { merge: true }
    );

    return res.json({ ok: true, message: "Configuracion de correo actualizada correctamente", config: { ccEmails, bccEmails, updatedBy: requesterEmail || "" } });
  } catch (err) {
    console.error("Error updating email config:", err);
    return res.status(500).json({ ok: false, error: "Error al actualizar la configuracion de correo" });
  }
};

// --- Estadísticas ---

export const getDashboardStats = async (req, res) => {
  try {
    const snapshot = await db.collection("meetings_analysis").orderBy("createdAt", "desc").get();

    const stats = {
      totalAudios: snapshot.size,
      totalUsers: new Set(),
      avgScore: 0,
      monthlyHistory: {},
      topConsultants: {},
    };

    let totalScoreSum = 0;

    const usersSnapshot = await db.collection("users").get();
    const userNamesMap = {};
    usersSnapshot.forEach(u => {
      userNamesMap[u.data().email.toLowerCase()] = u.data().name || u.data().email;
    });

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const email = (data.userEmail || "").toLowerCase();
      if (!email) return;

      stats.totalUsers.add(email);

      const sc = data.analysis?.scorecard || {};
      const score = Math.round(((100 - (sc.muletillas?.score || 0)) + (sc.cierre_negociacion?.score || 0) + (sc.manejo_objeciones?.score || 0) + (sc.propuesta_valor?.score || 0)) / 4);
      totalScoreSum += score;

      if (data.createdAt) {
        const date = data.createdAt.toDate();
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        stats.monthlyHistory[monthKey] = (stats.monthlyHistory[monthKey] || 0) + 1;
      }

      if (!stats.topConsultants[email]) {
        stats.topConsultants[email] = { count: 0, totalScore: 0, name: userNamesMap[email] || email };
      }
      stats.topConsultants[email].count++;
      stats.topConsultants[email].totalScore += score;
    });

    stats.avgScore = stats.totalAudios > 0 ? Math.round(totalScoreSum / stats.totalAudios) : 0;
    stats.totalUsers = stats.totalUsers.size;

    const consultantsArray = Object.entries(stats.topConsultants).map(([email, data]) => ({
      email,
      name: data.name,
      sessions: data.count,
      avgScore: Math.round(data.totalScore / data.count)
    })).sort((a, b) => b.avgScore - a.avgScore).slice(0, 5);

    stats.topConsultants = consultantsArray;

    return res.json({ ok: true, stats });
  } catch (err) {
    console.error("Error calculating stats:", err);
    return res.status(500).json({ ok: false, error: "Error al obtener estadísticas" });
  }
};
