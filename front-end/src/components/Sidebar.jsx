import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getUser, clearUser } from "../utils/user";
import { 
  CloudUpload, 
  History, 
  Users, 
  Sliders, 
  LayoutDashboard, 
  LogOut, 
  ChevronLeft, 
  ChevronRight 
} from "lucide-react";
import "../styles/Sidebar.css";

const EXPANDED_TOP_LOGO = "https://storage.googleapis.com/kinedrik-imagenes/KINEDRIK_Logotipo_negativo.svg";
const COLLAPSED_TOP_LOGO = "https://storage.googleapis.com/kinedrik-imagenes/KINEDRIK_Simbolo_negativo.svg";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser() || {};
  const { fullName, email, role } = user;

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  const isUploadPage = location.pathname === "/upload";
  const isAdminPage = location.pathname === "/admin";
  const isHistoryPage = location.pathname === "/history";
  const isDashboardPage = location.pathname === "/dashboard";
  const isAdvancedConfigPage = location.pathname === "/configuracion-avanzada";

  const isAuthorizedAdmin =
    user?.role === "admin" ||
    user?.role === "superadmin" ||
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

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(isSidebarCollapsed));
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
            <CloudUpload size={22} strokeWidth={2} />
            <span>Subir Archivo</span>
          </button>

          <button className={`sidebarItem ${isHistoryPage ? "active" : ""}`} onClick={() => { navigate("/history"); setIsMobileSidebarOpen(false); }} title="Historial de reportes">
            <History size={22} strokeWidth={2} />
            <span>Historial</span>
          </button>


          <button
            className={`sidebarItem ${isAdminPage ? "active" : ""} ${!isAuthorizedAdmin ? "disabled" : ""}`}
            onClick={handleAdminClick}
            title={isAuthorizedAdmin ? "Gestionar usuarios" : "Sin acceso"}
          >
            <Users size={22} strokeWidth={2} />
            <span>Gestionar Usuarios</span>
          </button>

          {isAuthorizedSuperAdmin && (
            <button
              className={`sidebarItem ${isAdvancedConfigPage ? "active" : ""}`}
              onClick={handleAdvancedConfigClick}
              title="Configuración avanzada"
            >
              <svg 
                width="22" 
                height="22" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.8" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="lucide-custom-icon"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Configuración<br />Avanzada</span>
            </button>
          )}
        </nav>

        {storedName && (
          <button className="sidebarBadge" type="button" onClick={handleLogoutClick} title="Cerrar sesión">
            <div className={`userAvatarWrapper ${user.picture ? 'hasPic' : ''}`}>
              {user.picture ? (
                <img 
                  src={user.picture} 
                  alt={storedName || "Profile"} 
                  className="userPhoto" 
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              {(
                <div 
                  className="defaultAvatar" 
                  style={{ display: user.picture ? 'none' : 'flex' }}
                >
                  {(() => {
                    const parts = (storedName || "").split(" ").filter(Boolean);
                    if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                    return (storedName || "?").charAt(0).toUpperCase();
                  })()}
                </div>
              )}
              {!user.picture && <span className="statusDot" aria-hidden="true" />}
            </div>
            {!isSidebarCollapsed && (
              <div className="badgeInfo">
                <span className="badgeName">{storedName}</span>
                <span className="badgeRole">{(role || 'user').toUpperCase()}</span>
              </div>
            )}
            {!isSidebarCollapsed && (
              <span className="logoutActionIcon" aria-hidden="true">
                <LogOut size={18} strokeWidth={2.5} />
              </span>
            )}
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
