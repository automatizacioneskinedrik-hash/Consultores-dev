import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Upload from "./pages/Upload";
import Admin from "./pages/Admin";
import AdvancedConfig from "./pages/AdvancedConfig";
import History from "./pages/History";
import Dashboard from "./pages/Dashboard";
import SpeechConfig from "./pages/SpeechConfig";
import Costs from "./pages/Costs";
import Coach from "./pages/Coach";
import ApiDocs from "./pages/ApiDocs";
import { getUser } from "./utils/user";
import { canManage, cargoOf } from "./utils/roles";
import "./App.css";

function isLoggedIn() {
  return Boolean(localStorage.getItem("kinedrix_email"));
}

// Gestionar usuarios, Speech comercial and Configuración avanzada depend on the user's cargo.
function managesApp() {
  return canManage(getUser());
}

const ProtectedRoute = ({ children }) => {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
};

const AdminRoute = ({ children }) => {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (!managesApp()) return <Navigate to="/upload" replace />;
  return children;
};

// Documentación y API is only for the Ingeniero cargo.
const EngineerRoute = ({ children }) => {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (cargoOf(getUser()).id !== "ingeniero") return <Navigate to="/upload" replace />;
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
        <Route path="/metricas" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/metricas/cuantitativas" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/metricas/coach" element={<ProtectedRoute><Coach /></ProtectedRoute>} />
        <Route path="/metricas/cualitativas" element={<Navigate to="/metricas/coach" replace />} />
        <Route path="/history" element={<Navigate to="/metricas" replace />} />
        <Route path="/dashboard" element={<Navigate to="/metricas/cuantitativas" replace />} />
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
        <Route path="/speech-comercial" element={<AdminRoute><SpeechConfig /></AdminRoute>} />
        <Route path="/costos" element={<AdminRoute><Costs /></AdminRoute>} />
        <Route path="/documentacion-api" element={<EngineerRoute><ApiDocs /></EngineerRoute>} />


        <Route path="/" element={<Navigate to={isLoggedIn() ? "/upload" : "/login"} replace />} />
        <Route path="*" element={<Navigate to={isLoggedIn() ? "/upload" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
