import { useLocation, useNavigate } from "react-router-dom";
import "./MetricsTabs.css";

// Métricas joins Historial and the Panel; each tab is its own route so links and the back button work.
const METRICS_TABS = [
  { path: "/metricas", label: "Historial" },
  { path: "/metricas/cuantitativas", label: "Cuantitativas" },
  { path: "/metricas/cualitativas", label: "Cualitativas" },
];

export default function MetricsTabs() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return <div className="metricsHead">
    <h1 className="pageTitle">Métricas</h1>
    <nav className="metricsTabs" role="tablist" aria-label="Secciones de métricas">
      {METRICS_TABS.map((tab) => <button
        key={tab.path}
        type="button"
        role="tab"
        className="metricsTab"
        aria-selected={pathname === tab.path}
        onClick={() => navigate(tab.path)}
      >{tab.label}</button>)}
    </nav>
  </div>;
}
