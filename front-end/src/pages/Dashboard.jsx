import React, { useState, useEffect } from "react";
import "./Dashboard.css";
import Sidebar from "../components/Sidebar";
import { getUser } from "../utils/user";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell 
} from "recharts";
import { 
  TrendingUp, Users, Mic, Award, ArrowUpRight, ArrowDownRight, 
  Target, Zap, Star
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export default function Dashboard() {
  const [user] = useState(() => getUser() || {});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/dashboard-stats`, {
        headers: {
          "X-Admin-Email": user.email,
          "X-Auth-Token": user.authToken
        }
      });
      const data = await res.json();
      if (data.ok) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Error fetching dashboard stats:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) return (
    <div className="dashLoadingContainer">
      <Sidebar />
      <div className="dashLoading">
        <div className="dashSpinner"></div>
        <span>Analizando métricas globales...</span>
      </div>
    </div>
  );

  if (!stats) return null;

  // Preparar datos para las gráficas
  const chartData = Object.entries(stats.monthlyHistory)
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6); // Últimos 6 meses

  return (
    <div className="dashboardContainer">
      <Sidebar />
      <div className="dashboardContent">
        <header className="dashHeader">
          <div className="headerText">
            <h1>Panel de Control</h1>
            <p>Bienvenido al centro de insights de Kinedriꓘ</p>
          </div>
          <div className="headerDate">
            {new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric", day: "numeric" })}
          </div>
        </header>

        {/* Stats Grid */}
        <div className="statsGrid">
          <div className="statCard">
            <div className="statIcon blue"><Mic size={24} /></div>
            <div className="statInfo">
              <span className="statLabel">Total Audios</span>
              <span className="statValue">{stats.totalAudios}</span>
              <span className="statTrend up"><ArrowUpRight size={14} /> +12% este mes</span>
            </div>
          </div>
          <div className="statCard">
            <div className="statIcon green"><Users size={24} /></div>
            <div className="statInfo">
              <span className="statLabel">Consultores Activos</span>
              <span className="statValue">{stats.totalUsersCount}</span>
              <span className="statTrend"><Zap size={14} /> En tiempo real</span>
            </div>
          </div>
          <div className="statCard">
            <div className="statIcon purple"><TrendingUp size={24} /></div>
            <div className="statInfo">
              <span className="statLabel">Score Promedio</span>
              <span className="statValue">{stats.avgScore}%</span>
              <span className="statTrend up"><ArrowUpRight size={14} /> +5.4% de mejora</span>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="chartsGrid">
          <div className="chartCard">
            <div className="chartHeader">
              <h3>Actividad Mensual</h3>
              <span>Audios procesados</span>
            </div>
            <div className="chartBody">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2b6cff" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#2b6cff" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#2b6cff" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chartCard">
             <div className="chartHeader">
                <h3>Top 10 Consultores</h3>
                <span>Basado en Score Promedio</span>
             </div>
             <div className="topConsultantsList">
                {stats.topConsultants.map((c, idx) => (
                  <div key={c.email} className="consultantLine">
                    <div className="consInfo">
                      <div className="consRank">{idx + 1}</div>
                      <div className="consName">
                        <span>{c.name}</span>
                        <small>{c.count} audios</small>
                      </div>
                    </div>
                    <div className="consScore">
                      <div className="scoreFill" style={{ width: `${c.avgScore}%`, backgroundColor: c.avgScore >= 70 ? '#22c55e' : c.avgScore >= 40 ? '#eab308' : '#ef4444' }}></div>
                      <span className="scoreNum">{c.avgScore}%</span>
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
