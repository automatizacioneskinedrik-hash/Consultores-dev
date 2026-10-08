import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { getUser } from "../utils/user";
import "./SpeechConfig.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const TOTAL_POINTS = 100;
const GENERAL_GROUP_ID = "GENERAL";
const AUTOSAVE_DELAY = 800;
const SPEECH_TABS = [
  ["version", "Versión"],
  ["history", "Historial"],
];

const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const sumPoints = (rules) => rules.reduce((sum, rule) => sum + (Number(rule.points) || 0), 0);

// Gradient of brand blues (Navy → Kinedrik Blue → Digital Blue) for the points bar segments.
const BLUE_STOPS = [[4, 0, 37], [0, 64, 164], [40, 133, 255]];
function blueShade(index, count) {
  const position = count > 1 ? (index / (count - 1)) * (BLUE_STOPS.length - 1) : 0;
  const stop = Math.min(Math.floor(position), BLUE_STOPS.length - 2);
  const ratio = position - stop;
  const [r, g, b] = BLUE_STOPS[stop].map((value, channel) => Math.round(value + (BLUE_STOPS[stop + 1][channel] - value) * ratio));
  return `rgb(${r}, ${g}, ${b})`;
}

function editableCopy(speech) {
  const { format, name, description, phases, rules, talkRatio, muletillas } = structuredClone(speech);
  return { format, name, description: description || "", changeNote: "", phases, rules, talkRatio, muletillas };
}

// Older drafts kept talk ratio and muletillas as rules in a "Toda la llamada" group; move them to their indicators.
const LEGACY_RATIO_RULE_ID = "general-participacion";
const LEGACY_MULETILLAS_RULE_ID = "general-muletillas";
function withIndicators(speech, template) {
  if (!speech) return speech;
  const hasRatio = Array.isArray(speech.talkRatio?.limits);
  const hasMuletillas = Number.isInteger(speech.muletillas?.points);
  if (hasRatio && hasMuletillas && !speech.rules.some((rule) => rule.phaseId === GENERAL_GROUP_ID)) return speech;
  const legacyPoints = (id) => speech.rules.find((rule) => rule.id === id)?.points;
  const lastPhaseId = speech.phases[speech.phases.length - 1]?.id;
  return {
    ...speech,
    rules: speech.rules
      .filter((rule) => rule.id !== LEGACY_RATIO_RULE_ID && rule.id !== LEGACY_MULETILLAS_RULE_ID)
      .map((rule) => rule.phaseId === GENERAL_GROUP_ID ? { ...rule, phaseId: lastPhaseId } : rule),
    talkRatio: hasRatio ? speech.talkRatio : { limits: [...template.talkRatio.limits], points: speech.talkRatio?.points ?? legacyPoints(LEGACY_RATIO_RULE_ID) ?? template.talkRatio.points },
    muletillas: hasMuletillas ? speech.muletillas : { ...structuredClone(template.muletillas), points: legacyPoints(LEGACY_MULETILLAS_RULE_ID) ?? template.muletillas.points },
  };
}

// Traffic light on brand colors: blue is the ideal, then green, yellow and orange; grey gives no points.
const RATIO_ZONES = [
  { name: "Ideal", color: "#0040A4", factor: 1 },
  { name: "Bien", color: "#8ABC43", factor: 0.75 },
  { name: "Regular", color: "#FBB42A", factor: 0.5 },
  { name: "Débil", color: "#FF5900", factor: 0.25 },
];

function TalkRatioSlider({ ratio, editable, onChange }) {
  const { limits, points } = ratio;
  function moveLimit(index, value) {
    const low = index === 0 ? 1 : limits[index - 1] + 1;
    const high = index === limits.length - 1 ? 100 : limits[index + 1] - 1;
    onChange({ ...ratio, limits: limits.map((limit, position) => position === index ? Math.max(low, Math.min(high, value)) : limit) });
  }
  const formatPoints = (value) => value.toLocaleString("es-CO");
  return <div className="speechRatio">
    <div className="speechRatioWho"><span>Cuánto habla el consultor</span><span>el resto es el cliente</span></div>
    <div className={`speechRatioSlider ${editable ? "editable" : ""}`}>
      <div className="speechRatioBar" aria-hidden="true">
        {RATIO_ZONES.map((zone, index) => {
          const from = index === 0 ? 0 : limits[index - 1];
          return <span key={zone.name} style={{ left: `${from}%`, width: `${limits[index] - from}%`, background: zone.color }} />;
        })}
      </div>
      {limits.map((limit, index) => <span key={`tag-${RATIO_ZONES[index].name}`} className="speechRatioTag" style={{ left: `${limit}%` }}>{limit} %</span>)}
      {editable && limits.map((limit, index) => <input
        key={`limit-${RATIO_ZONES[index].name}`}
        type="range"
        min={0}
        max={100}
        value={limit}
        aria-label={`Límite de ${RATIO_ZONES[index].name}: hasta ${limit} %`}
        onChange={(event) => moveLimit(index, Number(event.target.value))}
      />)}
    </div>
    <div className="speechRatioScale" aria-hidden="true"><span>0 %</span><span>50 %</span><span>100 %</span></div>
    <ul className="speechRatioLegend">
      {RATIO_ZONES.map((zone, index) => <li key={zone.name}>
        <i style={{ background: zone.color }} />
        <b>{zone.name}</b>
        <span>hasta {limits[index]} %</span>
        <b>{formatPoints(points * zone.factor)} pts</b>
      </li>)}
      <li><i className="none" /><b>Sin puntos</b><span>más de {limits[limits.length - 1]} %</span><b>0 pts</b></li>
    </ul>
  </div>;
}

function PointsSummary({ groups, total }) {
  return <section className="speechSummary" aria-label="Reparto de puntos">
    <div className="speechSummaryHead">
      <strong>Reparto de los 100 puntos</strong>
      <span className={`speechTotal ${total === TOTAL_POINTS ? "ok" : "error"}`}>
        {total} <small>/ {TOTAL_POINTS} pts {total === TOTAL_POINTS ? "✓" : total < TOTAL_POINTS ? `· faltan ${TOTAL_POINTS - total}` : `· sobran ${total - TOTAL_POINTS}`}</small>
      </span>
    </div>
    {/* Each label sits under its own bar segment, so both share the segment's width. */}
    <div className="speechBar">
      {groups.filter((group) => group.points > 0).map((group, index, shownGroups) => <div className="speechBarSegment" key={group.id} title={`${group.name}: ${group.points} pts`} style={{ flexGrow: group.points }}>
        <span style={{ background: blueShade(index, shownGroups.length) }} />
        <small>{group.name} <b>{group.points}</b></small>
      </div>)}
    </div>
    <p className="speechHint">Cada regla vale unos puntos. La IA califica cada regla de Excelente a No lo hizo y el sistema suma.</p>
  </section>;
}

function RuleRow({ rule, editable, editing, onEdit, onChange, onRemove }) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  return <div className="speechRule">
    <div className="speechRuleText">
      <strong>{rule.title || "Regla sin texto"}</strong>
      {rule.allowNotApplicable && <span className="speechTag">No resta si no ocurre</span>}
    </div>
    <span className={`speechStepper ${editable ? "" : "readOnly"}`}>
      {editable && <button type="button" aria-label="Restar un punto" onClick={() => onChange("points", Math.max(1, rule.points - 1))}>−</button>}
      <output>{rule.points} <small>pts</small></output>
      {editable && <button type="button" aria-label="Sumar un punto" onClick={() => onChange("points", Math.min(TOTAL_POINTS, rule.points + 1))}>+</button>}
    </span>
    {editable && <span className="speechRuleActions">
      <button type="button" className="speechIconButton" aria-label="Editar regla" title="Editar regla" aria-expanded={editing} onClick={onEdit}><Pencil size={15} /></button>
      <button type="button" className="speechIconButton danger" aria-label="Eliminar regla" title="Eliminar regla" onClick={() => setConfirmingRemove(true)}><Trash2 size={15} /></button>
    </span>}
    {editable && confirmingRemove && <div className="speechConfirm speechRuleConfirm">
      ¿Eliminar esta regla?
      <button type="button" className="speechSecondaryButton" onClick={() => setConfirmingRemove(false)}>No</button>
      <button type="button" className="speechDangerButton" onClick={onRemove}>Eliminar</button>
    </div>}
    {editable && editing && <div className="speechEditor">
      <div className="speechInputField">
        <label htmlFor={`ruleTitle-${rule.id}`}>Qué debe pasar</label>
        <input id={`ruleTitle-${rule.id}`} autoFocus value={rule.title} maxLength={200} placeholder="Ej. Pregunta por el presupuesto antes del precio" onChange={(event) => onChange("title", event.target.value)} />
        <span>Una sola acción, fácil de comprobar al escuchar la llamada.</span>
      </div>
      <div className="speechInputField">
        <label htmlFor={`ruleGuidance-${rule.id}`}>Ayuda para la IA (opcional)</label>
        <input id={`ruleGuidance-${rule.id}`} value={rule.guidance || ""} maxLength={1500} placeholder="Ej. Vale si pregunta por ingresos o capacidad de pago" onChange={(event) => onChange("guidance", event.target.value)} />
      </div>
      <label className="speechSwitch">
        <input type="checkbox" checked={rule.allowNotApplicable} onChange={(event) => onChange("allowNotApplicable", event.target.checked)} />
        <span>No restar si la situación no ocurre<small>Ejemplo: si el cliente no pone objeciones, la regla de objeciones no cuenta.</small></span>
      </label>
      <div className="speechEditorActions">
        <span />
        <button type="button" className="speechPrimaryButton" onClick={onEdit}>Listo</button>
      </div>
    </div>}
  </div>;
}

function WordList({ id, label, help, words, muted, editable, onChange }) {
  const [value, setValue] = useState("");
  function add() {
    const word = value.trim().toLowerCase();
    if (word && !words.includes(word)) onChange([...words, word]);
    setValue("");
  }
  return <div className="speechWordList">
    <label htmlFor={id}>{label}</label>
    <p>{help}</p>
    <div className="speechChips">
      {words.map((word) => <span className={`speechChip ${muted ? "muted" : ""}`} key={word}>{word}
        {editable && <button type="button" aria-label={`Quitar ${word}`} onClick={() => onChange(words.filter((entry) => entry !== word))}><X size={12} /></button>}
      </span>)}
    </div>
    {editable && <div className="speechWordAdd">
      <input id={id} value={value} maxLength={40} placeholder="Escribe y pulsa Enter" onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
      <button type="button" className="speechSecondaryButton" onClick={add} disabled={!value.trim()}><Plus size={14} /> Añadir</button>
    </div>}
  </div>;
}

export default function SpeechConfig() {
  const [user] = useState(() => getUser() || {});
  const [activeTab, setActiveTab] = useState("version");
  const [active, setActive] = useState(null);
  const [template, setTemplate] = useState(null);
  const [draft, setDraft] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [saveState, setSaveState] = useState("saved");
  const [expanded, setExpanded] = useState(() => new Set());
  const [editingRule, setEditingRule] = useState(null);
  const [editingPhase, setEditingPhase] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const revisionRef = useRef(0);
  const pendingRef = useRef(false);

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_BASE_URL}/api/prompts/speech${path}`, {
      ...options,
      headers: { "X-Admin-Email": user.email || "", "X-Auth-Token": user.authToken || "", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "No se pudo completar la operación.");
    return data;
  }, [user.email, user.authToken]);

  const updateRevision = (value) => { revisionRef.current = value; };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request("");
      const pointsDraft = data.draft?.format === "points" ? withIndicators(data.draft, data.pointsTemplate) : null;
      setActive(data.active);
      setTemplate(data.pointsTemplate);
      setDraft(pointsDraft);
      setVersions(data.versions || []);
      updateRevision(data.revision);
      setSaveState("saved");
      setExpanded(new Set());
    } catch (error) {
      setNotice({ error: true, text: error.message });
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const saveDraft = useCallback(async (config) => {
    setSaveState("saving");
    try {
      const data = await request("/draft", { method: "PUT", body: JSON.stringify({ config, revision: revisionRef.current }) });
      updateRevision(data.revision);
      setSaveState("saved");
      return true;
    } catch (error) {
      setSaveState("error");
      setNotice({ error: true, text: `No se pudo guardar el borrador: ${error.message}` });
      return false;
    }
  }, [request]);

  // Autosave the draft shortly after the last change.
  useEffect(() => {
    if (!draft || !pendingRef.current) return undefined;
    const timer = setTimeout(() => { pendingRef.current = false; saveDraft(draft); }, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [draft, saveDraft]);

  function change(patch) {
    pendingRef.current = true;
    setSaveState("pending");
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function startEdit() {
    const start = editableCopy(withIndicators(active?.format === "points" ? active : template, template));
    setNotice(null);
    setDraft(start);
    setExpanded(new Set());
    await saveDraft(start);
  }

  async function discard() {
    setBusy(true);
    try {
      const data = await request("/draft", { method: "DELETE" });
      updateRevision(data.revision);
      pendingRef.current = false;
      setDraft(null);
      setConfirming(null);
      setEditingRule(null);
      setNotice({ text: "Borrador descartado. Sigue activa la versión publicada." });
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true);
    setNotice(null);
    pendingRef.current = false;
    try {
      if (!(await saveDraft(draft))) return;
      await request("/publish", { method: "POST", body: JSON.stringify({ revision: revisionRef.current }) });
      setPublishing(false);
      await load();
      setNotice({ text: `Versión "${draft.name}" publicada. Las próximas llamadas se califican con ella.` });
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  async function activate(version) {
    if (!window.confirm(`¿Volver a usar "${version.name}" para las llamadas nuevas?`)) return;
    setBusy(true);
    try {
      await request(`/versions/${encodeURIComponent(version.id)}/activate`, { method: "POST" });
      await load();
      setNotice({ text: `Ahora está activa "${version.name}".` });
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  function toggle(id) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const editing = Boolean(draft);
  // The fixed-rules version is shown through its points translation (same phases, same criteria).
  const shown = editing ? draft : withIndicators(active?.format === "points" ? active : template, template);
  const groups = shown ? [
    ...shown.phases.map((phase, index) => ({ ...phase, number: index + 1 })),
  ].map((group) => {
    const rules = shown.rules.filter((rule) => rule.phaseId === group.id);
    return { ...group, rules, points: sumPoints(rules) };
  }) : [];
  const ratioPoints = shown?.talkRatio?.points || 0;
  const muletillasPoints = shown?.muletillas?.points || 0;
  const summaryGroups = [...groups, { id: "talk-ratio", name: "Ratio de habla", points: ratioPoints }, { id: "muletillas", name: "Muletillas", points: muletillasPoints }];
  const total = shown ? sumPoints(shown.rules) + ratioPoints + muletillasPoints : 0;

  function changePhase(id, field, value) {
    change({ phases: draft.phases.map((phase) => phase.id === id ? { ...phase, [field]: value } : phase) });
  }

  function addPhase() {
    const phase = { id: newId("fase"), name: "Nueva fase", objective: "" };
    change({ phases: [...draft.phases, phase] });
    setExpanded((current) => new Set(current).add(phase.id));
    setEditingPhase(phase.id);
  }

  function removePhase(id) {
    change({ phases: draft.phases.filter((phase) => phase.id !== id), rules: draft.rules.filter((rule) => rule.phaseId !== id) });
    setConfirming(null);
  }

  function changeRule(id, field, value) {
    change({ rules: draft.rules.map((rule) => rule.id === id ? { ...rule, [field]: value } : rule) });
  }

  function addRule(phaseId) {
    const rule = { id: newId("regla"), phaseId, title: "", guidance: "", points: 1, allowNotApplicable: false };
    change({ rules: [...draft.rules, rule] });
    setEditingRule(rule.id);
  }

  function removeRule(id) {
    change({ rules: draft.rules.filter((rule) => rule.id !== id) });
    setEditingRule(null);
  }

  const saveLabel = { saving: "Guardando…", pending: "Guardando…", saved: "Cambios guardados", error: "No se pudo guardar" }[saveState];

  return (
    <div className="speechConfigPage">
      <Sidebar />
      <main className="speechConfigContent">
        <header className="speechConfigHeader">
          <div>
            <h1 className="pageTitle">Configurar <span className="titleAccent">Speech Comercial</span></h1>
            <p>Define qué debe pasar en cada fase de la llamada y cuántos puntos vale.</p>
          </div>
        </header>

        {loading && <div className="speechCard">Cargando speech comercial…</div>}
        {!loading && active && <>
          <nav className="speechTabs" role="tablist" aria-label="Secciones del speech comercial">
            {SPEECH_TABS.map(([id, label]) => <button
              key={id}
              id={`speech-tab-${id}`}
              className="speechTab"
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls="speech-tab-panel"
              onClick={() => setActiveTab(id)}
            >{label}</button>)}
          </nav>

          {notice && <div role="status" className={`speechNotice ${notice.error ? "error" : ""}`}>{notice.text}</div>}

          <section className="speechTabPanel" id="speech-tab-panel" role="tabpanel" aria-labelledby={`speech-tab-${activeTab}`}>
            {activeTab === "version" && <>
              {publishing && editing && <section className="speechPublishBox">
                <h2>Publicar nueva versión</h2>
                <div className="speechInputField"><label htmlFor="publishName">Nombre de la versión</label><input id="publishName" value={draft.name} maxLength={100} onChange={(event) => change({ name: event.target.value })} /></div>
                <div className="speechInputField"><label htmlFor="publishNote">Qué cambiaste</label><input id="publishNote" value={draft.changeNote || ""} maxLength={300} placeholder="Ej. Más puntos al diagnóstico y nueva regla de beca" onChange={(event) => change({ changeNote: event.target.value })} /></div>
                <p className="speechHint">Las llamadas que se analicen a partir de ahora usarán esta versión. Los reportes anteriores conservan la suya.</p>
                <div className="speechEditorActions">
                  <button type="button" className="speechSecondaryButton" onClick={() => setPublishing(false)} disabled={busy}>Seguir editando</button>
                  <button type="button" className="speechPrimaryButton" onClick={publish} disabled={busy || total !== TOTAL_POINTS || !draft.name.trim()}>Publicar</button>
                </div>
              </section>}

              {!publishing && !editing && <div className="speechFlow view">
                <div><strong>Versión activa: {active.name}</strong><p>Es la que usa hoy el análisis de las llamadas. Estás en modo lectura.</p></div>
                <button type="button" className="speechPrimaryButton" onClick={startEdit} disabled={busy}>Crear nueva versión</button>
              </div>}

              {!publishing && editing && <div className="speechFlow edit">
                <div><strong>Borrador de nueva versión</strong><p>Los cambios se guardan solos. Los consultores no ven nada hasta que publiques. <span className="speechSaveState">{saveLabel}</span></p></div>
                <div className="speechFlowActions">
                  {confirming === "discard"
                    ? <><span>¿Descartar todos los cambios?</span><button type="button" className="speechSecondaryButton" onClick={() => setConfirming(null)}>No</button><button type="button" className="speechDangerButton" onClick={discard} disabled={busy}>Sí, descartar</button></>
                    : <><button type="button" className="speechSecondaryButton" onClick={() => setConfirming("discard")} disabled={busy}>Descartar borrador</button><button type="button" className="speechPrimaryButton" onClick={() => { setPublishing(true); setEditingRule(null); }} disabled={busy}>Publicar versión</button></>}
                </div>
              </div>}

              {shown && <>
                <PointsSummary groups={summaryGroups} total={total} />
                <div className={`speechPhases ${editing ? "" : "readOnly"}`}>
                  {groups.map((group) => {
                    const open = expanded.has(group.id);
                    const count = group.rules.length;
                    return <section className={`speechPhaseCard ${open ? "open" : ""}`} key={group.id}>
                      <button type="button" className="speechPhaseHead" aria-expanded={open} onClick={() => toggle(group.id)}>
                        <span className="speechStep">{group.number}</span>
                        <span className="speechPhaseTitle"><strong>{group.name || "Fase sin nombre"}</strong><span>{count} {count === 1 ? "regla" : "reglas"}</span></span>
                        <span className="speechPhasePoints">{group.points} <small>pts</small></span>
                        <ChevronRight className="speechChevron" size={18} aria-hidden="true" />
                      </button>

                      {open && <div className="speechPhaseBody">
                        {editing && editingPhase === group.id
                            ? <div className="speechEditor">
                              <div className="speechInputField"><label htmlFor={`phaseName-${group.id}`}>Nombre de la fase</label><input id={`phaseName-${group.id}`} autoFocus value={group.name} maxLength={100} onChange={(event) => changePhase(group.id, "name", event.target.value)} /></div>
                              <div className="speechInputField"><label htmlFor={`phaseObjective-${group.id}`}>Objetivo</label><input id={`phaseObjective-${group.id}`} value={group.objective} maxLength={2000} placeholder="Para qué sirve esta fase en la llamada" onChange={(event) => changePhase(group.id, "objective", event.target.value)} /></div>
                              <div className="speechEditorActions"><span /><button type="button" className="speechPrimaryButton" onClick={() => setEditingPhase(null)}>Listo</button></div>
                            </div>
                            : <div className="speechObjective"><b>Objetivo</b><p>{group.objective || "Sin objetivo definido."}</p>{editing && <button type="button" className="speechLinkButton" onClick={() => setEditingPhase(group.id)}>Editar fase</button>}</div>}

                        <p className="speechSectionLabel"><span>Reglas de esta fase ({count})</span><span>Puntos</span></p>
                        <div className="speechRules">
                          {group.rules.map((rule) => <RuleRow
                            key={rule.id}
                            rule={rule}
                            editable={editing}
                            editing={editingRule === rule.id}
                            onEdit={() => setEditingRule(editingRule === rule.id ? null : rule.id)}
                            onChange={(field, value) => changeRule(rule.id, field, value)}
                            onRemove={() => removeRule(rule.id)}
                          />)}
                          {!count && <div className="speechRule"><span className="speechRuleEmpty">Esta fase aún no tiene reglas.</span></div>}
                        </div>
                        {editing && <button type="button" className="speechSecondaryButton speechAddRule" onClick={() => addRule(group.id)}><Plus size={14} /> Añadir regla</button>}

                        {editing && (confirming === group.id
                          ? <div className="speechConfirm">¿Eliminar la fase "{group.name}"{count ? ` y sus ${count} reglas` : ""}?<button type="button" className="speechSecondaryButton" onClick={() => setConfirming(null)}>Cancelar</button><button type="button" className="speechDangerButton" onClick={() => removePhase(group.id)}>Eliminar</button></div>
                          : <button type="button" className="speechRemovePhase" onClick={() => setConfirming(group.id)} disabled={draft.phases.length === 1} title={draft.phases.length === 1 ? "El speech necesita al menos una fase" : undefined}><Trash2 size={15} /> Eliminar esta fase</button>)}
                      </div>}
                    </section>;
                  })}
                  {editing && <button type="button" className="speechAddPhase" onClick={addPhase} disabled={draft.phases.length >= 12}><Plus size={18} /> Añadir fase</button>}
                  <section className={`speechPhaseCard ${expanded.has("talk-ratio") ? "open" : ""}`}>
                    <div className="speechRatioHeadRow">
                      <button type="button" className="speechPhaseHead" aria-expanded={expanded.has("talk-ratio")} onClick={() => toggle("talk-ratio")}>
                        <span className="speechStep">%</span>
                        <span className="speechPhaseTitle"><strong>Ratio de habla</strong><span>Ideal: el consultor habla hasta {shown.talkRatio.limits[0]} %</span></span>
                        {editing ? <span /> : <span className="speechPhasePoints">{ratioPoints} <small>pts</small></span>}
                        <ChevronRight className="speechChevron" size={18} aria-hidden="true" />
                      </button>
                      {editing && <span className="speechStepper">
                        <button type="button" aria-label="Restar un punto" onClick={() => change({ talkRatio: { ...draft.talkRatio, points: Math.max(0, draft.talkRatio.points - 1) } })}>−</button>
                        <output>{ratioPoints} <small>pts</small></output>
                        <button type="button" aria-label="Sumar un punto" onClick={() => change({ talkRatio: { ...draft.talkRatio, points: Math.min(TOTAL_POINTS, draft.talkRatio.points + 1) } })}>+</button>
                      </span>}
                    </div>
                    {expanded.has("talk-ratio") && <div className="speechPhaseBody">
                      <TalkRatioSlider ratio={shown.talkRatio} editable={editing} onChange={(talkRatio) => change({ talkRatio })} />
                    </div>}
                  </section>
                  <section className={`speechPhaseCard ${expanded.has("muletillas") ? "open" : ""}`}>
                    <div className="speechRatioHeadRow">
                      <button type="button" className="speechPhaseHead" aria-expanded={expanded.has("muletillas")} onClick={() => toggle("muletillas")}>
                        <span className="speechStep">Aa</span>
                        <span className="speechPhaseTitle"><strong>Muletillas</strong><span>{shown.muletillas.count.length} palabras cuentan · {shown.muletillas.ignore.length} no cuentan</span></span>
                        {editing ? <span /> : <span className="speechPhasePoints">{muletillasPoints} <small>pts</small></span>}
                        <ChevronRight className="speechChevron" size={18} aria-hidden="true" />
                      </button>
                      {editing && <span className="speechStepper">
                        <button type="button" aria-label="Restar un punto" onClick={() => change({ muletillas: { ...draft.muletillas, points: Math.max(0, draft.muletillas.points - 1) } })}>−</button>
                        <output>{muletillasPoints} <small>pts</small></output>
                        <button type="button" aria-label="Sumar un punto" onClick={() => change({ muletillas: { ...draft.muletillas, points: Math.min(TOTAL_POINTS, draft.muletillas.points + 1) } })}>+</button>
                      </span>}
                    </div>
                    {expanded.has("muletillas") && <div className="speechPhaseBody">
                      <p className="speechMuletillasHow">El sistema cuenta cuántas veces el consultor dice las palabras de la lista y la IA juzga si son un tic o un uso normal. La IA también avisa de otras repeticiones que no estén en la lista.</p>
                      <div className="speechMuletillasGrid">
                        <WordList id="muletillasCount" label="Cuentan como muletilla" help="Rellenos que algunos consultores repiten como un tic." words={shown.muletillas.count} editable={editing} onChange={(count) => change({ muletillas: { ...draft.muletillas, count } })} />
                        <WordList id="muletillasIgnore" label="No cuentan" help="Conectores normales del español. Nunca restan." words={shown.muletillas.ignore} muted editable={editing} onChange={(ignore) => change({ muletillas: { ...draft.muletillas, ignore } })} />
                      </div>
                    </div>}
                  </section>
                </div>
              </>}
            </>}

            {activeTab === "history" && <section className="speechSection speechVersions">
              <div className="speechVersionList">
                {versions.map((version) => <div className="speechVersion" key={version.id}>
                  <div className="speechVersionInfo">
                    <strong>{version.name}</strong>
                    <span>
                      {version.legacy ? "Versión original" : version.publishedAt?._seconds ? new Date(version.publishedAt._seconds * 1000).toLocaleDateString("es-CO") : "Publicada"}
                      {" · "}{version.changeNote || (version.format === "points" ? "Versión por puntos" : `${version.phaseCount} fases, formato anterior`)}
                    </span>
                  </div>
                  {active.id === version.id
                    ? <span className="speechActivePill">Activa</span>
                    : <button type="button" className="speechSecondaryButton" onClick={() => activate(version)} disabled={busy || editing}>Volver a usar esta versión</button>}
                </div>)}
              </div>
              {editing && <p className="speechHint">Para cambiar la versión activa, primero publica o descarta el borrador.</p>}
            </section>}
          </section>
        </>}
      </main>
    </div>
  );
}
