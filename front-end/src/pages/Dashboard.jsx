import { useEffect, useId, useMemo, useState } from "react";
import { Button, Card, Col, ConfigProvider, DatePicker, Empty, Row, Select, Spin } from "antd";
import {
  ClockCircleOutlined,
  FilterOutlined,
  LineChartOutlined,
  PercentageOutlined,
  PhoneOutlined,
  ReloadOutlined,
  StarOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import dayjs from "dayjs";
import Sidebar from "../components/Sidebar";
import { getUser } from "../utils/user";
import "./Dashboard.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const DEFAULT_CONSULTANT_OPTIONS = [{ label: "Todos", value: "all" }];

const KPI_DEFS = [
  { key: "callVolumeN", label: "Volumen de llamadas (N)", icon: <PhoneOutlined /> },
  { key: "meanScore", label: "Score medio (μ)", icon: <StarOutlined />, suffix: "%" },
  {
    key: "expectedDurationSec",
    label: "Duración esperada (E[t])",
    icon: <ClockCircleOutlined />,
  },
  {
    key: "meanCloseProbability",
    label: "P(cierre) media (μ)",
    icon: <PercentageOutlined />,
    suffix: "%",
  },
  {
    key: "meanConsultantTalkPct",
    label: "Share consultor (μ)",
    icon: <UserOutlined />,
    suffix: "%",
  },
  {
    key: "meanClientTalkPct",
    label: "Share cliente (μ)",
    icon: <TeamOutlined />,
    suffix: "%",
  },
];

const NUMBER_FORMAT = new Intl.NumberFormat("es-CO");

function clampNumber(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function formatFixed(value, digits = 1) {
  const n = clampNumber(value);
  if (n == null) return "—";
  return n.toFixed(digits);
}

function formatInt(value) {
  const n = clampNumber(value);
  if (n == null) return "—";
  return NUMBER_FORMAT.format(Math.round(n));
}

function formatDurationSeconds(seconds) {
  const n = clampNumber(seconds);
  if (n == null) return "—";
  const total = Math.max(0, Math.round(n));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad2 = (x) => String(x).padStart(2, "0");
  if (hh > 0) return `${hh}:${pad2(mm)}:${pad2(ss)}`;
  return `${mm}:${pad2(ss)}`;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  return null;
}

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeekMonday(date) {
  const d = startOfLocalDay(date);
  const day = d.getDay(); // 0=Sun ... 6=Sat
  const diff = (day + 6) % 7; // monday=0
  d.setDate(d.getDate() - diff);
  return d;
}

function buildTimeRange({ month, week, day }) {
  const dtfDay = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" });
  const dtfMonth = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });

  const dayDate = toDate(day);
  if (dayDate) {
    const start = startOfLocalDay(dayDate);
    const end = addDays(start, 1);
    return { startMs: start.getTime(), endMs: end.getTime(), label: `Día: ${dtfDay.format(start)}` };
  }

  const weekDate = toDate(week);
  if (weekDate) {
    const start = startOfWeekMonday(weekDate);
    const end = addDays(start, 7);
    const endInclusive = addDays(end, -1);
    return {
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: `Semana: ${dtfDay.format(start)} – ${dtfDay.format(endInclusive)}`,
    };
  }

  const monthDate = toDate(month);
  if (monthDate) {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1, 0, 0, 0, 0);
    return {
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: `Mes: ${dtfMonth.format(start)}`,
    };
  }

  return { startMs: null, endMs: null, label: "Histórico" };
}

function formatWeekPickerValue(value) {
  const date = toDate(value);
  if (!date) return "";
  const start = startOfWeekMonday(date);
  const end = addDays(start, 6);
  const dtf = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" });
  return `${dtf.format(start)} – ${dtf.format(end)}`;
}

function DashboardKpiCard({ label, icon, value, suffix, loading }) {
  return (
    <Card className="dashboardKpiCard">
      <div className="dashboardKpiTop">
        <div className="dashboardKpiLabel">{label}</div>
        <div className="dashboardKpiIcon" aria-hidden="true">
          {icon}
        </div>
      </div>
      <div className="dashboardKpiValue">
        {loading ? (
          <span className="dashboardKpiNumber dashboardKpiLoading">
            <Spin size="small" />
          </span>
        ) : (
          <>
            <span className="dashboardKpiNumber">{value}</span>
            {suffix && value !== "—" ? (
              <span className="dashboardKpiSuffix">{suffix}</span>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

function DashboardLineCard({
  title,
  data,
  dataKey,
  stroke,
  bucket,
  loading,
  yDomain,
  valueSuffix,
  valueLabel,
}) {
  const rawId = useId();
  const gradientId = useMemo(() => `dash_grad_${rawId.replace(/:/g, "")}`, [rawId]);
  const formatTick = useMemo(() => {
    const dtfHour = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" });
    const dtfDay = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" });
    const dtfMonth = new Intl.DateTimeFormat("es-CO", { month: "short", year: "2-digit", timeZone: "UTC" });

    return (ts) => {
      const n = clampNumber(ts);
      if (n == null) return "";
      const d = new Date(n);
      if (bucket === "hour") return dtfHour.format(d);
      if (bucket === "day") return dtfDay.format(d);
      return dtfMonth.format(d);
    };
  }, [bucket]);

  return (
    <Card className="dashboardPanel" title={title}>
      <div className="dashboardChartWrap">
        {loading ? (
          <div className="dashboardChartState">
            <Spin />
          </div>
        ) : !data?.length ? (
          <div className="dashboardChartState">
            <Empty description="Sin datos para los filtros seleccionados" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, left: 6, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                  <stop offset="70%" stopColor={stroke} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(4, 0, 37, 0.08)" />
              <XAxis
                dataKey="ts"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 12 }}
                tickFormatter={formatTick}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                domain={yDomain || ["auto", "auto"]}
                tickFormatter={(v) => (valueSuffix ? `${Math.round(v)}${valueSuffix}` : Math.round(v))}
              />
              <Tooltip
                labelFormatter={(label) => formatTick(label)}
                formatter={(v) => {
                  const n = clampNumber(v);
                  if (n == null) return ["—", valueLabel || ""];
                  const formatted = valueSuffix ? `${formatFixed(n, 1)}${valueSuffix}` : formatFixed(n, 1);
                  return [formatted, valueLabel || ""];
                }}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                fill={`url(#${gradientId})`}
                stroke="none"
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                name={valueLabel || title}
                stroke={stroke}
                strokeWidth={3}
                dot={false}
                connectNulls
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
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
  const [consultantOptions, setConsultantOptions] = useState(DEFAULT_CONSULTANT_OPTIONS);

  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [consultantsLoading, setConsultantsLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [refetchToken, setRefetchToken] = useState(0);

  const [dashboardData, setDashboardData] = useState(() => ({
    kpis: null,
    series: [],
    meta: null,
  }));

  const authHeaders = useMemo(
    () => ({
      "X-Admin-Email": user.email || "",
      "X-Auth-Token": user.authToken || "",
    }),
    [user.email, user.authToken],
  );

  const timeRange = useMemo(() => buildTimeRange({ month, week, day }), [month, week, day]);

  const isFutureRange = useMemo(() => {
    if (!Number.isFinite(timeRange.startMs)) return false;
    return timeRange.startMs > Date.now();
  }, [timeRange.startMs]);

  const weekPresets = useMemo(
    () => [
      { label: "Esta semana", value: () => dayjs() },
      { label: "Semana pasada", value: () => dayjs().subtract(1, "week") },
    ],
    [],
  );

  const clearTimeFilters = () => {
    setMonth(null);
    setWeek(null);
    setDay(null);
  };

  useEffect(() => {
    if (!isAuthorizedSuperAdmin) return;
    const controller = new AbortController();
    let ignore = false;

    (async () => {
      try {
        setConsultantsLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/admin/dashboard-consultants`, {
          headers: authHeaders,
          signal: controller.signal,
        });
        const data = await res.json();
        if (ignore) return;
        if (!data.ok) return;
        const list = Array.isArray(data.consultants) ? data.consultants : [];
        setConsultantOptions([...DEFAULT_CONSULTANT_OPTIONS, ...list]);
      } catch (err) {
        if (!ignore && err?.name !== "AbortError") {
          console.debug("Dashboard consultants fetch inhibited:", err?.message || err);
        }
      } finally {
        if (!ignore) setConsultantsLoading(false);
      }
    })();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [authHeaders, isAuthorizedSuperAdmin]);

  useEffect(() => {
    if (!isAuthorizedSuperAdmin) return;
    const controller = new AbortController();
    let ignore = false;

    (async () => {
      try {
        setDashboardError("");
        setDashboardLoading(true);
        const params = new URLSearchParams();
        params.set("consultantEmail", consultant || "all");
        if (Number.isFinite(timeRange.startMs) && Number.isFinite(timeRange.endMs)) {
          params.set("startMs", String(timeRange.startMs));
          params.set("endMs", String(timeRange.endMs));
        }

        const res = await fetch(`${API_BASE_URL}/api/admin/executive-dashboard?${params.toString()}`, {
          headers: authHeaders,
          signal: controller.signal,
        });
        const data = await res.json();
        if (ignore) return;

        if (!data.ok) {
          setDashboardError(data.error || "No se pudo cargar el dashboard.");
          setDashboardData({ kpis: null, series: [], meta: null });
          return;
        }

        setDashboardData({
          kpis: data.kpis || null,
          series: Array.isArray(data.series) ? data.series : [],
          meta: data.meta || null,
        });
      } catch (err) {
        if (ignore || err?.name === "AbortError") return;
        setDashboardError("No se pudo cargar el dashboard. Verifica tu conexión e intenta de nuevo.");
        setDashboardData({ kpis: null, series: [], meta: null });
      } finally {
        if (!ignore) setDashboardLoading(false);
      }
    })();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [authHeaders, consultant, isAuthorizedSuperAdmin, refetchToken, timeRange.endMs, timeRange.startMs]);

  const kpiValues = useMemo(() => {
    const k = dashboardData.kpis || {};
    return {
      callVolumeN: formatInt(k.callVolumeN),
      meanScore: formatFixed(k.meanScore, 1),
      expectedDurationSec: formatDurationSeconds(k.expectedDurationSec),
      meanCloseProbability: formatFixed(k.meanCloseProbability, 1),
      meanConsultantTalkPct: formatFixed(k.meanConsultantTalkPct, 1),
      meanClientTalkPct: formatFixed(k.meanClientTalkPct, 1),
    };
  }, [dashboardData.kpis]);

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
                        suffix={kpi.suffix || null}
                        loading={dashboardLoading}
                      />
                    </Col>
                  ))}
                </Row>
                {dashboardError ? (
                  <div className="dashboardError" role="alert">
                    {dashboardError}
                    <Button
                      className="dashboardErrorBtn"
                      icon={<ReloadOutlined />}
                      onClick={() => {
                        setRefetchToken((v) => v + 1);
                      }}
                    >
                      Reintentar
                    </Button>
                  </div>
                ) : null}
              </section>

              <section className="dashboardSection">
                <Card
                  className="dashboardFiltersCard"
                  title={
                    <span className="dashboardCardTitle">
                      <FilterOutlined /> Segmentación de datos
                    </span>
                  }
                  extra={
                    <Button
                      size="middle"
                      onClick={clearTimeFilters}
                      disabled={!month && !week && !day}
                    >
                      Limpiar tiempo
                    </Button>
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
                        onChange={(value) => {
                          setMonth(value);
                          setWeek(null);
                          setDay(null);
                        }}
                      />
                    </div>

                    <div className="dashboardFilter">
                      <div className="dashboardFilterLabel">Semana</div>
                      <DatePicker
                        className="dashboardFilterControl"
                        size="large"
                        picker="week"
                        placeholder="Selecciona semana"
                        presets={weekPresets}
                        format={formatWeekPickerValue}
                        value={week}
                        onChange={(value) => {
                          setWeek(value);
                          setMonth(null);
                          setDay(null);
                        }}
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
                        onChange={(value) => {
                          setDay(value);
                          setMonth(null);
                          setWeek(null);
                        }}
                      />
                    </div>

                    <div className="dashboardFilter">
                      <div className="dashboardFilterLabel">Consultor</div>
                      <Select
                        className="dashboardFilterControl"
                        size="large"
                        value={consultant}
                        onChange={setConsultant}
                        options={consultantOptions}
                        loading={consultantsLoading}
                        showSearch
                        optionFilterProp="label"
                        placeholder="Selecciona consultor"
                      />
                    </div>
                  </div>

                  {isFutureRange ? (
                    <div className="dashboardHint" role="status">
                      La segmentación de tiempo seleccionada está en el futuro; no habrá datos disponibles aún.
                    </div>
                  ) : null}
                </Card>
              </section>

              <section className="dashboardSection">
                <div className="dashboardChartsHeader">
                  <div className="dashboardChartsTitle">
                    <LineChartOutlined /> Gráficos de líneas
                  </div>
                  <div className="dashboardChartsMeta">
                    <span className="dashboardMetaPill">{timeRange.label}</span>
                    {consultant !== "all" ? (
                      <span className="dashboardMetaPill">
                        {consultantOptions.find((o) => o.value === consultant)?.label || "Consultor"}
                      </span>
                    ) : (
                      <span className="dashboardMetaPill">Todos</span>
                    )}
                  </div>
                </div>

                <Row gutter={[16, 16]}>
                  <Col xs={24}>
                    <DashboardLineCard
                      title="Evolución de score medio (μ)"
                      data={dashboardData.series}
                      dataKey="meanScore"
                      stroke="#0040A4"
                      bucket={dashboardData.meta?.bucket}
                      loading={dashboardLoading}
                      yDomain={[0, 100]}
                      valueSuffix="%"
                      valueLabel="μ Score"
                    />
                  </Col>
                  <Col xs={24}>
                    <DashboardLineCard
                      title="Evolución de P(cierre) (μ)"
                      data={dashboardData.series}
                      dataKey="meanClose"
                      stroke="#2885FF"
                      bucket={dashboardData.meta?.bucket}
                      loading={dashboardLoading}
                      yDomain={[0, 100]}
                      valueSuffix="%"
                      valueLabel="μ P(cierre)"
                    />
                  </Col>
                  <Col xs={24}>
                    <DashboardLineCard
                      title="Evolución de share cliente (μ)"
                      data={dashboardData.series}
                      dataKey="meanClientTalk"
                      stroke="#0040A4"
                      bucket={dashboardData.meta?.bucket}
                      loading={dashboardLoading}
                      yDomain={[0, 100]}
                      valueSuffix="%"
                      valueLabel="μ Share cliente"
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
