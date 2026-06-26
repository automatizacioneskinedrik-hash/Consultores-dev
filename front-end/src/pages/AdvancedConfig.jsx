import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import { getUser } from "../utils/user";
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

  const [openSections, setOpenSections] = useState({ email: true, whatsapp: true });
  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

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

  const authHeaders = {
    "X-Admin-Role": user.role || "user",
    "X-Admin-Email": user.email || "",
    "X-Auth-Token": user.authToken || "",
  };

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

  return (
    <>
      <Sidebar />
      <div className="advancedPage">
        <main className="advancedContent">
          <header className="advancedHeader">
            <h1 className="advancedTitle">
              <span className="titlePrimary">Configuracion</span>
              <span className="titleAccent">avanzada</span>
            </h1>
            <p>
              Define los correos que recibiran copia en los reportes automaticos.
            </p>
          </header>

          <section className="advancedPanel">
            <div className="advancedPanelTop" onClick={() => toggleSection("email")}>
              <h2>Configuracion de correo</h2>
              <svg className={`panelChevron${openSections.email ? "" : " collapsed"}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            <div className={`panelBody${openSections.email ? "" : " collapsed"}`}>
              {isLoading ? (
                <div className="advancedLoading">Cargando configuracion...</div>
              ) : (
                <div className="advancedForm">
                  <section className="emailBlock">
                    <div className="emailBlockHeader">
                      <h3>Correo con copia (CC)</h3>
                      <span>{ccEmails.length} agregados</span>
                    </div>
                    <div className="emailInputRow">
                      <input
                        id="cc-input"
                        type="text"
                        value={ccInput}
                        onChange={(e) => setCcInput(e.target.value)}
                        onKeyDown={(e) => handleInputKeyDown(e, "cc")}
                        placeholder="correo@gmail.com"
                      />
                      <button type="button" className="addEmailBtn" onClick={() => addEmailToList("cc")}>
                        Agregar
                      </button>
                    </div>
                    <small>Ingresa un correo por vez y presiona Enter o Agregar.</small>
                    <ul className="emailList">
                      {ccEmails.length === 0 ? (
                        <li className="emailEmpty">No hay correos en copia.</li>
                      ) : (
                        ccEmails.map((email) => (
                          <li key={email} className="emailItem">
                            <span>{email}</span>
                            <button type="button" className="emailRemoveBtn" onClick={() => removeEmailFromList("cc", email)}>
                              Eliminar
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </section>

                  <section className="emailBlock">
                    <div className="emailBlockHeader bcc">
                      <h3>Correo con copia oculta (BCC)</h3>
                      <span>{bccEmails.length} agregados</span>
                    </div>
                    <div className="emailInputRow">
                      <input
                        id="bcc-input"
                        type="text"
                        value={bccInput}
                        onChange={(e) => setBccInput(e.target.value)}
                        onKeyDown={(e) => handleInputKeyDown(e, "bcc")}
                        placeholder="correo@gmail.com"
                      />
                      <button type="button" className="addEmailBtn" onClick={() => addEmailToList("bcc")}>
                        Agregar
                      </button>
                    </div>
                    <small>Estas direcciones no seran visibles para los demas destinatarios.</small>
                    <ul className="emailList">
                      {bccEmails.length === 0 ? (
                        <li className="emailEmpty">No hay correos en copia oculta.</li>
                      ) : (
                        bccEmails.map((email) => (
                          <li key={email} className="emailItem">
                            <span>{email}</span>
                            <button type="button" className="emailRemoveBtn" onClick={() => removeEmailFromList("bcc", email)}>
                              Eliminar
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </section>
                </div>
              )}

              {successMsg && <div className="advancedNotice">{successMsg}</div>}
              {errorMsg && <div className="advancedError">{errorMsg}</div>}
              {(updatedBy || updatedAt) && (
                <div className="advancedMeta">
                  {updatedBy && <span>Actualizado por: {updatedBy}</span>}
                  {updatedAt && <span>Fecha: {updatedAt}</span>}
                </div>
              )}
            </div>
          </section>

          <section className="advancedPanel">
            <div className="advancedPanelTop" onClick={() => toggleSection("whatsapp")}>
              <h2>Prompt IA WhatsApp</h2>
              <svg className={`panelChevron${openSections.whatsapp ? "" : " collapsed"}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            <div className={`panelBody${openSections.whatsapp ? "" : " collapsed"}`}>
              <div className="advancedForm">
                {/* Columna izquierda: editor del nuevo prompt */}
                <section className="emailBlock">
                  <div className="emailBlockHeader">
                    <h3>Prompt</h3>
                  </div>
                  <textarea
                    className="followupPromptTextarea"
                    value={followupDraft}
                    onChange={(e) => setFollowupDraft(e.target.value)}
                    rows={8}
                    placeholder="Escribe la instrucción para el mensaje sugerido de WhatsApp..."
                  />
                  <div className="followupPromptActions">
                    <button
                      type="button"
                      className="addEmailBtn promptSaveBtn"
                      onClick={saveFollowupPrompt}
                      disabled={isSavingPrompt || !followupDraft.trim()}
                    >
                      {isSavingPrompt ? "Guardando..." : "Guardar prompt"}
                    </button>
                  </div>
                  <small>Al guardar se crea un nuevo prompt y se activa automáticamente.</small>
                </section>

                {/* Columna derecha: lista de prompts */}
                <section className="emailBlock">
                  <div className="emailBlockHeader">
                    <h3>Prompts guardados</h3>
                    <span>{followupPrompts.length} en total</span>
                  </div>
                  {isLoadingFollowup ? (
                    <div className="advancedLoading">Cargando prompts...</div>
                  ) : (
                    <ul className="emailList promptVersionList">
                      {followupPrompts.map((p) => (
                        <li key={p.id} className={`emailItem promptVersionItem${p.isActive ? " promptItemActive" : ""}`}>
                          <div className="promptVersionInfo">
                            <div className="promptVersionMeta">
                              {p.isDefault && <span className="promptBadgeDefault">Original</span>}
                              {p.isActive && <span className="promptBadgeActive">Activo</span>}
                              {p.createdAt?._seconds && (
                                <span className="promptVersionDate">
                                  {new Date(p.createdAt._seconds * 1000).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                                </span>
                              )}
                            </div>
                            <span className="promptVersionPreview">
                              {p.instruction.slice(0, 80)}{p.instruction.length > 80 ? "…" : ""}
                            </span>
                            {p.createdBy && p.createdBy !== "system" && (
                              <span className="promptVersionBy">{p.createdBy}</span>
                            )}
                          </div>
                          <div className="promptItemActions">
                            {!p.isActive && (
                              <button
                                type="button"
                                className="emailRemoveBtn promptRestoreBtn"
                                onClick={() => { activateFollowupPrompt(p.id); setFollowupDraft(p.instruction); }}
                                disabled={activatingId === p.id}
                              >
                                {activatingId === p.id ? "..." : "Activar"}
                              </button>
                            )}
                            {!p.isDefault && (
                              <button
                                type="button"
                                className="emailRemoveBtn"
                                onClick={() => deleteFollowupPrompt(p.id)}
                                disabled={deletingId === p.id}
                              >
                                {deletingId === p.id ? "..." : "Eliminar"}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {promptMsg.text && (
                <div className={promptMsg.type === "success" ? "advancedNotice" : "advancedError"}>
                  {promptMsg.text}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
