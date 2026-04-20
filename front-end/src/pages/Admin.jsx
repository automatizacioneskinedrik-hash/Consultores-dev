import { useEffect, useMemo, useState } from "react";
import { User, Mail, Shield, Edit2, Trash2, Search, UserPlus } from "lucide-react";
import Sidebar from "../components/Sidebar";
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
  const [role, setRole] = useState("user");
  const [formError, setFormError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const itemsPerPage = 8;

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("kinedrix_user") || "{}");
    } catch {
      return {};
    }
  }, []);

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

  useEffect(() => {
    const isAuthorized = currentUser?.role === "admin" || currentUser?.role === "superadmin" || currentUser?.email === "adminkinedrik@eadic.com";
    if (isAuthorized) {
      fetchUsers();
    } else {
      setLoading(false);
    }
  }, [currentUser]);

  const filteredUsers = useMemo(() => {
    const q = queryStr.trim().toLowerCase();
    const roleOrder = { "user": 1, "admin": 2, "superadmin": 3 };
    
    let list = q ? users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
    ) : [...users];

    return list.sort((a, b) => {
      const orderA = roleOrder[a.role || "user"] || 1;
      const orderB = roleOrder[b.role || "user"] || 1;
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
    setRole("user");
    setFormError("");
    setIsModalOpen(true);
  };

  const openEdit = (u) => {
    setMode("edit");
    setEditingId(u.id);
    setName(u.name);
    setEmail(u.email);
    setRole(u.role || "user");
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
        body: JSON.stringify({ name: cleanName, email: cleanEmail, role }),
      });

      const data = await res.json();
      if (data.ok) {
        await fetchUsers();
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
      <div className="adminPage">
        <main className="adminContent">
          <div className="adminHeaderRow">
            <div className="adminTitleSection">
              <h1>Gestión de Usuarios</h1>
              <p>Administra el acceso y roles de tu equipo</p>
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
                          <div className="userAvatar">
                            <User size={16} />
                          </div>
                          <span className="fullName">{u.name}</span>
                        </div>
                        
                        <div className="userEmailCol">
                          <Mail size={14} className="cellIcon" />
                          <span>{u.email}</span>
                        </div>

                        <div className="userRoleCol">
                          <div className={`roleBadge ${u.role || 'user'}`}>
                            <Shield size={12} className="cellIcon" />
                            <span>{u.role === 'admin' ? 'ADMIN' : (u.role === 'superadmin' ? 'SUPERADMIN' : 'USUARIO')}</span>
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
                          {/* Restricted Deletion: Admin cannot delete other Admins OR Super Admins */}
                          {!(currentUser.role === 'admin' && (u.role === 'admin' || u.role === 'superadmin')) && (
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
                  <span className="labelText">Rol del usuario</span>
                  <div className="roleSelector">
                    <label className={`roleOption ${role === 'user' ? 'active' : ''}`}>
                      <input 
                        type="radio" 
                        name="role" 
                        value="user" 
                        checked={role === 'user'} 
                        onChange={(e) => setRole(e.target.value)} 
                        className="roleRadio"
                      />
                      <div className="roleInfo">
                        <span className="roleText">Usuario normal</span>
                        <span className="roleDescription">Acceso a carga y análisis básico</span>
                      </div>
                    </label>

                    <label className={`roleOption ${role === 'admin' ? 'active' : ''}`}>
                      <input 
                        type="radio" 
                        name="role" 
                        value="admin" 
                        checked={role === 'admin'} 
                        onChange={(e) => setRole(e.target.value)}
                        className="roleRadio"
                      />
                      <div className="roleInfo">
                        <span className="roleText">Administrador</span>
                        <span className="roleDescription">Gestión del equipo y configuraciones</span>
                      </div>
                    </label>

                    {(currentUser.role === 'superadmin' || currentUser.email === 'adminkinedrik@eadic.com') && (
                      <label className={`roleOption ${role === 'superadmin' ? 'active' : ''}`}>
                        <input 
                          type="radio" 
                          name="role" 
                          value="superadmin" 
                          checked={role === 'superadmin'} 
                          onChange={(e) => setRole(e.target.value)}
                          className="roleRadio"
                        />
                        <div className="roleInfo">
                          <span className="roleText">Super Admin</span>
                          <span className="roleDescription">Control total del sistema</span>
                        </div>
                      </label>
                    )}
                  </div>
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
