import { useEffect, useMemo, useState } from "react";
import { Mail, Shield, Edit2, Trash2, Search, UserPlus } from "lucide-react";
import Sidebar from "../components/Sidebar";
import GuideTour from "../components/GuideTour";

const ADMIN_TOUR = [
  { title: "¡Hola! Yo me encargo del equipo", text: "Aquí decides quién entra al sistema y qué puede hacer cada persona. Te muestro cómo." },
  { target: ".adminActionsHeader .searchWrapper", title: "Busca a alguien", text: "Escribe el nombre o el correo y la lista se filtra al instante." },
  { target: ".addBtn", title: "Añade a una persona nueva", text: "Registra su nombre, su correo y su rol. Con ese correo podrá entrar al sistema." },
  { do: [{ show: [".addBtn", ".modalOverlay .modal"] }], target: ".modalOverlay .modal", title: "El formulario", text: "Aquí escribes el nombre y el correo de la persona y eliges su rol: usuario, admin o superadmin." },
  { target: ".modalOverlay .primaryBtn", title: "Guárdalo", text: "Cuando todo esté bien, con este botón la registras. Hasta entonces no se guarda nada." },
  { do: [{ hide: [".modalOverlay .closeBtn", ".modalOverlay .modal"] }], target: ".tableWrapper", title: "Tu equipo", text: "Aquí ves a cada persona con su correo y su rol: usuario, admin o superadmin. El rol define qué secciones puede ver." },
  { target: ".actionIconBtn", title: "Editar o quitar", text: "Con estos botones cambias los datos o el rol de una persona, o la quitas del sistema." },
  { target: ".pagination", title: "Más personas", text: "Si el equipo es grande, la lista se reparte en páginas. Muévete entre ellas con estos botones." },
  { title: "¡Listo, ya sabes gestionar el equipo!", text: "Si algo no te quedó claro, haz clic en mí, abajo a la izquierda, y repetimos el recorrido." },
];
const ADMIN_TOUR_CLEANUP = [{ hide: [".modalOverlay .closeBtn", ".modalOverlay .modal"] }];

import UserAvatar from "../components/UserAvatar";
import { CARGOS, canManage, cargoOf } from "../utils/roles";

const CARGO_ORDER = CARGOS.map((option) => option.id);

const roleDescription = (id) => {
  if (id === "ingeniero") return "Acceso total al sistema.";
  return cargoOf({ cargo: id }).manages
    ? "Ve todas las llamadas y métricas, y gestiona usuarios, speech comercial y configuración."
    : "Ve solo sus propias llamadas y métricas.";
};
import "./Admin.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queryStr, setQueryStr] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("kadvisor");
  const [formError, setFormError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const itemsPerPage = 8;
  const [changes, setChanges] = useState([]);

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("kinedrix_user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const isEngineer = cargoOf(currentUser).id === "ingeniero";

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: {
          "X-Admin-Role": currentUser.role || "user",
          "X-Admin-Email": currentUser.email || "",
          "X-Auth-Token": currentUser.authToken || ""
        }
      });
      const data = await res.json();
      if (data.ok) {
        setUsers(data.users);
      } else if (res.status !== 403 && res.status !== 401) {
        // Only log serious non-auth errors
        console.warn("API Note:", data.error);
      }
    } catch (error) {
      // Don't log network errors to console.error
      console.debug("Fetch inhibited:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Every change made in the app, with the profile that made it.
  const fetchChanges = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/audit-log`, {
        headers: { "X-Admin-Email": currentUser.email || "", "X-Auth-Token": currentUser.authToken || "" },
      });
      const data = await res.json();
      if (data.ok) setChanges(data.changes);
    } catch (error) {
      console.debug("Historial no disponible:", error.message);
    }
  };

  useEffect(() => {
    const isAuthorized = canManage(currentUser);
    if (isAuthorized) {
      fetchUsers();
      fetchChanges();
    } else {
      setLoading(false);
    }
  }, [currentUser]);

  const filteredUsers = useMemo(() => {
    const q = queryStr.trim().toLowerCase();
    
    let list = q ? users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
    ) : [...users];

    return list.sort((a, b) => {
      const orderA = CARGO_ORDER.indexOf(cargoOf(a).id);
      const orderB = CARGO_ORDER.indexOf(cargoOf(b).id);
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [users, queryStr]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIdx, startIdx + itemsPerPage);

  const openCreate = () => {
    setMode("create");
    setEditingId(null);
    setName("");
    setEmail("");
    setCargo("kadvisor");
    setFormError("");
    setIsModalOpen(true);
  };

  const openEdit = (u) => {
    setMode("edit");
    setEditingId(u.id);
    setName(u.name);
    setEmail(u.email);
    setCargo(cargoOf(u).id);
    setFormError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormError("");
  };

  const validate = (candidateName, candidateEmail) => {
    const n = candidateName.trim();
    const e = candidateEmail.trim().toLowerCase();
    if (!n) return "El nombre es obligatorio.";
    if (!e) return "El correo es obligatorio.";
    const basicEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    if (!basicEmailOk) return "Ingresa un correo válido.";
    const emailTaken = users.some((u) => {
      if (mode === "edit" && u.id === editingId) return false;
      return u.email.toLowerCase() === e;
    });
    if (emailTaken) return "Este correo ya existe en la lista.";
    return "";
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const error = validate(name, email);
    if (error) {
      setFormError(error);
      return;
    }

    setIsSaving(true);
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    try {
      const url = mode === "create"
        ? `${API_BASE_URL}/api/admin/users`
        : `${API_BASE_URL}/api/admin/users/${editingId}`;

      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Role": currentUser.role || "user",
          "X-Admin-Email": currentUser.email || "",
          "X-Auth-Token": currentUser.authToken || ""
        },
        body: JSON.stringify({ name: cleanName, email: cleanEmail, cargo }),
      });

      const data = await res.json();
      if (data.ok) {
        await fetchUsers();
        fetchChanges();
        closeModal();
      } else {
        setFormError(data.error || "Error al guardar");
      }
    } catch (err) {
      setFormError("Error de conexión con el servidor");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = async (u) => {
    if (!window.confirm(`¿Eliminar a "${u.name}"?\nEsta acción no se puede deshacer.`)) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${u.id}`, {
        method: "DELETE",
        headers: {
          "X-Admin-Role": currentUser.role || "user",
          "X-Admin-Email": currentUser.email || "",
          "X-Auth-Token": currentUser.authToken || ""
        }
      });
      const data = await res.json();
      if (data.ok) {
        await fetchUsers();
        fetchChanges();
      } else {
        alert(data.error || "Error al eliminar");
      }
    } catch (err) {
      alert("Error de conexión al eliminar");
      console.error(err);
    }
  };

  function SearchIcon() {
    return (
      <svg className="iSearch" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M16.2 16.2 21 21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  function getInitials(fullName = "") {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    const first = parts[0]?.[0] || "";
    const second = parts.length > 1 ? parts[1]?.[0] || "" : "";
    return (first + second).toUpperCase();
  }

  return (
    <>
      <Sidebar />
      {!loading && <GuideTour id="admin" steps={ADMIN_TOUR} cleanup={ADMIN_TOUR_CLEANUP} mascot="/mascots/dots/dot-verde-gestion-usuarios-guia.webp" mascotName="el personaje verde" aura="rgba(138, 188, 67, .6)" />}
      <div className="adminPage">
        <main className="adminContent">
          <div className="adminHeaderRow">
            <div className="adminTitleSection">
              <h1 className="pageTitle">Gestión de <span className="titleAccent">Usuarios</span></h1>
              <p>Administra el acceso y los roles de tu equipo</p>
            </div>

            <div className="adminActionsHeader">
              <div className="searchWrapper">
                <Search size={18} className="searchIcon" />
                <input
                  type="text"
                  value={queryStr}
                  onChange={(e) => {
                    setQueryStr(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Buscar por nombre o correo..."
                />
              </div>
              <button className="addBtn" onClick={openCreate}>
                <UserPlus size={18} />
                <span>Añadir Usuario</span>
              </button>
            </div>
          </div>

          <div className="tableWrapper">
            {filteredUsers.length === 0 ? (
              <div className="emptyRow">
                No hay resultados para tu búsqueda.
              </div>
            ) : (
              <>
                <div className="tableHeaders">
                  <div className="headerCell nameHeader">NOMBRE</div>
                  <div className="headerCell emailHeader">CORREO ELECTRÓNICO</div>
                  <div className="headerCell roleHeader">ROL</div>
                  <div className="headerCell actionsHeader">ACCIONES</div>
                </div>
                <div className="userCardsContainer">
                  {paginatedUsers.map((u) => (
                    <div key={u.id} className={`userLogRow role-${u.role || 'user'}`}>
                      <div className="userRowContent">
                        <div className="userNameCol">
                          <UserAvatar name={u.name} email={u.email} picture={u.picture || u.photoURL} className="adminUserAvatar" />
                          <span className="fullName">{u.name}</span>
                        </div>
                        
                        <div className="userEmailCol">
                          <Mail size={14} className="cellIcon" />
                          <span>{u.email}</span>
                        </div>

                        <div className="userRoleCol">
                          <div className={`roleBadge ${u.role || 'user'}`}>
                            <Shield size={12} className="cellIcon" />
                            <span>{cargoOf(u).label}</span>
                          </div>
                        </div>

                        <div className="userActionsCol">
                          <button
                            className="actionIconBtn"
                            title="Editar"
                            onClick={() => openEdit(u)}
                          >
                            <Edit2 size={16} />
                          </button>
                          {/* Only an Ingeniero can remove another Ingeniero */}
                          {(cargoOf(u).id !== "ingeniero" || isEngineer) && (
                            <button
                              className="actionIconBtn delete"
                              title="Eliminar"
                              onClick={() => onDelete(u)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="pagination">
                    <span className="paginationInfo">
                      VISUALIZANDO {startIdx + 1} -{" "}
                      {Math.min(startIdx + itemsPerPage, filteredUsers.length)}{" "}
                      DE {filteredUsers.length} USUARIOS
                    </span>
                    <div className="paginationControls">
                      <button
                        className="paginationBtn"
                        onClick={() =>
                          setCurrentPage(Math.max(1, currentPage - 1))
                        }
                        disabled={currentPage === 1}
                      >
                        ‹
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                        (page) => (
                          <button
                            key={page}
                            className={`paginationBtn ${currentPage === page ? "active" : ""
                              }`}
                            onClick={() => setCurrentPage(page)}
                          >
                            {page}
                          </button>
                        ),
                      )}
                      <button
                        className="paginationBtn"
                        onClick={() =>
                          setCurrentPage(Math.min(totalPages, currentPage + 1))
                        }
                        disabled={currentPage === totalPages}
                      >
                        ›
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <section className="auditCard" aria-labelledby="auditTitle">
            <h2 id="auditTitle">Historial de cambios</h2>
            <p>Cada cambio en usuarios, speech comercial y configuración, con quién lo hizo y cuándo.</p>
            {changes.length === 0
              ? <div className="auditEmpty">Todavía no hay cambios registrados.</div>
              : <ul className="auditList">
                  {changes.map((change) => <li key={change.id}>
                    <span className="auditWhen">{change.changedAt ? new Date(change.changedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : ""}</span>
                    <span className="auditWhat">{change.summary}</span>
                    <span className="auditWho">
                      <UserAvatar name={change.changedByName} email={change.changedBy} picture={users.find((u) => u.email === change.changedBy)?.picture} className="avatarSm" />
                      {change.changedByName || change.changedBy}
                    </span>
                  </li>)}
                </ul>}
          </section>
        </main>

        {/* Loading overlay removed per user request */}

        {isModalOpen && (
          <div className="modalOverlay" onMouseDown={closeModal}>
            <div
              className="modal"
              onMouseDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="modalHeader">
                <h2>
                  {mode === "create" ? "Añadir usuario" : "Editar usuario"}
                </h2>
                <button
                  className="closeBtn"
                  onClick={closeModal}
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              <form className="modalBody" onSubmit={onSubmit}>
                <label className="field">
                  <span className="labelText">Nombre completo</span>
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setFormError("");
                    }}
                    placeholder="Nombre Apellido"
                  />
                </label>
                <label className="field">
                  <span className="labelText">Correo electrónico</span>
                  <input
                    className="input"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFormError("");
                    }}
                    placeholder="correo@dominio.com"
                  />
                </label>
                <label className="field">
                  <span className="labelText">Rol</span>
                  <select className="input roleSelect" value={cargo} onChange={(e) => setCargo(e.target.value)}>
                    {CARGOS.filter((option) => option.id !== "ingeniero" || isEngineer).map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                  <span className="roleHint">
                    <strong>{cargoOf({ cargo }).label}</strong>
                    <span>{roleDescription(cargo)}</span>
                  </span>
                </label>
                {formError && <div className="formError">{formError}</div>}
                <div className="modalActions">
                  <button
                    type="button"
                    className="ghostBtn"
                    onClick={closeModal}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="primaryBtn" disabled={isSaving}>
                    {isSaving ? "Guardando..." : (mode === "create" ? "Guardar" : "Guardar cambios")}
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
