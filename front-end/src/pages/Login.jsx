import { GoogleLogin } from "@react-oauth/google";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setUser } from "../utils/user";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

  const saveEmail = (emailToSave) => {
    try {
      const saved = JSON.parse(localStorage.getItem("kinedrix_emails") || "[]");
      const updated = [emailToSave, ...saved.filter((e) => e !== emailToSave)];
      localStorage.setItem(
        "kinedrix_emails",
        JSON.stringify(updated.slice(0, 5)),
      );
    } catch {
      // ignore storage errors
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setGoogleLoading(true);
      setError("");

      const credential = credentialResponse?.credential;
      if (!credential) throw new Error("Google no devolvio credencial valida");

      const response = await fetch(`${apiBaseUrl}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });

      const data = await response.json();
      if (!response.ok || !data?.ok || !data?.user?.email) {
        throw new Error(data?.error || "No se pudo iniciar sesion con Google");
      }

      setUser({ fullName: data.user.fullName || "", email: data.user.email });
      saveEmail(data.user.email);
      navigate("/upload");
    } catch (err) {
      setError(err.message || "Error al iniciar sesion con Google");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError("Google cancelo o no pudo completar el inicio de sesion");
  };

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
          <p className="cardSub">
            Inicia sesion con tu cuenta de Google para acceder a la plataforma
          </p>

          <div className="googleSection">
            <div className="googleButtonWrap">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
              />
            </div>
            {error && <div className="errorMessage">{error}</div>}
            {googleLoading && (
              <div className="googleStatus">Validando cuenta de Google...</div>
            )}
          </div>
        </div>

        <div className="footer">
          © KINEDRIK Audio Inc. Todos los derechos reservados.
        </div>
      </div>
    </div>
  );
}
