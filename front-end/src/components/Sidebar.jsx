import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getUser, clearUser } from "../utils/user";
import "../styles/Sidebar.css";

function UploadIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20.39 18.39A5 5 0 0018 8h-1.26A7 7 0 105 16.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 16V10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 13l3-3 3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function BrandLogo() {
  return (
    <svg
      className="brandLogo"
      width="140"
      height="28"
      viewBox="0 0 140 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="20"
        fontFamily="Inter, Arial, sans-serif"
        fontWeight="800"
        fontSize="18"
        fill="#ffffff"
      >
        KINEDRIK
      </text>
      <rect x="112" y="6" width="6" height="16" rx="3" fill="#f49b1a" />
      <rect x="122" y="6" width="6" height="16" rx="3" fill="#6c3af6" />
      <rect x="132" y="6" width="6" height="16" rx="3" fill="#9b6bff" />
    </svg>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const { fullName, email, role } = user;

  const isAuthorizedAdmin =
    role === "admin" ||
    role === "superadmin" ||
    (email && email.toLowerCase() === "adminkinedrik@eadic.com") ||
    (email && email.toLowerCase() === "admin123@eadic.com");

  const storedName = fullName || (role === "superadmin" ? "SUPERADMIN" : (role === "admin" ? "ADMIN" : ""));

  const handleUploadClick = () => {
    navigate("/upload");
  };

  const handleAdminClick = () => {
    if (isAuthorizedAdmin) {
      navigate("/admin");
    } else {
      alert("No tienes permiso para acceder a esta sección");
    }
  };

  const handleLogout = () => {
    if (window.confirm("¿Estás seguro de que quieres cerrar sesión?")) {
      clearUser();
      navigate("/login");
    }
  };

  const isUploadPage = location.pathname === "/upload";
  const isAdminPage = location.pathname === "/admin";

  return (
    <div className="sidebar">
      <div className="sidebarBrand">
        <div className="sidebarBrandName">
          <BrandLogo />
        </div>
      </div>

      <nav className="sidebarNav">
        <button
          className={`sidebarItem ${isUploadPage ? "active" : ""}`}
          onClick={handleUploadClick}
          title="Subir Archivo"
        >
          <UploadIcon />
          <span>Subir Archivo</span>
        </button>

        <button
          className={`sidebarItem ${isAdminPage ? "active" : ""} ${!isAuthorizedAdmin ? "disabled" : ""
            }`}
          onClick={handleAdminClick}
          title={isAuthorizedAdmin ? "Gestionar Usuarios" : "Sin acceso"}
        >
          <UsersIcon />
          <span>Gestionar Usuarios</span>
        </button>
      </nav>

      {storedName && (
        <div className="sidebarBadge">
          <button className="logoutBtn" onClick={handleLogout} title="Cerrar Sesión">
            <LogoutIcon />
          </button>
          <span className="badgeName">{storedName}</span>
          <span className="statusDot" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
