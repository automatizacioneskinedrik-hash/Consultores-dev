import React, { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import "./Prompts.css";
import { FaStar, FaRegStar, FaCheckCircle, FaTools, FaPlus, FaUndo } from "react-icons/fa";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export default function Prompts() {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSavedModalOpen, setIsSavedModalOpen] = useState(false);
  
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchPrompts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/prompts?t=${Date.now()}`);
      const data = await res.json();
      if (data.ok) {
        setPrompts(data.prompts);
      } else {
        console.error("Error from API:", data.error);
      }
    } catch (error) {
      console.error("Error fetching prompts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  const openCreate = () => {
    setName("");
    setContent("");
    setFormError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormError("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setFormError("El nombre es obligatorio.");
    if (!content.trim()) return setFormError("El contenido es obligatorio.");

    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), content: content.trim(), isActive: false, isFavorite: false }),
      });
      const data = await res.json();
      if (data.ok) {
        await fetchPrompts();
        closeModal();
      } else {
        setFormError(data.error || "Error al guardar");
      }
    } catch (err) {
      setFormError("Error de conexión con el servidor");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleFavorite = async (prompt) => {
    try {
      await fetch(`${API_BASE_URL}/api/prompts/${prompt.id}/favorite`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !prompt.isFavorite }),
      });
      await fetchPrompts();
    } catch (err) {
      console.error(err);
    }
  };

  const setAsActive = async (prompt) => {
    if (prompt.isActive) return;
    try {
      await fetch(`${API_BASE_URL}/api/prompts/${prompt.id}/active`, {
        method: "PUT"
      });
      await fetchPrompts();
    } catch (err) {
      console.error(err);
    }
  };

  const restoreDefault = async () => {
    if (!window.confirm("¿Seguro que deseas revertir al prompt predeterminado?")) return;
    try {
      await fetch(`${API_BASE_URL}/api/prompts/restore-default`, { method: "POST" });
      await fetchPrompts();
    } catch (err) {
      console.error(err);
    }
  };

  const openSavedPrompts = () => {
    setIsSavedModalOpen(true);
  };
  
  const closeSavedPrompts = () => {
    setIsSavedModalOpen(false);
  };

  // Sorting: Active > Favorites > Others. Also filter out empty prompts.
  const validPrompts = prompts.filter(p => (p.name && p.name.trim() !== '') || (p.content && p.content.trim() !== ''));
  const sortedPrompts = [...validPrompts].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return new Date(b.createdAt?._seconds ? b.createdAt._seconds * 1000 : 0) - new Date(a.createdAt?._seconds ? a.createdAt._seconds * 1000 : 0);
  });

  const activePrompt = prompts.find(p => p.isActive);

  return (
    <>
      <Sidebar />
      <div className="promptsPage">
        <main className="promptsContent">
          <div className="topSection">
            <div className="cardHeader">
              <h1>Gestor de Prompts</h1>
              <p>Administra las instrucciones de comportamiento de la IA</p>
            </div>
            <div className="actionsRow">
              <button className="ghostBtn restoreBtn" onClick={openSavedPrompts} title="Ver prompts guardados">
                <FaTools /> Prompts Guardados
              </button>
              <button className="primaryBtn addBtn" onClick={openCreate}>
                <FaPlus /> Añadir Prompt
              </button>
            </div>
          </div>

          <div className="contentWrapper">
            {/* Active Prompt Banner */}
            {activePrompt && (
              <div className="activePromptBanner">
                <div className="activeHeader">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div className="activeBadge">
                      <FaCheckCircle /> EN USO ACTUALMENTE
                    </div>
                    {/* Botón Revertir Cambios */}
                    <button className="ghostBtn restoreBtn" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={restoreDefault}>
                      <FaUndo /> Revertir cambios
                    </button>
                  </div>
                  <h3>{activePrompt.name}</h3>
                </div>
                <div className="activeContentBox">
                  <p>{activePrompt.content}</p>
                </div>
              </div>
            )}

            {!activePrompt && (
              <div className="emptyRow">
                <h3 style={{ color: '#040025', marginBottom: '8px' }}>No hay prompt activo</h3>
                <p style={{ marginBottom: '16px' }}>Añade uno para comenzar a instruir a la IA.</p>
                <button className="primaryBtn" onClick={openCreate}>
                  <FaPlus /> Añadir Prompt
                </button>
              </div>
            )}
          </div>
        </main>

        {/* Modal Saved Prompts */}
        {isSavedModalOpen && (
          <div className="modalOverlay" onMouseDown={closeSavedPrompts} style={{justifyContent: 'flex-end'}}>
            <div className="savedPromptsPanel" onMouseDown={(e) => e.stopPropagation()}>
              <div className="panelHeader">
                <h2>Prompts<br/>Guardados</h2>
                <button className="closeBtn" onClick={closeSavedPrompts}>✕</button>
              </div>
              <div className="panelBody">
                {loading ? (
                  <div className="loadingText">Cargando prompts...</div>
                ) : sortedPrompts.length === 0 ? (
                  <div className="emptyRow">
                    <p style={{marginBottom: '10px'}}>Aún no tienes prompts guardados.</p>
                    <button className="primaryBtn" onClick={() => { closeSavedPrompts(); openCreate(); }}>
                      <FaPlus /> Agregar el primer prompt
                    </button>
                  </div>
                ) : (
                  <div className="promptsListVertical">
                    {sortedPrompts.map(prompt => (
                      <div key={prompt.id} className={`savedPromptCard ${prompt.isActive ? 'isActiveCard' : ''}`}>
                        <div className="spcTop">
                          <button className="spcFavBtn" onClick={() => toggleFavorite(prompt)} title="Marcar como favorito">
                            {prompt.isFavorite ? <FaStar className="starIcon filled" /> : <FaRegStar className="starIcon" />}
                          </button>
                          <h4>{prompt.name}</h4>
                        </div>
                        <div className="spcMiddle">
                          <p>{prompt.content}</p>
                        </div>
                        <div className="spcBottom">
                          {!prompt.isActive ? (
                            <button className="spcUseBtn" onClick={() => { setAsActive(prompt); closeSavedPrompts(); }}>
                              <FaCheckCircle /> Activar
                            </button>
                          ) : (
                            <span className="spcActiveText"><FaCheckCircle /> Seleccionado</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Create Prompt */}
        {isModalOpen && (
          <div className="modalOverlay" onMouseDown={closeModal}>
            <div className="modal promptsModal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHeader">
                <h2>Añadir Nuevo Prompt</h2>
                <button className="closeBtn" onClick={closeModal}>✕</button>
              </div>
              <form className="modalBody" onSubmit={onSubmit}>
                <label className="field">
                  <span className="labelText">Nombre o Etiqueta</span>
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setFormError(""); }}
                    placeholder="Ej: Versión enfocada en objeciones"
                    autoFocus
                  />
                </label>
                <p className="fieldSubtext">El formato del correo está protegido. Solo modifica tono y enfoque.</p>
                <label className="field">
                  <span className="labelText">Instrucciones de Comportamiento</span>
                  <textarea
                    className="input contentArea"
                    value={content}
                    onChange={(e) => { setContent(e.target.value); setFormError(""); }}
                    placeholder="Escribe las instrucciones aquí..."
                    rows="6"
                  />
                </label>
                {formError && <div className="formError">{formError}</div>}
                <div className="modalActions">
                  <button type="button" className="ghostBtn" onClick={closeModal}>Cancelar</button>
                  <button type="submit" className="primaryBtn" disabled={isSaving}>
                    {isSaving ? "Guardando..." : "Guardar prompt"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
