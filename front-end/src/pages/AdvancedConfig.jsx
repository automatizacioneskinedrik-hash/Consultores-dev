import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import { canManage } from "../utils/roles";
import GuideTour from "../components/GuideTour";
import ChangeHistory from "../components/ChangeHistory";

const ADVANCED_TOUR_CLEANUP = [{ click: ".speechTabs .speechTab:first-child" }];
const ADVANCED_TOUR = [
  { title: "¡Hola! Aquí se toman las decisiones de fondo", text: "Esta sección controla cómo trabaja el sistema por dentro. Te muestro cada parte." },
  { do: [{ click: ".speechTabs .speechTab:first-child" }], target: ".speechTabs", title: "Tres pestañas", text: "Modelo de IA, Mensaje de WhatsApp y Correos." },
  { target: ".acProviders", title: "OpenAI o Claude", text: "Toca un logo para ver los modelos de cada proveedor. El que dice En uso es el que califica hoy." },
  { do: [{ show: [".acCardHead .acLink", ".acChooser"] }], target: ".acChooser", title: "Elige qué modelos ver", text: "Aquí aparecen los modelos de tu cuenta de OpenAI, agrupados por tipo. Marca los que quieras tener a mano y guarda la selección." },
  { do: [{ hide: [".acCardHead .acLink", ".acChooser"] }], target: ".acModels", title: "Cambiar de modelo", text: "Elige otro modelo de la lista y actívalo. Las llamadas que ya se analizaron conservan su nota; solo cambian las nuevas." },
  { target: ".acModel .speechPrimaryButton", title: "Activar", text: "Al pulsar Activar te pido confirmación antes de cambiar el modelo, para que no pase por error." },
  { target: ".changeHistory", title: "Quién lo cambió y cuándo", text: "Cada cambio de modelo queda registrado con la persona y la fecha, para saber siempre qué pasó." },
  { do: [{ click: "#advanced-tab-whatsapp" }], target: ".acTextarea", title: "El mensaje de WhatsApp", text: "Aquí escribes la instrucción que sigue la IA para redactar el mensaje de seguimiento de cada llamada. Guárdala cuando la cambies." },
  { target: ".acVersions", title: "Versiones del mensaje", text: "Cada instrucción guardada queda aquí. Puedes volver a una anterior o borrar las que ya no sirvan." },
  { do: [{ click: "#advanced-tab-email" }], target: ".acEmailBlock", title: "Alerta de grabaciones", text: "Aquí decides quién recibe el correo con quién no subió grabaciones." },
  { do: [{ click: ".speechTabs .speechTab:first-child" }], title: "¡Listo, ya conoces la configuración!", text: "Si algo no te quedó claro, haz clic en mí, abajo a la izquierda, y repetimos el recorrido." },
];

import AiModelTab from "../components/AiModelTab";
import { getUser } from "../utils/user";
import "./SpeechConfig.css";
import "./AdvancedConfig.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmailValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeEmailArray(values = []) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((email) => normalizeEmailValue(email)).filter(Boolean))];
}

function formatTimestamp(ts) {
  if (!ts) return "";
  if (typeof ts === "string") return ts;
  if (ts._seconds) {
    return new Date(ts._seconds * 1000).toLocaleString("es-CO");
  }
  return "";
}

export default function AdvancedConfig() {
  const user = useMemo(() => getUser(), []);
  const [alertEmails, setAlertEmails] = useState([]);
  const [emailInput, setEmailInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [updatedBy, setUpdatedBy] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const [followupDraft, setFollowupDraft] = useState("");
  const [followupPrompts, setFollowupPrompts] = useState([]);
  const [isLoadingFollowup, setIsLoadingFollowup] = useState(true);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [activatingId, setActivatingId] = useState(null);
  const [promptMsg, setPromptMsg] = useState({ type: "", text: "" });

  const [activeTab, setActiveTab] = useState("model");

  const loadEmailConfig = async () => {
    try {
      setIsLoading(true);
      setErrorMsg("");

      const res = await fetch(`${API_BASE_URL}/api/admin/email-config`, {
        headers: {
          "X-Admin-Role": user.role || "user",
          "X-Admin-Email": user.email || "",
          "X-Auth-Token": user.authToken || "",
        },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (res.status === 401 || res.status === 403) return; // Keep it clean
        throw new Error(data.error || "No se pudo cargar la configuracion");
      }

      const config = data.config || {};
      setAlertEmails(normalizeEmailArray(config.alertEmails || []));
      setUpdatedBy(config.updatedBy || "");
      setUpdatedAt(formatTimestamp(config.updatedAt));
    } catch (error) {
      setErrorMsg(error.message || "Error de conexion al cargar configuracion");
    } finally {
      setIsLoading(false);
    }
  };

  const authHeaders = useMemo(() => ({
    "X-Admin-Role": user.role || "user",
    "X-Admin-Email": user.email || "",
    "X-Auth-Token": user.authToken || "",
  }), [user]);

  const loadFollowupPrompts = async () => {
    setIsLoadingFollowup(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/prompts/followup`, { headers: authHeaders });
      const data = await res.json();
      if (data.ok) {
        const list = data.prompts || [];
        setFollowupPrompts(list);
        const active = list.find((p) => p.isActive);
        if (active) setFollowupDraft(active.instruction);
      }
    } catch {
      // silencioso
    } finally {
      setIsLoadingFollowup(false);
    }
  };

  const saveFollowupPrompt = async () => {
    setPromptMsg({ type: "", text: "" });
    setIsSavingPrompt(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/prompts/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ instruction: followupDraft }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Error al guardar");
      setPromptMsg({ type: "success", text: "Prompt guardado y activado correctamente." });
      await loadFollowupPrompts();
    } catch (err) {
      setPromptMsg({ type: "error", text: err.message });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const activateFollowupPrompt = async (id) => {
    setActivatingId(id);
    setPromptMsg({ type: "", text: "" });
    try {
      const res = await fetch(`${API_BASE_URL}/api/prompts/followup/${id}/activate`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Error al activar");
      await loadFollowupPrompts();
    } catch (err) {
      setPromptMsg({ type: "error", text: err.message });
    } finally {
      setActivatingId(null);
    }
  };

  const deleteFollowupPrompt = async (id) => {
    setDeletingId(id);
    setPromptMsg({ type: "", text: "" });
    try {
      const res = await fetch(`${API_BASE_URL}/api/prompts/followup/${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Error al eliminar");
      await loadFollowupPrompts();
    } catch (err) {
      setPromptMsg({ type: "error", text: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    const isAuthorized = canManage(user);
    if (isAuthorized) {
      loadEmailConfig();
      loadFollowupPrompts();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  const saveEmailConfig = async (nextEmails) => {
    setErrorMsg("");
    setSuccessMsg("");
    setIsSaving(true);
    try {
      const parsed = normalizeEmailArray(nextEmails);
      const res = await fetch(`${API_BASE_URL}/api/admin/email-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ alertEmails: parsed }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo guardar la configuración");
      setAlertEmails(parsed);
      setSuccessMsg("Lista guardada.");
      if (data.config) setUpdatedBy(data.config.updatedBy || "");
    } catch (error) {
      setErrorMsg(error.message || "Error guardando la configuración");
    } finally {
      setIsSaving(false);
    }
  };

  const addEmail = async () => {
    const email = normalizeEmailValue(emailInput);
    if (!BASIC_EMAIL_REGEX.test(email)) {
      setErrorMsg("Escribe un correo válido, por ejemplo nombre@empresa.com.");
      return;
    }
    if (alertEmails.includes(email)) {
      setErrorMsg("Ese correo ya está en la lista.");
      return;
    }
    setEmailInput("");
    await saveEmailConfig([...alertEmails, email]);
  };

  const tabs = [
    ["model", "Modelo de IA"],
    ["whatsapp", "Mensaje de WhatsApp"],
    ["email", "Correos"],
  ];
  const currentTab = tabs.some(([id]) => id === activeTab) ? activeTab : tabs[0][0];

  return (
    <div className="speechConfigPage">
      <Sidebar />
      <GuideTour id="advanced" steps={ADVANCED_TOUR} cleanup={ADVANCED_TOUR_CLEANUP} mascot="/mascots/dots/dot-naranja-ceo-guia.webp" mascotName="el personaje naranja" aura="rgba(255, 89, 0, .5)" delay={1500} />
      <main className="speechConfigContent">
        <header className="speechConfigHeader">
          <div>
            <h1 className="pageTitle">Configuración <span className="titleAccent">avanzada</span></h1>
            <p>Ajusta cómo funciona el análisis de las llamadas.</p>
          </div>
        </header>

        <nav className="speechTabs" role="tablist" aria-label="Secciones de configuración avanzada">
          {tabs.map(([id, label]) => <button
            key={id}
            id={`advanced-tab-${id}`}
            className="speechTab"
            type="button"
            role="tab"
            aria-selected={currentTab === id}
            aria-controls="advanced-tab-panel"
            onClick={() => setActiveTab(id)}
          >{label}</button>)}
        </nav>

        <section className="speechTabPanel" id="advanced-tab-panel" role="tabpanel" aria-labelledby={`advanced-tab-${currentTab}`}>
          {currentTab === "model" && <AiModelTab authHeaders={authHeaders} />}

          {currentTab === "whatsapp" && <div className="acPanel">
            {promptMsg.text && <div role="status" className={`speechNotice ${promptMsg.type === "success" ? "" : "error"}`}>{promptMsg.text}</div>}
            <section className="acCard">
              <div className="acCardHead"><div><h2>Instrucción para el mensaje de WhatsApp</h2><p>La IA usa esta instrucción para redactar el mensaje de seguimiento que se sugiere al consultor.</p></div></div>
              <textarea
                className="acTextarea"
                value={followupDraft}
                onChange={(e) => setFollowupDraft(e.target.value)}
                rows={7}
                aria-label="Instrucción para el mensaje de WhatsApp"
                placeholder="Escribe la instrucción para el mensaje sugerido de WhatsApp..."
              />
              <div className="acRowBetween">
                <p className="acHint">Al guardar se crea una versión nueva y se activa.</p>
                <button type="button" className="speechPrimaryButton" onClick={saveFollowupPrompt} disabled={isSavingPrompt || !followupDraft.trim()}>
                  {isSavingPrompt ? "Guardando…" : "Guardar y activar"}
                </button>
              </div>
            </section>

            <section className="acCard">
              <div className="acCardHead"><div><h2>Versiones guardadas</h2><p>Puedes volver a una versión anterior.</p></div><span className="acHint">{followupPrompts.length} versiones</span></div>
              {isLoadingFollowup ? <p className="acHint">Cargando versiones…</p> : <div className="acVersions">
                {followupPrompts.map((p) => <div className="acVersion" key={p.id}>
                  <div>
                    <strong>{p.isDefault ? "Original" : `Versión del ${p.createdAt?._seconds ? new Date(p.createdAt._seconds * 1000).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—"}`}</strong>
                    {p.isActive && <span className="acPill">Activa</span>}
                    <p>{p.instruction.slice(0, 140)}{p.instruction.length > 140 ? "…" : ""}</p>
                    {p.createdBy && p.createdBy !== "system" && <span className="acHint">{p.createdBy}</span>}
                  </div>
                  <div className="acActions">
                    {!p.isActive && <button type="button" className="speechSecondaryButton" onClick={() => { activateFollowupPrompt(p.id); setFollowupDraft(p.instruction); }} disabled={activatingId === p.id}>
                      {activatingId === p.id ? "…" : "Volver a usar"}
                    </button>}
                    {!p.isDefault && !p.isActive && <button type="button" className="speechSecondaryButton acDanger" onClick={() => deleteFollowupPrompt(p.id)} disabled={deletingId === p.id}>
                      {deletingId === p.id ? "…" : "Eliminar"}
                    </button>}
                  </div>
                </div>)}
              </div>}
            </section>
            <ChangeHistory section="whatsapp" description="Cambios en las instrucciones del mensaje de WhatsApp." refreshKey={promptMsg.text} />
          </div>}

          {currentTab === "email" && <div className="acPanel">
            {successMsg && <div role="status" className="speechNotice">{successMsg}</div>}
            {errorMsg && <div role="status" className="speechNotice error">{errorMsg}</div>}
            <section className="acCard">
              <div className="acCardHead"><div><h2>Alerta de grabaciones</h2><p>Quién no subió grabaciones el día hábil anterior.</p></div></div>
              {isLoading ? <p className="acHint">Cargando configuración…</p> : <div className="acEmailBlock">
                <strong>Quién recibe la alerta</strong>
                <div className="acChips">
                  {alertEmails.length
                    ? alertEmails.map((email) => <span key={email}>{email}<button type="button" aria-label={`Quitar ${email}`} onClick={() => saveEmailConfig(alertEmails.filter((item) => item !== email))} disabled={isSaving}>✕</button></span>)
                    : <span className="acEmpty">Sin correos</span>}
                </div>
                <div className="acAdd">
                  <input id="alert-email-input" type="text" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }} placeholder="correo@empresa.com" aria-label="Añadir correo a la alerta" />
                  <button type="button" className="speechSecondaryButton" onClick={addEmail} disabled={isSaving}>Añadir</button>
                </div>
              </div>}
              {(updatedBy || updatedAt) && <p className="acHint">{updatedBy && `Actualizado por ${updatedBy}`}{updatedBy && updatedAt ? " · " : ""}{updatedAt}</p>}
            </section>
            <ChangeHistory section="email" description="Cambios en quién recibe la alerta de grabaciones." refreshKey={successMsg} />
          </div>}
        </section>
      </main>
    </div>
  );
}
