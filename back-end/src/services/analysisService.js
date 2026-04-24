import path from "path";
import { v4 as uuidv4 } from "uuid";
import fs from "fs-extra";
import os from "os";
import ffmpeg from "fluent-ffmpeg";
import admin, { db } from "../config/firebase.js";
import { bucket } from "../config/storage.js";
import { openai } from "../config/openai.js";
import { transporter } from "../config/mailer.js";
import { getSystemPrompt } from "../../prompts-master.js";
import { getEmailConfigFromFirestore } from "./emailService.js";
import { normalizeEmailValue } from "../utils/helpers.js";

export async function processAudioAnalysis(objectPath, userEmail) {
  console.log(`Starting analysis for ${objectPath} (User: ${userEmail})`);
  const tempFilePath = path.join(os.tmpdir(), `audio_${uuidv4()}${path.extname(objectPath)}`);
  let filesToClean = [tempFilePath];

  try {
    if (!openai) {
      throw new Error("OPENAI_API_KEY no configurada en el entorno");
    }

    await bucket.file(objectPath).download({ destination: tempFilePath });
    console.log("File downloaded to temp path:", tempFilePath);

    const stats = await fs.stat(tempFilePath);
    let finalAudioPath = tempFilePath;
    const WHISPER_LIMIT_BYTES = 25 * 1024 * 1024;

    if (stats.size > WHISPER_LIMIT_BYTES) {
      console.log(`Archivo excede los 25MB (${stats.size} bytes). Comprimiendo...`);
      const compressedPath = path.join(os.tmpdir(), `compressed_${uuidv4()}.mp3`);
      await new Promise((resolve, reject) => {
        ffmpeg(tempFilePath).audioBitrate('32k').format('mp3')
          .on('end', () => resolve()).on('error', (err) => reject(err)).save(compressedPath);
      });
      finalAudioPath = compressedPath;
      filesToClean.push(compressedPath);
    }

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(finalAudioPath),
      model: "whisper-1",
      response_format: "verbose_json",
    });

    const totalSeconds = transcription.duration || 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    let additionalInstructions = "";
    const promptSnapshot = await db.collection("prompts").where("isActive", "==", true).limit(1).get();
    if (!promptSnapshot.empty) {
      additionalInstructions = promptSnapshot.docs[0].data().content || "";
    }

    const systemPrompt = getSystemPrompt(durationStr, additionalInstructions, transcription.text);
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: systemPrompt }],
      response_format: { type: "json_object" },
      temperature: 0,
      seed: 42,
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    analysis.participacion.duracion_total = durationStr;

    const analysisData = {
      userEmail,
      objectPath,
      transcription: transcription.text,
      analysis,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("meetings_analysis").add(analysisData);

    if (transporter && userEmail && userEmail !== "anonymous") {
      const userSnapshot = await db.collection("users").where("email", "==", userEmail.trim().toLowerCase()).limit(1).get();
      let consultantName = userEmail.split('@')[0];
      if (!userSnapshot.empty) {
        consultantName = userSnapshot.docs[0].data().name || consultantName;
      }

      const clienteNome = analysis.nombre_cliente || "Cliente";
      const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      const emailConfig = await getEmailConfigFromFirestore();

      const mailOptions = {
        from: process.env.EMAIL_FROM || "Kinedriꓘ <no-reply@kinedrik.com>",
        to: normalizeEmailValue(userEmail),
        subject: `Reporte: Reunión con ${clienteNome} — ${dateStr}`,
        html: generateEmailHtml(analysis, consultantName, minutes, seconds, clienteNome)
      };

      if (emailConfig.ccEmails.length > 0) mailOptions.cc = emailConfig.ccEmails;
      if (emailConfig.bccEmails.length > 0) mailOptions.bcc = emailConfig.bccEmails;

      await transporter.sendMail(mailOptions);
    }
  } catch (err) {
    console.error("Error processing analysis:", err);
    throw err;
  } finally {
    for (const f of filesToClean) {
      if (await fs.pathExists(f)) await fs.remove(f);
    }
  }
}

function generateEmailHtml(analysis, consultantName, minutes, seconds, clienteNome) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Kinedrik</title>
  <style>
    body, table, td, div, p, a {
      font-family: Arial, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    @media only screen and (max-width: 820px) {
      .main-card { width: 100% !important; }
      .px-mobile { padding-left: 20px !important; padding-right: 20px !important; }
      .metric-stack, .metric-stack td { display: block !important; width: 100% !important; }
      .metric-right-mobile { padding-top: 15px !important; }
      .text-box { width: 100% !important; }
      .footer-col, .footer-col td { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#D9D9D9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#D9D9D9" style="width:100%; margin:0; padding:0; background-color:#D9D9D9;">
    <tr>
      <td align="center" style="padding:40px 20px; background-color:#D9D9D9;">
        <table role="presentation" width="850" cellpadding="0" cellspacing="0" border="0" class="main-card" style="width:760px; max-width:760px; background-color:#FFFFFF; border-radius:24px; overflow:hidden;">
          <tr>
            <td background="https://storage.googleapis.com/kinedrik-imagenes/Banner%20consultores.png" bgcolor="#040025" style="background-color:#040025; background-image:url('https://storage.googleapis.com/kinedrik-imagenes/Banner%20consultores.png'); background-repeat:no-repeat; background-position:center 35%; background-size:100% auto; padding:100px 40px; border-bottom:4px solid #FF6B00;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="color:#FFFFFF; font-size:26px; font-weight:900; letter-spacing:2px;">
                    KINEDRI<span style="color:#FF6B00;">ꓘ</span>
                  </td>
                  <td align="right">
                    <span style="display:inline-block; border:1px solid #FF6B00; color:#FF6B00; padding:6px 12px; border-radius:6px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1px;">
                      Reporte Confidencial
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 10px 40px;" class="px-mobile">
              <div style="color:#040025; font-size:32px; line-height:1.15; font-weight:900; letter-spacing:-1px; margin:0 0 12px 0;">Tu Gran Sesión de Hoy</div>
              <div style="color:#64748B; font-size:14px; line-height:1.5; font-weight:500;">Un gusto saludarte, <strong style="color:#2885FF;">${consultantName}</strong></div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="metric-stack">
                <tr>
                  <td width="50%" valign="top" style="padding-right:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg, #0040A4 0%, #2885FF 100%); border-radius:24px;">
                      <tr>
                        <td align="center" style="padding:26px 20px;">
                          <div style="font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:1px; opacity:0.8; color:#FFFFFF; margin-bottom:14px;">Tiempo de Conexión</div>
                          <div style="font-size:42px; line-height:1; font-weight:900; color:#FFFFFF; letter-spacing:-1px; margin-bottom:8px;">${minutes}:${seconds.toString().padStart(2, '0')}</div>
                          <div style="font-size:10px; line-height:1.4; font-weight:600; color:#FFFFFF; opacity:0.75;">¡Minutos de puro valor!</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td width="50%" valign="top" style="padding-left:8px;" class="metric-right-mobile">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border:1px solid #E2E8F0; border-radius:24px;">
                      <tr>
                        <td style="padding:26px 20px;">
                          <div style="font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:#0040A4; margin-bottom:14px; text-align:center;">Diálogo Compartido</div>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
                            <tr>
                              <td align="left">
                                <div style="font-size:24px; font-weight:900; color:#BB8AFF;">${analysis.participacion.consultor_pct.replace('%', '')}%</div>
                                <div style="font-size:10px; font-weight:800; color:#94A3B8; text-transform:uppercase;">Tú</div>
                              </td>
                              <td align="right">
                                <div style="font-size:24px; font-weight:900; color:#FF5900;">${analysis.participacion.cliente_pct.replace('%', '')}%</div>
                                <div style="font-size:10px; font-weight:800; color:#94A3B8; text-transform:uppercase;">${clienteNome}</div>
                              </td>
                            </tr>
                          </table>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9; border-radius:10px;">
                            <tr>
                              <td width="${analysis.participacion.consultor_pct}" style="height:8px; background-color:#BB8AFF; border-radius:10px 0 0 10px; font-size:0; line-height:0;">&nbsp;</td>
                              <td width="${analysis.participacion.cliente_pct}" style="height:8px; background-color:#FF5900; border-radius:0 10px 10px 0; font-size:0; line-height:0;">&nbsp;</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border:1px solid #E2E8F0; border-radius:24px;">
                <tr>
                  <td style="padding:26px 20px;">
                    <div style="font-size:11px; font-weight:900; text-transform:uppercase; color:#0040A4; margin-bottom:8px;">
                      Interés del Cliente <span style="float:right; background-color:#E0E7FF; color:#4338CA; padding:2px 8px; border-radius:12px; font-size:9px;">${analysis.probabilidades?.estado_interes || 'Indeterminado'}</span>
                    </div>
                    <div style="font-size:32px; font-weight:900; color:#1E293B; margin-bottom:8px;">${analysis.probabilidades?.interes_cliente || 0}%</div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9; border-radius:10px; margin-bottom:24px;">
                      <tr>
                        <td width="${analysis.probabilidades?.interes_cliente || 0}%" style="height:12px; background:linear-gradient(90deg, #3B82F6 0%, #2563EB 100%); border-radius:10px;"></td>
                        <td width="${100 - (analysis.probabilidades?.interes_cliente || 0)}%" style="height:12px; border-radius:0 10px 10px 0;"></td>
                      </tr>
                    </table>
                    <div style="font-size:11px; font-weight:900; text-transform:uppercase; color:#EA580C; margin-bottom:8px;">
                      Proximidad al Cierre <span style="float:right; background-color:#FFEDD5; color:#C2410C; padding:2px 8px; border-radius:12px; font-size:9px;">${analysis.probabilidades?.estado_cierre || 'Indeterminado'}</span>
                    </div>
                    <div style="font-size:32px; font-weight:900; color:#1E293B; margin-bottom:8px;">${analysis.probabilidades?.proximidad_cierre || 0}%</div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9; border-radius:10px;">
                      <tr>
                        <td width="${analysis.probabilidades?.proximidad_cierre || 0}%" style="height:12px; background:linear-gradient(90deg, #F97316 0%, #EA580C 100%); border-radius:10px;"></td>
                        <td width="${100 - (analysis.probabilidades?.proximidad_cierre || 0)}%" style="height:12px; border-radius:0 10px 10px 0;"></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <div style="color:#0F172A; font-size:14px; font-weight:900; text-transform:uppercase; letter-spacing:1px; margin-bottom:16px;">Scorecard de la Sesión</div>
              ${(() => {
                const sc = analysis.scorecard || {};
                const scoreValues = Object.values(sc).map(d => d.score || 0);
                const minScore = scoreValues.length > 0 ? Math.min(...scoreValues) : -1;
                let hasBadgeGist = false;
                return Object.entries(sc).map(([key, data]) => {
                  const titles = { muletillas: "Muletillas", cierre_negociacion: "Cierre y Negociación", manejo_objeciones: "Manejo de Objeciones", propuesta_valor: "Propuesta de Valor" };
                  const title = titles[key] || key;
                  const score = data.score || 0;
                  let color = "#EF4444";
                  if (key === 'muletillas') color = score <= 30 ? "#22C55E" : score <= 60 ? "#EAB308" : "#EF4444";
                  else color = score >= 71 ? "#22C55E" : score >= 41 ? "#EAB308" : "#EF4444";
                  let badgeHtml = '';
                  if (score === minScore && !hasBadgeGist) {
                    badgeHtml = '<span style="background-color:#EF4444; color:#FFFFFF; padding:4px 10px; border-radius:6px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1px;">POR TRABAJAR</span>';
                    hasBadgeGist = true;
                  }
                  return `
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; margin-bottom:12px;">
                    <tr>
                      <td style="padding:20px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                          <tr>
                            <td align="left" style="font-size:15px; font-weight:900; color:#0F172A;">${title}</td>
                            <td align="right" style="font-size:22px; font-weight:900; color:${color};">${score}%</td>
                          </tr>
                        </table>
                        <div style="font-size:12px; color:#64748B; font-style:italic; line-height:1.4; margin-bottom:12px; min-height:40px;">${data.contexto || ''}</div>
                        <div style="padding-top:4px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:2px;">
                            <tr>
                              ${score > 0 ? `<td width="${score}%" align="right" style="padding-right:2px; font-size:13px; line-height:1; color:${color}; font-weight:900;">▼</td>` : `<td width="1%"></td>`}
                              ${score < 100 && score > 0 ? `<td width="${100 - score}%"></td>` : score === 0 ? `<td width="99%" align="left" style="font-size:13px; line-height:1; color:${color}; font-weight:900;">▼</td>` : ''}
                            </tr>
                          </table>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:4px; height:8px; margin-bottom:2px;">
                            <tr>
                              <td width="30%" style="height:8px; background-color:${key === 'muletillas' ? '#22C55E' : '#EF4444'}; border-radius:4px 0 0 4px;"></td>
                              <td width="40%" style="height:8px; background-color:#EAB308;"></td>
                              <td width="30%" style="height:8px; background-color:${key === 'muletillas' ? '#EF4444' : '#22C55E'}; border-radius:0 4px 4px 0;"></td>
                            </tr>
                          </table>
                        </div>
                        ${badgeHtml ? `<div style="margin-top:14px;">${badgeHtml}</div>` : ''}
                      </td>
                    </tr>
                  </table>`;
                }).join('');
              })()}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <div style="color:#16A34A; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">Aspectos Positivos</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 15px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0FDF4; border:1px solid #DCFCE7; border-top:4px solid #22C55E; border-radius:12px; overflow:hidden;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" width="40" style="width:40px;">
                          <div style="width:30px; height:30px; line-height:30px; text-align:center; border-radius:50%; background-color:#22C55E; color:#FFFFFF; font-weight:900;">✓</div>
                        </td>
                        <td valign="top" class="text-box">
                          <div style="margin:0; color:#0F172A; font-size:15px; font-weight:800; line-height:1.3;">${analysis.feedback?.aspecto_positivo?.titulo || 'Buen Trabajo'}</div>
                          <div style="margin-top:4px; color:#475569; font-size:13px; line-height:1.45;">${analysis.feedback?.aspecto_positivo?.descripcion || ''}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <div style="color:#EA580C; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">Puntos de Mejora</div>
            </td>
          </tr>
          ${(analysis.feedback?.puntos_mejora || []).map(item => {
            const phases = { F01: 'F01 — Apertura', F02: 'F02 — Diagnóstico', F03: 'F03 — Visión', F04: 'F04 — Vehículo', F05: 'F05 — Cierre' };
            const phase = phases[(item.codigo_fase || '').substring(0,3)] || item.codigo_fase || '';
            return `
          <tr>
            <td style="padding:0 40px 15px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF7ED; border:1px solid #FFEDD5; border-top:4px solid #F97316; border-radius:12px; overflow:hidden;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" width="40" style="width:40px;">
                          <div style="width:30px; height:30px; line-height:30px; text-align:center; border-radius:50%; background-color:#F97316; color:#FFFFFF; font-weight:900;">!</div>
                        </td>
                        <td valign="top" class="text-box">
                          <div style="margin:0; font-size:15px; line-height:1.3;"><span style="color:#94A3B8; font-weight:700;">${phase}</span> <strong style="color:#000000; font-weight:900;">· ${item.titulo_error || 'Mejora'}</strong></div>
                          <div style="margin-top:12px; color:#475569; font-size:13px; line-height:1.6;">
                            <strong>Frase detectada:</strong> <em>"${item.frase_detectada}"</em><br><br>
                            <strong style="color:#F97316;">Problema:</strong> ${item.problema}<br><br>
                            <strong style="color:#EF4444;">Impacto:</strong> ${item.impacto}<br><br>
                            ${(item.correcciones_sugeridas || (item.correccion_sugerida ? [item.correccion_sugerida] : [])).slice(0, 5).length > 0 ? `
                            <div style="color:#166534; font-weight:700; margin-bottom:10px; margin-top:16px;">Correcciones Sugeridas:</div>
                            ${(item.correcciones_sugeridas || (item.correccion_sugerida ? [item.correccion_sugerida] : [])).slice(0, 5).map(c => `
                            <div style="background-color:#DCFCE7; color:#166534; padding:12px 14px; border-radius:8px; margin-bottom:10px; font-weight:500; font-size:13px; line-height:1.5;">
                              "${c}"
                            </div>
                            `).join('')}
                            ` : ''}
                            <div style="background-color:#FFEDD5; padding:10px; border-radius:6px; font-size:12px; border-left:4px solid #EA580C;"><strong>Próxima llamada:</strong> ${item.proxima_llamada}</div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
          }).join('')}
          <tr>
            <td style="padding:28px 40px 10px 40px;" class="px-mobile">
              <div style="color:#8B5CF6; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">Tus Fortalezas</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 25px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F3FF; border:1px solid #EDE9FE; border-top:4px solid #8B5CF6; border-radius:12px; overflow:hidden;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" width="40" style="width:40px;">
                          <div style="width:30px; height:30px; line-height:30px; text-align:center; border-radius:50%; background-color:#8B5CF6; color:#FFFFFF; font-weight:900;">★</div>
                        </td>
                        <td valign="top" class="text-box">
                          <div style="margin:0; color:#0F172A; font-size:15px; font-weight:800; line-height:1.3;">${analysis.feedback?.fortaleza_destacada?.titulo || 'Fortaleza'}</div>
                          <div style="margin-top:12px; padding:12px; background-color:#E0E7FF; color:#4338CA; border-radius:8px; font-size:14px; font-style:italic; line-height:1.5; font-weight:500;">"${analysis.feedback?.fortaleza_destacada?.cita || ''}"</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 35px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #F1F5F9; border-radius:20px; overflow:hidden;" class="footer-col">
                <tr>
                  <td valign="top" width="50%" style="padding:20px; border-top:4px solid #22C55E; background-color:#F8FAFC; border-right:1px solid #F1F5F9;">
                    <div style="font-size:13px; font-weight:900; color:#166534; margin-bottom:12px;">Lo que el lead necesita</div>
                    ${(analysis.necesidades || []).map(n => `
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;">
                      <tr><td width="15" valign="top" style="color:#22C55E; font-size:14px;">●</td><td valign="top" style="font-size:13px; color:#475569; line-height:1.4;">${n}</td></tr>
                    </table>`).join('')}
                  </td>
                  <td valign="top" width="50%" style="padding:20px; border-top:4px solid #F97316; background-color:#F8FAFC;">
                    <div style="font-size:13px; font-weight:900; color:#C2410C; margin-bottom:12px;">Tus próximos pasos</div>
                    ${(analysis.proximos_pasos?.consultor || []).map((p, i) => `
                    <div style="background-color:#FFFFFF; border:1px solid #FFEDD5; border-radius:8px; padding:12px; margin-bottom:10px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                        <tr><td><span style="font-size:10px; font-weight:900; color:#EA580C; background-color:#FFF7ED; padding:3px 8px; border-radius:12px;">PASO ${i+1}</span></td></tr>
                      </table>
                      <div style="font-size:13px; color:#334155; line-height:1.4; font-weight:600;">${p}</div>
                    </div>`).join('')}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${(() => {
            const sc = analysis.scorecard || {};
            const generalScore = Math.round(((100 - (sc.muletillas?.score || 0)) + (sc.cierre_negociacion?.score || 0) + (sc.manejo_objeciones?.score || 0) + (sc.propuesta_valor?.score || 0)) / 4);
            const generalColor = generalScore >= 71 ? "#22C55E" : generalScore >= 41 ? "#EAB308" : "#EF4444";
            return `
          <tr>
            <td style="padding:10px 40px 40px 40px;" class="px-mobile">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#040025; border-radius:24px; overflow:hidden; border:2px solid ${generalColor};">
                <tr>
                  <td style="padding:40px 20px; text-align:center;">
                    <div style="font-size:12px; font-weight:900; color:#94A3B8; text-transform:uppercase; letter-spacing:2px; margin-bottom:12px;">Puntuación General</div>
                    <div style="font-size:64px; font-weight:900; color:#FFFFFF; line-height:1; margin-bottom:24px;">${generalScore}<span style="font-size:32px; color:${generalColor};">%</span></div>
                    <div style="margin:0 auto; max-width:80%;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;">
                        <tr>${generalScore > 0 ? `<td width="${generalScore}%" align="right" style="font-size:14px; color:${generalColor};">▼</td>` : `<td></td>`}</tr>
                      </table>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="height:12px; border-radius:6px;">
                        <tr>
                          <td width="30%" style="background-color:#EF4444; border-radius:6px 0 0 6px;"></td>
                          <td width="40%" style="background-color:#EAB308;"></td>
                          <td width="30%" style="background-color:#22C55E; border-radius:0 6px 6px 0;"></td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
          })()}
          <tr>
            <td style="background-color:#111827; padding:32px 40px; text-align:center;" class="px-mobile">
              <div style="color:#FFFFFF; font-size:16px; font-weight:800;">KINEDRIꓘ — Elevating skills</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
