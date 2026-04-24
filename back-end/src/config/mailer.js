import nodemailer from "nodemailer";

const emailEnabled = Boolean(
  process.env.EMAIL_HOST &&
  process.env.EMAIL_USER &&
  process.env.EMAIL_PASS
);

export const transporter = emailEnabled
  ? nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_PORT === "465",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })
  : null;

if (!transporter) {
  console.warn("ADVERTENCIA: configuracion SMTP incompleta.");
}
