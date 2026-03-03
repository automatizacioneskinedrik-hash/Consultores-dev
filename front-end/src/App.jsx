import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Upload from "./pages/Upload";
import Admin from "./pages/Admin";

function isLoggedIn() {
  return Boolean(localStorage.getItem("kinedrix_email"));
}

function isAdmin() {
  try {
    const user = JSON.parse(localStorage.getItem("kinedrix_user") || "{}");
    return (
      user.role === "admin" ||
      user.role === "superadmin" ||
      user.email.toLowerCase() === "admin123@eadic.com" ||
      user.email.toLowerCase() === "adminkinedrik@eadic.com"
    );
  } catch {
    return false;
  }
}

function AdminRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (!isAdmin()) return <Navigate to="/upload" replace />;
  return children;
}

function ProtectedRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

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

        {/* RUTA ADMIN AGREGADA */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <Admin />
            </AdminRoute>
          }
        />

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
