import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

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
      const saved = JSON.parse(localStorage.getItem("kinedrix_emails") || "[]");
      const updated = [emailToSave, ...saved.filter((e) => e !== emailToSave)];
      localStorage.setItem("kinedrix_emails", JSON.stringify(updated.slice(0, 5)));
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
    e.toLowerCase().includes(email.toLowerCase().trim())
  );

  const isInstitutionalEmail = (value) => {
    return value.toLowerCase().endsWith(".eadic@gmail.com");
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    if (!isInstitutionalEmail(cleanEmail)) {
      localStorage.removeItem("kinedrix_email");
      setError("Solo se permiten correos institucionales que terminen en .eadic@gmail.com");
      return;
    }

    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No autorizado");
      }

      localStorage.setItem("kinedrix_email", cleanEmail);
      localStorage.setItem("kinedrix_user", JSON.stringify(data.user));
      saveEmail(cleanEmail);

      navigate("/upload");
    } catch (err) {
      localStorage.removeItem("kinedrix_email");
      setError(err.message || "Error validando usuario");
    }
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
            Usa tu correo institucional para acceder a la plataforma
          </p>

          <form onSubmit={onSubmit}>
            <label className="label">Correo electronico</label>

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
              <span>Iniciar sesion</span>
              <span className="arrow">-&gt;</span>
            </button>
          </form>
        </div>

        <div className="footer">© KINEDRIK Audio Inc. Todos los derechos reservados.</div>
      </div>
    </div>
  );
}
