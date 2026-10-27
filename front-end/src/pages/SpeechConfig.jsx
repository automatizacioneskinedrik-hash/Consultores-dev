import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import GuideTour from "../components/GuideTour";
import ChangeHistory from "../components/ChangeHistory";
import UserAvatar from "../components/UserAvatar";
import SpeechMatrix from "../components/SpeechMatrix";
import { DEFAULT_GAPS, GAP_KINDS, GAP_STOPS, formatGap, stopIndex } from "../utils/muletillaGaps";

const SPEECH_TOUR_CLEANUP = [{ click: "#speech-tab-version" }];
const SPEECH_TOUR = [
  { title: "¡Hola! Yo cuido el speech comercial", text: "Aquí se define cómo se califica cada llamada. Te muestro sus partes, de arriba a abajo." },
  { target: ".speechTabs", title: "Versión e Historial", text: "En Versión ves y editas el speech. En Historial están todas las versiones publicadas, por si quieres volver a una anterior." },
  { target: ".speechBar", title: "Primero lees, luego editas", text: "Para cambiar algo, crea una nueva versión. Guardas el borrador cuando quieras y publicas cuando esté listo; los consultores no notan nada antes." },
  { target: ".smCard", title: "Fases y reglas", text: "Todo el speech en una tabla: cada fase con sus reglas debajo. Escribes directo en las celdas, los puntos solo aceptan números y la insignia se elige de la biblioteca." },
  { target: ".smPills", title: "El reparto de los 100 puntos", text: "Cada burbuja suma los puntos de su fase. Para publicar, el total debe dar exactamente 100." },
  { target: ".speechRatioHeadRow", title: "Ratio de habla", text: "Aquí defines hasta qué porcentaje puede hablar el consultor antes de perder puntos. Lo mide el sistema, no la IA." },
  { do: [{ show: [".speechRatioHeadRow .speechPhaseHead", ".speechRatio"] }], target: ".speechRatio", title: "Los cuatro límites", text: "Estas marcas dividen el ratio en cinco zonas, de excelente a no lo hizo. Al editar, las mueves para ajustar cada zona." },
  { target: ".speechPhaseCard:last-of-type .speechRatioHeadRow", title: "Muletillas", text: "La IA detecta sola las muletillas. Tú solo indicas cada cuánto se vale repetir una palabra." },
  { do: [{ show: [".speechPhaseCard:last-of-type .speechPhaseHead", ".speechGap"] }], target: ".speechGap", title: "El slicer", text: "Si el consultor repite una palabra muy seguido, baja la nota. Al editar, mueves las manijas para ajustar los tiempos." },
  { do: [{ click: "#speech-tab-history" }], target: ".speechVersions", title: "Todas las versiones", text: "Aquí queda cada versión publicada con su fecha. Si algo no funcionó, puedes volver a una anterior con un clic." },
  { do: [{ click: "#speech-tab-version" }], title: "¡Listo, ya conoces el speech!", text: "Si algo no te quedó claro, haz clic en mí, abajo a la izquierda, y repetimos el recorrido." },
];

import { getUser } from "../utils/user";
import "./SpeechConfig.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const TOTAL_POINTS = 100;
const GENERAL_GROUP_ID = "GENERAL";
const SPEECH_TABS = [
  ["version", "Versión"],
  ["history", "Historial"],
];

const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const sumPoints = (rules) => rules.reduce((sum, rule) => sum + (Number(rule.points) || 0), 0);

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

// One slicer for every muletilla: under the first handle a repetition is a tic, over the second it is normal use.
function MuletillaGapSlider({ gaps = DEFAULT_GAPS, editable, onChange }) {
  const last = GAP_STOPS.length - 1;
  const ticIndex = stopIndex(gaps.tic);
  const normalIndex = stopIndex(gaps.normal);
  const at = (index) => `${(index / last) * 100}%`;
  const zones = [["tic", 0, ticIndex], ["alerta", ticIndex, normalIndex], ["normal", normalIndex, last]];
  function move(handle, index) {
    const tic = handle === "tic" ? Math.min(index, normalIndex - 1) : ticIndex;
    const normal = handle === "normal" ? Math.max(index, ticIndex + 1) : normalIndex;
    onChange({ tic: GAP_STOPS[tic], normal: GAP_STOPS[normal] });
  }
  return <div className="speechGap">
    <strong className="speechGapTitle">Tiempo entre repeticiones de la misma muletilla</strong>
    <div className={`speechGapSlider ${editable ? "editable" : ""}`}>
      <span className="speechGapBubble" style={{ left: at(ticIndex) }}>{formatGap(GAP_STOPS[ticIndex])}</span>
      <span className="speechGapBubble" style={{ left: at(normalIndex) }}>{formatGap(GAP_STOPS[normalIndex])}</span>
      <div className="speechGapBar" aria-hidden="true">
        {zones.map(([kind, from, to]) => <span key={kind} style={{ width: at(to - from), background: GAP_KINDS[kind].color, color: GAP_KINDS[kind].text }}>
          {GAP_KINDS[kind].label}<small>{GAP_KINDS[kind].effect}</small>
        </span>)}
      </div>
      {editable && <>
        <input type="range" min={0} max={last} value={ticIndex} aria-label={`Tic: menos de ${formatGap(GAP_STOPS[ticIndex])}`} onChange={(event) => move("tic", Number(event.target.value))} />
        <input type="range" min={0} max={last} value={normalIndex} aria-label={`Normal: más de ${formatGap(GAP_STOPS[normalIndex])}`} onChange={(event) => move("normal", Number(event.target.value))} />
      </>}
    </div>
    <div className="speechGapScale" aria-hidden="true"><span>0 s</span><span>10 min</span></div>
  </div>;
}

// Words the team says are never a muletilla, even if the AI lists them. Starts empty.
function MuletillaExclusions({ words = [], editable, onChange }) {
  const [value, setValue] = useState("");
  function add() {
    const word = value.trim().toLowerCase();
    if (word && !words.includes(word)) onChange([...words, word]);
    setValue("");
  }
  return <div className="speechExclude">
    <label htmlFor="muletillasExclude">Palabras que no cuentan como muletilla</label>
    <p>Si la IA marca como muletilla una palabra que no lo es, escríbela aquí y dejará de contarse.</p>
    {words.length > 0 && <div className="speechExcludeChips">
      {words.map((word) => <span key={word}>{word}
        {editable && <button type="button" aria-label={`Quitar ${word}`} onClick={() => onChange(words.filter((entry) => entry !== word))}><X size={12} /></button>}
      </span>)}
    </div>}
    {!words.length && !editable && <p className="speechExcludeEmpty">Ninguna por ahora.</p>}
    {editable && <div className="speechExcludeAdd">
      <input id="muletillasExclude" value={value} maxLength={40} placeholder="Escribe una palabra y pulsa Enter" onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
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
  const [savedAt, setSavedAt] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const revisionRef = useRef(0);

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
      setSavedAt(data.draftSavedAt);
      setConflict(null);
      setExpanded(new Set());
    } catch (error) {
      setNotice({ error: true, text: error.message });
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  // The draft is saved only with "Guardar borrador". If someone saved in between, say who and let the user choose.
  const saveDraft = useCallback(async (config) => {
    setSaveState("saving");
    try {
      const data = await request("/draft", { method: "PUT", body: JSON.stringify({ config, revision: revisionRef.current }) });
      updateRevision(data.revision);
      setSaveState("saved");
      setSavedAt(new Date().toISOString());
      setConflict(null);
      return true;
    } catch (error) {
      if (/otra sesión/.test(error.message)) {
        const latest = await request("").catch(() => null);
        setConflict({ by: latest?.draftSavedByName || latest?.draftSavedBy || "Otra persona", at: latest?.draftSavedAt, revision: latest?.revision });
        setSaveState("dirty");
      } else {
        setSaveState("error");
        setNotice({ error: true, text: `No se pudo guardar el borrador: ${error.message}` });
      }
      return false;
    }
  }, [request]);

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (saveState !== "dirty") return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  function change(patch) {
    setSaveState("dirty");
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function keepMine() {
    if (conflict?.revision != null) updateRevision(conflict.revision);
    await saveDraft(draft);
  }

  async function startEdit() {
    const start = editableCopy(withIndicators(active?.format === "points" ? active : template, template));
    setNotice(null);
    setDraft(start);
    setExpanded(new Set());
    await saveDraft(start);
  }

  async function publish() {
    setBusy(true);
    setNotice(null);
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
  const ratioPoints = shown?.talkRatio?.points || 0;
  const muletillasPoints = shown?.muletillas?.points || 0;
  const total = shown ? sumPoints(shown.rules) + ratioPoints + muletillasPoints : 0;

  const minutesAgo = savedAt ? Math.max(0, Math.round((Date.now() - Date.parse(savedAt)) / 60000)) : null;
  const saveLabel = { saving: "Guardando…", dirty: "Cambios sin guardar", error: "No se pudo guardar" }[saveState]
    || (minutesAgo == null ? "Borrador guardado" : minutesAgo < 1 ? "Guardado hace un momento" : `Guardado hace ${minutesAgo} min`);

  return (
    <div className="speechConfigPage">
      <Sidebar />
      {!loading && <GuideTour id="speech" steps={SPEECH_TOUR} cleanup={SPEECH_TOUR_CLEANUP} mascot="/mascots/dots/dot-lila-editor-speech-guia.webp" mascotName="el personaje lila" aura="rgba(187, 138, 255, .6)" />}
      <main className={`speechConfigContent ${!loading && active && activeTab === "version" ? "withBar" : ""}`}>
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
                {total !== TOTAL_POINTS && <p className="speechHint">El total es {total}; debe dar 100 para publicar.</p>}
              </section>}

              {conflict && editing && <div className="speechConflict" role="alert">
                <span><b>{conflict.by} guardó cambios en este borrador{conflict.at ? ` el ${new Date(conflict.at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}` : ""}.</b> Tus cambios siguen aquí, sin guardar.</span>
                <div><button type="button" className="speechSecondaryButton" onClick={load} disabled={busy}>Cargar sus cambios</button><button type="button" className="speechPrimaryButton" onClick={keepMine} disabled={busy}>Guardar los míos encima</button></div>
              </div>}

              {shown && <>
                <SpeechMatrix speech={shown} editable={editing} onChange={change} ratioPoints={ratioPoints} muletillasPoints={muletillasPoints} newId={newId} />
                <div className={`speechPhases ${editing ? "" : "readOnly"}`}>
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
                        <span className="speechPhaseTitle"><strong>Muletillas</strong><span>La IA las detecta sola</span></span>
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
                      <p className="speechMuletillasHow">La IA detecta sola las muletillas. Con el slicer indicas cada cuánto se vale repetir una palabra: si el consultor la repite muy seguido, baja la nota.</p>
                      <MuletillaGapSlider gaps={shown.muletillas.gaps} editable={editing} onChange={(gaps) => change({ muletillas: { ...draft.muletillas, gaps } })} />
                      <MuletillaExclusions words={shown.muletillas.exclude} editable={editing} onChange={(exclude) => change({ muletillas: { ...draft.muletillas, exclude } })} />
                    </div>}
                  </section>
                </div>
              </>}
            </>}

            {activeTab === "version" && <div className="speechBar" role="region" aria-label="Guardar y publicar">
              {editing
                ? <>
                  <div className={`speechBarState ${saveState === "dirty" ? "dirty" : saveState === "error" ? "error" : ""}`}><i />{saveState === "dirty" ? <b>{saveLabel}</b> : <span>{saveLabel}</span>}</div>
                  <button type="button" className="speechSecondaryButton" onClick={() => saveDraft(draft)} disabled={busy || saveState !== "dirty"}>Guardar borrador</button>
                  <button type="button" className="speechPrimaryButton" onClick={() => setPublishing(true)} disabled={busy}>Publicar versión</button>
                </>
                : <>
                  <div className="speechBarState"><i /><span>Versión activa: <b>{active.name}</b> · modo lectura</span></div>
                  <button type="button" className="speechPrimaryButton" onClick={startEdit} disabled={busy}>Crear nueva versión</button>
                </>}
            </div>}

            {activeTab === "history" && <section className="speechSection speechVersions">
              <div className="speechVersionList">
                {versions.map((version) => <div className="speechVersion" key={version.id}>
                  <div className="speechVersionInfo">
                    <strong>{version.name}</strong>
                    <span>
                      {version.legacy ? "Versión original" : version.publishedAt?._seconds ? new Date(version.publishedAt._seconds * 1000).toLocaleDateString("es-CO") : "Publicada"}
                      {" · "}{version.changeNote || (version.format === "points" ? "Versión por puntos" : `${version.phaseCount} fases, formato anterior`)}
                    </span>
                    {version.publishedBy && <span className="speechVersionBy">
                      <UserAvatar name={version.publishedByName} email={version.publishedBy} picture={version.publishedByPicture} className="avatarXs" />
                      Publicada por {version.publishedByName || version.publishedBy}
                    </span>}
                  </div>
                  {active.id === version.id
                    ? <span className="speechActivePill">Activa</span>
                    : <button type="button" className="speechSecondaryButton" onClick={() => activate(version)} disabled={busy || editing}>Volver a usar esta versión</button>}
                </div>)}
              </div>
              <ChangeHistory section="speech" description="Publicaciones, borradores descartados y vueltas a versiones anteriores." refreshKey={`${active?.id}-${versions.length}-${Boolean(draft)}`} />
              {editing && <p className="speechHint">Para cambiar la versión activa, primero publica el borrador.</p>}
            </section>}
          </section>
        </>}
      </main>
    </div>
  );
}
