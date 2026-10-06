import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Save, Send, RotateCcw } from "lucide-react";
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
const SPEECH_TABS = [
  ["version", "Versión"],
  ["rules", "Reglas comerciales"],
  ["phases", "Fases del speech"],
  ["history", "Historial de versiones"],
];

export default function SpeechConfig() {
  const [user] = useState(() => getUser() || {});
  const [activeTab, setActiveTab] = useState("version");
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

  useLayoutEffect(() => {
    if (activeTab !== "phases" && activeTab !== "rules") return;
    document.querySelectorAll(".speechPhaseField textarea, .speechRulesGrid textarea").forEach((textarea) => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    });
  }, [activeTab, draft?.phases, draft?.rules]);

  function change(patch) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    setNotice(null);
  }

  function changePhase(index, field, value) {
    const phases = draft.phases.map((phase, position) => position === index ? { ...phase, [field]: value } : phase);
    change({ phases });
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
            <h1 className="pageTitle">Configurar <span className="titleAccent">Speech Comercial</span></h1>
            <p>Ordena las fases y define cómo reconocerlas y evaluarlas en cada llamada.</p>
            <p className="speechActiveStatus">Versión activa: {active?.name || "Cargando..."}</p>
          </div>
        </header>

        {notice && <div role="status" className={`speechNotice ${notice.error ? "error" : ""}`}>{notice.text}</div>}
        {loading && <div className="speechCard">Cargando speech comercial…</div>}
        {!loading && draft && <>
          <nav className="speechTabs" role="tablist" aria-label="Secciones de configuración del speech">
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

          <section className="speechTabPanel" id="speech-tab-panel" role="tabpanel" aria-labelledby={`speech-tab-${activeTab}`}>
            {activeTab === "version" && <section className="speechSection speechOverview">
              <div className="speechSectionHeading"><div><h2>Datos de la versión</h2><p>Identifica esta versión y describe brevemente la metodología comercial.</p></div></div>
              <div className="speechOverviewFields">
                <div className="speechField"><label htmlFor="speechName">Nombre de esta versión</label><input id="speechName" value={draft.name} maxLength={100} onChange={(event) => change({ name: event.target.value })} /></div>
                <div className="speechField"><label htmlFor="speechDescription">Descripción</label><input id="speechDescription" value={draft.description || ""} maxLength={500} onChange={(event) => change({ description: event.target.value })} /></div>
              </div>
              <div className="speechScoring">
                <div className="speechScoringHeading"><h3>Cálculo de adherencia al guion</h3><p>El puntaje parte de 100 y se le aplican los descuentos definidos aquí.</p></div>
                <div className="speechScoringRow">
                  <div><label htmlFor="speechOmission">Descuento por fase omitida</label><p>Se aplica por cada fase del speech que no se detecte.</p></div>
                  <div className="speechScoringValue"><input id="speechOmission" type="number" min="0" max="100" value={draft.scoring.omissionPenalty} onChange={(event) => change({ scoring: { ...draft.scoring, omissionPenalty: Number(event.target.value) } })} /><span>puntos</span></div>
                </div>
                <div className="speechScoringRow">
                  <div><label htmlFor="speechInversion">Descuento por orden alterado</label><p>Se aplica si las fases se detectan en un orden diferente.</p></div>
                  <div className="speechScoringValue"><input id="speechInversion" type="number" min="0" max="100" value={draft.scoring.inversionPenalty} onChange={(event) => change({ scoring: { ...draft.scoring, inversionPenalty: Number(event.target.value) } })} /><span>puntos</span></div>
                </div>
              </div>
            </section>}

            {activeTab === "rules" && <section className="speechSection speechRules">
              <div className="speechSectionHeading"><div><h2>Reglas comerciales generales</h2><p>Escribe cada criterio en lenguaje natural: qué debe observar la IA y cómo debe evaluarlo. No necesitas incluir nombres técnicos.</p></div></div>
              <div className="speechRulesGrid">
                {RULE_FIELDS.map(([key, label]) => <div className="speechField" key={key}>
                  <label htmlFor={`speechRule-${key}`}>{label}</label>
                  <textarea id={`speechRule-${key}`} value={draft.rules?.[key] || ""} maxLength={4000} rows={1} onChange={(event) => change({ rules: { ...draft.rules, [key]: event.target.value } })} />
                </div>)}
              </div>
            </section>}

            {activeTab === "phases" && <section className="speechSection">
              <div className="speechSectionHeading"><div><h2>Fases del speech</h2><p>Las fases se presentan en el orden de evaluación. Su estructura se mantiene fija.</p></div><span className="speechPhaseCount">{draft.phases.length} fases</span></div>
              <div className="speechPhaseList">
                {draft.phases.map((phase, index) => <section className="speechPhase" key={phase.id}>
                  <div className="speechPhaseHead"><span className="speechPhaseNumber">Fase {index + 1}</span></div>
                  <div className="speechPhaseFields">
                    <div className="speechPhaseField"><label htmlFor={`speechPhaseName-${phase.id}`}>Nombre de la fase</label><input id={`speechPhaseName-${phase.id}`} value={phase.name} maxLength={100} onChange={(event) => changePhase(index, "name", event.target.value)} /></div>
                    <div className="speechPhaseField"><label htmlFor={`speechObjective-${phase.id}`}>Objetivo</label><textarea id={`speechObjective-${phase.id}`} value={phase.objective} maxLength={2000} onChange={(event) => changePhase(index, "objective", event.target.value)} rows={1} /></div>
                    <div className="speechPhaseField"><label htmlFor={`speechDetection-${phase.id}`}>Cómo reconocerla en la llamada</label><textarea id={`speechDetection-${phase.id}`} value={phase.detection} maxLength={2000} onChange={(event) => changePhase(index, "detection", event.target.value)} rows={1} /></div>
                    <div className="speechPhaseField"><label htmlFor={`speechEvaluation-${phase.id}`}>Criterios de evaluación</label><textarea id={`speechEvaluation-${phase.id}`} value={phase.evaluation} maxLength={3000} onChange={(event) => changePhase(index, "evaluation", event.target.value)} rows={1} /></div>
                  </div>
                </section>)}
              </div>
            </section>}

            {activeTab === "history" && <section className="speechSection speechVersions">
              <div className="speechSectionHeading"><div><h2>Historial de versiones</h2><p>Cada publicación queda registrada. Puedes consultar versiones anteriores y reactivar una para llamadas nuevas.</p></div></div>
              <div className="speechVersionList">
                {versions.map((version) => <div className="speechVersion" key={version.id}>
                  <div className="speechVersionInfo">
                    <strong>{version.name}</strong>
                    <span>{version.phaseCount} fases <span aria-hidden="true">·</span> {version.legacy ? "Versión original" : version.publishedAt?._seconds ? new Date(version.publishedAt._seconds * 1000).toLocaleDateString("es-CO") : "Publicada"}</span>
                  </div>
                  {active?.id === version.id
                    ? <em>Activa</em>
                    : <button onClick={() => activate(version.id)} disabled={busy || dirty}><RotateCcw size={15} /> Reactivar</button>}
                </div>)}
              </div>
            </section>}
          </section>

          <div className="speechBottomBar"><span>{dirty ? "Tienes cambios sin guardar" : "Los cambios guardados esperan publicación"}</span><div><button className="speechSecondaryButton" onClick={save} disabled={busy || !dirty}><Save size={16} /> Guardar borrador</button><button className="speechPrimaryButton" onClick={publish} disabled={busy || dirty || !draft.phases.length}><Send size={16} /> Publicar versión</button></div></div>
        </>}
      </main>
    </div>
  );
}
