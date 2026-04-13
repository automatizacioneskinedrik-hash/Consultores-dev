import React from "react";
import "./ReportDetail.css";

export default function ReportDetail({ report, onClose }) {
  if (!report) return null;

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
  const generalScore = Math.round(((100 - muletillasScore) + cierreScore + objecionesScore + valorScore) / 4);
  const generalColor = generalScore >= 71 ? "#22C55E" : generalScore >= 41 ? "#EAB308" : "#EF4444";

  return (
    <div className="reportOverlay">
      <div className="reportContainer">
        <header className="reportHeader">
          <div className="headerLeft">
            <h2>Reporte de Sesión</h2>
            <span>{clienteNome} — {dateStr}</span>
          </div>
          <button className="closeReport" onClick={onClose}>✕</button>
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
            <div className="metricCard white">
              <span className="mLabel">Participación</span>
              <div className="participationBar">
                <div className="pPart user" style={{ width: analysis.participacion?.consultor_pct }}>
                  <span>Tú: {analysis.participacion?.consultor_pct}</span>
                </div>
                <div className="pPart client" style={{ width: analysis.participacion?.cliente_pct }}>
                  <span>{clienteNome}: {analysis.participacion?.cliente_pct}</span>
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
                  <div className="pBarBase"><div className="pBarFill blue" style={{width: `${analysis.probabilidades?.interes_cliente}%`}}></div></div>
                </div>
                <div className="probItem">
                  <div className="probTop">
                    <span>Proximidad al Cierre</span>
                    <span className="pBadge orange">{analysis.probabilidades?.estado_cierre}</span>
                  </div>
                  <div className="pBarBase"><div className="pBarFill orange" style={{width: `${analysis.probabilidades?.proximidad_cierre}%`}}></div></div>
                </div>
             </div>
          </div>

          {/* Scorecard */}
          <div className="statsSection">
            <h4>Scorecard Detallado</h4>
            <div className="scorecardList">
              {Object.entries(sc).map(([key, data]) => {
                const titles = { muletillas: "Muletillas", cierre_negociacion: "Cierre y Negociación", manejo_objeciones: "Manejo de Objeciones", propuesta_valor: "Propuesta de Valor" };
                const score = data.score || 0;
                let color = score >= 71 ? "#22C55E" : score >= 41 ? "#EAB308" : "#EF4444";
                if (key === 'muletillas') color = score <= 30 ? "#22C55E" : score <= 60 ? "#EAB308" : "#EF4444";

                return (
                  <div key={key} className="scoreItem">
                    <div className="scoreTop">
                      <span>{titles[key] || key}</span>
                      <span style={{ color }}>{score}%</span>
                    </div>
                    <p className="scoreContext">{data.contexto}</p>
                    <div className="scoreBarBase"><div className="scoreBarFill" style={{ width: `${score}%`, backgroundColor: color }}></div></div>
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
                    <div className="impCorrections">
                      <strong>Correcciones Sugeridas:</strong>
                      <ul>
                        {(item.correcciones_sugeridas || []).map((c, i) => <li key={i}>"{c}"</li>)}
                      </ul>
                    </div>
                    <div className="impNext">
                      <strong>Próxima llamada:</strong> {item.proxima_llamada}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
