import React, { useState, useEffect } from "react";
import "./History.css";
import Sidebar from "../components/Sidebar";
import ReportDetail from "../components/ReportDetail";
import { getUser } from "../utils/user";
import { Search, Filter, Calendar, ChevronRight, User, Eye, CheckCircle } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export default function History() {
  const [user] = useState(() => getUser());
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [selectedReportData, setSelectedReportData] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const isAdmin = user.role === "admin" || user.role === "superadmin";

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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleOpenDetail = (session) => {
    setSelectedReportId(session.id);
    setSelectedReportData(session.report);
  };

  const filteredSessions = sessions.filter(s => 
    s.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="historyContainer">
      <Sidebar />
      <div className="historyContent">
        <header className="historyHeader">
          <div className="headerText">
            <h1>Historial de Reportes</h1>
            <p>Consulta todos tus análisis y sesiones procesadas.</p>
          </div>

          <div className="historyFilters">
            <div className="searchBar">
              <Search className="sIcon" size={18} />
              <input 
                type="text" 
                placeholder="Buscar por cliente o consultor..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="filterBtn">
              <Filter size={18} />
              <span>Filtros</span>
            </button>
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
                            <User size={14} />
                            {session.userEmail.split('@')[0]}
                          </div>
                        </td>
                      )}
                      <td className="clientName">{session.cliente}</td>
                      <td>
                        <div className={`scoreBadge ${session.score >= 70 ? 'high' : session.score >= 40 ? 'mid' : 'low'}`}>
                          {session.score}%
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
                        <button className="viewSummaryBtn" onClick={(e) => { e.stopPropagation(); handleOpenDetail(session); }}>
                          <Eye size={14} />
                          <span>Ver Resumen</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="noResults">
                <p>No se encontraron reportes que coincidan con la búsqueda.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedReportId && (
        <ReportDetail 
          report={selectedReportData} 
          loading={isDetailLoading} 
          onClose={() => {
            setSelectedReportId(null);
            setSelectedReportData(null);
          }} 
        />
      )}
    </div>
  );
}
