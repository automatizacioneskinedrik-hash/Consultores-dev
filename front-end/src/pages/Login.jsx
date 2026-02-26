import { GoogleLogin } from "@react-oauth/google";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearCurrentLoginEmail, setUser } from "../utils/user";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

  // Cargar correos guardados al montar
  const [savedEmails, setSavedEmails] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("kinedrix_emails") || "[]");
      return Array.isArray(saved) ? saved.slice(0, 5) : [];
    } catch {
      return [];
    }
  });

  const saveEmail = (emailToSave) => {
    try {
      // Guardar directamente en localStorage de forma sincrónica
      const saved = JSON.parse(localStorage.getItem("kinedrix_emails") || "[]");
      const updated = [emailToSave, ...saved.filter((e) => e !== emailToSave)];
      localStorage.setItem(
        "kinedrix_emails",
        JSON.stringify(updated.slice(0, 5)),
      );
      // Actualizar estado también para inmediatez en UI
      setSavedEmails(updated.slice(0, 5));
    } catch {
      // ignore storage errors
    }
  };

  const selectEmail = (selectedEmail) => {
    setEmail(selectedEmail);
    setShowDropdown(false);
  };

  const filteredEmails = savedEmails.filter((e) =>
    e.toLowerCase().includes(email.toLowerCase().trim()),
  );

  const isInstitutionalEmail = (value) => {
    // ✅ ESTRICTO: debe terminar en ".eadic@gmail.com"
    return value.toLowerCase().endsWith(".eadic@gmail.com");
  };

  const onSubmit = (e) => {
    e.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    if (!isInstitutionalEmail(cleanEmail)) {
      // ✅ evita que quede una sesión previa “válida”
      localStorage.removeItem("kinedrix_email");
      clearCurrentLoginEmail();
      setError(
        "Solo se permiten correos institucionales que terminen en .eadic@gmail.com",
      );
      return;
    }

    setError("");
    setUser({ fullName: cleanEmail.split("@")[0], email: cleanEmail });
    saveEmail(cleanEmail); // guardar en historial
    navigate("/upload");
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setGoogleLoading(true);
      setError("");

      const credential = credentialResponse?.credential;
      if (!credential) throw new Error("Google no devolvió credencial válida");

      const response = await fetch(`${apiBaseUrl}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });

      const data = await response.json();
      if (!response.ok || !data?.ok || !data?.user?.email) {
        throw new Error(data?.error || "No se pudo iniciar sesión con Google");
      }

      setUser({ fullName: data.user.fullName || "", email: data.user.email });
      saveEmail(data.user.email);
      navigate("/upload");
    } catch (err) {
      setError(err.message || "Error al iniciar sesión con Google");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError("Google canceló o no pudo completar el inicio de sesión");
  };

  return (
    <div className="loginPage">
      {/* Decoración lateral izquierda */}
      <div className="sideDecor left" aria-hidden="true">
        <span className="sideLine orange" />
        <span className="sideLine blue" />
        <span className="sideLine lilac" />
      </div>

      {/* Decoración lateral derecha */}
      <div className="sideDecor right" aria-hidden="true">
        <span className="sideLine orange" />
        <span className="sideLine blue" />
        <span className="sideLine lilac" />
      </div>

      <div className="loginWrap">
        <div className="logoBlock">
          <div className="miniBars">
            <span className="mb o" />
            <span className="mb b" />
            <span className="mb l" />
          </div>

          <div className="logoText">
            KINEDRI<span className="mirroredK">K</span>
          </div>
        </div>

        <div className="card">
          <h1 className="cardTitle">Bienvenido de nuevo</h1>
          <p className="cardSub">
            Usa tu correo institucional para acceder a la plataforma
          </p>

          <form onSubmit={onSubmit}>
            <label className="label">Correo electrónico</label>

            <input
              className="input"
              type="email"
              placeholder="nombre.eadic@gmail.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              required
            />

            {showDropdown && filteredEmails.length > 0 && (
              <div className="emailDropdown">
                {filteredEmails.map((savedEmail, idx) => (
                  <div
                    key={idx}
                    className="emailOption"
                    onMouseDown={() => selectEmail(savedEmail)}
                  >
                    {savedEmail}
                  </div>
                ))}
              </div>
            )}

            {error && <div className="errorMessage">{error}</div>}

            <button className="btn" type="submit">
              <span>Iniciar sesión</span>
              <span className="arrow">→</span>
            </button>
          </form>

          <div className="googleSection">
            <div className="googleDivider">
              <span>o continuar con Google</span>
            </div>
            <div className="googleButtonWrap">
              <GoogleLogin onSuccess={handleGoogleSuccess} onError={handleGoogleError} />
            </div>
            {googleLoading && <div className="googleStatus">Validando cuenta de Google...</div>}
          </div>
        </div>

        <div className="footer">
          © KINEDRIꓘ Audio Inc. Todos los derechos reservados.
        </div>
      </div>
    </div>
  );
}
