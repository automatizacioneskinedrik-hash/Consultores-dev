import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

// The two AI providers, shown as buttons with their official logos.
const PROVIDERS = {
  openai: { label: "OpenAI", logo: "/logos/openai-chatgpt-oficial.webp", pricing: "https://developers.openai.com/api/docs/pricing", search: "luna" },
  anthropic: { label: "Claude", logo: "/logos/claude-oficial.png", pricing: "https://www.anthropic.com/pricing", search: "sonnet" },
};
const providerOf = (model) => (/^claude-/i.test(String(model)) ? "anthropic" : "openai");

const formatDate = (value) => {
  const date = value?._seconds ? new Date(value._seconds * 1000) : value ? new Date(value) : null;
  return date ? date.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "";
};

// Dated snapshots and "chat-latest" aliases repeat a model under another name.
const DUPLICATE_NAME = /(-\d{4}-\d{2}-\d{2}$|chat-latest$)/;
const RECENT_GPT_FROM = 5.4;
const RECENT_CLAUDE_FROM = 4.5;
// Size or edition suffixes are not a model type ("gpt-5.4-mini" is a classic GPT, "gpt-6-luna" is type Luna).
const EDITION_SUFFIXES = new Set(["mini", "nano", "pro", "turbo", "preview", "latest", "instruct"]);

// Claude ids come as claude-opus-5-5 (family, then version) or, for older ones, claude-3-5-sonnet-….
function claudeInfo(model) {
  const current = model.match(/^claude-([a-z]+)-(\d+)(?:-(\d))?(?:-|$)/);
  if (current) return { family: current[1], version: Number(`${current[2]}.${current[3] || 0}`) };
  const legacy = model.match(/^claude-(\d+)(?:-(\d))?-([a-z]+)/);
  if (legacy) return { family: legacy[3], version: Number(`${legacy[1]}.${legacy[2] || 0}`) };
  return { family: null, version: 0 };
}

const versionOf = (model) => (providerOf(model) === "anthropic"
  ? claudeInfo(model).version
  : Number(model.match(/^gpt-(\d+(?:\.\d+)?)/)?.[1] || 0));
const typeOf = (model) => {
  if (providerOf(model) === "anthropic") return claudeInfo(model).version >= RECENT_CLAUDE_FROM ? claudeInfo(model).family : null;
  const suffix = model.match(/^gpt-\d+(?:\.\d+)?-([a-z]+)$/)?.[1];
  return suffix && !EDITION_SUFFIXES.has(suffix) ? suffix : null;
};
const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);
const byNewest = (a, b) => versionOf(b) - versionOf(a) || a.localeCompare(b);

// Named types (Luna, Sol… for OpenAI; Opus, Sonnet, Haiku… for Claude) get their own card; recent
// classic GPTs go below; everything older stays folded.
function classify(models) {
  const types = new Map();
  const recent = [];
  const older = new Map();
  for (const model of models) {
    const type = typeOf(model);
    const claude = providerOf(model) === "anthropic";
    if (type) {
      if (!types.has(type)) types.set(type, []);
      types.get(type).push(model);
    } else if (!claude && versionOf(model) >= RECENT_GPT_FROM) {
      recent.push(model);
    } else {
      const version = versionOf(model);
      const label = claude ? `Claude ${version || ""}`.trim() : version ? `GPT-${model.match(/^gpt-(\d+(?:\.\d+)?)/)[1]}` : "Serie o";
      if (!older.has(label)) older.set(label, { label, version, models: [] });
      older.get(label).models.push(model);
    }
  }
  const typeCards = [...types.entries()]
    .map(([type, list]) => ({ type, label: capitalize(type), models: list.sort(byNewest) }))
    .sort((a, b) => versionOf(b.models[0]) - versionOf(a.models[0]) || a.label.localeCompare(b.label));
  const olderGroups = [...older.values()].sort((a, b) => b.version - a.version);
  olderGroups.forEach((group) => group.models.sort(byNewest));
  return { typeCards, recent: recent.sort(byNewest), olderGroups };
}

function ModelOption({ model, active, checked, onToggle }) {
  const isActive = model === active;
  return <label className={`acOption ${checked ? "isChecked" : ""} ${isActive ? "isActive" : ""}`}>
    <input type="checkbox" checked={checked} disabled={isActive} onChange={(event) => onToggle(model, event.target.checked)} />
    <span className="acOptionName">{model}</span>
    {isActive && <span className="acPill">En uso</span>}
  </label>;
}

function ModelChooser({ available, active, selected, onChange, searchHint }) {
  const [query, setQuery] = useState("");
  const [showOlder, setShowOlder] = useState(false);
  const term = query.trim().toLowerCase();
  const models = available.filter((model) => model === active || selected.includes(model) || !DUPLICATE_NAME.test(model));
  const matching = term ? models.filter((model) => model.toLowerCase().includes(term)) : models;
  const { typeCards, recent, olderGroups } = classify(matching);
  const olderCount = olderGroups.reduce((sum, group) => sum + group.models.length, 0);
  const isChecked = (model) => model === active || selected.includes(model);
  const toggle = (model, checked) => onChange(checked ? [...selected, model] : selected.filter((entry) => entry !== model));
  const option = (model) => <ModelOption key={model} model={model} active={active} checked={isChecked(model)} onToggle={toggle} />;

  return <div className="acChooserBody">
    <input className="acSearch" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar modelo, por ejemplo: ${searchHint}`} aria-label="Buscar modelo" />

    {typeCards.length > 0 && <div className="acTypeGrid">
      {typeCards.map((card) => <div className="acTypeCard" key={card.type}>
        <div className="acTypeHead"><h3>{card.label}</h3><span>{card.models.length} {card.models.length === 1 ? "versión" : "versiones"}</span></div>
        <div className="acTypeList">{card.models.map(option)}</div>
      </div>)}
    </div>}

    {recent.length > 0 && <div className="acGroup">
      <h3 className="acGroupTitle">GPT clásicos</h3>
      <div className="acOptionGrid">{recent.map(option)}</div>
    </div>}

    {!typeCards.length && !recent.length && !olderCount && <p className="acHint">Ningún modelo coincide con la búsqueda.</p>}

    {olderCount > 0 && (term || showOlder
      ? <div className="acOlder">
          {!term && <button type="button" className="acLink" onClick={() => setShowOlder(false)}>Ocultar modelos anteriores</button>}
          {olderGroups.map((group) => <div className="acGroup" key={group.label}>
            <h3 className="acGroupTitle">{group.label}</h3>
            <div className="acOptionGrid">{group.models.map(option)}</div>
          </div>)}
        </div>
      : <button type="button" className="acLink" onClick={() => setShowOlder(true)}>Mostrar modelos anteriores ({olderCount})</button>)}
  </div>;
}

// Configuración avanzada → Modelo de IA: choose the provider (OpenAI or Claude) and the model that grades calls.
export default function AiModelTab({ authHeaders }) {
  const [config, setConfig] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [visibleDraft, setVisibleDraft] = useState([]);
  const [confirming, setConfirming] = useState(null);
  const [provider, setProvider] = useState(null);

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
    try { setConfig(await request("")); }
    catch (error) { setNotice({ error: true, text: error.message }); }
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

  async function activate(model) {
    setBusy(true);
    try {
      await request("/activate", { method: "POST", body: JSON.stringify({ model }) });
      setConfirming(null);
      await load();
      setNotice({ text: `Ahora las llamadas nuevas se analizan con ${model}.` });
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  if (!config) return <div className="acCard">{notice ? <div className="speechNotice error">{notice.text}</div> : "Cargando modelos…"}</div>;

  const activeProvider = config.activeProvider || providerOf(config.activeModel);
  const shown = provider || activeProvider;
  const shownInfo = (config.providers || []).find((entry) => entry.id === shown) || { models: config.availableModels || [], error: null };
  const visibleHere = config.visibleModels.filter((model) => providerOf(model) === shown);

  const chooseProvider = (id) => { setProvider(id); setChoosing(false); setConfirming(null); };

  return <div className="acPanel">
    {notice && <div role="status" className={`speechNotice ${notice.error ? "error" : ""}`}>{notice.text}</div>}

    <div className="acFlow">
      <div><strong>Modelo activo: {config.activeModel}</strong><p>Analiza todas las llamadas nuevas con {PROVIDERS[activeProvider].label}.</p></div>
    </div>

    <section className="acCard">
      <div className="acCardHead"><div><h2>¿Con qué IA califica el sistema?</h2><p>Toca un logo para ver sus modelos.</p></div></div>
      <div className="acProviders" role="tablist" aria-label="Proveedor de IA">
        {Object.entries(PROVIDERS).map(([id, info]) => {
          const entry = (config.providers || []).find((item) => item.id === id);
          return <button
            key={id}
            type="button"
            role="tab"
            aria-selected={shown === id}
            className={`acProvider acProvider-${id} ${shown === id ? "isShown" : ""} ${activeProvider === id ? "isActive" : ""}`}
            onClick={() => chooseProvider(id)}
          >
            <img src={info.logo} alt="" />
            <span className="acProviderName">{info.label}</span>
            {activeProvider === id
              ? <span className="acPill">En uso · {config.activeModel}</span>
              : entry?.error ? <span className="acProviderWarn">No disponible</span> : <span className="acProviderHint">{entry?.models.length || 0} modelos</span>}
          </button>;
        })}
      </div>
    </section>

    <section className="acCard">
      <div className="acCardHead">
        <div><h2>Modelos de {PROVIDERS[shown].label}</h2><p>Lista leída de tu cuenta de {PROVIDERS[shown].label}. Elige cuáles quieres tener a mano aquí.</p></div>
        {!shownInfo.error && <button type="button" className="acLink" onClick={() => { setVisibleDraft(config.visibleModels); setChoosing(!choosing); }}>{choosing ? "Cerrar" : "Elegir qué modelos mostrar"}</button>}
      </div>

      {shownInfo.error && <div className="speechNotice error">{PROVIDERS[shown].label} no está disponible: {shownInfo.error}</div>}

      {choosing && <div className="acChooser">
        <ModelChooser available={shownInfo.models} active={config.activeModel} selected={visibleDraft} onChange={setVisibleDraft} searchHint={PROVIDERS[shown].search} />
        <div className="acRowEnd"><button type="button" className="speechPrimaryButton" onClick={saveVisible} disabled={busy}>Guardar selección</button></div>
      </div>}

      {!shownInfo.error && <div className="acModels">
        {visibleHere.length === 0 && <div className="acModel"><div className="acModelName"><span>Todavía no hay modelos elegidos.</span></div><div /><div className="acActions" /></div>}
        {visibleHere.map((model) => {
          const isActive = model === config.activeModel;
          const switchesProvider = providerOf(model) !== activeProvider;
          return <div className={`acModel ${isActive ? "isActive" : ""}`} key={model}>
            <div className="acModelName"><span>{model}</span>{isActive && <span className="acPill">Activo</span>}</div>
            <div className="acCost">{isActive ? "Califica las llamadas nuevas" : ""}</div>
            <div className="acActions">
              {!isActive && <button type="button" className="speechPrimaryButton" onClick={() => setConfirming(model)} disabled={busy}>Activar</button>}
            </div>
            {confirming === model && <div className="acConfirm">
              ¿Activar {model}?{switchesProvider ? ` El sistema pasará de ${PROVIDERS[activeProvider].label} a ${PROVIDERS[shown].label}.` : ""} Las llamadas nuevas se analizarán con este modelo. Las anteriores no cambian.
              <button type="button" className="speechSecondaryButton" onClick={() => setConfirming(null)}>Cancelar</button>
              <button type="button" className="speechPrimaryButton" onClick={() => activate(model)} disabled={busy}>Sí, activar</button>
            </div>}
          </div>;
        })}
      </div>}
      <p className="acHint">Precios oficiales: <a href={PROVIDERS[shown].pricing} target="_blank" rel="noopener noreferrer">página de precios de {PROVIDERS[shown].label}</a>.</p>
    </section>

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
