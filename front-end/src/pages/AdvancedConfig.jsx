import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
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
  const [ccEmails, setCcEmails] = useState([]);
  const [bccEmails, setBccEmails] = useState([]);
  const [ccInput, setCcInput] = useState("");
  const [bccInput, setBccInput] = useState("");
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

  const isSuperAdmin = user?.role === "superadmin" || user?.email === "adminkinedrik@eadic.com";
  const [activeTab, setActiveTab] = useState(isSuperAdmin ? "model" : "whatsapp");

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
      const loadedCc = normalizeEmailArray(config.ccEmails || []);
      const loadedBcc = normalizeEmailArray(config.bccEmails || []).filter((email) => !loadedCc.includes(email));
      setCcEmails(loadedCc);
      setBccEmails(loadedBcc);
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
    const isAuthorized = user?.role === "superadmin" || user?.email === "adminkinedrik@eadic.com";
    if (isAuthorized) {
      loadEmailConfig();
      loadFollowupPrompts();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  const saveEmailConfig = async (newCc, newBcc) => {
    setErrorMsg("");
    setSuccessMsg("");
    setIsSaving(true);
    try {
      const parsedCc = normalizeEmailArray(newCc);
      const parsedBcc = normalizeEmailArray(newBcc).filter((email) => !parsedCc.includes(email));

      const invalidEmails = [...parsedCc, ...parsedBcc].filter((email) => !BASIC_EMAIL_REGEX.test(email));
      if (invalidEmails.length > 0) {
        setErrorMsg(`Corrige estos correos invalidos: ${invalidEmails.join(", ")}`);
        setIsSaving(false);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/admin/email-config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Role": user.role || "user",
          "X-Admin-Email": user.email || "",
          "X-Auth-Token": user.authToken || "",
        },
        body: JSON.stringify({
          ccEmails: parsedCc,
          bccEmails: parsedBcc,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo guardar la configuracion");
      }

      setCcEmails(parsedCc);
      setBccEmails(parsedBcc);
      setSuccessMsg("Configuracion actualizada automáticamente.");
      
      if (data.config) {
        setUpdatedBy(data.config.updatedBy || "");
      }
    } catch (error) {
      setErrorMsg(error.message || "Error guardando configuracion");
    } finally {
      setIsSaving(false);
    }
  };

  const addEmailToList = async (listType) => {
    setErrorMsg("");
    setSuccessMsg("");

    const rawValue = listType === "cc" ? ccInput : bccInput;
    const email = normalizeEmailValue(rawValue);

    if (!email) {
      setErrorMsg("Ingresa un correo para agregar.");
      return;
    }

    if (!BASIC_EMAIL_REGEX.test(email)) {
      setErrorMsg("Ingresa un correo valido.");
      return;
    }

    if (listType === "cc") {
      if (ccEmails.includes(email)) {
        setErrorMsg("Ese correo ya existe en la lista de CC.");
        return;
      }
      setCcInput("");
      await saveEmailConfig([...ccEmails, email], bccEmails);
      return;
    }

    if (bccEmails.includes(email)) {
      setErrorMsg("Ese correo ya existe en la lista de BCC.");
      return;
    }

    if (ccEmails.includes(email)) {
      setErrorMsg("Ese correo ya esta en CC. No puede repetirse en BCC.");
      return;
    }

    setBccInput("");
    await saveEmailConfig(ccEmails, [...bccEmails, email]);
  };

  const removeEmailFromList = async (listType, emailToRemove) => {
    if (listType === "cc") {
      await saveEmailConfig(ccEmails.filter(e => e !== emailToRemove), bccEmails);
      return;
    }
    await saveEmailConfig(ccEmails, bccEmails.filter(e => e !== emailToRemove));
  };

  const handleInputKeyDown = (e, listType) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addEmailToList(listType);
    }
  };

  const tabs = [
    ...(isSuperAdmin ? [["model", "Modelo de IA"]] : []),
    ["whatsapp", "Mensaje de WhatsApp"],
    ["email", "Correos"],
  ];
  const currentTab = tabs.some(([id]) => id === activeTab) ? activeTab : tabs[0][0];

  return (
    <div className="speechConfigPage">
      <Sidebar />
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
          >{label}{id === "model" && <small className="acTabBadge">SUPERADMIN</small>}</button>)}
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
          </div>}

          {currentTab === "email" && <div className="acPanel">
            {successMsg && <div role="status" className="speechNotice">{successMsg}</div>}
            {errorMsg && <div role="status" className="speechNotice error">{errorMsg}</div>}
            <section className="acCard">
              <div className="acCardHead"><div><h2>Copias de los reportes por correo</h2><p>Quién recibe copia de los reportes que se envían a los consultores.</p></div></div>
              {isLoading ? <p className="acHint">Cargando configuración…</p> : <div className="acTwoCol">
                {[["cc", "Con copia (CC)", ccEmails, ccInput, setCcInput], ["bcc", "Con copia oculta (CCO)", bccEmails, bccInput, setBccInput]].map(([type, label, emails, value, setValue]) => <div className="acEmailBlock" key={type}>
                  <strong>{label}</strong>
                  <div className="acChips">
                    {emails.length
                      ? emails.map((email) => <span key={email}>{email}<button type="button" aria-label={`Quitar ${email}`} onClick={() => removeEmailFromList(type, email)} disabled={isSaving}>✕</button></span>)
                      : <span className="acEmpty">Sin correos</span>}
                  </div>
                  <div className="acAdd">
                    <input id={`${type}-input`} type="text" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => handleInputKeyDown(e, type)} placeholder="correo@empresa.com" aria-label={`Añadir correo ${label}`} />
                    <button type="button" className="speechSecondaryButton" onClick={() => addEmailToList(type)} disabled={isSaving}>Añadir</button>
                  </div>
                </div>)}
              </div>}
              {(updatedBy || updatedAt) && <p className="acHint">{updatedBy && `Actualizado por ${updatedBy}`}{updatedBy && updatedAt ? " · " : ""}{updatedAt}</p>}
            </section>
          </div>}
        </section>
      </main>
    </div>
  );
}
