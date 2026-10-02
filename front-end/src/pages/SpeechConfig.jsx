import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Send, RotateCcw, Trash2 } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { getUser } from "../utils/user";
import "./SpeechConfig.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const RULE_FIELDS = [
  ["milestones", "Hitos de control"],
  ["participation", "Participación y escucha"],
  ["closing", "Cierre y negociación"],
  ["proposal", "Propuesta de valor"],
  ["price", "Momento del precio"],
  ["commitment", "Tipo de compromiso"],
  ["discovery", "Preguntas de descubrimiento"],
  ["objections", "Objeciones"],
];

export default function SpeechConfig() {
  const [user] = useState(() => getUser() || {});
  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState(null);
  const [versions, setVersions] = useState([]);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_BASE_URL}/api/prompts/speech${path}`, {
      ...options,
      headers: { "X-Admin-Email": user.email || "", "X-Auth-Token": user.authToken || "", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "No se pudo completar la operación.");
    return data;
  }, [user.email, user.authToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request("");
      setActive(data.active);
      setDraft(data.draft || structuredClone(data.active));
      setVersions(data.versions || []);
      setRevision(data.revision);
      setDirty(false);
    } catch (error) {
      setNotice({ error: true, text: error.message });
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  function change(patch) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    setNotice(null);
  }

  function changePhase(index, field, value) {
    const phases = draft.phases.map((phase, position) => position === index ? { ...phase, [field]: value } : phase);
    change({ phases });
  }

  function movePhase(index, direction) {
    const phases = [...draft.phases];
    const target = index + direction;
    if (target < 0 || target >= phases.length) return;
    [phases[index], phases[target]] = [phases[target], phases[index]];
    change({ phases });
  }

  function addPhase() {
    change({ phases: [...draft.phases, { id: `phase-${crypto.randomUUID()}`, name: "Nueva fase", objective: "", detection: "", evaluation: "" }] });
  }

  function removePhase(index) {
    if (draft.phases.length === 1) return;
    change({ phases: draft.phases.filter((_, position) => position !== index) });
  }

  async function save() {
    setBusy(true);
    try {
      const data = await request("/draft", { method: "PUT", body: JSON.stringify({ config: draft, revision }) });
      setRevision(data.revision);
      setDirty(false);
      setNotice({ text: "Borrador guardado. El análisis sigue usando la versión publicada." });
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!window.confirm("¿Publicar este speech? Las llamadas nuevas usarán esta versión. Los reportes anteriores conservarán la suya.")) return;
    setBusy(true);
    try {
      await request("/publish", { method: "POST", body: JSON.stringify({ revision }) });
      await load();
      setNotice({ text: "Versión publicada. El siguiente análisis usará este speech." });
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  async function activate(id) {
    if (!window.confirm("¿Activar esta versión para las llamadas nuevas?")) return;
    setBusy(true);
    try {
      await request(`/versions/${encodeURIComponent(id)}/activate`, { method: "POST" });
      await load();
      setNotice({ text: "Versión activada. El historial conserva la metodología usada en cada llamada." });
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="speechConfigPage">
      <Sidebar />
      <main className="speechConfigContent">
        <header className="speechConfigHeader">
          <div>
            <span className="speechEyebrow">Metodología comercial</span>
            <h1 className="pageTitle">Configurar <span className="titleAccent">Speech Comercial</span></h1>
            <p>Ordena las fases y define cómo reconocerlas y evaluarlas en cada llamada.</p>
          </div>
          <span className="speechActiveBadge">Activa: {active?.name || "Cargando..."}</span>
        </header>

        {notice && <div role="status" className={`speechNotice ${notice.error ? "error" : ""}`}>{notice.text}</div>}
        {loading && <div className="speechCard">Cargando speech comercial…</div>}
        {!loading && draft && <>
          <section className="speechCard speechOverview">
            <div className="speechField"><label htmlFor="speechName">Nombre de esta versión</label><input id="speechName" value={draft.name} maxLength={100} onChange={(event) => change({ name: event.target.value })} /></div>
            <div className="speechField"><label htmlFor="speechDescription">Descripción</label><input id="speechDescription" value={draft.description || ""} maxLength={500} onChange={(event) => change({ description: event.target.value })} /></div>
            <div className="speechScoring">
              <span>Adherencia al guion</span>
              <div className="speechField"><label htmlFor="speechOmission">Puntos por fase omitida</label><input id="speechOmission" type="number" min="0" max="100" value={draft.scoring.omissionPenalty} onChange={(event) => change({ scoring: { ...draft.scoring, omissionPenalty: Number(event.target.value) } })} /></div>
              <div className="speechField"><label htmlFor="speechInversion">Puntos por orden invertido</label><input id="speechInversion" type="number" min="0" max="100" value={draft.scoring.inversionPenalty} onChange={(event) => change({ scoring: { ...draft.scoring, inversionPenalty: Number(event.target.value) } })} /></div>
            </div>
          </section>

          <details className="speechCard speechRules">
            <summary>Reglas comerciales generales <span>8 criterios editables</span></summary>
            <p>Estas reglas complementan las fases y alimentan el análisis de cada llamada nueva.</p>
            <div className="speechRulesGrid">
              {RULE_FIELDS.map(([key, label]) => <div className="speechField" key={key}>
                <label htmlFor={`speechRule-${key}`}>{label}</label>
                <textarea id={`speechRule-${key}`} value={draft.rules?.[key] || ""} maxLength={4000} rows={4} onChange={(event) => change({ rules: { ...draft.rules, [key]: event.target.value } })} />
              </div>)}
            </div>
            <div className="speechField"><label htmlFor="speechExtraRules">Reglas comerciales adicionales</label><textarea id="speechExtraRules" value={draft.extraRules || ""} maxLength={6000} rows={4} placeholder="Añade aquí criterios que no encajen en las secciones anteriores." onChange={(event) => change({ extraRules: event.target.value })} /></div>
          </details>

          <div className="speechSectionHeading"><div><h2>Fases del speech</h2><p>{draft.phases.length} fases · cambia el orden con las flechas</p></div><button className="speechTextButton" onClick={addPhase} disabled={draft.phases.length >= 12}><Plus size={16} /> Añadir fase</button></div>
          <div className="speechPhaseList">
            {draft.phases.map((phase, index) => <section className="speechCard speechPhase" key={phase.id}>
              <div className="speechPhaseHead"><span className="speechPhaseNumber">{String(index + 1).padStart(2, "0")}</span><span className="speechPhaseId">ID {phase.id}</span><div className="speechPhaseActions"><button title="Subir fase" aria-label={`Subir ${phase.name}`} onClick={() => movePhase(index, -1)} disabled={index === 0}><ArrowUp size={16} /></button><button title="Bajar fase" aria-label={`Bajar ${phase.name}`} onClick={() => movePhase(index, 1)} disabled={index === draft.phases.length - 1}><ArrowDown size={16} /></button><button title="Quitar fase" aria-label={`Quitar ${phase.name}`} onClick={() => removePhase(index)} disabled={draft.phases.length === 1}><Trash2 size={16} /></button></div></div>
              <div className="speechField"><label htmlFor={`speechPhaseName-${phase.id}`}>Nombre</label><input id={`speechPhaseName-${phase.id}`} value={phase.name} maxLength={100} onChange={(event) => changePhase(index, "name", event.target.value)} /></div>
              <div className="speechPhaseGrid">
                <div className="speechField"><label htmlFor={`speechObjective-${phase.id}`}>Objetivo</label><textarea id={`speechObjective-${phase.id}`} value={phase.objective} maxLength={2000} onChange={(event) => changePhase(index, "objective", event.target.value)} rows={3} /></div>
                <div className="speechField"><label htmlFor={`speechDetection-${phase.id}`}>Cómo reconocerla en la llamada</label><textarea id={`speechDetection-${phase.id}`} value={phase.detection} maxLength={2000} onChange={(event) => changePhase(index, "detection", event.target.value)} rows={3} /></div>
              </div>
              <div className="speechField"><label htmlFor={`speechEvaluation-${phase.id}`}>Criterios de evaluación</label><textarea id={`speechEvaluation-${phase.id}`} value={phase.evaluation} maxLength={3000} onChange={(event) => changePhase(index, "evaluation", event.target.value)} rows={3} /></div>
            </section>)}
          </div>

          <div className="speechBottomBar"><span>{dirty ? "Tienes cambios sin guardar" : "Los cambios guardados esperan publicación"}</span><div><button className="speechSecondaryButton" onClick={save} disabled={busy || !dirty}><Save size={16} /> Guardar borrador</button><button className="speechPrimaryButton" onClick={publish} disabled={busy || dirty || !draft.phases.length}><Send size={16} /> Publicar versión</button></div></div>

          <section className="speechVersions"><h2>Versiones anteriores</h2><p>Una versión publicada permanece disponible para revisión y reactivación.</p><div className="speechVersionList">{versions.map((version) => <div className="speechVersion" key={version.id}><div><strong>{version.name}</strong><span>{version.phaseCount} fases · {version.legacy ? "Original" : version.publishedAt?._seconds ? new Date(version.publishedAt._seconds * 1000).toLocaleDateString("es-CO") : "Publicada"}</span></div>{active?.id === version.id ? <em>Activa</em> : <button onClick={() => activate(version.id)} disabled={busy || dirty}><RotateCcw size={15} /> Activar</button>}</div>)}</div></section>
        </>}
      </main>
    </div>
  );
}
