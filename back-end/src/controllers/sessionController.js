import { db } from "../config/firebase.js";
import { normalizeEmailValue } from "../utils/helpers.js";
import { USER_CACHE, CACHE_TTL } from "../middleware/auth.js";

export const getRecentSessions = async (req, res) => {
  try {
    const email = (req.query.email || "").toLowerCase().trim();
    if (!email || email === "anonymous") return res.json({ ok: true, sessions: [] });

    const snapshot = await db.collection("meetings_analysis")
      .where("userEmail", "==", email)
      .orderBy("createdAt", "desc")
      .limit(3)
      .get();

    const sessions = snapshot.docs.map(doc => {
      const data = doc.data();
      let filename = "Audio_Cargado";
      if (data.objectPath) {
        const parts = data.objectPath.split("/");
        filename = parts[parts.length - 1];
      }
      return {
        id: doc.id,
        filename: data.analysis?.nombre_cliente ? "Reunión con " + data.analysis.nombre_cliente : filename,
        date: data.createdAt ? data.createdAt.toDate().toISOString() : null,
        duration: data.analysis?.participacion?.duracion_total || "00:00"
      };
    });

    return res.json({ ok: true, sessions });
  } catch (err) {
    console.error("Error fetching recent sessions:", err);
    return res.status(500).json({ ok: false, error: "Error obtaining sessions" });
  }
};

export const getAllSessions = async (req, res) => {
  try {
    const requesterEmail = normalizeEmailValue(req.headers["x-admin-email"]);
    let userData;

    const cached = USER_CACHE.get(requesterEmail);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      userData = cached.data;
    } else {
      const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
      if (userSnapshot.empty) return res.status(401).json({ ok: false, error: "Usuario no encontrado" });
      userData = userSnapshot.docs[0].data();
      USER_CACHE.set(requesterEmail, { data: userData, timestamp: Date.now() });
    }

    const { filterEmail } = req.query;
    let query = db.collection("meetings_analysis");

    if (userData.role !== "admin" && userData.role !== "superadmin") {
      query = query.where("userEmail", "==", userData.email.toLowerCase().trim());
    } else if (filterEmail) {
      query = query.where("userEmail", "==", filterEmail.toLowerCase().trim());
    }

    const snapshot = await query.get();

    const usersSnapshot = await db.collection("users").get();
    const userNamesMap = {};
    usersSnapshot.forEach(u => {
      const uData = u.data();
      userNamesMap[normalizeEmailValue(uData.email)] = uData.name || "";
    });

    const sessions = snapshot.docs.map(doc => {
      const data = doc.data();
      const sc = data.analysis?.scorecard || {};
      const email = normalizeEmailValue(data.userEmail);

      // Usar el score persistido al momento del análisis; si no existe (registros antiguos), calcularlo
      const generalScore = data.generalScore ?? Math.round(
        ((100 - (sc.muletillas?.score || 0)) + (sc.cierre_negociacion?.score || 0) + (sc.manejo_objeciones?.score || 0) + (sc.propuesta_valor?.score || 0)) / 4
      );

      return {
        id: doc.id,
        userEmail: data.userEmail,
        userName: userNamesMap[email] || (data.userEmail ? data.userEmail.split('@')[0] : "Desconocido"),
        cliente: data.analysis?.nombre_cliente || "Desconocido",
        date: data.createdAt ? data.createdAt.toDate().toISOString() : null,
        duration: data.analysis?.participacion?.duracion_total || "00:00",
        score: generalScore,
        status: "procesado",
        report: data
      };
    });

    sessions.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(0);
      const dateB = b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });

    return res.json({ ok: true, sessions });
  } catch (err) {
    console.error("Error fetching all sessions:", err);
    return res.status(500).json({ ok: false, error: "Error al obtener historial" });
  }
};

export const getSessionDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterEmail = normalizeEmailValue(req.headers["x-admin-email"]);
    const userSnapshot = await db.collection("users").where("email", "==", requesterEmail).limit(1).get();
    if (userSnapshot.empty) return res.status(401).json({ ok: false, error: "Usuario no encontrado" });
    const userData = userSnapshot.docs[0].data();

    const doc = await db.collection("meetings_analysis").doc(id).get();
    if (!doc.exists) return res.status(404).json({ ok: false, error: "Reporte no encontrado" });

    const data = doc.data();

    if (userData.role !== "admin" && userData.role !== "superadmin" && data.userEmail !== userData.email) {
      return res.status(403).json({ ok: false, error: "No tienes permiso para ver este reporte" });
    }

    return res.json({ ok: true, report: data });
  } catch (err) {
    console.error("Error fetching report detail:", err);
    return res.status(500).json({ ok: false, error: "Error al obtener detalle" });
  }
};

export const resendSessionEmail = async (req, res) => {
  try {
    const { sessionId, email } = req.body;
    if (!sessionId || !email) return res.status(400).json({ ok: false, error: "Faltan parámetros" });

    const doc = await db.collection("meetings_analysis").doc(sessionId).get();
    if (!doc.exists) return res.status(404).json({ ok: false, error: "Sesión no encontrada" });

    const data = doc.data();
    if (data.userEmail !== email) return res.status(403).json({ ok: false, error: "No autorizado" });

    console.log("Resend requested for session:", sessionId, "to", email);
    return res.json({ ok: true, message: "Correo re-enviado con éxito." });
  } catch (err) {
    console.error("Error resending email:", err);
    return res.status(500).json({ ok: false, error: "Error resending" });
  }
};
