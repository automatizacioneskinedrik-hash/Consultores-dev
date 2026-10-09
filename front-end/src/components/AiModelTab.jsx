import { useCallback, useEffect, useState } from "react";
import { LEVELS } from "../utils/scoreLevels";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const PRICING_URL = "https://developers.openai.com/api/docs/pricing";

const formatScore = (value) => value == null ? "—" : Number(value).toLocaleString("es-CO", { maximumFractionDigits: 2 });
const formatDate = (value) => {
  const date = value?._seconds ? new Date(value._seconds * 1000) : value ? new Date(value) : null;
  return date ? date.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "";
};
const tokens = (usage) => usage ? `${usage.inputTokens.toLocaleString("es-CO")} de entrada · ${usage.outputTokens.toLocaleString("es-CO")} de salida` : "Sin registro de tokens";

function LevelChip({ level }) {
  const info = LEVELS[level] || LEVELS.no_lo_hizo;
  return <span className="acChip"><i style={{ background: info.color }} />{info.label}</span>;
}

// Dated snapshots and "chat-latest" aliases repeat a model under another name; recent families are 5.4+.
const DUPLICATE_NAME = /(-\d{4}-\d{2}-\d{2}$|chat-latest$)/;
const RECENT_FROM_VERSION = 5.4;

function familyOf(model) {
  const match = model.match(/^gpt-(\d+(?:\.\d+)?)/);
  return match ? { key: match[1], label: `GPT-${match[1]}`, version: Number(match[1]) } : { key: "o", label: "Serie o (razonamiento)", version: 0 };
}

function groupByFamily(models) {
  const groups = new Map();
  for (const model of models) {
    const family = familyOf(model);
    if (!groups.has(family.key)) groups.set(family.key, { ...family, models: [] });
    groups.get(family.key).models.push(model);
  }
  return [...groups.values()].sort((a, b) => b.version - a.version);
}

function ModelChooser({ available, active, selected, onChange }) {
  const [query, setQuery] = useState("");
  const [showOlder, setShowOlder] = useState(false);
  const term = query.trim().toLowerCase();
  const models = available.filter((model) => model === active || selected.includes(model) || !DUPLICATE_NAME.test(model));
  const matching = term ? models.filter((model) => model.toLowerCase().includes(term)) : models;
  const groups = groupByFamily(matching);
  const recent = groups.filter((group) => group.version >= RECENT_FROM_VERSION);
  const older = groups.filter((group) => group.version < RECENT_FROM_VERSION);
  const olderCount = older.reduce((sum, group) => sum + group.models.length, 0);

  const renderGroup = (group) => <div className="acFamily" key={group.key}>
    <h3>{group.label}</h3>
    <div className="acChooserList">
      {group.models.map((model) => <label key={model} className="acCheck">
        <input type="checkbox" checked={model === active || selected.includes(model)} disabled={model === active}
          onChange={(event) => onChange(event.target.checked ? [...selected, model] : selected.filter((entry) => entry !== model))} />
        <code>{model}</code>
      </label>)}
    </div>
  </div>;

  return <div className="acChooserBody">
    <input className="acSearch" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar modelo, por ejemplo: luna" aria-label="Buscar modelo" />
    {recent.map(renderGroup)}
    {!recent.length && !older.length && <p className="acHint">Ningún modelo coincide con la búsqueda.</p>}
    {olderCount > 0 && (term || showOlder
      ? older.map(renderGroup)
      : <button type="button" className="acLink" onClick={() => setShowOlder(true)}>Mostrar modelos anteriores ({olderCount})</button>)}
  </div>;
}

// Configuración avanzada → Modelo de IA (superadmin only): choose, test and activate the GPT model.
export default function AiModelTab({ authHeaders }) {
  const [config, setConfig] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [visibleDraft, setVisibleDraft] = useState([]);
  const [testModel, setTestModel] = useState(null);
  const [testSession, setTestSession] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_BASE_URL}/api/ai-config${path}`, {
      ...options,
      headers: { ...authHeaders, ...(options.body ? { "Content-Type": "application/json" } : {}) },
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "No se pudo completar la operación.");
    return data;
  }, [authHeaders]);

  const load = useCallback(async () => {
    try {
      const [configData, sessionsData] = await Promise.all([request(""), request("/test-sessions")]);
      setConfig(configData);
      setSessions(sessionsData.sessions || []);
      setTestSession((current) => current || sessionsData.sessions?.[0]?.id || "");
    } catch (error) { setNotice({ error: true, text: error.message }); }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  async function saveVisible() {
    setBusy(true);
    try {
      await request("/visible-models", { method: "PUT", body: JSON.stringify({ models: [...new Set([config.activeModel, ...visibleDraft])] }) });
      setChoosing(false);
      await load();
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    setNotice(null);
    try {
      setTestResult(await request("/test", { method: "POST", body: JSON.stringify({ sessionId: testSession, model: testModel }) }));
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setTesting(false); }
  }

  async function activate(model) {
    setBusy(true);
    try {
      await request("/activate", { method: "POST", body: JSON.stringify({ model }) });
      setConfirming(null);
      setTestModel(null);
      setTestResult(null);
      await load();
      setNotice({ text: `Ahora las llamadas nuevas se analizan con ${model}.` });
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  if (!config) return <div className="acCard">{notice ? <div className="speechNotice error">{notice.text}</div> : "Cargando modelos…"}</div>;

  const testedOk = testResult && testResult.test?.model && testModel;
  const changedRules = testResult ? (testResult.test.scoring.items || []).filter((item) => {
    const before = (testResult.current.scoring?.items || []).find((entry) => entry.ruleId === item.ruleId);
    return before && before.level !== item.level;
  }) : [];
  const ruleTitle = (ruleId) => ruleId === "talk-ratio" ? "Ratio de habla" : ruleId === "muletillas" ? "Muletillas" : testResult?.test.ruleTitles?.[ruleId] || ruleId;

  return <div className="acPanel">
    {notice && <div role="status" className={`speechNotice ${notice.error ? "error" : ""}`}>{notice.text}</div>}

    <div className="acFlow">
      <div><strong>Modelo activo: {config.activeModel}</strong><p>Analiza todas las llamadas nuevas. El costo real aparecerá cuando se conecte la facturación de OpenAI.</p></div>
    </div>

    <section className="acCard">
      <div className="acCardHead">
        <div><h2>Modelos disponibles</h2><p>Lista leída de tu cuenta de OpenAI. Elige cuáles quieres comparar aquí.</p></div>
        <button type="button" className="acLink" onClick={() => { setVisibleDraft(config.visibleModels); setChoosing(!choosing); }}>{choosing ? "Cerrar" : "Elegir qué modelos mostrar"}</button>
      </div>

      {choosing && <div className="acChooser">
        <ModelChooser available={config.availableModels} active={config.activeModel} selected={visibleDraft} onChange={setVisibleDraft} />
        <div className="acRowEnd"><button type="button" className="speechPrimaryButton" onClick={saveVisible} disabled={busy}>Guardar selección</button></div>
      </div>}

      <div className="acModels">
        {config.visibleModels.map((model) => {
          const isActive = model === config.activeModel;
          const canActivate = testedOk && testModel === model;
          return <div className={`acModel ${isActive ? "isActive" : ""}`} key={model}>
            <div className="acModelName"><code>{model}</code>{isActive && <span className="acPill">Activo</span>}</div>
            <div className="acCost">{isActive ? "Costo real: pendiente de conectar la facturación" : "Sin datos todavía. Haz una prueba."}</div>
            <div className="acActions">
              {!isActive && <>
                <button type="button" className="speechSecondaryButton" onClick={() => { setTestModel(model); setTestResult(null); setConfirming(null); }}>Probar</button>
                <button type="button" className="speechPrimaryButton" onClick={() => setConfirming(model)} disabled={!canActivate || busy} title={canActivate ? undefined : "Pruébalo antes de activarlo"}>Activar</button>
              </>}
            </div>
            {confirming === model && <div className="acConfirm">
              ¿Activar {model}? Las llamadas nuevas se analizarán con este modelo. Las anteriores no cambian.
              <button type="button" className="speechSecondaryButton" onClick={() => setConfirming(null)}>Cancelar</button>
              <button type="button" className="speechPrimaryButton" onClick={() => activate(model)} disabled={busy}>Sí, activar</button>
            </div>}
          </div>;
        })}
      </div>
      <p className="acHint">Precios oficiales: <a href={PRICING_URL} target="_blank" rel="noopener noreferrer">página de precios de OpenAI</a>.</p>
    </section>

    {testModel && <section className="acTest">
      <div className="acCardHead">
        <div><h2>Probar {testModel} con una sesión</h2><p>Se analiza una llamada ya existente con este modelo y el speech publicado. No se guarda nada y el consultor no lo ve.</p></div>
        <button type="button" className="acLink" onClick={() => { setTestModel(null); setTestResult(null); }}>Cerrar</button>
      </div>
      <div className="acTestRow">
        <select aria-label="Sesión para probar" value={testSession} onChange={(event) => { setTestSession(event.target.value); setTestResult(null); }}>
          {sessions.map((session) => <option key={session.id} value={session.id}>
            {session.client} · {formatDate(session.date)} · {session.duration} · {session.scoreFormat === "points" ? `${formatScore(session.score)} pts` : `${formatScore(session.score)} %`}
          </option>)}
        </select>
        <button type="button" className="speechPrimaryButton" onClick={runTest} disabled={testing || !testSession}>{testing ? "Analizando… puede tardar un minuto" : `Analizar con ${testModel}`}</button>
      </div>

      {testResult && <>
        <div className="acCompare">
          <div className="acSide">
            <h3>Resultado guardado · {testResult.current.model || "modelo anterior"}</h3>
            <div className="acScore">{formatScore(testResult.current.score)} <small>{testResult.current.scoring ? "pts" : "% (sistema antiguo)"}</small></div>
            <span className="acHint">{tokens(testResult.current.usage)}</span>
          </div>
          <div className="acSide">
            <h3>{testResult.test.model}</h3>
            <div className="acScore">{formatScore(testResult.test.scoring.score)} <small>pts</small></div>
            <span className="acHint">{tokens(testResult.test.usage)}</span>
          </div>
        </div>
        {testResult.current.scoring
          ? <div className="acDiff">
            <strong>{changedRules.length ? "Reglas con resultado distinto" : "Todas las reglas coinciden"}</strong>
            {changedRules.map((item) => {
              const before = testResult.current.scoring.items.find((entry) => entry.ruleId === item.ruleId);
              return <div key={item.ruleId}>
                <span>{ruleTitle(item.ruleId)}{item.frase ? <em> — {item.frase}</em> : null}</span>
                <span><LevelChip level={before.level} /> → <LevelChip level={item.level} /></span>
              </div>;
            })}
          </div>
          : <p className="acHint">Esta sesión se calificó con el sistema antiguo, así que no hay comparación regla por regla.</p>}
        <p className="acHint">Si el resultado te convence, ya puedes activar {testModel}.</p>
      </>}
    </section>}

    <section className="acCard">
      <div className="acCardHead"><div><h2>Historial de cambios</h2><p>Quién cambió el modelo y cuándo.</p></div></div>
      <div className="acHistory">
        {config.history.length
          ? config.history.map((entry, index) => <div key={`${entry.model}-${index}`}><strong>{entry.model} activado</strong><span>{entry.changedBy} · {formatDate(entry.changedAt)}</span></div>)
          : <div><strong>{config.activeModel}</strong><span>Modelo inicial del sistema</span></div>}
      </div>
    </section>
  </div>;
}
