import { useEffect, useState } from "react";
import { Button, Card, Col, ConfigProvider, DatePicker, Empty, Row, Spin } from "antd";
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
  { target: ".dashboardTopFilters", title: "Elige el periodo", text: "Escoge un mes, una semana o fechas exactas. Todo se actualiza con tu elección." },
  { target: ".costsKpis", title: "Las cifras clave", text: "El total del periodo, lo del último día, cuánto cuesta en promedio cada llamada y cuántas se procesaron." },
  { target: '[data-tour="costs-daily"]', title: "Día por día", text: "Cada barra es un día y cada color, un proveedor. Encima ves el total del día." },
  { target: '[data-tour="costs-providers"]', title: "Por proveedor", text: "Aquí ves de dónde sale cada número. AssemblyAI aparece como calculado porque no tiene forma de reportar su costo." },
];

const short = (date, format = "D MMM") => dayjs(date).locale("es").format(format);

// The period is a month, a calendar week (Monday to Sunday) or exact dates; picking one clears the others.
const mondayOf = (date) => date.subtract((date.day() + 6) % 7, "day").startOf("day");
const notAfterToday = (date) => (date.isAfter(dayjs(), "day") ? dayjs() : date);
function rangeOf({ kind, value }) {
  if (kind === "month") return [value.startOf("month"), notAfterToday(value.endOf("month"))];
  if (kind === "week") return [mondayOf(value), notAfterToday(mondayOf(value).add(6, "day"))];
  return value;
}
const formatWeek = (value) => `${short(mondayOf(value))} – ${short(mondayOf(value).add(6, "day"))}`;
const WEEK_PRESETS = [
  { label: "Esta semana", value: () => dayjs() },
  { label: "Semana pasada", value: () => dayjs().subtract(1, "week") },
];
const outsideDays = (date) => date.isBefore(COSTS_START, "day") || date.isAfter(dayjs(), "day");
const outsideMonths = (date) => date.endOf("month").isBefore(COSTS_START, "day") || date.startOf("month").isAfter(dayjs(), "day");

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
  const [selection, setSelection] = useState(() => ({ kind: "month", value: dayjs() }));
  const range = rangeOf(selection);
  const from = range[0].format("YYYY-MM-DD");
  const to = range[1].format("YYYY-MM-DD");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ from, to });
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
  }, [from, to, user.email, user.authToken]);

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
  // A provider that could not be read keeps its last values; its row just says it is not up to date.
  const stale = new Set(Object.keys(data?.errors || {}));
  function choose(kind, value) {
    if (!value) return;
    setLoading(true);
    setError("");
    setSelection({ kind, value });
  }
  const valueFor = (kind) => (selection.kind === kind ? selection.value : null);
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
              {data?.collectedAt && <p className="costsUpdated">Último corte: {short(data.collectedAt, "D [de] MMMM")}</p>}
              {error && <p className="costsUpdated costsError">{error}</p>}
            </div>
          </div>
          <div className="dashboardTopFilters">
            <div className="dashboardFiltersLabels">
              <div className="dashboardFilterLabel">Mes</div>
              <div className="dashboardFilterLabel">Semana</div>
              <div className="dashboardFilterLabel">Fechas</div>
            </div>
            <div className="dashboardFiltersInputs">
              <DatePicker className="dashboardFilterControl" picker="month" placeholder="Mes" allowClear={false} value={valueFor("month")} onChange={(value) => choose("month", value)} disabledDate={outsideMonths} format={(value) => short(value, "MMMM YYYY")} />
              <DatePicker className="dashboardFilterControl" picker="week" placeholder="Semana" allowClear={false} value={valueFor("week")} onChange={(value) => choose("week", value)} disabledDate={outsideDays} presets={WEEK_PRESETS} format={formatWeek} />
              <DatePicker.RangePicker className="dashboardFilterControl costsRange" placeholder={["Desde", "Hasta"]} allowClear={false} value={valueFor("range")} onChange={(value) => choose("range", value)} disabledDate={outsideDays} format="D MMM YYYY" />
            </div>
            <div className="dashboardFiltersFooter">
              <Button type="text" size="small" className="dashboardClearBtn" onClick={() => choose("range", [COSTS_START, dayjs()])}>Ver todo</Button>
            </div>
          </div>
        </header>


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
                  ? <div className="dashboardChartState"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin datos para estas fechas." /></div>
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
                    <span><em className={`costsSource ${provider.calculated ? "calculated" : ""}`}>{provider.source}</em>{stale.has(provider.id) && <em className="costsStale" title="En el último corte no respondió; se muestran sus valores anteriores.">Sin actualizar</em>}</span>
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
