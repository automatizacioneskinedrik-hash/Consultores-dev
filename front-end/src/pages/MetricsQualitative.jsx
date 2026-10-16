import { Empty } from "antd";
import Sidebar from "../components/Sidebar";
import MetricsTabs from "../components/MetricsTabs";
import "./Dashboard.css";

// Waits for the qualitative metrics that management is defining.
export default function MetricsQualitative() {
  return <div className="dashboardPage">
    <Sidebar />
    <main className="dashboardContent">
      <MetricsTabs />
      <section className="metricsPlaceholder">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Aquí verás las métricas cualitativas que defina la dirección." />
      </section>
    </main>
  </div>;
}
