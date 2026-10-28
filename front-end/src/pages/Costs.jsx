import { useEffect, useState } from "react";
import { Button, Card, Col, ConfigProvider, DatePicker, Empty, Row, Select, Spin } from "antd";
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
  { target: ".costsTech", title: "Una tecnología o un modelo", text: "Mira solo un proveedor, o un modelo de OpenAI o Claude, para comparar cuánto cuesta cada uno." },
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
// Per-call costs are a few cents, so they keep three decimals.
const moneyPerCall = (value) => `US$${(value || 0).toLocaleString("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const providerAmount = (day, id) => day?.providers?.[id]?.amount || 0;
const dayTotal = (day) => PROVIDERS.reduce((sum, provider) => sum + providerAmount(day, provider.id), 0);

// Mirrors modelName in back-end/src/services/costReport.js, for days stored before it grouped by model.
const modelName = (item) => String(item || "").split(",")[0].trim().toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, "");
const AI_PROVIDERS = new Set(["openai", "claude"]);
const providerOfModel = (model) => (model.startsWith("claude") ? "claude" : "openai");

// The Tecnología filter: "all", a provider id, or one model of OpenAI or Claude ("openai:gpt-5.5").
const parseTech = (tech) => { const [providerId, model = null] = tech.split(":"); return { providerId, model }; };
function modelAmounts(day, providerId) {
  const amounts = {};
  for (const [item, value] of Object.entries(day?.providers?.[providerId]?.details || {})) amounts[modelName(item)] = (amounts[modelName(item)] || 0) + value;
  return amounts;
}
function amountFor(day, tech) {
  if (!day) return 0;
  if (tech === "all") return dayTotal(day);
  const { providerId, model } = parseTech(tech);
  return model ? modelAmounts(day, providerId)[model] || 0 : providerAmount(day, providerId);
}

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
  const [tech, setTech] = useState("all");

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
  const callsByModel = data?.callsByModel || {};
  const { providerId: techProvider, model: techModel } = parseTech(tech);
  const total = days.reduce((sum, day) => sum + amountFor(day, tech), 0);
  const allCalls = days.reduce((sum, day) => sum + (day.calls || 0), 0);
  const hours = days.reduce((sum, day) => sum + (day.audioHours || 0), 0);
  // OpenAI and Claude count only the calls their models graded; the rest serve every call.
  const modelCalls = (model) => callsByModel[model] || 0;
  const calls = techModel ? modelCalls(techModel)
    : AI_PROVIDERS.has(techProvider) ? Object.entries(callsByModel).filter(([model]) => providerOfModel(model) === techProvider).reduce((sum, [, count]) => sum + count, 0)
      : allCalls;
  const modelsUsed = (providerId) => [...new Set([...days.flatMap((day) => Object.keys(modelAmounts(day, providerId))), ...Object.keys(callsByModel).filter((model) => providerOfModel(model) === providerId)])].sort();
  const techOptions = [
    { value: "all", label: "Todas las tecnologías" },
    ...PROVIDERS.flatMap((provider) => [
      { value: provider.id, label: provider.name },
      ...(AI_PROVIDERS.has(provider.id) ? modelsUsed(provider.id).map((model) => ({ value: `${provider.id}:${model}`, label: model, isModel: true })) : []),
    ]),
  ];
  const series = tech === "all"
    ? PROVIDERS.map((provider) => ({ key: provider.id, name: provider.name, color: provider.color }))
    : [{ key: "value", name: techModel || PROVIDERS.find((provider) => provider.id === techProvider)?.name, color: PROVIDERS.find((provider) => provider.id === techProvider)?.color }];
  const chartData = days.map((day) => ({
    label: short(day.date),
    total: amountFor(day, tech),
    value: amountFor(day, tech),
    ...Object.fromEntries(PROVIDERS.map((provider) => [provider.id, providerAmount(day, provider.id)])),
  }));
  const shownProviders = tech === "all" ? PROVIDERS : PROVIDERS.filter((provider) => provider.id === techProvider);
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
        <header className="dashboardTopBar costsTopBar">
          <div className="dashboardHeaderTitle">
            <div className="dashboardHeaderText">
              <h1 className="pageTitle">Costos de <span className="titleAccent">procesamiento</span></h1>
              {latest && <p className="costsUpdated">Datos hasta el {short(latest.date, "D [de] MMMM")}</p>}
              {error && <p className="costsUpdated costsError">{error}</p>}
            </div>
          </div>
          <div className="dashboardTopFilters">
            <div className="dashboardFiltersLabels">
              <div className="dashboardFilterLabel">Mes</div>
              <div className="dashboardFilterLabel">Semana</div>
              <div className="dashboardFilterLabel">Fechas</div>
              <div className="dashboardFilterLabel">Tecnología</div>
            </div>
            <div className="dashboardFiltersInputs">
              <DatePicker className="dashboardFilterControl" picker="month" placeholder="Mes" allowClear={false} value={valueFor("month")} onChange={(value) => choose("month", value)} disabledDate={outsideMonths} format={(value) => short(value, "MMMM YYYY")} />
              <DatePicker className="dashboardFilterControl" picker="week" placeholder="Semana" allowClear={false} value={valueFor("week")} onChange={(value) => choose("week", value)} disabledDate={outsideDays} presets={WEEK_PRESETS} format={formatWeek} />
              <DatePicker.RangePicker className="dashboardFilterControl costsRange" placeholder={["Desde", "Hasta"]} allowClear={false} value={valueFor("range")} onChange={(value) => choose("range", value)} disabledDate={outsideDays} format="D MMM YYYY" />
              <Select
                className="dashboardFilterControl costsTech"
                value={tech}
                onChange={setTech}
                options={techOptions}
                optionRender={(option) => <span className={option.data.isModel ? "costsTechModel" : "costsTechProvider"}>{option.data.label}</span>}
                popupMatchSelectWidth={false}
                aria-label="Filtrar por tecnología o modelo"
              />
            </div>
            <div className="dashboardFiltersFooter">
              <Button type="text" size="small" className="dashboardClearBtn" onClick={() => { setTech("all"); choose("range", [COSTS_START, dayjs()]); }}>Ver todo</Button>
            </div>
          </div>
        </header>


        <section className="dashboardSection">
          <Row gutter={[16, 16]} className="costsKpis">
            <Col xs={24} sm={12} xl={6}><KpiCard loading={loading} label="Total del periodo" legend={`${short(range[0])} – ${short(range[1])}`} icon={<DollarOutlined />} value={money(total)} /></Col>
            <Col xs={24} sm={12} xl={6}><KpiCard loading={loading} label="Último día" legend={latest ? `${short(latest.date)} · ${latest.calls || 0} llamadas` : "Aún sin datos."} icon={<CalendarOutlined />} value={latest ? money(amountFor(latest, tech)) : "—"} /></Col>
            <Col xs={24} sm={12} xl={6}><KpiCard loading={loading} label="Costo promedio por llamada" legend={tech === "all" ? "Todos los proveedores sumados." : `Solo ${techModel || PROVIDERS.find((provider) => provider.id === techProvider)?.name}.`} icon={<RiseOutlined />} value={calls ? moneyPerCall(total / calls) : "—"} /></Col>
            <Col xs={24} sm={12} xl={6}><KpiCard loading={loading} label="Llamadas procesadas" legend={AI_PROVIDERS.has(techProvider) ? "Calificadas con esta tecnología." : `${hours.toLocaleString("es-CO", { maximumFractionDigits: 1 })} horas de audio.`} icon={<PhoneOutlined />} value={calls.toLocaleString("es-CO")} /></Col>
          </Row>
        </section>

        <section className="dashboardSection">
          <Card className="dashboardPanel" title="Costo por día" data-tour="costs-daily" extra={<div className="costsLegend">{series.map((entry) => <span key={entry.key}><i style={{ background: entry.color }} />{entry.name}</span>)}</div>}>
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
                      {series.map((entry, index) => <Bar key={entry.key} dataKey={entry.key} name={entry.name} stackId="cost" fill={entry.color} barSize={30} radius={index === series.length - 1 ? [6, 6, 0, 0] : 0}>
                        {index === series.length - 1 && <LabelList dataKey="total" position="top" formatter={(value) => money(value)} style={{ fontSize: 11, fontWeight: 700, fill: "#040025" }} />}
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
              {shownProviders.map((provider) => {
                const isAi = AI_PROVIDERS.has(provider.id);
                const onlyModel = techModel && techProvider === provider.id ? techModel : null;
                const sum = days.reduce((acc, day) => acc + (onlyModel ? amountFor(day, tech) : providerAmount(day, provider.id)), 0);
                const isOpen = open.has(provider.id) || Boolean(onlyModel);
                const byItem = {};
                for (const day of days) {
                  const items = isAi ? modelAmounts(day, provider.id) : day.providers?.[provider.id]?.details || {};
                  for (const [item, value] of Object.entries(items)) if (!onlyModel || item === onlyModel) byItem[item] = (byItem[item] || 0) + value;
                }
                if (isAi) for (const model of modelsUsed(provider.id)) if (!onlyModel || model === onlyModel) byItem[model] ||= 0;
                const latestItems = isAi ? modelAmounts(latest, provider.id) : latest?.providers?.[provider.id]?.details || {};
                const efficiency = (model, value) => {
                  const count = modelCalls(model);
                  return count ? `${count.toLocaleString("es-CO")} llamadas · ${moneyPerCall(value / count)} por llamada` : "Sin llamadas calificadas";
                };
                return <div key={provider.id}>
                  <button type="button" className="costsRow" aria-expanded={isOpen} onClick={() => toggle(provider.id)}>
                    <span className="costsProvider"><i style={{ background: provider.color }} />{provider.name}</span>
                    <span><em className={`costsSource ${provider.calculated ? "calculated" : ""}`}>{provider.source}</em>{stale.has(provider.id) && <em className="costsStale" title="En el último corte no respondió; se muestran sus valores anteriores.">Sin actualizar</em>}</span>
                    <span>{money(onlyModel ? amountFor(latest, tech) : providerAmount(latest, provider.id))}</span>
                    <span><b>{money(sum)}</b></span>
                    <span className="costsPct">{total ? Math.round((sum / total) * 100) : 0} %</span>
                    <span className="costsChevron">›</span>
                  </button>
                  {isOpen && <div className="costsDetail">
                    {Object.keys(byItem).length
                      ? Object.entries(byItem).sort((a, b) => b[1] - a[1]).map(([item, value]) => <div className="costsRow costsSub" key={item}><span>{item}</span><span className="costsEfficiency">{isAi ? efficiency(item, value) : ""}</span><span>{money(latestItems[item])}</span><span>{money(value)}</span><span /><span /></div>)
                      : <p>Sin gasto en este periodo.</p>}
                  </div>}
                </div>;
              })}
              <div className="costsRow costsFoot" role="row"><span>Total</span><span /><span>{money(amountFor(latest, tech))}</span><span>{money(total)}</span><span>100 %</span><span /></div>
            </div>
          </Card>
        </section>
      </ConfigProvider>
    </main>
  </div>;
}
