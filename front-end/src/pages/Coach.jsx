import { useEffect, useState } from "react";
import { ConfigProvider, Spin } from "antd";
import Sidebar from "../components/Sidebar";
import GuideTour from "../components/GuideTour";
import MetricsTabs from "../components/MetricsTabs";
import WaCard from "../components/WaCard";
import MiCamino from "../components/MiCamino";
import PersonChips from "../components/PersonChips";
import { badgeSrc, ruleBadge } from "../utils/badges";
import { getUser } from "../utils/user";
import { seesAll } from "../utils/roles";
import "./Dashboard.css";
import "./Coach.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const STAGE_COLOR = { Inminente: "#8ABC43", "Negociación": "#2885FF", Seguimiento: "#FBB42A", "Gestión LP": "#FF5900" };
const VAL = { ok: ["ok", "✓ Confirmado"], pa: ["pa", "◑ Parcial"], pe: ["pe", "○ Pendiente"] };
const LEVEL_ORDER = ["no_lo_hizo", "debil", "regular", "bien", "excelente"];
const notaColor = (value) => (value >= 70 ? "#5E8C1F" : value >= 45 ? "#C98A00" : "#D9480F");
const barColor = (value) => (value >= 70 ? "#8ABC43" : value >= 45 ? "#FBB42A" : "#FF5900");
const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
const formatScore = (value) => (value == null ? "—" : Number(value).toLocaleString("es-CO"));
const share = (score) => (score && score.possible > 0 ? (100 * score.earned) / score.possible : null);

// The insignia closest to being won in the first phase still open: most Excelente/Bien in the recent calls.
function nextInsignia(path) {
  const phase = path?.phases.find((entry) => !entry.earned);
  if (!phase) return null;
  const rule = phase.rules.filter((entry) => entry.state !== "earned" && entry.state !== "risk")
    .sort((a, b) => b.recent.filter(Boolean).length - a.recent.filter(Boolean).length)[0];
  if (!rule) return null;
  const good = rule.recent.filter(Boolean).length;
  return { rule, phase, missing: Math.max(1, path.needed - good), good, window: path.window };
}

const COACH_TOUR = [
  { title: "¡Hola! Aquí está tu coach", text: "Te muestro lo que haces bien, lo que puedes mejorar y el siguiente paso con cada lead." },
  { target: ".coachMatrix", title: "Matriz de calidad", text: "Cada barra es una fase del speech: los puntos que sacas de media por llamada, de los que vale. La raya marca la media del equipo." },
  { target: ".coachBadgesCard", title: "Foco de mejora", text: "Las tres reglas donde más puntos se pierden por llamada, cada una con su consejo, y tu próxima insignia." },
  { target: ".camCard", title: "Mi camino", text: "Cada regla del speech tiene su insignia: la ganas con Excelente o Bien en 3 de tus últimas 5 llamadas. Con todas las de una fase, ganas la de la fase." },
  { target: ".coachLeads", title: "Mis leads", text: "Cada llamada con su interés, su nota y las validaciones. Haz clic en una para ver su ficha y enviar el mensaje de WhatsApp." },
];

function LeadCard({ lead, headers, onClose, onFollowUpDone }) {
  const [report, setReport] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/sessions/${lead.id}`, { headers })
      .then((response) => response.json())
      .then((data) => { if (!cancelled && data.ok) setReport(data.report); })
      .catch(() => { /* the card still shows what the list already has */ });
    return () => { cancelled = true; };
  }, [lead.id, headers]);

  const analysis = report?.analysis || {};
  const rules = new Map((report?.speechSnapshot?.rules || []).map((rule) => [rule.id, rule.title]));
  const fix = (report?.scoring?.items || [])
    .filter((item) => rules.has(item.ruleId) && item.como_mejorar && item.level !== "no_aplica")
    .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level))[0];
  const said = [
    ...(analysis.objeciones || []).map((objection) => [objection.categoria || "Objeción", objection.descripcion]),
    ...(analysis.seguimiento?.frase_cliente ? [["Dijo", analysis.seguimiento.frase_cliente]] : []),
  ].filter(([, text]) => text);
  const unresolved = (analysis.objeciones || []).filter((objection) => objection.resuelta === false).map((objection) => objection.descripcion);

  async function markFollowUp(id, action) {
    try { await fetch(`${API_BASE_URL}/api/followups/${id}/${action}`, { method: "PATCH", headers }); } catch { /* se refresca igual */ }
    onFollowUpDone();
  }

  return <div className="coachOverlay" onMouseDown={onClose}>
    <div className="coachDialog" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-label={`Ficha de ${lead.client}`}>
      <header className="coachDialogHead"><div><h3>{lead.client}</h3><span>Llamada del {shortDate(lead.date)}{lead.duration ? ` · ${lead.duration}` : ""} · nota {formatScore(lead.score)} pts</span></div><button type="button" onClick={onClose} aria-label="Cerrar">×</button></header>
      <div className="coachDialogBody">
        <div className="coachTags">{lead.stage && <span>{lead.stage}</span>}{lead.interest != null && <span>interés {lead.interest}</span>}{analysis.tipo_compromiso_cierre && <span>compromiso {analysis.tipo_compromiso_cierre}</span>}</div>
        {!report ? <div className="coachLoading"><Spin /></div> : <>
          <div className="coachTwo">
            <div className="coachFcard"><div className="hd lt">Quién es y qué busca</div><div className="bd">
              {(analysis.necesidades || []).length ? <ul>{analysis.necesidades.map((need) => <li key={need}>{need}</li>)}</ul> : <p>Sin necesidades registradas.</p>}
            </div></div>
            <div className="coachFcard"><div className="hd lt">Lo que dijo</div><div className="bd">
              {said.length ? said.map(([tag, text]) => <div key={text} className="coachSaid"><span>{tag}</span><p>«{text}»</p></div>) : <p>Sin objeciones claras.</p>}
            </div></div>
          </div>
          {lead.next && <div className="coachNext"><small>→ Siguiente paso acordado</small><b>{lead.next}</b></div>}
          <div className="coachTwo">
            <div className="coachFcard"><div className="hd pe">⚠ Mejora comercial</div><div className="bd">
              {fix ? <><b>{rules.get(fix.ruleId)}</b><p>{fix.como_mejorar}</p></> : <p>Sin observaciones en esta llamada.</p>}
            </div></div>
            <div className="coachFcard"><div className="hd gr">⚑ Señales y riesgo</div><div className="bd">
              <p>{analysis.momento_precio?.descripcion || "Sin señales registradas."}</p>
              {unresolved.length > 0 && <><small>Pendiente</small><p>{unresolved.join(" · ")}</p></>}
            </div></div>
          </div>
        </>}
        {lead.followUp && <div className="coachBand"><div className="cbt">✦ Recomendación del coach</div>
          <WaCard followUp={lead.followUp} onSent={(id) => markFollowUp(id, "enviado")} onDismiss={(id) => markFollowUp(id, "rechazado")} />
        </div>}
        <div className="coachNote">El resumen, la nota y la recomendación salen del análisis de la grabación en Speech. Son una propuesta: la decisión del siguiente paso es tuya.</div>
      </div>
    </div>
  </div>;
}

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

// Mi camino with its own person filter ("Yo" and each person; insignias are personal, so no team option).
function CaminoSection({ headers, user, options }) {
  const [who, setWho] = useState("me");
  const [state, setState] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/metrics/coach/path?${new URLSearchParams({ consultant: who })}`, { headers })
      .then((response) => response.json())
      .then((body) => { if (!cancelled && body.ok && body.path) setState(body); })
      .catch(() => { /* el resto de Coach sigue funcionando */ });
    return () => { cancelled = true; };
  }, [who, headers]);
  if (!state) return null;
  const own = state.owner === String(user.email || "").toLowerCase();
  const person = options.find((option) => option.value === state.owner);
  return <MiCamino key={state.owner} path={state.path} own={own}
    title={own ? "Tu camino" : `Camino de ${person?.fullName || state.owner}`}
    storageKey={`kinedrik_camino_${user.email || ""}`}
    filter={options.length > 1 ? <PersonChips options={options} value={who} onChange={setWho} label="Ver el camino de" /> : null} />;
}

export default function Coach() {
  const [user] = useState(() => getUser() || {});
  const viewsEveryone = seesAll(user);
  const [headers] = useState(() => ({ "X-Admin-Email": user.email || "", "X-Auth-Token": user.authToken || "" }));
  const [consultant, setConsultant] = useState("me");
  const [people, setPeople] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const myEmail = String(user.email || "").toLowerCase();

  useEffect(() => {
    if (!viewsEveryone) return;
    fetch(`${API_BASE_URL}/api/admin/dashboard-consultants`, { headers })
      .then((response) => response.json())
      .then((body) => { if (body.ok) setPeople(body.consultants); })
      .catch(() => { /* sin lista, solo "Yo" y "Equipo" */ });
  }, [viewsEveryone, headers]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ consultant });
    fetch(`${API_BASE_URL}/api/metrics/coach?${params}`, { headers })
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        if (!body.ok) throw new Error(body.error || "No se pudieron cargar las métricas.");
        setData(body);
        setError("");
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [consultant, headers, refresh]);

  // Only people with calls on the active speech, so nobody shows up empty.
  const me = { value: "me", label: "Yo", fullName: user.fullName, email: myEmail, picture: user.picture };
  const others = people.filter((person) => person.value !== myEmail && (data?.teamEmails || []).includes(person.value))
    .map((person) => ({ ...person, fullName: person.label }));
  const metricOptions = viewsEveryone ? [me, { value: "all", label: "Equipo" }, ...others] : [];
  const caminoOptions = viewsEveryone ? [me, ...others] : [me];

  // Texts speak to whoever is being looked at: you, another person or the team.
  const viewing = consultant === "me" ? "me" : consultant === "all" ? "team" : "person";
  const first = firstName(viewing === "me" ? user.fullName : others.find((person) => person.value === consultant)?.label);
  const t = {
    me: { title: [`${first ? `${first}, lo` : "Lo"} que haces bien.`, "Lo que puedes mejorar."], legend: "Tu media", repeated: "Lo que más se me repite", focus: "dónde más puntos pierdes", next: "Tu próxima insignia", recent: "tus últimas", missing: "te", leads: "Mis leads" },
    person: { title: [`${first}: lo que hace bien.`, "Lo que puede mejorar."], legend: `Media de ${first}`, repeated: `Lo que más se le repite a ${first}`, focus: `dónde más puntos pierde ${first}`, next: `Próxima insignia de ${first}`, recent: "sus últimas", missing: "le", leads: `Leads de ${first}` },
    team: { title: ["El equipo: lo que hace bien.", "Lo que puede mejorar."], legend: "Media del equipo", repeated: "Lo que más se repite en el equipo", focus: "dónde más puntos pierde el equipo", next: "", recent: "", missing: "", leads: "Leads del equipo" },
  }[viewing];

  const showTeam = viewing !== "team";
  const pendingWa = (data?.leads || []).filter((lead) => lead.waPending).length;
  const next = nextInsignia(data?.path);
  const leads = [...(data?.leads || [])].sort((a, b) => (b.interest ?? -1) - (a.interest ?? -1));

  return <div className="dashboardPage">
    <Sidebar />
    {data && !data.legacy && <GuideTour id="coach" steps={COACH_TOUR} mascot="/mascots/dots/dot-amarillo-analitico-guia.webp" mascotName="el personaje amarillo" aura="rgba(251, 180, 42, .55)" />}
    <main className="dashboardContent">
      <MetricsTabs />
      <ConfigProvider theme={{ token: { colorPrimary: "#0040A4", borderRadius: 12, fontFamily: "Roboto, Helvetica, Arial, sans-serif" } }}>
        <div className="coachVh">
          <h2>{t.title[0]}<br />{t.title[1]}</h2>
          {metricOptions.length > 0 && <PersonChips options={metricOptions} value={consultant} onChange={setConsultant} label="Ver las métricas de" />}
        </div>

        {error && <p className="coachError">{error}</p>}
        {!data && !error && <div className="coachLoading"><Spin /></div>}
        {data?.legacy && <p className="coachEmpty">El speech activo es del formato anterior. Coach funciona con speech por puntos.</p>}

        {data && !data.legacy && <>
          <div className="coachGrid">
            <div className="coachCard coachMatrix">
              <div className="coachCardHead"><h3>Matriz de calidad</h3><span className="coachChip">puntos por llamada</span></div>
              <div className="coachLegend"><span><i />{t.legend}</span>{showTeam && <span><s />Media del equipo</span>}</div>
              {data.phases.map((phase) => <div key={phase.id} className="coachPhase" title={phase.rules.join(" · ")}>
                <div className="coachPhaseTop"><span><b>{phase.name}</b> <em>{phase.points} pts</em></span>
                  <span>{phase.mine == null ? <em>sin llamadas</em> : <><b style={{ color: notaColor(share(phase.mine)) }}>{formatScore(phase.mine.earned)}</b> <em>de {formatScore(phase.mine.possible)}{showTeam && phase.team ? ` · equipo ${formatScore(phase.team.earned)}` : ""}</em></>}</span></div>
                <div className="coachTrack"><i style={{ width: `${share(phase.mine) ?? 0}%`, background: barColor(share(phase.mine) ?? 0) }} />{showTeam && phase.team && <s style={{ left: `${share(phase.team)}%` }} />}</div>
              </div>)}
              <p className="coachMut">Pasa el ratón por cada fase para ver sus reglas.</p>
              <p className="coachLbl">{t.repeated}</p>
              {data.repeated.length ? data.repeated.map((rule) => <div key={rule.title} className="coachRep"><span>{rule.title}</span><i><u style={{ width: `${(100 * rule.pct) / data.repeated[0].pct}%` }} /></i><b>{rule.pct}%</b></div>)
                : <p className="coachMut">Nada que se repita todavía.</p>}
              <p className="coachMut">Equipo: {data.counts.team} llamadas analizadas con «{data.speech.name}».</p>
            </div>

            <div className="coachCard coachBadgesCard">
              <div className="coachCardHead"><h3>Foco de mejora</h3><span className="coachChip">{t.focus}</span></div>
              {data.improvements?.length ? <ol className="coachImprove">
                {data.improvements.map((entry, index) => <li key={entry.ruleId} className={index === 0 ? "main" : ""}>
                  <span className="coachImproveNum" aria-hidden="true">{index + 1}</span>
                  <div>
                    <b>{entry.title}</b>
                    <small>{entry.phase} · se pierden {formatScore(entry.lostPerCall)} de {entry.points} pts por llamada · Excelente o Bien en el {entry.goodPct} %</small>
                    {entry.tip && <p>{entry.tip}</p>}
                  </div>
                </li>)}
              </ol> : <p className="coachMut">Todavía no hay llamadas con el speech activo para calcularlo.</p>}
              {next && t.next && <div className="coachNextBadge">
                {ruleBadge(next.rule) && <img src={badgeSrc(ruleBadge(next.rule))} alt="" />}
                <div><small>{t.next}</small><b>{next.rule.title}</b><span>{next.phase.name} · Excelente o Bien en {next.good} de {t.recent} {next.window} · {t.missing} {next.missing === 1 ? "falta 1" : `faltan ${next.missing}`}</span></div>
              </div>}
            </div>
          </div>

          <CaminoSection headers={headers} user={user} options={caminoOptions} />

          <div className="coachCard coachLeads">
            <div className="coachNavhd"><div><h3>{t.leads}</h3><span>{leads.length} conversaciones analizadas · ordenadas por interés · pulsa una fila para abrir la ficha</span></div>
              {pendingWa > 0 ? <span className="coachChipDark">💬 {pendingWa} {pendingWa === 1 ? "mensaje" : "mensajes"} por enviar</span> : <span className="coachChipDark">Validaciones por llamada</span>}</div>
            <div className="coachTableWrap"><table className="coachTable">
              <thead><tr><th>Lead · perfil</th><th>En qué punto está</th><th className="num">Interés</th><th className="num">Nota</th>{data.validations.map((label) => <th key={label}>{label}</th>)}</tr></thead>
              <tbody>{leads.map((lead) => <tr key={lead.id} onClick={() => setOpen(lead)}>
                <td><b>{lead.client}</b>{lead.waPending && <span className="coachWaDot" title="Mensaje de WhatsApp por enviar">💬 por enviar</span>}<em>{shortDate(lead.date)}{lead.duration ? ` · ${lead.duration}` : ""}</em></td>
                <td>{lead.stage ? <><span className="coachDot" style={{ background: STAGE_COLOR[lead.stage] || "#94a3b8" }} />{lead.stage}</> : "—"}</td>
                <td className="num" style={{ color: "#D9480F" }}><b>{lead.interest ?? "—"}</b></td>
                <td className="num" style={{ color: notaColor(lead.score ?? 0) }}><b>{formatScore(lead.score)}</b></td>
                {lead.validations.map((check, index) => <td key={index}>{check ? <span className={`coachVch ${VAL[check.state][0]}`} title={check.why}>{VAL[check.state][1]}</span> : <span className="coachMut">—</span>}</td>)}
              </tr>)}</tbody>
            </table></div>
            {!leads.length && <p className="coachMut">Todavía no hay llamadas analizadas con este speech.</p>}
            <div className="coachLeg"><span className="coachVch ok">✓ Confirmado</span><span className="coachVch pa">◑ Parcial</span><span className="coachVch pe">○ Pendiente</span><span>Sale de las reglas del speech conectadas a cada validación y de lo que dijo el lead.</span></div>
          </div>
        </>}
      </ConfigProvider>
    </main>
    {open && <LeadCard lead={open} headers={headers} onClose={() => setOpen(null)} onFollowUpDone={() => { setOpen(null); setRefresh((value) => value + 1); }} />}
  </div>;
}
