import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getUser, clearUser } from "../utils/user";
import { BookOpenText, ChartNoAxesCombined, CloudUpload, History, Menu, Settings, Users } from "lucide-react";
import "../styles/Sidebar.css";

const SIDEBAR_MASCOT = "/mascots/dot-listening.png";

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
  const isSpeechConfigPage = location.pathname === "/speech-comercial";

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

  const handleAdminClick = () => { navigate("/admin"); setIsMobileSidebarOpen(false); };
  const handleAdvancedConfigClick = () => { navigate("/configuracion-avanzada"); setIsMobileSidebarOpen(false); };
  const handleDashboardClick = () => { navigate("/dashboard"); setIsMobileSidebarOpen(false); };

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

      {storedName && (
        <button
          className={`accountAvatarButton ${isUploadPage ? "withWhatsApp" : ""}`}
          type="button"
          onClick={handleLogoutClick}
          title="Cuenta"
          aria-label={`Cuenta de ${storedName}. Abrir opciones de cierre de sesión`}
        >
          <span className={`accountAvatar ${user.picture ? "hasPicture" : ""}`}>
            {user.picture && (
              <img
                src={user.picture}
                alt=""
                className="accountAvatarPhoto"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                  event.currentTarget.nextSibling.style.display = "flex";
                }}
              />
            )}
            <span className="accountAvatarFallback" style={{ display: user.picture ? "none" : "flex" }}>
              {(() => {
                const parts = (storedName || "").split(" ").filter(Boolean);
                if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                return (storedName || "?").charAt(0).toUpperCase();
              })()}
            </span>
          </span>
        </button>
      )}

      {isMobileSidebarOpen && <div className="sidebarOverlay" onClick={() => setIsMobileSidebarOpen(false)} />}

      <div className={sidebarClassName}>
        <div className="sidebarBrand">
          <button
            className={`sidebarBrandToggle ${isSidebarCollapsed ? "is-collapsed" : "is-expanded"}`}
            type="button"
            onClick={toggleCollapsedSidebar}
            title={isSidebarCollapsed ? "Desplegar sidebar" : "Replegar sidebar"}
            aria-label={isSidebarCollapsed ? "Desplegar sidebar" : "Replegar sidebar"}
            aria-expanded={!isSidebarCollapsed}
          >
            {isSidebarCollapsed ? (
              <Menu size={23} strokeWidth={2} aria-hidden="true" />
            ) : (
              <span className="sidebarMascotViewport" aria-hidden="true">
                <img src={SIDEBAR_MASCOT} alt="" className="sidebarMascot" />
              </span>
            )}
          </button>
        </div>

        <nav className="sidebarNav">
          <button className={`sidebarItem ${isUploadPage ? "active" : ""}`} onClick={handleUploadClick} title="Subir archivo">
            <CloudUpload className="sidebarNavIcon" size={21} strokeWidth={2} aria-hidden="true" />
            <span className="sidebarItemLabel">Subir Archivo</span>
          </button>

          <button className={`sidebarItem ${isHistoryPage ? "active" : ""}`} onClick={() => { navigate("/history"); setIsMobileSidebarOpen(false); }} title="Historial de reportes">
            <History className="sidebarNavIcon" size={21} strokeWidth={2} aria-hidden="true" />
            <span className="sidebarItemLabel">Historial</span>
          </button>


          {isAuthorizedAdmin && (
            <button
              className={`sidebarItem ${isAdminPage ? "active" : ""}`}
              onClick={handleAdminClick}
              title="Gestionar usuarios"
            >
              <Users className="sidebarNavIcon" size={21} strokeWidth={2} aria-hidden="true" />
              <span className="sidebarItemLabel">Gestionar Usuarios</span>
            </button>
          )}

          {isAuthorizedSuperAdmin && (
            <button
              className={`sidebarItem ${isDashboardPage ? "active" : ""}`}
              onClick={handleDashboardClick}
              title="Panel"
            >
              <ChartNoAxesCombined className="sidebarNavIcon" size={21} strokeWidth={2} aria-hidden="true" />
              <span className="sidebarItemLabel" translate="no">Panel</span>
            </button>
          )}

          {isAuthorizedAdmin && (
            <button className={`sidebarItem ${isSpeechConfigPage ? "active" : ""}`} onClick={() => { navigate("/speech-comercial"); setIsMobileSidebarOpen(false); }} title="Speech comercial">
              <BookOpenText className="sidebarNavIcon" size={21} strokeWidth={2} aria-hidden="true" />
              <span className="sidebarItemLabel">Speech Comercial</span>
            </button>
          )}

          {isAuthorizedSuperAdmin && (
            <button
              className={`sidebarItem ${isAdvancedConfigPage ? "active" : ""}`}
              onClick={handleAdvancedConfigClick}
              title="Configuración avanzada"
            >
              <Settings className="sidebarNavIcon" size={21} strokeWidth={2} aria-hidden="true" />
              <span className="sidebarItemLabel">Configuración<br />Avanzada</span>
            </button>
          )}
        </nav>

      </div>

      {showLogoutModal && (
        <div className="logoutModalOverlay">
          <div className="logoutModalCard">
            <div className="logoutModalTitle">Kinedriꓘ</div>
            <div className="logoutModalText">¿Estás seguro de que quieres salir{email ? ` ${email}` : ""}?</div>
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
