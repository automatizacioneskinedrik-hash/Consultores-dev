import { useEffect, useMemo, useState } from "react";
import { FaPencilAlt, FaTrashAlt } from "react-icons/fa";
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
  const itemsPerPage = 4;

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
      const res = await fetch(`${API_BASE_URL}/api/admin/users`);
      const data = await res.json();
      if (data.ok) {
        setUsers(data.users);
      } else {
        console.error("Error from API:", data.error);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = queryStr.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q),
    );
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
        headers: { "Content-Type": "application/json" },
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
          "X-Admin-Role": currentUser.role || "user"
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
          <div className="topSection">
            <div className="cardHeader">
              <h1>Gestión de Usuarios</h1>
              <p>Administra el acceso de tu equipo</p>
            </div>

            <div className="actionsRow">
              <div className="searchBox">
                <SearchIcon />
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
                + Añadir Usuario
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
                  <div className="headerCell emailHeader">
                    CORREO ELECTRÓNICO
                  </div>
                  <div className="headerCell roleHeader" style={{ flex: '1' }}>ROL</div>
                  <div className="headerCell actionsHeader">ACCIONES</div>
                </div>
                <div className="userCards">
                  {paginatedUsers.map((u, idx) => {
                    const initials = getInitials(u.name);
                    const pillClass =
                      idx % 3 === 0
                        ? "blueBg"
                        : idx % 3 === 1
                          ? "lilacBg"
                          : "yellowBg";
                    return (
                      <div key={u.id} className="userCard">
                        <div className="cardTop">
                          <div className="userInfo">
                            <div className={`initial ${pillClass}`}>
                              {initials}
                            </div>
                            <div className="userDetails">
                              <div className="userName">{u.name}</div>
                              <div className="userEmail">{u.email}</div>
                            </div>
                          </div>
                          <div className="userRole" style={{ flex: '1', fontSize: '12px', fontWeight: '600', color: u.role === 'admin' ? '#f49b1a' : '#6c3af6' }}>
                            {u.role === 'admin' ? 'ADMIN' : (u.role === 'superadmin' ? 'SUPERADMIN' : 'USUARIO')}
                          </div>
                          <div className="actions">
                            <button
                              className="iconBtn"
                              title="Editar"
                              onClick={() => openEdit(u)}
                              aria-label="Editar"
                            >
                              <FaPencilAlt />
                            </button>
                            {/* Restricted Deletion: Admin cannot delete other Admin */}
                            {!(currentUser.role === 'admin' && u.role === 'admin') && (
                              <button
                                className="iconBtn deleteBtn"
                                title="Eliminar"
                                onClick={() => onDelete(u)}
                                aria-label="Eliminar"
                              >
                                <FaTrashAlt />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

          <div className="footerNote">
            ● TODOS LOS CAMBIOS EN ESTA SECCIÓN SON SINCRONIZADOS CON FIREBASE FIRESTORE.
          </div>
        </main>

        {loading && (
          <div className="loadingOverlay">Cargando usuarios...</div>
        )}

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
                  <select
                    className="input"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={{ background: '#1a1a1a', border: '1px solid #333', color: 'white', padding: '10px', borderRadius: '4px' }}
                  >
                    <option value="user">Usuario normal</option>
                    <option value="admin">Administrador</option>
                  </select>
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
