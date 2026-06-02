import React, { useRef, useState } from "react";
import { FileText, FileDown, Headphones, X } from "lucide-react";
import { getUser } from "../utils/user";
import "./ReportDetail.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export default function ReportDetail({ report, onClose }) {
  const reportRef = useRef(null);
  const [audioLoading, setAudioLoading] = useState(false);

  if (!report) return null;

  const handleExportPDF = () => {
    // Cambiamos el título temporalmente para que el PDF se guarde con este nombre por defecto
    const originalTitle = document.title;
    document.title = `Speech_Kinedrik_${report.analysis?.nombre_cliente || 'Sesion'}`;

    // Usamos el diálogo de impresión nativo del navegador (que permite "Guardar como PDF" y mantiene el texto seleccionable)
    window.print();

    // Restauramos el título original
    document.title = originalTitle;
  };

  const handleDownloadAudio = async () => {
    if (!report.objectPath) return;
    setAudioLoading(true);
    try {
      const user = getUser() || {};
      const res = await fetch(
        `${API_BASE_URL}/api/sessions/audio-download?objectPath=${encodeURIComponent(report.objectPath)}`,
        { headers: { "X-Admin-Email": user.email || "", "X-Auth-Token": user.authToken || "" } }
      );
      const data = await res.json();
      if (!data.ok || !data.url) throw new Error(data.error || "No se pudo obtener el enlace");
      const a = document.createElement("a");
      a.href = data.url;
      a.download = data.filename || "audio.mp3";
      a.click();
    } catch (err) {
      alert("No se pudo descargar el audio: " + err.message);
    } finally {
      setAudioLoading(false);
    }
  };

  const handleExportTXT = () => {
    const clientName = report.analysis?.nombre_cliente || "Cliente";
    const date = report.createdAt
      ? new Date(report.createdAt._seconds * 1000).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
      : "";
    const header = `Transcripción — ${clientName} — ${date}\nConsultor: ${report.userEmail || ""}\n${"─".repeat(60)}\n\n`;
    const blob = new Blob([header + (report.transcription || "Sin transcripción disponible")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Transcripcion_${clientName.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const { analysis, createdAt, userEmail } = report;
  const clienteNome = analysis.nombre_cliente || "Cliente";
  const dateStr = createdAt ? new Date(createdAt._seconds * 1000).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) : "";

  const sc = analysis.scorecard || {};
  const muletillasScore = sc.muletillas?.score || 0;
  const cierreScore = sc.cierre_negociacion?.score || 0;
  const objecionesScore = sc.manejo_objeciones?.score || 0;
  const valorScore = sc.propuesta_valor?.score || 0;

  // Usar el score persistido en Firestore (guardado al momento del análisis).
  // Si no existe (registros anteriores), lo calculamos como fallback.
  const generalScore = report.generalScore ?? Math.round(((100 - muletillasScore) + cierreScore + objecionesScore + valorScore) / 4);
  const generalColor = generalScore >= 71 ? "#22C55E" : generalScore >= 41 ? "#EAB308" : "#EF4444";

  return (
    <div className="reportOverlay">
      <div className="reportContainer" ref={reportRef}>
        <header className="reportHeader">
          <div className="headerLeft">
            <h2>Reporte de Sesión</h2>
            <span>{clienteNome} — {dateStr}</span>
          </div>
          <div className="headerActions">
            {report.objectPath && (
              <button className="exportAudioBtn" onClick={handleDownloadAudio} disabled={audioLoading} title="Descargar audio original">
                <Headphones size={16} />
                <span>{audioLoading ? "..." : "Audio"}</span>
              </button>
            )}
            <button className="exportTXTBtn" onClick={handleExportTXT} title="Descargar transcripción en TXT">
              <FileDown size={16} />
              <span>TXT</span>
            </button>
            <button className="exportPDFBtn" onClick={handleExportPDF} title="Exportar a PDF">
              <FileText size={16} />
              <span>PDF</span>
            </button>
            <button className="closeReport" onClick={onClose} title="Cerrar">
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="reportContent">
          {/* Hero Section */}
          <div className="reportHero">
            <div className="heroText">
              <h3>Tu Gran Sesión de Hoy</h3>
              <p>Consultor: <strong>{userEmail}</strong></p>
            </div>
            <div className="generalScoreCircle" style={{ borderColor: generalColor }}>
              <span className="scoreValue">{generalScore}%</span>
              <span className="scoreLabel">Score General</span>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="metricsGrid">
            <div className="metricCard blue">
              <span className="mLabel">Duración Total</span>
              <span className="mValue">{analysis.participacion?.duracion_total || "00:00"}</span>
            </div>
            <div className="metricCard white participationCard">
              <div className="participationHeader">
                <span className="pLabel user">Tú</span>
                <span className="pLabel client">{clienteNome}</span>
              </div>
              <div className="participationBar">
                <div className="pPart user" style={{ width: analysis.participacion?.consultor_pct }}>
                  <span className="pPct">{analysis.participacion?.consultor_pct}</span>
                </div>
                <div className="participationDivider"></div>
                <div className="pPart client" style={{ width: analysis.participacion?.cliente_pct }}>
                  <span className="pPct">{analysis.participacion?.cliente_pct}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Probabilidades */}
          <div className="statsSection">
            <h4>Probabilidades</h4>
            <div className="probGrid">
              <div className="probItem">
                <div className="probTop">
                  <span>Interés del Cliente</span>
                  <span className="pBadge">{analysis.probabilidades?.estado_interes}</span>
                </div>
                <div className="pBarBase"><div className="pBarFill blue" style={{ width: `${analysis.probabilidades?.interes_cliente}%` }}></div></div>
              </div>
              <div className="probItem">
                <div className="probTop">
                  <span>Proximidad al Cierre</span>
                  <span className="pBadge orange">{analysis.probabilidades?.estado_cierre}</span>
                </div>
                <div className="pBarBase"><div className="pBarFill orange" style={{ width: `${analysis.probabilidades?.proximidad_cierre}%` }}></div></div>
              </div>
            </div>
          </div>

          {/* Scorecard */}
          <div className="statsSection">
            <h4>Scorecard Detallado</h4>
            <div className="scorecardList">
              {[
                { key: 'muletillas', title: 'Muletillas', score: muletillasScore },
                { key: 'cierre_negociacion', title: 'Cierre y Negociación', score: cierreScore },
                { key: 'manejo_objeciones', title: 'Manejo de Objeciones', score: objecionesScore },
                { key: 'propuesta_valor', title: 'Propuesta de Valor', score: valorScore }
              ].map((item) => {
                const data = sc[item.key] || {};
                let color = item.score >= 71 ? "#22C55E" : item.score >= 41 ? "#EAB308" : "#EF4444";
                if (item.key === 'muletillas') {
                  color = item.score <= 30 ? "#22C55E" : item.score <= 60 ? "#EAB308" : "#EF4444";
                }

                return (
                  <div key={item.key} className="scoreItem">
                    <div className="scoreTop">
                      <span>{item.title}</span>
                      <div className="scoreRightLabel">
                        {item.key === 'muletillas' && item.score > 50 && (
                          <span className="improveBadge">⚠️ Por Trabajar</span>
                        )}
                        <span style={{ color }}>{item.score}%</span>
                      </div>
                    </div>
                    <p className="scoreContext">{data.contexto || ""}</p>
                    <div className={`trafficLightBar ${item.key === 'muletillas' ? 'inverted' : ''}`}>
                      <div className="tlSegment s1"></div>
                      <div className="tlSegment s2"></div>
                      <div className="tlSegment s3"></div>
                      <div className="tlMarker" style={{ left: `${item.score}%` }}>
                        <div className="tlTriangle" style={{ borderBottomColor: color }}></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Feedback Sections */}
          <div className="feedbackGrid">
            <div className="fSection positive">
              <h5>✓ Aspecto Positivo</h5>
              <h6>{analysis.feedback?.aspecto_positivo?.titulo}</h6>
              <p>{analysis.feedback?.aspecto_positivo?.descripcion}</p>
            </div>
          </div>

          <div className="statsSection">
            <h4>Tus Fortalezas</h4>
            <div className="fortalezaCard">
              <div className="fortalezaHeader">
                <span className="starIcon">★</span>
                <h5>{analysis.feedback?.fortaleza_destacada?.titulo || "Fortaleza Detectada"}</h5>
              </div>
              <div className="fortalezaCita">
                <p>"{analysis.feedback?.fortaleza_destacada?.cita}"</p>
              </div>
            </div>
          </div>

          <div className="statsSection">
            <h4>Puntos de Mejora</h4>
            <div className="improvementList">
              {(analysis.feedback?.puntos_mejora || []).map((item, idx) => (
                <div key={idx} className="improvementCard">
                  <div className="impHeader">
                    <span className="impFase">{item.codigo_fase}</span>
                    <span className="impTitle">{item.titulo_error}</span>
                  </div>
                  <div className="impBody">
                    <p><strong>Frase detectada:</strong> <em>"{item.frase_detectada}"</em></p>
                    <p><strong>Problema:</strong> {item.problema}</p>
                    {(item.correcciones_sugeridas || (item.correccion_sugerida ? [item.correccion_sugerida] : [])).slice(0, 5).length > 0 && (
                      <div className="impCorrections">
                        <strong>Correcciones Sugeridas:</strong>
                        <div className="correctionsList">
                          {(item.correcciones_sugeridas || (item.correccion_sugerida ? [item.correccion_sugerida] : [])).slice(0, 5).map((c, i) => (
                            <div key={i} className="correctionBox">
                              "{c}"
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="impNext">
                      <strong>Próxima llamada:</strong> {item.proxima_llamada}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="footerSectionsGrid">
            <div className="footerSectionCol needs">
              <h4>Lo que el lead necesita</h4>
              <ul className="needsList">
                {(analysis.necesidades || []).map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
            <div className="footerSectionCol steps">
              <h4>Tus próximos pasos</h4>
              <div className="stepsList">
                {(analysis.proximos_pasos?.consultor || []).map((p, i) => (
                  <div key={i} className="stepItem">
                    <span className="stepNumber">{i + 1}</span>
                    <p>{p}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <footer className="reportFooter">
            <div className="footerLine"></div>
            <p className="footerCredits">Desarrollado por el equipo de Ingeniería</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
