import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getUser, clearUser } from "../utils/user";
import "../styles/Sidebar.css";

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20.39 18.39A5 5 0 0018 8h-1.26A7 7 0 105 16.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 16V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 13l3-3 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 17L21 12L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M16 11a4 4 0 11-8 0 4 4 0 018 0zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AdvancedConfigIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3L13.7 5.8L16.9 5.6L17.5 8.7L20.3 10.4L18.6 13.2L19.2 16.3L16 16.5L14.3 19.3L11.5 17.6L8.7 19.3L7 16.5L3.8 16.3L4.4 13.2L2.7 10.4L5.5 8.7L6.1 5.6L9.3 5.8L11 3H12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="11.5" r="2.4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

const EXPANDED_TOP_LOGO = "https://storage.googleapis.com/kinedrik-imagenes/KINEDRIK_Logotipo_negativo.svg";
const COLLAPSED_TOP_LOGO = "https://storage.googleapis.com/kinedrik-imagenes/KINEDRIK_Simbolo_negativo.svg";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const { fullName, email, role } = user;

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const isUploadPage = location.pathname === "/upload";
  const isAdminPage = location.pathname === "/admin";
  const isAdvancedConfigPage = location.pathname === "/configuracion-avanzada";

  const isAuthorizedAdmin =
    role === "admin" ||
    role === "superadmin" ||
    (email && email.toLowerCase() === "adminkinedrik@eadic.com") ||
    (email && email.toLowerCase() === "admin123@eadic.com");

  const isAuthorizedSuperAdmin = role === "superadmin" || (email && email.toLowerCase() === "adminkinedrik@eadic.com");
  const storedName = fullName || (role === "superadmin" ? "SUPERADMIN" : role === "admin" ? "ADMIN" : "");

  const sidebarClassName = `sidebar ${isMobileSidebarOpen ? "open" : ""} uploadSidebar ${isSidebarCollapsed ? "collapsed" : ""}`.trim();

  useEffect(() => {
    const collapsedClassName = "sidebar-collapsed";
    document.body.classList.toggle(collapsedClassName, isSidebarCollapsed);

    return () => {
      document.body.classList.remove(collapsedClassName);
    };
  }, [isSidebarCollapsed]);

  const toggleSidebar = () => setIsMobileSidebarOpen((prev) => !prev);
  const toggleCollapsedSidebar = () => setIsSidebarCollapsed((prev) => !prev);

  const handleUploadClick = () => {
    navigate("/upload");
    setIsMobileSidebarOpen(false);
  };

  const handleAdminClick = () => {
    if (!isAuthorizedAdmin) {
      alert("No tienes permiso para acceder a esta sección");
      return;
    }
    navigate("/admin");
    setIsMobileSidebarOpen(false);
  };

  const handleAdvancedConfigClick = () => {
    if (!isAuthorizedSuperAdmin) {
      alert("No tienes permiso para acceder a esta sección");
      return;
    }
    navigate("/configuracion-avanzada");
    setIsMobileSidebarOpen(false);
  };

  const handleLogoutClick = () => setShowLogoutModal(true);

  const handleConfirmLogout = () => {
    setShowLogoutModal(false);
    clearUser();
    navigate("/login");
  };

  const handleCancelLogout = () => setShowLogoutModal(false);

  return (
    <>
      <button className={`mobileToggle ${isMobileSidebarOpen ? "open" : ""}`} onClick={toggleSidebar}>
        {isMobileSidebarOpen ? "✕" : "☰"}
      </button>

      {isMobileSidebarOpen && <div className="sidebarOverlay" onClick={() => setIsMobileSidebarOpen(false)} />}

      <div className={sidebarClassName}>
        <div className="sidebarBrand">
          <button
            className="sidebarTopLogoSwitch"
            onClick={toggleCollapsedSidebar}
            title={isSidebarCollapsed ? "Desplegar sidebar" : "Replegar sidebar"}
            aria-label={isSidebarCollapsed ? "Desplegar sidebar" : "Replegar sidebar"}
          >
            <img
              src={EXPANDED_TOP_LOGO}
              alt="Kinedrik"
              className={`sidebarTopLogoImage full ${isSidebarCollapsed ? "hidden" : "visible"}`}
            />
            <img
              src={COLLAPSED_TOP_LOGO}
              alt="Kinedrik símbolo"
              className={`sidebarTopLogoImage symbol ${isSidebarCollapsed ? "visible" : "hidden"}`}
            />
          </button>
        </div>

        <nav className="sidebarNav">
          <button className={`sidebarItem ${isUploadPage ? "active" : ""}`} onClick={handleUploadClick} title="Subir archivo">
            <UploadIcon />
            <span>Subir Archivo</span>
          </button>

          <button
            className={`sidebarItem ${isAdminPage ? "active" : ""} ${!isAuthorizedAdmin ? "disabled" : ""}`}
            onClick={handleAdminClick}
            title={isAuthorizedAdmin ? "Gestionar usuarios" : "Sin acceso"}
          >
            <UsersIcon />
            <span>Gestionar Usuarios</span>
          </button>

          {isAuthorizedSuperAdmin && (
            <button
              className={`sidebarItem ${isAdvancedConfigPage ? "active" : ""}`}
              onClick={handleAdvancedConfigClick}
              title="Configuración avanzada"
            >
              <AdvancedConfigIcon />
              <span>Configuración avanzada</span>
            </button>
          )}
        </nav>

        {storedName && (
          <button className="sidebarBadge" type="button" onClick={handleLogoutClick} title="Cerrar sesión">
            <span className="logoutBtn" aria-hidden="true">
              <LogoutIcon />
            </span>
            <span className="badgeName">{storedName}</span>
            <span className="statusDot" aria-hidden="true" />
          </button>
        )}
      </div>

      {showLogoutModal && (
        <div className="logoutModalOverlay">
          <div className="logoutModalCard">
            <div className="logoutModalTitle">Kinedriꓘ</div>
            <div className="logoutModalText">¿Estás seguro de que quieres salir?</div>
            <div className="logoutModalSubtext">Tu progreso está a salvo. Te esperamos pronto.</div>
            <div className="logoutModalActions">
              <button className="logoutModalBtn cancel" onClick={handleCancelLogout}>
                Cancelar
              </button>
              <button className="logoutModalBtn confirm" onClick={handleConfirmLogout}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
