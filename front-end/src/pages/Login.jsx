import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_SCRIPT_ID = "google-identity-services";

function parseGoogleCredential(credential) {
  try {
    const payload = credential.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const googleButtonRef = useRef(null);

  const saveEmail = (emailToSave) => {
    try {
      const saved = JSON.parse(localStorage.getItem("kinedrix_emails") || "[]");
      const updated = [emailToSave, ...saved.filter((e) => e !== emailToSave)];
      localStorage.setItem("kinedrix_emails", JSON.stringify(updated.slice(0, 5)));
    } catch {

    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Credenciales incorrectas");
      }

      localStorage.setItem("kinedrix_email", data.user.email);
      localStorage.setItem("kinedrix_user", JSON.stringify(data.user));
      saveEmail(data.user.email);
      navigate("/upload");
    } catch (err) {
      setError(err.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = useCallback(
    async (credentialResponse) => {
      try {
        setError("");

        const credential = credentialResponse?.credential;
        if (!credential) throw new Error("Google no devolvio una credencial valida");

        const payload = parseGoogleCredential(credential);
        const email = (payload?.email || "").trim().toLowerCase();
        if (!email) throw new Error("No se pudo obtener el correo de Google");

        const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        const data = await res.json();
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "No autorizado");
        }

        localStorage.setItem("kinedrix_email", email);
        localStorage.setItem("kinedrix_user", JSON.stringify(data.user));
        saveEmail(email);
        navigate("/upload");
      } catch (err) {
        localStorage.removeItem("kinedrix_email");
        setError(err.message || "Error al iniciar sesion con Google");
      }
    },
    [navigate],
  );

  const handleGoogleLogin = async () => {
    try {
      setError("");

      if (!window.google) {
        throw new Error("El servicio de Google no está cargado. Por favor, recarga la página.");
      }

      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          setError("Haz clic en el botón de Google para continuar.");
          setGoogleLoading(false);
        }
      });
    } catch (err) {
      setError(err.message || "Error al iniciar sesión con Google");
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredential,
          cancel_on_tap_outside: false,
        });

        // Render the visible button in the container
        window.google.accounts.id.renderButton(
          document.getElementById("googleBtnContainer"),
          {
            theme: "outline",
            size: "large",
            width: 320,
            text: "continue_with",
            shape: "pill"
          }
        );
      }
    };
    script.onerror = () => {
      setError("No se pudo cargar el script de Google. Verifica tu conexión.");
    };
    document.body.appendChild(script);

    return () => {
      const existing = document.querySelector(`script[src="https://accounts.google.com/gsi/client"]`);
      if (existing) document.body.removeChild(existing);
    };
  }, [handleGoogleCredential]);

  return (
    <div className="loginPage">
      <div className="sideDecor left" aria-hidden="true">
        <span className="sideLine orange" />
        <span className="sideLine blue" />
        <span className="sideLine lilac" />
      </div>

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
            KINEDRIꓘ
          </div>
        </div>

        <div className="card">
          <h1 className="cardTitle">Bienvenido de nuevo</h1>
          <p className="cardSub">Accede a la plataforma con tu cuenta de Google</p>

          <div className="googleSection">
            <div
              id="googleBtnContainer"
              style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}
            ></div>
            {error && (
              <div className="errorMessage" style={{ color: '#ff4d4d', marginTop: '10px', fontSize: '13px' }}>
                {error.includes("origin_mismatch")
                  ? "Error: Esta URL (localhost) no está autorizada en Google Console. Por favor, usa el puerto autorizado o agrega este origen."
                  : error}
              </div>
            )}
          </div>

          <div className="separator">
            <span>o ingresa como administrador</span>
          </div>

          <form className="adminForm" onSubmit={handleAdminLogin}>
            <div className="inputGroup">
              <input
                type="email"
                className="input"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="inputGroup">
              <input
                type="password"
                className="input"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn adminBtn" disabled={loading}>
              {loading ? "Iniciando..." : "Entrar como Admin"}
              {!loading && <span className="arrow">→</span>}
            </button>
          </form>
        </div>

        <div className="footer">© KINEDRIꓘ Audio Inc. Todos los derechos reservados.</div>
      </div>
    </div>
  );
}


