import admin, { db } from "../config/firebase.js";
import { normalizeEmailValue, sanitizeEmailArray, isValidEmailValue } from "../utils/helpers.js";
import { getEmailConfigFromFirestore } from "../services/emailService.js";
import { CARGOS, cargoOf, isCargo, legacyRoleFor } from "../roles.js";
import { AUDIT_SECTIONS, listChanges, logChange } from "../services/auditLog.js";

// --- Gestión de Usuarios ---
// req.requester is set by adminRoutes. Only an Ingeniero can create, edit or remove another Ingeniero.

const isEngineer = (requester) => requester.cargo.id === "ingeniero";
const publicUser = (id, data) => {
  const { password, authToken, ...safe } = data;
  return { id, ...safe, cargo: cargoOf(data).id };
};

export const getCargos = (req, res) => res.json({ ok: true, cargos: CARGOS });

export const getAllUsers = async (req, res) => {
  try {
    const snapshot = await db.collection("users").get();
    const users = snapshot.docs
      .map((doc) => publicUser(doc.id, doc.data()))
      .filter((u) => isEngineer(req.requester) || u.cargo !== "ingeniero")
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return res.json({ ok: true, users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al obtener usuarios" });
  }
};

export const addUser = async (req, res) => {
  try {
    const { name } = req.body;
    const email = normalizeEmailValue(req.body.email);
    const cargo = isCargo(req.body.cargo) ? req.body.cargo : "kadvisor";
    if (!email) return res.status(400).json({ ok: false, error: "Email requerido" });
    if (cargo === "ingeniero" && !isEngineer(req.requester)) {
      return res.status(403).json({ ok: false, error: "Solo un Ingeniero puede crear otro Ingeniero." });
    }
    const existing = await db.collection("users").where("email", "==", email).limit(1).get();
    if (!existing.empty) return res.status(409).json({ ok: false, error: "Ya existe un usuario con ese correo." });

    const newUser = { name: name || "", email, cargo, role: legacyRoleFor(cargo), createdAt: new Date().toISOString() };
    const docRef = await db.collection("users").add(newUser);
    await logChange(req.requester, "user.create", `Creó a ${newUser.name || email} como ${cargoOf(newUser).label}`, { userId: docRef.id, email, cargo });
    return res.json({ ok: true, id: docRef.id, user: publicUser(docRef.id, newUser) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al agregar usuario" });
  }
};

export const editUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userRef = db.collection("users").doc(id);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const before = userDoc.data();
    const cargo = isCargo(req.body.cargo) ? req.body.cargo : cargoOf(before).id;
    if ((cargoOf(before).id === "ingeniero" || cargo === "ingeniero") && !isEngineer(req.requester)) {
      return res.status(403).json({ ok: false, error: "Solo un Ingeniero puede editar o nombrar Ingenieros." });
    }

    const update = {
      name: req.body.name ?? before.name ?? "",
      email: normalizeEmailValue(req.body.email) || before.email,
      cargo,
      role: legacyRoleFor(cargo),
    };
    await userRef.update(update);

    const changes = [];
    if (update.name !== (before.name || "")) changes.push(`nombre: ${before.name || "(vacío)"} → ${update.name}`);
    if (update.email !== before.email) changes.push(`correo: ${before.email} → ${update.email}`);
    if (cargo !== cargoOf(before).id) changes.push(`rol: ${cargoOf(before).label} → ${cargoOf(update).label}`);
    if (changes.length) {
      await logChange(req.requester, "user.update", `Editó a ${update.name || update.email}: ${changes.join("; ")}`, { userId: id, changes });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al editar usuario" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const userData = userDoc.data();
    if (cargoOf(userData).id === "ingeniero" && !isEngineer(req.requester)) {
      return res.status(403).json({ ok: false, error: "Solo un Ingeniero puede eliminar a otro Ingeniero." });
    }
    await db.collection("users").doc(id).delete();
    await logChange(req.requester, "user.delete", `Eliminó a ${userData.name || userData.email} (${cargoOf(userData).label})`, { userId: id, email: userData.email });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error al eliminar usuario" });
  }
};

export const getAuditLog = async (req, res) => {
  try {
    const section = AUDIT_SECTIONS.includes(req.query.section) ? req.query.section : "users";
    return res.json({ ok: true, changes: await listChanges(section) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "No se pudo cargar el historial de cambios" });
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
    await logChange(req.requester, "email.update", "Actualizó las copias de los reportes por correo", { ccEmails, bccEmails });

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

      // Usar el score persistido; fallback para registros anteriores a esta actualización
      const sc = data.analysis?.scorecard || {};
      const score = data.generalScore ?? Math.round(
        ((100 - (sc.muletillas?.score || 0)) + (sc.cierre_negociacion?.score || 0) + (sc.manejo_objeciones?.score || 0) + (sc.propuesta_valor?.score || 0)) / 4
      );
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
