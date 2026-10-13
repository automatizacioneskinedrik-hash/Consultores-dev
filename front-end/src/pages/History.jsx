import React, { useState, useEffect } from "react";
import "./History.css";
import Sidebar from "../components/Sidebar";
import ReportDetail from "../components/ReportDetail";
import { getUser } from "../utils/user";
import { Search, Filter, Calendar, ChevronRight, Eye, CheckCircle, X } from "lucide-react";
import UserAvatar from "../components/UserAvatar";
import GuideTour from "../components/GuideTour";

const HISTORY_TOUR = [
  { title: "¡Hola! Yo analizo tus resultados", text: "Aquí guardo todas tus llamadas analizadas. Te enseño a encontrarlas y a leer tu reporte." },
  { target: ".searchWrapper", title: "Busca una llamada", text: "Escribe el nombre del cliente y la lista se filtra al instante, así no tienes que buscar fila por fila." },
  { target: ".historyTable", title: "Tus llamadas, de la más reciente a la más antigua", text: "Cada fila muestra la fecha, el cliente, la nota y cuánto duró la llamada." },
  { target: ".scoreBadge", title: "Tu nota", text: "Es la nota sobre 100 puntos según el speech comercial. El color te dice de un vistazo cómo te fue: verde desde 70, amarillo desde 40 y rojo por debajo." },
  { do: [{ hide: [".closeReport", ".reportOverlay"] }], wait: 0, target: ".viewSummaryBtn", title: "Abre tu reporte", text: "Aquí ves cómo te fue en cada fase, la frase de la llamada que lo prueba y qué decir distinto la próxima vez. Desde el reporte también puedes descargarlo en PDF." },
  { do: [{ hide: [".closeReport", ".reportOverlay"] }], wait: 0, target: ".deleteSessionBtn", title: "Borrar una prueba", text: "Esta X solo aparece en tus llamadas de prueba y las quita del historial." },
  { do: [{ show: [".viewSummaryBtn", ".reportOverlay"] }], wait: 6000, target: ".reportHero", title: "Tu nota, de un vistazo", text: "Abrí tu llamada más reciente. Arriba ves tu foto junto a la nota, sobre 100 puntos." },
  { target: ".reportOverlay .metricCard.blue", title: "Cuánto duró", text: "La duración total de la llamada." },
  { target: ".reportOverlay .participationCard", title: "Quién habló más", text: "La barra reparte la llamada entre tú y tu cliente. Cuanto más hable el cliente, mejor." },
  { target: ".reportOverlay .probGrid", title: "Cómo vio el cliente la llamada", text: "Estima el interés del cliente y qué tan cerca está de cerrar." },
  { target: ".reportOverlay .psCard", title: "Tu nota, fase por fase", text: "Cada tarjeta es una fase del speech, con los puntos que lograste de los que vale." },
  { do: [{ show: [".reportOverlay .psToggle", ".reportOverlay .psRules:not(.psCollapsed)"] }], target: ".reportOverlay .psRule", title: "Regla por regla", text: "Al abrir una fase ves cada regla con la frase de tu llamada que la prueba, cómo mejorarla y qué hacer en la próxima llamada." },
  { target: ".reportOverlay .psCard:has(.psSemaforo)", title: "Tu ratio de habla", text: "Muestra en qué zona quedaste y cuántos puntos te dio." },
  { target: ".reportOverlay .psCard:has(.psWords)", title: "Tus muletillas", text: "Las palabras que más repetiste y cuántas veces. Intenta cambiarlas por pausas cortas." },
  { target: ".reportOverlay .footerSectionCol.needs", title: "Lo que tu cliente necesita", text: "Un resumen de lo que buscaba tu cliente, para preparar tu seguimiento." },
  { target: ".reportOverlay .footerSectionCol.steps", title: "Tus próximos pasos", text: "Lo que quedó pendiente después de la llamada, en orden." },
  { target: ".reportOverlay .headerActions", title: "Descarga lo que necesites", text: "Desde aquí descargas el audio, la transcripción o el reporte en PDF. Con la X cierras el reporte." },
  { do: [{ hide: [".closeReport", ".reportOverlay"] }], title: "¡Listo, ya sabes leer tus resultados!", text: "Si algo no te quedó claro, haz clic en mí, abajo a la izquierda, y repetimos el recorrido." },
];
const HISTORY_TOUR_CLEANUP = [{ hide: [".closeReport", ".reportOverlay"] }];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export default function History() {
  const [user] = useState(() => getUser());
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [selectedReportData, setSelectedReportData] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState(null);

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions?email=${user.email}&role=${user.role}`, {
        headers: {
          "X-Admin-Email": user.email,
          "X-Auth-Token": user.authToken
        }
      });
      const data = await res.json();
      if (data.ok) {
        setSessions(data.sessions);
      }
    } catch (err) {
      console.error("Error fetching history:", err);
      setError("No se pudo cargar el historial. Por favor, verifica tu conexión o intenta más tarde.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleOpenDetail = async (session) => {
    setSelectedReportId(session.id);
    setSelectedReportData(null);
    setIsDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${session.id}`, {
        headers: { "X-Admin-Email": user.email, "X-Auth-Token": user.authToken },
      });
      const data = await res.json();
      if (data.ok) setSelectedReportData(data.report);
    } catch (err) {
      console.error("Error loading session detail:", err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Only shown on the tester's own sessions (server sets canDelete) to clean up test uploads.
  const handleDeleteSession = async (session) => {
    if (!window.confirm(`¿Eliminar la sesión de ${session.cliente} (${new Date(session.date).toLocaleDateString()})? Se borran el reporte, su seguimiento de WhatsApp y el audio. No se puede deshacer.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${session.id}`, {
        method: "DELETE",
        headers: { "X-Admin-Email": user.email, "X-Auth-Token": user.authToken },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo eliminar la sesión.");
      setSessions((current) => current.filter((entry) => entry.id !== session.id));
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredSessions = sessions.filter(s =>
    s.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.userName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="historyContainer">
      <Sidebar />
      {!loading && <GuideTour id="history" steps={HISTORY_TOUR} cleanup={HISTORY_TOUR_CLEANUP} hideLauncher={Boolean(selectedReportId)}mascot="/mascots/dots/dot-amarillo-analitico-guia.webp" mascotName="el personaje amarillo" aura="rgba(251, 180, 42, .55)" />}
      <div className="historyContent">
        <header className="historyHeader">
          <div className="headerText">
            <h1 className="pageTitle">Historial de <span className="titleAccent">Reportes</span></h1>
            <p>Consulta todos tus análisis y sesiones procesadas.</p>
          </div>

          <div className="historyFilters">
            <div className="searchWrapper">
              <Search size={18} className="searchIcon" />
              <input
                type="text"
                placeholder={isAdmin ? "Buscar por cliente o consultor..." : "Buscar por nombre del cliente..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </header>

        {loading ? (
          <div className="historyLoading">
            <div className="historySpinner"></div>
            <span>Cargando reportes...</span>
          </div>
        ) : (
          <div className="historyGrid">
            {filteredSessions.length > 0 ? (
              <table className="historyTable">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    {isAdmin && <th>Consultor</th>}
                    <th>Cliente</th>
                    <th>Score</th>
                    <th>Duración</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session) => (
                    <tr key={session.id} onClick={() => handleOpenDetail(session)}>
                      <td>
                        <div className="dateCell">
                          <Calendar size={14} />
                          {new Date(session.date).toLocaleDateString()}
                        </div>
                      </td>
                      {isAdmin && (
                        <td>
                          <div className="userCell">
                            <UserAvatar name={session.userName} email={session.userEmail} picture={session.userPicture} className="historyConsultantAvatar" />
                            {session.userName}
                          </div>
                        </td>
                      )}
                      <td className="clientName">{session.cliente}</td>
                      <td>
                        <div className={`scoreBadge ${session.score >= 70 ? 'high' : session.score >= 40 ? 'mid' : 'low'}`}>
                          {session.scoreFormat === "points" ? `${Number(session.score).toLocaleString("es-CO")} pts` : `${session.score}%`}
                        </div>
                      </td>
                      <td>{session.duration}</td>
                      <td>
                        <span className="statusTag processed">
                          <CheckCircle size={12} className="tagIcon" />
                          Realizado
                        </span>
                      </td>
                      <td>
                        <div className="rowActions">
                          <button className="viewSummaryBtn" onClick={(e) => { e.stopPropagation(); handleOpenDetail(session); }}>
                            <Eye size={14} />
                            <span>Ver Resumen</span>
                          </button>
                          {session.canDelete && (
                            <button className="deleteSessionBtn" title="Eliminar sesión de prueba" aria-label={`Eliminar sesión de ${session.cliente}`} onClick={(e) => { e.stopPropagation(); handleDeleteSession(session); }}>
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : error ? (
              <div className="noResults">
                <p style={{ color: '#ef4444' }}>{error}</p>
                <button 
                  onClick={fetchHistory} 
                  style={{ marginTop: '10px', background: 'var(--blue)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="noResults">
                <p>No se encontraron reportes que coincidan con la búsqueda.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedReportId && isDetailLoading && (
        <div className="detailLoadingOverlay">
          <div className="historySpinner"></div>
          <span>Cargando reporte...</span>
        </div>
      )}
      {selectedReportId && selectedReportData && (
        <ReportDetail
          report={selectedReportData}
          onClose={() => {
            setSelectedReportId(null);
            setSelectedReportData(null);
          }}
        />
      )}
    </div>
  );
}
