import { useEffect, useState } from "react";
import { Alert, Button, Card, Col, ConfigProvider, DatePicker, Empty, Row, Spin } from "antd";
import { CalendarOutlined, DollarOutlined, PhoneOutlined, RiseOutlined } from "@ant-design/icons";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import dayjs from "dayjs";
import "dayjs/locale/es";
import Sidebar from "../components/Sidebar";
import GuideTour from "../components/GuideTour";
import { getUser } from "../utils/user";
import "./Dashboard.css";
import "./Costs.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
// Mirrors back-end/src/services/costReport.js (COSTS_START_DATE and PROVIDER_IDS).
const COSTS_START = dayjs("2026-09-01");

const PROVIDERS = [
  { id: "assembly", name: "AssemblyAI", color: "#BB8AFF", source: "Calculado: minutos × US$0,17/h", calculated: true },
  { id: "openai", name: "OpenAI", color: "#040025", source: "Reportado por OpenAI" },
  { id: "claude", name: "Claude", color: "#FF5900", source: "Reportado por Anthropic" },
  { id: "google", name: "Google Cloud", color: "#2885FF", source: "Reportado por Google" },
];

const COSTS_TOUR = [
  { title: "¡Hola! Yo llevo las cuentas", text: "Aquí ves cuánto cuesta procesar las llamadas, proveedor por proveedor. Te muestro dónde está cada cosa." },
  { target: ".dashboardTopFilters", title: "Elige las fechas", text: "Escoge desde y hasta qué día quieres ver. Todo se actualiza con tu elección." },
  { target: ".costsKpis", title: "Las cifras clave", text: "El total del periodo, lo del último día, cuánto cuesta en promedio cada llamada y cuántas se procesaron." },
  { target: '[data-tour="costs-daily"]', title: "Día por día", text: "Cada barra es un día y cada color, un proveedor. Encima ves el total del día." },
  { target: '[data-tour="costs-providers"]', title: "Por proveedor", text: "Aquí ves de dónde sale cada número. AssemblyAI aparece como calculado porque no tiene forma de reportar su costo." },
];

// The most recent day that can have costs is yesterday; the default view is its last 14 days.
const latestDay = () => {
  const yesterday = dayjs().subtract(1, "day");
  return yesterday.isBefore(COSTS_START, "day") ? COSTS_START : yesterday;
};
const defaultRange = () => {
  const end = latestDay();
  const start = end.subtract(13, "day");
  return [start.isBefore(COSTS_START, "day") ? COSTS_START : start, end];
};
const short = (date, format = "D MMM") => dayjs(date).locale("es").format(format);

const money = (value) => `US$${(value || 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const providerAmount = (day, id) => day?.providers?.[id]?.amount || 0;
const dayTotal = (day) => PROVIDERS.reduce((sum, provider) => sum + providerAmount(day, provider.id), 0);

function KpiCard({ label, legend, icon, value, loading }) {
  return <Card className="dashboardKpiCard">
    <div className="dashboardKpiTop"><div className="dashboardKpiLabel">{label}</div></div>
    <div className="dashboardKpiValue">
      {loading
        ? <span className="dashboardKpiNumber dashboardKpiLoading"><Spin size="small" /></span>
        : <div className="dashboardKpiValueRow">
          <div className="dashboardKpiValueLeft"><span className="dashboardKpiNumber">{value}</span></div>
          <div className="dashboardKpiIcon" aria-hidden="true">{icon}</div>
        </div>}
    </div>
    <div className="dashboardKpiLegend"><div className="dashboardKpiLegendText">{legend}</div></div>
  </Card>;
}

export default function Costs() {
  const [user] = useState(() => getUser() || {});
  const [range, setRange] = useState(defaultRange);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ from: range[0].format("YYYY-MM-DD"), to: range[1].format("YYYY-MM-DD") });
    fetch(`${API_BASE_URL}/api/costs?${params}`, { headers: { "X-Admin-Email": user.email || "", "X-Auth-Token": user.authToken || "" } })
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        if (!body.ok) throw new Error(body.error || "No se pudieron cargar los costos.");
        setData(body);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, user.email, user.authToken]);

  const days = data?.days || [];
  const latest = data?.latest || null;
  const total = days.reduce((sum, day) => sum + dayTotal(day), 0);
  const calls = days.reduce((sum, day) => sum + (day.calls || 0), 0);
  const hours = days.reduce((sum, day) => sum + (day.audioHours || 0), 0);
  const chartData = days.map((day) => ({
    label: short(day.date),
    total: dayTotal(day),
    ...Object.fromEntries(PROVIDERS.map((provider) => [provider.id, providerAmount(day, provider.id)])),
  }));
  const failed = Object.entries(data?.errors || {});
  function changeRange(value) {
    if (!value) return;
    setLoading(true);
    setError("");
    setRange(value);
  }
  const toggle = (id) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <div className="dashboardPage">
    <Sidebar />
    <GuideTour id="costs" steps={COSTS_TOUR} mascot="/mascots/dots/dot-azul-costos-guia.webp" mascotName="el personaje azul de las cuentas" aura="rgba(0, 64, 164, .45)" />
    <main className="dashboardContent">
      <ConfigProvider theme={{ token: { colorPrimary: "#0040A4", colorInfo: "#0040A4", borderRadius: 18, fontFamily: "Roboto, Helvetica, Arial, sans-serif" } }}>
        <header className="dashboardTopBar">
          <div className="dashboardHeaderTitle">
            <div className="dashboardHeaderText">
              <h1 className="pageTitle">Costos de <span className="titleAccent">procesamiento</span></h1>
              <p className="costsUpdated">
                Se actualiza cada día después de las 10:00 p. m. de Colombia (madrugada en España).
                {data?.collectedAt ? ` Último corte: ${short(data.collectedAt, "D MMM, h:mm a")}` : ""}
              </p>
            </div>
          </div>
          <div className="dashboardTopFilters">
            <div className="dashboardFiltersLabels"><div className="dashboardFilterLabel">Fechas</div></div>
            <div className="dashboardFiltersInputs">
              <DatePicker.RangePicker
                className="dashboardFilterControl costsRange"
                value={range}
                onChange={changeRange}
                format="D MMM YYYY"
                allowClear={false}
                disabledDate={(date) => date.isBefore(COSTS_START, "day") || date.isAfter(dayjs(), "day")}
                placeholder={["Desde", "Hasta"]}
              />
            </div>
            <div className="dashboardFiltersFooter">
              <Button type="text" size="small" className="dashboardClearBtn" onClick={() => changeRange([COSTS_START, dayjs()])}>Ver todo</Button>
            </div>
          </div>
        </header>

        {error && <Alert type="error" showIcon message={error} className="costsAlert" />}
        {failed.length > 0 && <Alert type="warning" showIcon className="costsAlert"
          message="En el último corte no se pudo leer algún proveedor; se muestran sus últimos valores."
          description={failed.map(([id, message]) => `${PROVIDERS.find((provider) => provider.id === id)?.name || id}: ${message}`).join(" · ")} />}

        <section className="dashboardSection">
          <Row gutter={[16, 16]} className="costsKpis">
            <Col xs={24} sm={12} xl={6}><KpiCard loading={loading} label="Total del periodo" legend={`${short(range[0])} – ${short(range[1])}`} icon={<DollarOutlined />} value={money(total)} /></Col>
            <Col xs={24} sm={12} xl={6}><KpiCard loading={loading} label="Último día" legend={latest ? `${short(latest.date)} · ${latest.calls || 0} llamadas` : "Aún sin datos."} icon={<CalendarOutlined />} value={latest ? money(dayTotal(latest)) : "—"} /></Col>
            <Col xs={24} sm={12} xl={6}><KpiCard loading={loading} label="Costo promedio por llamada" legend="Todos los proveedores sumados." icon={<RiseOutlined />} value={calls ? money(total / calls) : "—"} /></Col>
            <Col xs={24} sm={12} xl={6}><KpiCard loading={loading} label="Llamadas procesadas" legend={`${hours.toLocaleString("es-CO", { maximumFractionDigits: 1 })} horas de audio.`} icon={<PhoneOutlined />} value={calls.toLocaleString("es-CO")} /></Col>
          </Row>
        </section>

        <section className="dashboardSection">
          <Card className="dashboardPanel" title="Costo por día" data-tour="costs-daily" extra={<div className="costsLegend">{PROVIDERS.map((provider) => <span key={provider.id}><i style={{ background: provider.color }} />{provider.name}</span>)}</div>}>
            <div className="dashboardChartWrap">
              {loading
                ? <div className="dashboardChartState"><Spin /></div>
                : !days.length
                  ? <div className="dashboardChartState"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Todavía no hay datos para estas fechas. Cada día se suma el anterior después de las 10:00 p. m. de Colombia." /></div>
                  : <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} margin={{ left: 4, right: 8, top: 26, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(4,0,37,0.08)" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `US$${value.toLocaleString("es-CO")}`} width={56} />
                      <Tooltip formatter={(value, name) => [money(value), name]} />
                      {PROVIDERS.map((provider, index) => <Bar key={provider.id} dataKey={provider.id} name={provider.name} stackId="cost" fill={provider.color} barSize={30} radius={index === PROVIDERS.length - 1 ? [6, 6, 0, 0] : 0}>
                        {index === PROVIDERS.length - 1 && <LabelList dataKey="total" position="top" formatter={(value) => money(value)} style={{ fontSize: 11, fontWeight: 700, fill: "#040025" }} />}
                      </Bar>)}
                    </BarChart>
                  </ResponsiveContainer>}
            </div>
          </Card>
        </section>

        <section className="dashboardSection">
          <Card className="dashboardPanel" title="Por proveedor" data-tour="costs-providers">
            <div className="costsTable" role="table">
              <div className="costsRow costsHead" role="row"><span>Proveedor</span><span>Origen del dato</span><span>Último día</span><span>Periodo</span><span>% del total</span><span /></div>
              {PROVIDERS.map((provider) => {
                const sum = days.reduce((acc, day) => acc + providerAmount(day, provider.id), 0);
                const isOpen = open.has(provider.id);
                const byItem = {};
                for (const day of days) {
                  for (const [item, value] of Object.entries(day.providers?.[provider.id]?.details || {})) byItem[item] = (byItem[item] || 0) + value;
                }
                const latestItems = latest?.providers?.[provider.id]?.details || {};
                return <div key={provider.id}>
                  <button type="button" className="costsRow" aria-expanded={isOpen} onClick={() => toggle(provider.id)}>
                    <span className="costsProvider"><i style={{ background: provider.color }} />{provider.name}</span>
                    <span><em className={`costsSource ${provider.calculated ? "calculated" : ""}`}>{provider.source}</em></span>
                    <span>{money(providerAmount(latest, provider.id))}</span>
                    <span><b>{money(sum)}</b></span>
                    <span className="costsPct">{total ? Math.round((sum / total) * 100) : 0} %</span>
                    <span className="costsChevron">›</span>
                  </button>
                  {isOpen && <div className="costsDetail">
                    {Object.keys(byItem).length
                      ? Object.entries(byItem).sort((a, b) => b[1] - a[1]).map(([item, value]) => <div className="costsRow costsSub" key={item}><span>{item}</span><span /><span>{money(latestItems[item])}</span><span>{money(value)}</span><span /><span /></div>)
                      : <p>Sin gasto en este periodo.</p>}
                  </div>}
                </div>;
              })}
              <div className="costsRow costsFoot" role="row"><span>Total</span><span /><span>{money(dayTotal(latest))}</span><span>{money(total)}</span><span>100 %</span><span /></div>
            </div>
          </Card>
        </section>
      </ConfigProvider>
    </main>
  </div>;
}
