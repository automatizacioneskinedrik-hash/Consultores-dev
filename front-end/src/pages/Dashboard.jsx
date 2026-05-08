import { useMemo, useState } from "react";
import { ConfigProvider, Card, Col, DatePicker, Row, Select } from "antd";
import {
  ClockCircleOutlined,
  FilterOutlined,
  LineChartOutlined,
  PercentageOutlined,
  PhoneOutlined,
  StarOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Sidebar from "../components/Sidebar";
import { getUser } from "../utils/user";
import "./Dashboard.css";

const CONSULTANT_OPTIONS = [
  { label: "Todos", value: "all" },
  { label: "Consultor 1", value: "consultor_1" },
  { label: "Consultor 2", value: "consultor_2" },
  { label: "Consultor 3", value: "consultor_3" },
];

const KPI_DEFS = [
  { key: "totalCalls", label: "Total llamadas", icon: <PhoneOutlined /> },
  { key: "avgScore", label: "Score promedio", icon: <StarOutlined /> },
  { key: "avgTime", label: "Tiempo promedio", icon: <ClockCircleOutlined /> },
  { key: "closeRate", label: "Porcentaje de cierre", icon: <PercentageOutlined /> },
  { key: "consultantTalk", label: "Habla del consultor", icon: <UserOutlined /> },
  { key: "clientTalk", label: "Habla del cliente", icon: <TeamOutlined /> },
];

const MOCK_SERIES = [
  { label: "Ene", score: 68, time: 14, close: 42 },
  { label: "Feb", score: 73, time: 12, close: 46 },
  { label: "Mar", score: 70, time: 13, close: 44 },
  { label: "Abr", score: 76, time: 11, close: 49 },
  { label: "May", score: 74, time: 12, close: 47 },
  { label: "Jun", score: 79, time: 10, close: 52 },
];

function DashboardKpiCard({ label, icon, value, suffix }) {
  return (
    <Card className="dashboardKpiCard">
      <div className="dashboardKpiTop">
        <div className="dashboardKpiLabel">{label}</div>
        <div className="dashboardKpiIcon" aria-hidden="true">
          {icon}
        </div>
      </div>
      <div className="dashboardKpiValue">
        <span className="dashboardKpiNumber">{value}</span>
        {suffix ? <span className="dashboardKpiSuffix">{suffix}</span> : null}
      </div>
    </Card>
  );
}

function DashboardLineCard({ title, dataKey, stroke }) {
  return (
    <Card className="dashboardPanel" title={title}>
      <div className="dashboardChartWrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={MOCK_SERIES}
            margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(4, 0, 37, 0.08)" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const user = useMemo(() => getUser() || {}, []);
  const email = String(user.email || "").toLowerCase();
  const isAuthorizedSuperAdmin =
    user?.role === "superadmin" || email === "adminkinedrik@eadic.com";

  const [month, setMonth] = useState(null);
  const [week, setWeek] = useState(null);
  const [day, setDay] = useState(null);
  const [consultant, setConsultant] = useState("all");

  const kpiValues = useMemo(
    () => ({
      totalCalls: "—",
      avgScore: "—",
      avgTime: "—",
      closeRate: "—",
      consultantTalk: "—",
      clientTalk: "—",
    }),
    [],
  );

  return (
    <div className="dashboardPage">
      <Sidebar />
      <main className="dashboardContent">
        <ConfigProvider
          theme={{
            token: {
              colorPrimary: "#0040A4",
              colorInfo: "#0040A4",
              borderRadius: 18,
              fontFamily:
                "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            },
          }}
        >
          <header className="dashboardHeader">
            <div className="dashboardHeaderTitle">
              <div className="dashboardHeaderIcon" aria-hidden="true">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 20h18" />
                  <path d="M6 20v-8" />
                  <path d="M10 20v-12" />
                  <path d="M14 20v-6" />
                  <path d="M18 13v-3" />
                  <path d="M15 11l3-3 3 3" />
                </svg>
              </div>
              <div className="dashboardHeaderText">
                <h1>Tablero directivo de control</h1>
                <p>Indicadores, segmentación y tendencias para análisis de datos.</p>
              </div>
            </div>
          </header>

          {!isAuthorizedSuperAdmin ? (
            <section className="dashboardDenied" role="alert">
              No tienes permiso para acceder a esta sección.
            </section>
          ) : (
            <>
              <section className="dashboardSection">
                <Row gutter={[16, 16]}>
                  {KPI_DEFS.map((kpi) => (
                    <Col key={kpi.key} xs={24} sm={12} lg={8}>
                      <DashboardKpiCard
                        label={kpi.label}
                        icon={kpi.icon}
                        value={kpiValues[kpi.key]}
                        suffix={kpi.key === "closeRate" ? "%" : null}
                      />
                    </Col>
                  ))}
                </Row>
              </section>

              <section className="dashboardSection">
                <Card
                  className="dashboardFiltersCard"
                  title={
                    <span className="dashboardCardTitle">
                      <FilterOutlined /> Segmentación de datos
                    </span>
                  }
                >
                  <div className="dashboardFiltersGrid">
                    <div className="dashboardFilter">
                      <div className="dashboardFilterLabel">Mes</div>
                      <DatePicker
                        className="dashboardFilterControl"
                        size="large"
                        picker="month"
                        placeholder="Selecciona mes"
                        value={month}
                        onChange={setMonth}
                      />
                    </div>

                    <div className="dashboardFilter">
                      <div className="dashboardFilterLabel">Semana</div>
                      <DatePicker
                        className="dashboardFilterControl"
                        size="large"
                        picker="week"
                        placeholder="Selecciona semana"
                        value={week}
                        onChange={setWeek}
                      />
                    </div>

                    <div className="dashboardFilter">
                      <div className="dashboardFilterLabel">Día</div>
                      <DatePicker
                        className="dashboardFilterControl"
                        size="large"
                        picker="date"
                        placeholder="Selecciona día"
                        value={day}
                        onChange={setDay}
                      />
                    </div>

                    <div className="dashboardFilter">
                      <div className="dashboardFilterLabel">Consultor</div>
                      <Select
                        className="dashboardFilterControl"
                        size="large"
                        value={consultant}
                        onChange={setConsultant}
                        options={CONSULTANT_OPTIONS}
                      />
                    </div>
                  </div>
                </Card>
              </section>

              <section className="dashboardSection">
                <div className="dashboardChartsHeader">
                  <div className="dashboardChartsTitle">
                    <LineChartOutlined /> Gráficos de líneas
                  </div>
                </div>

                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={8}>
                    <DashboardLineCard
                      title="Tendencia de score"
                      dataKey="score"
                      stroke="#0040A4"
                    />
                  </Col>
                  <Col xs={24} lg={8}>
                    <DashboardLineCard
                      title="Tendencia de tiempo promedio"
                      dataKey="time"
                      stroke="#2885FF"
                    />
                  </Col>
                  <Col xs={24} lg={8}>
                    <DashboardLineCard
                      title="Tendencia de cierre"
                      dataKey="close"
                      stroke="#0040A4"
                    />
                  </Col>
                </Row>
              </section>
            </>
          )}
        </ConfigProvider>
      </main>
    </div>
  );
}
