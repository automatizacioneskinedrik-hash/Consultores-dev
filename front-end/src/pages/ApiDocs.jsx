import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import Sidebar from "../components/Sidebar";
import GuideTour from "../components/GuideTour";
import ChangeHistory from "../components/ChangeHistory";
import { getUser } from "../utils/user";
import "./SpeechConfig.css";
import "./AdvancedConfig.css";
import "./ApiDocs.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const MAX_SHOWN_CHARS = 60000;

const TABS = [
  ["start", "Inicio"],
  ["keys", "Llaves de acceso"],
  ["reference", "Referencia"],
  ["model", "Modelo de datos"],
  ["errors", "Errores y límites"],
];

const API_TOUR_CLEANUP = [{ click: "#api-tab-start" }];
const API_TOUR = [
  { title: "¡Hola! Soy el guía técnico", text: "Aquí está todo para conectar otros sistemas con Speech. Te muestro cada parte." },
  { do: [{ click: "#api-tab-start" }], target: ".apiBase", title: "Empieza por aquí", text: "La dirección de la API y cómo autenticarte en cada consulta." },
  { do: [{ click: "#api-tab-keys" }], target: ".apiKeyCreate", title: "Una llave por sistema", text: "Crea una llave para cada sistema que se conecte. Solo se muestra una vez: guárdala." },
  { do: [{ click: "#api-tab-reference" }], target: ".apiTry", title: "Prueba sin instalar nada", text: "Cada consulta trae ejemplos en cURL, JavaScript y Python, y un botón para probarla en vivo." },
  { do: [{ click: "#api-tab-model" }], target: ".apiMysql", title: "Tablas listas para MySQL", text: "Qué significa cada campo y un esquema para copiar y crear las tablas." },
  { do: [{ click: "#api-tab-errors" }], target: ".apiErrors", title: "Si algo falla", text: "Qué significa cada código de error y qué hacer." },
  { do: [{ click: "#api-tab-start" }], title: "¡Listo!", text: "Si quieres repetir el recorrido, haz clic en mí, abajo a la izquierda." },
];

const formatDate = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—");

function CopyButton({ text, label = "Copiar" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* el texto sigue visible para copiarlo a mano */ }
  };
  return <button type="button" className="apiCopy" onClick={copy} aria-label={label}>
    {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? "Copiado" : label}
  </button>;
}

function CodeBlock({ code, className = "" }) {
  return <div className={`apiCode ${className}`}>
    <CopyButton text={code} />
    <pre><code>{code}</code></pre>
  </div>;
}

function MethodBadge({ method }) {
  return <span className={`apiMethod apiMethod${method}`}>{method}</span>;
}

// URL with the path params replaced and only the query params that have a value.
function buildUrl(base, endpoint, values) {
  let path = endpoint.path;
  const query = [];
  for (const param of endpoint.params) {
    const value = String(values[param.name] ?? "").trim();
    if (param.in === "path") path = path.replace(`{${param.name}}`, value ? encodeURIComponent(value) : `{${param.name}}`);
    else if (value) query.push([param.name, value]);
  }
  return { url: `${base}${path}`, query };
}

function snippets(base, endpoint, values) {
  const { url, query } = buildUrl(base, endpoint, values);
  const fullUrl = query.length ? `${url}?${new URLSearchParams(query)}` : url;
  const pyValue = (value) => (/^\d+$/.test(value) ? value : JSON.stringify(value));
  return {
    curl: `curl -s "${fullUrl}" \\\n  -H "Authorization: Bearer $SPEECH_API_KEY"`,
    javascript: `const res = await fetch("${fullUrl}", {\n  headers: { Authorization: \`Bearer \${process.env.SPEECH_API_KEY}\` },\n});\nif (!res.ok) throw new Error((await res.json()).error.message);\nconst data = await res.json();`,
    python: `import os, requests\n\nres = requests.get(\n    "${url}",\n    headers={"Authorization": f"Bearer {os.environ['SPEECH_API_KEY']}"},${query.length ? `\n    params={${query.map(([name, value]) => `"${name}": ${pyValue(value)}`).join(", ")}},` : ""}\n    timeout=30,\n)\nres.raise_for_status()\ndata = res.json()`,
  };
}

function StartTab({ base, catalog }) {
  const paging = `import os, requests

BASE = "${base}"
HEADERS = {"Authorization": f"Bearer {os.environ['SPEECH_API_KEY']}"}

sessions, cursor = [], None
while True:
    params = {"from": "2026-10-01", "limit": 200}
    if cursor:
        params["cursor"] = cursor
    page = requests.get(f"{BASE}/sessions", headers=HEADERS, params=params, timeout=30)
    page.raise_for_status()
    body = page.json()
    sessions += body["data"]
    cursor = body["nextCursor"]
    if not cursor:
        break`;
  return <div className="acPanel">
    <section className="acCard apiBase">
      <div className="acCardHead"><div><h2>Dirección base</h2><p>Todas las rutas de la referencia van después de esta dirección.</p></div></div>
      <CodeBlock code={base} className="apiCodeInline" />
      <div className="acCardHead"><div><h2>Autenticación</h2><p>Cada petición lleva la llave del sistema en esta cabecera. Créala en Llaves de acceso.</p></div></div>
      <CodeBlock code={"Authorization: Bearer spk_tu_llave"} className="apiCodeInline" />
    </section>

    <section className="acCard">
      <div className="acCardHead"><div><h2>Formato</h2></div></div>
      <ul className="apiFacts">
        <li><b>JSON</b> en todas las respuestas, con codificación UTF-8.</li>
        <li><b>Fechas y horas</b> en UTC con formato ISO 8601, por ejemplo <code>2026-10-21T15:42:10.512Z</code>. Los filtros de día usan <code>AAAA-MM-DD</code>.</li>
        <li><b>Listas paginadas</b>: cada página trae <code>nextCursor</code>; envíalo en <code>cursor</code> para la siguiente. Cuando llega <code>null</code>, no hay más.</li>
        <li><b>Solo lectura</b>: ninguna consulta modifica datos de Speech.</li>
        <li><b>Límite</b>: {catalog.rateLimit} consultas por minuto por llave.</li>
      </ul>
    </section>

    <section className="acCard">
      <div className="acCardHead"><div><h2>Primeros pasos</h2></div></div>
      <ol className="apiSteps">
        <li><b>Crea una llave</b> en la pestaña Llaves de acceso y guárdala como variable de entorno <code>SPEECH_API_KEY</code>.</li>
        <li><b>Prueba la conexión.</b> Si responde con el nombre de tu llave, todo está bien.
          <CodeBlock code={`curl -s "${base}/ping" \\\n  -H "Authorization: Bearer $SPEECH_API_KEY"`} />
        </li>
        <li><b>Trae las sesiones</b>, página a página, hasta que <code>nextCursor</code> sea <code>null</code>.
          <CodeBlock code={paging} />
        </li>
      </ol>
    </section>
  </div>;
}

function KeysTab({ authHeaders }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [created, setCreated] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/dev/keys`, { headers: authHeaders })
      .then((res) => res.json())
      .then((data) => { if (!cancelled && data.ok) setKeys(data.keys); })
      .catch(() => { if (!cancelled) setMessage({ type: "error", text: "No se pudieron cargar las llaves." }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authHeaders, refresh]);

  const create = async () => {
    setBusy(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`${API_BASE_URL}/api/dev/keys`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo crear la llave.");
      setCreated({ key: data.key, name: data.item.name });
      setName("");
      setRefresh((value) => value + 1);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dev/keys/${id}/revoke`, { method: "POST", headers: authHeaders });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo revocar la llave.");
      setMessage({ type: "success", text: `Llave «${data.item.name}» revocada.` });
      setRefresh((value) => value + 1);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setConfirming(null);
      setBusy(false);
    }
  };

  return <div className="acPanel">
    {message.text && <div role="status" className={`speechNotice ${message.type === "error" ? "error" : ""}`}>{message.text}</div>}
    <section className="acCard apiKeyCreate">
      <div className="acCardHead"><div><h2>Crear llave</h2><p>Una por sistema, para poder revocarla sin afectar a los demás.</p></div></div>
      <div className="acAdd">
        <input id="api-key-name" type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) create(); }} placeholder="Nombre del sistema, por ejemplo MySQL TI" aria-label="Nombre del sistema" />
        <button type="button" className="speechPrimaryButton" onClick={create} disabled={busy || !name.trim()}>Crear llave</button>
      </div>
      {created && <div className="apiNewKey" role="status">
        <strong>Llave de «{created.name}»</strong>
        <p>Guárdala ahora: no se vuelve a mostrar.</p>
        <CodeBlock code={created.key} className="apiCodeInline" />
        <button type="button" className="speechSecondaryButton" onClick={() => setCreated(null)}>Ya la guardé</button>
      </div>}
    </section>

    <section className="acCard">
      <div className="acCardHead"><div><h2>Llaves</h2></div><span className="acHint">{keys.filter((key) => !key.revokedAt).length} activas</span></div>
      {loading ? <p className="acHint">Cargando llaves…</p> : !keys.length ? <p className="acHint">Todavía no hay llaves.</p> : <div className="apiTableWrap">
        <table className="apiTable">
          <thead><tr><th>Sistema</th><th>Llave</th><th>Creada por</th><th>Creada</th><th>Último uso</th><th>Estado</th><th aria-label="Acciones" /></tr></thead>
          <tbody>
            {keys.map((key) => <tr key={key.id} className={key.revokedAt ? "apiRevoked" : ""}>
              <td><b>{key.name}</b></td>
              <td><code>{key.hint}</code></td>
              <td>{key.createdBy || "—"}</td>
              <td>{formatDate(key.createdAt)}</td>
              <td>{key.lastUsedAt ? formatDate(key.lastUsedAt) : "Nunca"}</td>
              <td>{key.revokedAt ? <span className="apiStatus off">Revocada</span> : <span className="apiStatus on">Activa</span>}</td>
              <td className="apiActions">
                {!key.revokedAt && (confirming === key.id
                  ? <><span className="acHint">¿Revocar?</span><button type="button" className="speechSecondaryButton acDanger" onClick={() => revoke(key.id)} disabled={busy}>Sí, revocar</button><button type="button" className="speechSecondaryButton" onClick={() => setConfirming(null)}>No</button></>
                  : <button type="button" className="speechSecondaryButton acDanger" onClick={() => setConfirming(key.id)}>Revocar</button>)}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>
    <ChangeHistory section="api" description="Llaves creadas y revocadas." refreshKey={refresh} />
  </div>;
}

function ReferenceTab({ base, catalog, authHeaders }) {
  const [selectedId, setSelectedId] = useState(catalog.endpoints[0]?.id);
  const [values, setValues] = useState(() => Object.fromEntries(catalog.endpoints.map((endpoint) => [endpoint.id, Object.fromEntries(endpoint.params.map((param) => [param.name, param.example]))])));
  const [language, setLanguage] = useState("curl");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const endpoint = catalog.endpoints.find((entry) => entry.id === selectedId) || catalog.endpoints[0];
  const current = values[endpoint.id] || {};
  const code = snippets(base, endpoint, current);
  const missing = endpoint.params.filter((param) => param.required && !String(current[param.name] ?? "").trim());

  const setValue = (name, value) => setValues((all) => ({ ...all, [endpoint.id]: { ...all[endpoint.id], [name]: value } }));

  const select = (id) => {
    setSelectedId(id);
    setResult(null);
  };

  const run = async () => {
    setRunning(true);
    const { url, query } = buildUrl(`${API_BASE_URL}${catalog.basePath}`, endpoint, current);
    const started = performance.now();
    try {
      const res = await fetch(query.length ? `${url}?${new URLSearchParams(query)}` : url, { headers: authHeaders });
      const body = await res.json();
      setResult({ status: res.status, ms: Math.round(performance.now() - started), body });
      // Fill the ids of the detail endpoints with real values, so they can be tried right after.
      const first = body?.data?.[0];
      if (endpoint.id === "sessions" && first) {
        setValues((all) => ({
          ...all,
          session: { ...all.session, id: all.session?.id || first.id },
          "speech-version": { ...all["speech-version"], id: all["speech-version"]?.id || first.speechVersionId || "" },
        }));
      }
    } catch (error) {
      setResult({ status: 0, ms: Math.round(performance.now() - started), body: { error: { code: "network_error", message: error.message } } });
    } finally {
      setRunning(false);
    }
  };

  const shown = result ? JSON.stringify(result.body, null, 2) : "";

  return <div className="apiReference">
    <nav className="apiEndpoints" aria-label="Consultas">
      {catalog.endpoints.map((entry) => <button key={entry.id} type="button" className="apiEndpoint" aria-current={entry.id === endpoint.id} onClick={() => select(entry.id)}>
        <MethodBadge method={entry.method} /><span><code>{entry.path}</code><small>{entry.title}</small></span>
      </button>)}
      {catalog.upcoming.map((entry) => <div key={entry.path} className="apiEndpoint apiUpcoming" title={entry.description}>
        <MethodBadge method={entry.method} /><span><code>{entry.path}</code><small>{entry.title} · Próximamente</small></span>
      </div>)}
    </nav>

    <div className="apiDetail">
      <section className="acCard">
        <div className="apiDetailHead"><MethodBadge method={endpoint.method} /><h2>{endpoint.title}</h2></div>
        <CodeBlock code={`${endpoint.method} ${base}${endpoint.path}`} className="apiCodeInline" />
        <p className="apiText">{endpoint.description}</p>
        {endpoint.params.length > 0 ? <div className="apiTableWrap">
          <table className="apiTable">
            <thead><tr><th>Parámetro</th><th>Dónde</th><th>Tipo</th><th>Obligatorio</th><th>Descripción</th></tr></thead>
            <tbody>{endpoint.params.map((param) => <tr key={param.name}>
              <td><code>{param.name}</code></td><td>{param.in === "path" ? "ruta" : "query"}</td><td>{param.type}</td><td>{param.required ? "Sí" : "No"}</td><td>{param.description}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="acHint">Sin parámetros.</p>}
      </section>

      <section className="acCard apiTry">
        <div className="acCardHead"><div><h2>Probar</h2><p>Se ejecuta en vivo con tu sesión, sin llave.</p></div></div>
        {endpoint.params.length > 0 && <div className="apiInputs">
          {endpoint.params.map((param) => <label key={param.name} htmlFor={`try-${endpoint.id}-${param.name}`}>
            <span><code>{param.name}</code>{param.required && <em> obligatorio</em>}</span>
            <input id={`try-${endpoint.id}-${param.name}`} type="text" value={current[param.name] ?? ""} onChange={(e) => setValue(param.name, e.target.value)} placeholder={param.type === "date" ? "AAAA-MM-DD" : ""} />
          </label>)}
        </div>}
        <div className="apiRunRow">
          <button type="button" className="speechPrimaryButton" onClick={run} disabled={running || missing.length > 0}>{running ? "Consultando…" : "Probar"}</button>
          {missing.length > 0 && <span className="acHint">Escribe {missing.map((param) => param.name).join(", ")} para probar.</span>}
          {result && <span className={`apiHttp ${result.status >= 200 && result.status < 300 ? "ok" : "bad"}`}>{result.status || "Sin respuesta"} · {result.ms} ms</span>}
        </div>
        {result && <CodeBlock code={shown.length > MAX_SHOWN_CHARS ? `${shown.slice(0, MAX_SHOWN_CHARS)}\n… (respuesta recortada en pantalla)` : shown} className="apiResult" />}
      </section>

      <section className="acCard">
        <div className="apiLangs" role="tablist" aria-label="Lenguaje del ejemplo">
          {[["curl", "cURL"], ["javascript", "JavaScript"], ["python", "Python"]].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={language === id} onClick={() => setLanguage(id)}>{label}</button>)}
        </div>
        <CodeBlock code={code[language]} />
        <div className="acCardHead"><div><h2>Ejemplo de respuesta</h2></div></div>
        <CodeBlock code={JSON.stringify(endpoint.example, null, 2)} />
      </section>
    </div>
  </div>;
}

function ModelTab({ catalog }) {
  return <div className="acPanel">
    {catalog.dataModel.map((entity) => <section className="acCard" key={entity.entity}>
      <div className="acCardHead"><div><h2>{entity.entity}</h2><p><code>{entity.source}</code></p></div></div>
      <div className="apiTableWrap">
        <table className="apiTable">
          <thead><tr><th>Campo</th><th>Tipo</th><th>Qué significa</th></tr></thead>
          <tbody>{entity.fields.map(([field, type, meaning]) => <tr key={field}><td><code>{field}</code></td><td>{type}</td><td>{meaning}</td></tr>)}</tbody>
        </table>
      </div>
    </section>)}
    <section className="acCard apiMysql">
      <div className="acCardHead"><div><h2>Esquema sugerido para MySQL</h2><p>Tablas listas para copiar; los nombres de columna siguen los campos de la API.</p></div></div>
      <CodeBlock code={catalog.mysql} />
    </section>
  </div>;
}

function ErrorsTab({ catalog }) {
  return <div className="acPanel">
    <section className="acCard apiErrors">
      <div className="acCardHead"><div><h2>Formato de error</h2><p>Cuando algo falla, la respuesta siempre tiene esta forma.</p></div></div>
      <CodeBlock code={`{\n  "error": {\n    "code": "invalid_parameter",\n    "message": "from debe tener el formato AAAA-MM-DD."\n  }\n}`} />
      <div className="apiTableWrap">
        <table className="apiTable">
          <thead><tr><th>HTTP</th><th>code</th><th>Qué significa</th><th>Qué hacer</th></tr></thead>
          <tbody>{catalog.errors.map((entry) => <tr key={entry.status}><td><b>{entry.status}</b></td><td><code>{entry.code}</code></td><td>{entry.meaning}</td><td>{entry.action}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
    <section className="acCard">
      <div className="acCardHead"><div><h2>Límite de uso</h2></div></div>
      <p className="apiText">{catalog.rateLimit} consultas por minuto por llave. Si lo superas, la API responde 429 con la cabecera <code>Retry-After</code> en segundos. Para cargas grandes, pide páginas de 200 con <code>limit=200</code>.</p>
    </section>
    <section className="acCard">
      <div className="acCardHead"><div><h2>Registro de cambios</h2><p>Versión {catalog.version}. Los campos nuevos se añaden sin cambiar los existentes.</p></div></div>
      <ul className="apiChangelog">{catalog.changelog.map((entry) => <li key={entry.date}><b>{new Date(`${entry.date}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}</b> {entry.text}</li>)}</ul>
    </section>
  </div>;
}

export default function ApiDocs() {
  const user = useMemo(() => getUser() || {}, []);
  const authHeaders = useMemo(() => ({ "X-Admin-Email": user.email || "", "X-Auth-Token": user.authToken || "" }), [user]);
  const [activeTab, setActiveTab] = useState("start");
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");
  const base = catalog ? `${API_BASE_URL}${catalog.basePath}` : "";

  const loadCatalog = useCallback(() => {
    fetch(`${API_BASE_URL}/api/dev/catalog`, { headers: authHeaders })
      .then((res) => res.json())
      .then((data) => { if (data.ok) setCatalog(data.catalog); else throw new Error(data.error); })
      .catch(() => setError("No se pudo cargar la documentación. Recarga la página."));
  }, [authHeaders]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  return <div className="speechConfigPage">
    <Sidebar />
    {catalog && <GuideTour id="api" steps={API_TOUR} cleanup={API_TOUR_CLEANUP} mascot="/mascots/dots/dot-digital-blue-documentacion-api-guia.webp" mascotName="el personaje de gafas azules" aura="rgba(40, 133, 255, .5)" delay={1200} />}
    <main className="speechConfigContent">
      <header className="speechConfigHeader">
        <div>
          <h1 className="pageTitle">Documentación <span className="titleAccent">y API</span></h1>
          <p>Conecta otros sistemas con Speech.</p>
        </div>
      </header>

      <nav className="speechTabs" role="tablist" aria-label="Secciones de la documentación">
        {TABS.map(([id, label]) => <button key={id} id={`api-tab-${id}`} className="speechTab" type="button" role="tab" aria-selected={activeTab === id} aria-controls="api-tab-panel" onClick={() => setActiveTab(id)}>{label}</button>)}
      </nav>

      <section className="speechTabPanel" id="api-tab-panel" role="tabpanel" aria-labelledby={`api-tab-${activeTab}`}>
        {error && <div role="status" className="speechNotice error">{error}</div>}
        {!catalog && !error && <p className="acHint">Cargando documentación…</p>}
        {catalog && activeTab === "start" && <StartTab base={base} catalog={catalog} />}
        {catalog && activeTab === "keys" && <KeysTab authHeaders={authHeaders} />}
        {catalog && activeTab === "reference" && <ReferenceTab base={base} catalog={catalog} authHeaders={authHeaders} />}
        {catalog && activeTab === "model" && <ModelTab catalog={catalog} />}
        {catalog && activeTab === "errors" && <ErrorsTab catalog={catalog} />}
      </section>
    </main>
  </div>;
}
