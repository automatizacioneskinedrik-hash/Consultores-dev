import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Upload from "./pages/Upload";
import Admin from "./pages/Admin";
import AdvancedConfig from "./pages/AdvancedConfig";
import WhatsNewModal from "./components/WhatsNewModal";
import History from "./pages/History";
import Dashboard from "./pages/Dashboard";
import "./App.css";

function isLoggedIn() {
  return Boolean(localStorage.getItem("kinedrix_email"));
}

function isAdmin() {
  try {
    const user = JSON.parse(localStorage.getItem("kinedrix_user") || "{}");
    const userEmail = (user.email || "").toLowerCase();
    return (
      user.role === "admin" ||
      user.role === "superadmin" ||
      userEmail === "adminkinedrik@eadic.com" ||
      userEmail === "admin123@eadic.com"
    );
  } catch {
    return false;
  }
}

const ProtectedRoute = ({ children }) => {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
};

const AdminRoute = ({ children }) => {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (!isAdmin()) return <Navigate to="/upload" replace />;
  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <Upload />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <Admin />
            </AdminRoute>
          }
        />
        <Route
          path="/configuracion-avanzada"
          element={
            <AdminRoute>
              <AdvancedConfig />
            </AdminRoute>
          }
        />

        {/* <Route
          path="/dashboard"
          element={
            <AdminRoute>
              <Dashboard />
            </AdminRoute>
          }
        /> */}

        <Route path="/" element={<Navigate to={isLoggedIn() ? "/upload" : "/login"} replace />} />
        <Route path="*" element={<Navigate to={isLoggedIn() ? "/upload" : "/login"} replace />} />
      </Routes>
      <WhatsNewModal />
    </BrowserRouter>
  );
}
