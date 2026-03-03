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
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleButtonRef = useRef(null);

  const saveEmail = (emailToSave) => {
    try {
      const saved = JSON.parse(localStorage.getItem("kinedrix_emails") || "[]");
      const updated = [emailToSave, ...saved.filter((e) => e !== emailToSave)];
      localStorage.setItem("kinedrix_emails", JSON.stringify(updated.slice(0, 5)));
    } catch {
      // ignore storage errors
    }
  };

  const handleGoogleCredential = useCallback(
    async (credentialResponse) => {
      try {
        setGoogleLoading(true);
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
      } finally {
        setGoogleLoading(false);
      }
    },
    [navigate],
  );

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError("Falta VITE_GOOGLE_CLIENT_ID en la configuracion");
      return;
    }

    const initializeGoogle = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return;

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width: 320,
        text: "continue_with",
      });
    };

    if (window.google?.accounts?.id) {
      initializeGoogle();
      return;
    }

    let script = document.getElementById(GOOGLE_SCRIPT_ID);
    if (!script) {
      script = document.createElement("script");
      script.id = GOOGLE_SCRIPT_ID;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener("load", initializeGoogle);
    return () => {
      script.removeEventListener("load", initializeGoogle);
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
            KINEDRI<span className="mirroredK">K</span>
          </div>
        </div>

        <div className="card">
          <h1 className="cardTitle">Bienvenido de nuevo</h1>
          <p className="cardSub">Accede a la plataforma con tu cuenta de Google</p>

          <div className="googleSection">
            <div className="googleButtonWrap" ref={googleButtonRef} />
            {error && <div className="errorMessage">{error}</div>}
            {googleLoading && (
              <div className="googleStatus">Validando cuenta de Google...</div>
            )}
          </div>
        </div>

        <div className="footer">© KINEDRIK Audio Inc. Todos los derechos reservados.</div>
      </div>
    </div>
  );
}

