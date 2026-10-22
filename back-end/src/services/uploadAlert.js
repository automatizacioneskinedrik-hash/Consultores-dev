// Daily recordings alert: on working days, the first request after 7 a.m. (Colombia) emails the list in
// Configuración avanzada → Correos who did and did not upload recordings on the previous working day.
// Holidays and absences are not discounted yet: they will come from the integration with the other systems.
import admin, { db } from "../config/firebase.js";
import { transporter } from "../config/mailer.js";
import { cargoOf } from "../roles.js";
import { getEmailConfigFromFirestore } from "./emailService.js";
import { DAY, dayStart, dueDay, longDate, workingDaysSince } from "../utils/workingDays.js";

const LOOKBACK_DAYS = 60;
const RECENT_SELLER_DAYS = 14;
const RETRY_AFTER_MS = 30 * 60 * 1000;
const metaRef = db.collection("alert_meta").doc("daily_uploads");

export async function buildUploadReport(key) {
  const from = dayStart(key);
  const to = from + DAY;
  const since = new Date(from - LOOKBACK_DAYS * DAY);
  const [usersSnap, sessionsSnap, statusSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("meetings_analysis").where("createdAt", ">=", since).select("userEmail", "uploadedBy", "createdAt").get(),
    db.collection("analysis_status").where("createdAt", ">=", since).select("userEmail", "uploadedBy", "createdAt").get(),
  ]);

  // Every upload counts, also the ones a coordinator made for the person and the ones whose analysis failed.
  const people = new Map();
  const entry = (email) => people.get(email) || people.set(email, { sessions: 0, statuses: 0, last: 0, ownRecent: false }).get(email);
  const add = (doc, field) => {
    const data = doc.data();
    const email = String(data.userEmail || "").toLowerCase();
    const at = data.createdAt?.toMillis?.() || 0;
    if (!email || !at || at >= to) return;
    const person = entry(email);
    if (at >= from) person[field] += 1;
    person.last = Math.max(person.last, at);
    if (at >= to - RECENT_SELLER_DAYS * DAY && (!data.uploadedBy || String(data.uploadedBy).toLowerCase() === email)) person.ownRecent = true;
  };
  sessionsSnap.docs.forEach((doc) => add(doc, "sessions"));
  statusSnap.docs.forEach((doc) => add(doc, "statuses"));

  const rows = usersSnap.docs.map((doc) => doc.data())
    .filter((user) => user.email)
    .map((user) => {
      const email = String(user.email).toLowerCase();
      const cargo = cargoOf(user);
      const activity = people.get(email) || { sessions: 0, statuses: 0, last: 0, ownRecent: false };
      return {
        email, name: user.name || email.split("@")[0], picture: user.picture || "", cargo: cargo.label,
        expected: cargo.dailyUploads || activity.ownRecent,
        count: Math.max(activity.sessions, activity.statuses),
        last: activity.last,
      };
    })
    .filter((row) => row.expected);

  // Accounts with nothing in two months are probably no longer active: they go apart so the alert stays on real gaps.
  const inactive = rows.filter((row) => !row.last).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const missing = rows.filter((row) => row.count === 0 && row.last).sort((a, b) => a.last - b.last || a.name.localeCompare(b.name, "es"));
  const uploaded = rows.filter((row) => row.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
  return {
    day: key,
    label: longDate(from + 12 * 60 * 60 * 1000),
    missing: missing.map((row) => ({ ...row, lastLabel: row.last ? longDate(row.last) : "", daysWithout: row.last ? workingDaysSince(row.last, key) : null })),
    uploaded,
    inactive,
    total: uploaded.reduce((sum, row) => sum + row.count, 0),
  };
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const AVATAR_COLORS = ["#0040A4", "#BB8AFF", "#2885FF", "#8ABC43", "#FF5900", "#040025"];
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function personCell(row, index) {
  const avatar = row.picture
    ? `<img src="${escapeHtml(row.picture)}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border-radius:50%;">`
    : `<div style="width:32px;height:32px;border-radius:50%;background:${AVATAR_COLORS[index % AVATAR_COLORS.length]};color:#ffffff;font-size:12px;font-weight:700;line-height:32px;text-align:center;">${escapeHtml(initials(row.name))}</div>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:10px;vertical-align:middle;">${avatar}</td>
    <td style="vertical-align:middle;"><div style="font-size:14px;font-weight:700;color:#040025;">${escapeHtml(row.name)}</div><div style="font-size:12px;color:#5b6478;">${escapeHtml(row.cargo)}</div></td>
  </tr></table>`;
}

const cell = "padding:10px 14px;border-top:1px solid #e6e9f0;vertical-align:middle;";
const sepRow = (text) => `<tr><td colspan="3" style="padding:8px 14px;border-top:1px solid #e6e9f0;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#5b6478;background:#ffffff;">${text}</td></tr>`;

export function renderUploadEmail(report) {
  const allIn = report.missing.length === 0 && report.inactive.length === 0;
  const subject = report.missing.length === 0
    ? `Todos subieron grabaciones el ${report.label}`
    : `${report.missing.length} ${report.missing.length === 1 ? "persona no subió" : "personas no subieron"} grabaciones el ${report.label}`;
  const counter = (value, text, color, background) => `<td width="33%" style="padding:12px 14px;background:${background};border-radius:10px;">
    <div style="font-size:28px;font-weight:900;line-height:1.1;color:${color};">${value}</div><div style="font-size:12.5px;color:#5b6478;">${text}</div></td>`;

  const missingRows = report.missing.map((row, index) => {
    const alert = row.daysWithout != null && row.daysWithout >= 3;
    const last = `${capitalize(row.lastLabel)}${alert ? ` · ${row.daysWithout} días hábiles sin subir` : ""}`;
    return `<tr style="background:#fff7f2;"><td style="${cell}">${personCell(row, index)}</td>
      <td style="${cell}text-align:center;"><span style="display:inline-block;min-width:26px;padding:2px 8px;border-radius:999px;background:#FF5900;color:#ffffff;font-weight:700;font-size:13px;">0</span></td>
      <td style="${cell}font-size:13px;color:${alert ? "#B33E00" : "#5b6478"};${alert ? "font-weight:700;" : ""}">${escapeHtml(last)}</td></tr>`;
  }).join("");
  const uploadedRows = report.uploaded.map((row, index) => `<tr><td style="${cell}">${personCell(row, index + report.missing.length)}</td>
    <td style="${cell}text-align:center;font-size:14px;font-weight:700;color:#040025;">${row.count}</td>
    <td style="${cell}font-size:13px;color:#5b6478;">${escapeHtml(capitalize(report.label))}</td></tr>`).join("");
  const inactiveRows = report.inactive.map((row, index) => `<tr><td style="${cell}opacity:.75;">${personCell(row, index)}</td>
    <td style="${cell}text-align:center;font-size:14px;color:#94a3b8;">—</td>
    <td style="${cell}font-size:12.5px;color:#94a3b8;">Más de 2 meses</td></tr>`).join("");

  const body = allIn
    ? `<p style="margin:0;font-size:15px;line-height:1.45;color:#040025;"><span style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;border-radius:50%;background:#e8f2da;color:#3F5F12;font-weight:900;margin-right:10px;">✓</span><b>${report.uploaded.length === 1 ? "La persona" : `Las ${report.uploaded.length} personas`}</b> subieron al menos una grabación. En total, ${report.total} ${report.total === 1 ? "grabación" : "grabaciones"}.</p>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:10px 0;margin:0 -10px;"><tr>
        ${counter(report.missing.length, "no subieron", "#FF5900", "#fff1e9")}
        ${counter(report.uploaded.length, "sí subieron", "#5E8C1F", "#f6f8fb")}
        ${counter(report.total, "grabaciones en total", "#040025", "#f6f8fb")}
      </tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;border:1px solid #e6e9f0;border-radius:10px;border-collapse:separate;overflow:hidden;">
        <tr>
          <th align="left" style="padding:10px 14px;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#5b6478;background:#f6f8fb;">Persona</th>
          <th style="padding:10px 14px;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#5b6478;background:#f6f8fb;">Grabaciones</th>
          <th align="left" style="padding:10px 14px;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#5b6478;background:#f6f8fb;">Última grabación</th>
        </tr>
        ${report.missing.length ? `${sepRow("No subieron")}${missingRows}` : ""}
        ${report.uploaded.length ? `${sepRow("Sí subieron")}${uploadedRows}` : ""}
        ${report.inactive.length ? `${sepRow(`Sin actividad en 2 meses (${report.inactive.length}) · revisa en Gestionar usuarios si siguen activas`)}${inactiveRows}` : ""}
      </table>
      <p style="margin:16px 0 0;font-size:11.5px;line-height:1.5;color:#5b6478;">Cuenta cualquier grabación a nombre de la persona, también si la subió otra persona por ella o si el análisis dio error. Vacaciones, incapacidades y festivos todavía no se descuentan.</p>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#eef1f6;font-family:Roboto,'Helvetica Neue',Arial,sans-serif;color:#040025;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border-radius:14px;">
      <tr><td style="padding:26px 28px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:3px solid #040025;margin-bottom:20px;"><tr>
          <td style="padding-bottom:14px;font-size:21px;font-weight:900;color:#040025;">Grabaciones del ${escapeHtml(report.label)}</td>
          <td align="right" style="padding-bottom:14px;font-size:13px;font-weight:900;color:#040025;white-space:nowrap;">Speech <span style="color:#0040A4;">Kinedrik</span></td>
        </tr></table>
        ${body}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject, html };
}

let doneFor = null;
let running = null;
let lastFailure = 0;

async function sendForDay(key) {
  const claimed = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(metaRef);
    const data = snap.exists ? snap.data() : {};
    if (String(data.lastDay || "") >= key) return false;
    const sendingAt = data.sendingAt?.toMillis?.() || 0;
    if (data.sendingDay === key && Date.now() - sendingAt < 10 * 60 * 1000) return false; // another instance is on it
    transaction.set(metaRef, { sendingDay: key, sendingAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!claimed) { doneFor = key; return; }
  try {
    const { alertEmails } = await getEmailConfigFromFirestore();
    if (alertEmails.length) {
      const { subject, html } = renderUploadEmail(await buildUploadReport(key));
      await transporter.sendMail({ from: process.env.EMAIL_FROM || "Kinedrik <no-reply@kinedrik.com>", to: alertEmails, subject, html });
    }
    await metaRef.set({ lastDay: key, sendingDay: "", sentAt: admin.firestore.FieldValue.serverTimestamp(), recipients: alertEmails.length, error: "" }, { merge: true });
    doneFor = key;
  } catch (error) {
    lastFailure = Date.now();
    console.error("No se pudo enviar la alerta de grabaciones:", error.message);
    await metaRef.set({ sendingDay: "", error: String(error.message || error).slice(0, 300) }, { merge: true }).catch(() => {});
  }
}

export async function ensureUploadAlert(now = new Date()) {
  const key = dueDay(now);
  if (!key || doneFor === key || !transporter || Date.now() - lastFailure < RETRY_AFTER_MS) return;
  running ||= sendForDay(key).finally(() => { running = null; });
  await running;
}
