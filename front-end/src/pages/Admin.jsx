import { useEffect, useMemo, useState } from "react";
import { FaPencilAlt, FaTrashAlt } from "react-icons/fa";
import Sidebar from "../components/Sidebar";
import "./Admin.css";

const STORAGE_KEY = "kinedrix_users_v1";
const DEFAULT_USERS = [
  {
    id: "u1",
    name: "Alejandro Garcia",
    email: "alejandro.g@kinedrik.com",
    role: "User",
  },
  {
    id: "u2",
    name: "Beatriz Lopez",
    email: "b.lopez@kinedrik.com",
    role: "User",
  },
  {
    id: "u3",
    name: "Carlos Martinez",
    email: "carlos.mtz@kinedrik.com",
    role: "User",
  },
  {
    id: "u4",
    name: "Elena Rodriguez",
    email: "elena.rodriguez@kinedrik.com",
    role: "Admin",
  },
];

function normalizeRole(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "admin" ? "Admin" : "User";
}

function isAllowedInstitutionalEmail(value) {
  const emailValue = String(value || "").trim().toLowerCase();
  return (
    emailValue.endsWith(".eadic@gmail.com") ||
    emailValue.endsWith("@kinedrik.com")
  );
}

function normalizeUsers(users) {
  if (!Array.isArray(users)) return [];
  return users.map((u) => ({
    ...u,
    role: normalizeRole(u?.role),
  }));
}

function getInitials(fullName = "") {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[1]?.[0] || "" : "";
  return (first + second).toUpperCase();
}

function makeId() {
  return `u_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeLoadUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return normalizeUsers(parsed);
  } catch {
    return null;
  }
}

function safeSaveUsers(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function SearchIcon() {
  return (
    <svg
      className="iSearch"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M16.2 16.2 21 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Admin() {
  const [users, setUsers] = useState(() => safeLoadUsers() ?? DEFAULT_USERS);
  const [query, setQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("User");
  const [formError, setFormError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;

  useEffect(() => {
    safeSaveUsers(users);
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        normalizeRole(u.role).toLowerCase().includes(q),
    );
  }, [users, query]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIdx, startIdx + itemsPerPage);

  const openCreate = () => {
    setMode("create");
    setEditingId(null);
    setName("");
    setEmail("");
    setRole("User");
    setFormError("");
    setIsModalOpen(true);
  };

  const openEdit = (u) => {
    setMode("edit");
    setEditingId(u.id);
    setName(u.name);
    setEmail(u.email);
    setRole(normalizeRole(u.role));
    setFormError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormError("");
  };

  const validate = (candidateName, candidateEmail, candidateRole) => {
    const n = candidateName.trim();
    const e = candidateEmail.trim().toLowerCase();
    if (!n) return "El nombre es obligatorio.";
    if (!e) return "El correo es obligatorio.";
    if (!["Admin", "User"].includes(candidateRole)) {
      return "Selecciona un rol valido.";
    }
    const basicEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    if (!basicEmailOk) return "Ingresa un correo valido.";
    if (!isAllowedInstitutionalEmail(e)) {
      return "Solo se permiten correos que terminen en .eadic@gmail.com o @kinedrik.com.";
    }
    const emailTaken = users.some((u) => {
      if (mode === "edit" && u.id === editingId) return false;
      return u.email.toLowerCase() === e;
    });
    if (emailTaken) return "Este correo ya existe en la lista.";
    return "";
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const cleanRole = normalizeRole(role);
    const error = validate(name, email, cleanRole);
    if (error) {
      setFormError(error);
      return;
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (mode === "create") {
      const newUser = {
        id: makeId(),
        name: cleanName,
        email: cleanEmail,
        role: cleanRole,
      };
      setUsers((prev) => [newUser, ...prev]);
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingId
            ? { ...u, name: cleanName, email: cleanEmail, role: cleanRole }
            : u,
        ),
      );
    }
    closeModal();
  };

  const onDelete = (u) => {
    const ok = window.confirm(
      `Eliminar a "${u.name}"?\n\nEsta accion no se puede deshacer.`,
    );
    if (!ok) return;
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
  };

  return (
    <>
      <Sidebar />
      <div className="adminPage">
        <main className="adminContent">
          <div className="topSection">
            <div className="cardHeader">
              <h1>Gestion de Usuarios</h1>
              <p>Administra el acceso de tu equipo</p>
            </div>

            <div className="actionsRow">
              <div className="searchBox">
                <SearchIcon />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Buscar por nombre, correo o rol..."
                />
              </div>
              <button className="addBtn" onClick={openCreate}>
                + Anadir Usuario
              </button>
            </div>
          </div>

          <div className="tableWrapper">
            {filteredUsers.length === 0 ? (
              <div className="emptyRow">No hay resultados para tu busqueda.</div>
            ) : (
              <>
                <div className="tableHeaders">
                  <div className="headerCell nameHeader">NOMBRE</div>
                  <div className="headerCell emailHeader">CORREO ELECTRONICO</div>
                  <div className="headerCell actionsHeader">ACCIONES</div>
                </div>
                <div className="userCards">
                  {paginatedUsers.map((u, idx) => {
                    const initials = getInitials(u.name);
                    const pillClass =
                      idx % 3 === 0 ? "blueBg" : idx % 3 === 1 ? "lilacBg" : "yellowBg";
                    const userRole = normalizeRole(u.role);
                    return (
                      <div key={u.id} className="userCard">
                        <div className="cardTop">
                          <div className="userInfo">
                            <div className={`initial ${pillClass}`}>{initials}</div>
                            <div className="userDetails">
                              <div className="userName">{u.name}</div>
                              <div className="userEmail">{u.email}</div>
                            </div>
                          </div>
                          <div className="actions">
                            <span
                              className={`roleTag ${
                                userRole === "Admin" ? "roleTagAdmin" : "roleTagUser"
                              }`}
                            >
                              {userRole}
                            </span>
                            <button
                              className="iconBtn"
                              title="Editar"
                              onClick={() => openEdit(u)}
                              aria-label="Editar"
                            >
                              <FaPencilAlt />
                            </button>
                            <button
                              className="iconBtn deleteBtn"
                              title="Eliminar"
                              onClick={() => onDelete(u)}
                              aria-label="Eliminar"
                            >
                              <FaTrashAlt />
                            </button>
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
                      {Math.min(startIdx + itemsPerPage, filteredUsers.length)} DE{" "}
                      {filteredUsers.length} USUARIOS
                    </span>
                    <div className="paginationControls">
                      <button
                        className="paginationBtn"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        &#8249;
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          className={`paginationBtn ${currentPage === page ? "active" : ""}`}
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        className="paginationBtn"
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                      >
                        &#8250;
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="footerNote">
            TODOS LOS CAMBIOS EN ESTA SECCION SON AUDITADOS POR EL SISTEMA DE
            SEGURIDAD KINEDRIK.
          </div>
        </main>

        {isModalOpen && (
          <div className="modalOverlay" onMouseDown={closeModal}>
            <div
              className="modal"
              onMouseDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="modalHeader">
                <h2>{mode === "create" ? "Anadir usuario" : "Editar usuario"}</h2>
                <button className="closeBtn" onClick={closeModal} aria-label="Cerrar">
                  x
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
                  <span className="labelText">Correo electronico</span>
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
                  <select
                    className="input"
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value);
                      setFormError("");
                    }}
                  >
                    <option value="User">User</option>
                    <option value="Admin">Admin</option>
                  </select>
                </label>
                {formError && <div className="formError">{formError}</div>}
                <div className="modalActions">
                  <button type="button" className="ghostBtn" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" className="primaryBtn">
                    {mode === "create" ? "Guardar" : "Guardar cambios"}
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
