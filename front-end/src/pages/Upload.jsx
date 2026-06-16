import { useRef, useState, useEffect, useMemo } from "react";
import { getUser, setUser as storeUser } from "../utils/user";
import Sidebar from "../components/Sidebar";
import ReportDetail from "../components/ReportDetail";
import "../App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

function formatMB(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function Modal({ isOpen, message, onYes, onNo }) {
  if (!isOpen) return null;

  return (
    <div className="modalOverlay">
      <div className="modalContent">
        <p>{message}</p>
        <div className="modalButtons">
          <button className="btnYes" onClick={onYes}>
            Si
          </button>
          <button className="btnNo" onClick={onNo}>
            No
          </button>
        </div>
      </div>
    </div>
  );
}

function SuccessModal({ isOpen, message, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modalOverlay">
      <div className="modalContent successModalContent" style={{ position: "relative" }}>
        <button className="closeX" onClick={onClose} title="Cerrar">×</button>
        <div className="successIcon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2b6cff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <p className="successText">{message}</p>
        <div className="modalButtons">
          <button className="btnYes" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24">
      <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3Z" fill="#2b6cff" />
      <path d="M7 11a5 5 0 0 0 10 0" fill="none" stroke="#2b6cff" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 16v4" fill="none" stroke="#2b6cff" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 20h6" fill="none" stroke="#2b6cff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const PAIS_CODES = [
  { code: "+57",  iso: "co", label: "Colombia" },
  { code: "+34",  iso: "es", label: "España" },
  { code: "+52",  iso: "mx", label: "México" },
  { code: "+54",  iso: "ar", label: "Argentina" },
  { code: "+51",  iso: "pe", label: "Perú" },
  { code: "+56",  iso: "cl", label: "Chile" },
  { code: "+58",  iso: "ve", label: "Venezuela" },
  { code: "+593", iso: "ec", label: "Ecuador" },
  { code: "+591", iso: "bo", label: "Bolivia" },
  { code: "+595", iso: "py", label: "Paraguay" },
  { code: "+598", iso: "uy", label: "Uruguay" },
  { code: "+53",  iso: "cu", label: "Cuba" },
  { code: "+502", iso: "gt", label: "Guatemala" },
  { code: "+504", iso: "hn", label: "Honduras" },
  { code: "+503", iso: "sv", label: "El Salvador" },
  { code: "+505", iso: "ni", label: "Nicaragua" },
  { code: "+506", iso: "cr", label: "Costa Rica" },
  { code: "+507", iso: "pa", label: "Panamá" },
  { code: "+1809",iso: "do", label: "Rep. Dominicana" },
  { code: "+1787",iso: "pr", label: "Puerto Rico" },
  { code: "+55",  iso: "br", label: "Brasil" },
  { code: "+351", iso: "pt", label: "Portugal" },
  { code: "+1",   iso: "us", label: "EE.UU." },
  { code: "+1",   iso: "ca", label: "Canadá" },
  { code: "+44",  iso: "gb", label: "Reino Unido" },
  { code: "+33",  iso: "fr", label: "Francia" },
  { code: "+49",  iso: "de", label: "Alemania" },
  { code: "+39",  iso: "it", label: "Italia" },
  { code: "+31",  iso: "nl", label: "Países Bajos" },
  { code: "+32",  iso: "be", label: "Bélgica" },
  { code: "+41",  iso: "ch", label: "Suiza" },
  { code: "+61",  iso: "au", label: "Australia" },
  { code: "+81",  iso: "jp", label: "Japón" },
  { code: "+86",  iso: "cn", label: "China" },
  { code: "+91",  iso: "in", label: "India" },
  { code: "+971", iso: "ae", label: "Emiratos Árabes" },
];

function CountrySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = PAIS_CODES.find((p) => p.code === value) || PAIS_CODES[0];

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="waCountryWrap" ref={ref}>
      <button type="button" className="waCountryBtn" onClick={() => setOpen((o) => !o)}>
        <img src={`https://flagcdn.com/16x12/${selected.iso}.png`} width="16" height="12" alt={selected.label} className="waCountryFlag" />
        <span>{selected.code}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="waCountryDropdown">
          {PAIS_CODES.map((p, i) => (
            <button
              type="button"
              key={`${p.iso}-${i}`}
              className={`waCountryOption${value === p.code && selected.iso === p.iso ? " active" : ""}`}
              onClick={() => { onChange(p.code); setOpen(false); }}
            >
              <img src={`https://flagcdn.com/16x12/${p.iso}.png`} width="16" height="12" alt={p.label} className="waCountryOptionFlag" />
              <span className="waCountryOptionName">{p.label}</span>
              <span className="waCountryOptionCode">{p.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WaCard({ followUp, onSent, onDismiss }) {
  const [codigo, setCodigo] = useState(followUp.codigoPais || "+34");
  const [telefono, setTelefono] = useState(followUp.telefono || "");
  const [mensaje, setMensaje] = useState(followUp.mensajeSugerido || "");
  const [sending, setSending] = useState(false);
  const msgRef = useRef(null);

  useEffect(() => {
    if (msgRef.current) {
      msgRef.current.style.height = "auto";
      msgRef.current.style.height = msgRef.current.scrollHeight + "px";
    }
  }, [mensaje]);


  const handleSend = async () => {
    const num = telefono.replace(/\D/g, "");
    if (!num) return;
    const codigoLimpio = codigo.replace("+", "");
    window.open(`https://wa.me/${codigoLimpio}${num}?text=${encodeURIComponent(mensaje)}`, "_blank");
    setSending(true);
    await onSent(followUp.id);
  };

  return (
    <div className="waCard" style={{ position: "relative" }}>
      <button className="waCardDismiss" onClick={() => onDismiss(followUp.id)} title="Declinar">✕</button>
      <div className="waCardHeader">
        <div className="waCardName">{followUp.clienteNombre}</div>
        <div className="waCardDate">Recuerda enviar este mensaje en las próximas 24 hrs</div>
      </div>
      <textarea
        ref={msgRef}
        className="waCardMsg"
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        placeholder="Mensaje de seguimiento..."
        style={{ overflow: "hidden", resize: "none" }}
      />
      <div className="waCardPhone">
        <CountrySelect value={codigo} onChange={setCodigo} />
        <input
          className="waCardNumber"
          type="tel"
          placeholder="Número"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />
      </div>
      <button
        className="waCardBtn"
        onClick={handleSend}
        disabled={sending || !telefono.trim()}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        {sending ? "Enviando..." : "Enviar"}
      </button>
    </div>
  );
}

export default function Upload() {
  const inputRef = useRef(null);
  const pollingRef = useRef(null);
  const [user] = useState(() => getUser() || {});

  useEffect(() => {
    if (user && user.fullName) {
      storeUser(user);
    }
  }, [user]);

  const [fileMeta, setFileMeta] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successStep, setSuccessStep] = useState(() =>
    sessionStorage.getItem('kinedrik_upload_step') === '2' ? 2 : 0
  );
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [currentObjectPath, setCurrentObjectPath] = useState("");
  const [reportData, setReportData] = useState(null);
  const [pollingObjectPath, setPollingObjectPath] = useState(() =>
    sessionStorage.getItem('kinedrik_upload_step') === '2'
      ? sessionStorage.getItem('kinedrik_upload_path') || ''
      : ''
  );
  const [analysisText, setAnalysisText] = useState("Procesando información...");
  const [isLargeFile, setIsLargeFile] = useState(() =>
    sessionStorage.getItem('kinedrik_upload_large') === 'true'
  );
  const [recentSessions, setRecentSessions] = useState([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [sessionLoading, setSessionLoading] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [waOpen, setWaOpen] = useState(false);

  useEffect(() => {
    setWaOpen(followUps.length > 0);
  }, [followUps.length]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const fetchFollowUps = async (email) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/followups?email=${encodeURIComponent(email)}`,
        { headers: { "X-Admin-Email": user?.email || "", "X-Auth-Token": user?.authToken || "" } }
      );
      const data = await res.json();
      if (data.ok) setFollowUps(data.followUps || []);
    } catch { /* ignorar */ }
  };

  const handleMarkSent = async (id) => {
    try {
      await fetch(`${API_BASE_URL}/api/followups/${id}/enviado`, {
        method: "PATCH",
        headers: { "X-Admin-Email": user?.email || "", "X-Auth-Token": user?.authToken || "" },
      });
    } catch { /* ignorar */ }
    setFollowUps((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDismiss = async (id) => {
    try {
      await fetch(`${API_BASE_URL}/api/followups/${id}/rechazado`, {
        method: "PATCH",
        headers: { "X-Admin-Email": user?.email || "", "X-Auth-Token": user?.authToken || "" },
      });
    } catch { /* ignorar */ }
    setFollowUps((prev) => prev.filter((f) => f.id !== id));
  };

  const fetchRecentSessions = async (email) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/recent?email=${encodeURIComponent(email)}`, {
        headers: {
          "X-Admin-Email": user.email,
          "X-Auth-Token": user.authToken
        }
      });
      const data = await res.json();
      if (data.ok) {
        setRecentSessions(data.sessions || []);
      }
    } catch (err) {
      // Quietly ignore failed session fetches
    }
  };

  useEffect(() => {
    if (user?.email && user?.authToken) {
      fetchRecentSessions(user.email);
      fetchFollowUps(user.email);
    }
  }, [user?.email, user?.authToken]);

  useEffect(() => {
    if (successStep === 2) {
      const tips = [
        "El lead debe hablar el 55–65% del tiempo. Tu ratio ideal: 35–45%.",
        "Menos es más. Cuanta menos información des, más autoridad proyectas.",
        "Si el problema lo verbaliza el lead, es suyo. Si lo dices tú, es venta.",
        "Usa sus palabras exactas, no las tuyas. El lead debe escucharse a sí mismo.",
        "El silencio es tu aliado — si el lead no verbaliza su dolor, no buscará solución.",
        "El lead debe ver su propio GAP antes de que tú lo nombres.",
        "Ante una objeción: valida sin ceder, ancla al dolor, devuelve con una pregunta.",
        "Después de presentar el precio, haz silencio. El que habla primero, pierde.",
        "La decisión de fondo siempre antes del precio. Sin un SÍ claro, hablar de dinero es prematuro.",
        "No sigas vendiendo después del SÍ. Cierra y calla.",
        "No vendemos formación. Vendemos puntos de inflexión.",
        "No memorices las frases — interiorízalas. La autenticidad se percibe antes que el guion.",
        "Cada pregunta que no hagas es información que el lead no te dará voluntariamente.",
        "El diagnóstico no termina hasta que el lead ha verbalizado su dolor con sus propias palabras.",
        "La urgencia no se crea, se descubre. Tu trabajo es que el lead calcule el costo de no actuar.",
        "Las muletillas fragmentan tu autoridad. Cada 'este...' o 'o sea...' resta credibilidad.",
        "El radar no lo expliques — déjalo leer. 3–5 segundos de silencio valen más que 2 minutos de explicación.",
        "Cierra el círculo con sus palabras primero. Luego la decisión. Luego el precio. Siempre en ese orden.",
        "Si el lead pregunta el precio antes de tiempo, no lo des. Reconecta con su dolor primero.",
        "La F1 bien ejecutada reduce a la mitad el trabajo en F5. El rapport es tu base estructural.",
        "Ante un 'lo tengo que pensar': '¿Qué es lo que necesitas pensar?' devuelve la conversación.",
        "No preguntes '¿Tienes preguntas?' — pregunta '¿Qué es lo que más te resuena de esto?'",
        "Un monólogo de más de 2 minutos borra la confianza que tardaste 10 minutos en construir.",
        "El objetivo de F2 no es informar — es hacer que el lead se escuche a sí mismo.",
        "La objeción de precio casi siempre es una objeción de valor. Vuelve al GAP, no al descuento.",
        "Si el lead no verbaliza el impacto de su problema, el cierre siempre será difícil.",
        "Presenta una solución, no un catálogo. El exceso de opciones paraliza la decisión.",
        "El buen consultor no convence — hace que el lead se convenza a sí mismo.",
        "Confirma cada fase antes de avanzar. Un 'sí' de cabeza no es un compromiso verbal.",
        "Baja el ritmo en los momentos clave. Tu velocidad al hablar comunica tanto como tus palabras.",
      ];
      const shuffled = [...tips];
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
      }
      const reshuffle = (arr) => {
        for (let j = arr.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [arr[j], arr[k]] = [arr[k], arr[j]];
        }
      };
      let i = 0;
      setAnalysisText(shuffled[0]);
      const interval = setInterval(() => {
        i++;
        if (i >= shuffled.length) {
          i = 0;
          reshuffle(shuffled);
        }
        setAnalysisText(shuffled[i]);
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [successStep]);

  useEffect(() => {
    if (!pollingObjectPath) return;

    const poll = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/sessions/by-path?objectPath=${encodeURIComponent(pollingObjectPath)}`,
          { headers: { "X-Admin-Email": user?.email || "", "X-Auth-Token": user?.authToken || "" } }
        );
        const data = await res.json();
        if (data.ok && data.found && data.report) {
          clearInterval(pollingRef.current);
          sessionStorage.removeItem('kinedrik_upload_step');
          sessionStorage.removeItem('kinedrik_upload_path');
          sessionStorage.removeItem('kinedrik_upload_large');
          setPollingObjectPath("");
          setSuccessStep(0);
          setIsLargeFile(false);
          setReportData(data.report);
          setFileMeta(null);
          setProgress(0);
          setStatus("");
          setCurrentObjectPath("");
          if (inputRef.current) inputRef.current.value = "";
          if (user?.email) { fetchRecentSessions(user.email); fetchFollowUps(user.email); }
        }
      } catch {
        // red inestable: seguir intentando
      }
    };

    pollingRef.current = setInterval(poll, 5000);
    return () => clearInterval(pollingRef.current);
  }, [pollingObjectPath]);

  const todaySessions = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return recentSessions.filter(s => s.date && new Date(s.date) >= todayStart);
  }, [recentSessions]);

  useEffect(() => {
    if (!user?.email || !user?.authToken) return;
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(() => {
      fetchRecentSessions(user.email);
    }, midnight.getTime() - now.getTime());
    return () => clearTimeout(timer);
  }, [user?.email, user?.authToken]);

  const handleResendEmail = async (sessionId) => {
    alert("Procesando reenvío de reporte...");
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/resend`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Admin-Email": user.email,
          "X-Auth-Token": user.authToken
        },
        body: JSON.stringify({ sessionId, email: user.email })
      });
      const data = await res.json();
      if (data.ok) {
        alert("Reporte reenviado con éxito a tu correo.");
      } else {
        alert("Error al enviar: " + (data.error || "Desconocido"));
      }
    } catch (err) {
      alert("No se pudo conectar con el servidor. Verifica tu conexión a internet.");
    }
  };


  const handleFile = (file) => {
    if (!file) return;
    setFileMeta(file);
    setProgress(0);
    setStatus("");
    setShowModal(true);
  };

  const handleYes = async () => {
    if (!navigator.onLine) {
      setErrorMsg("No tienes conexión a internet. Por favor, conéctate e intenta de nuevo.");
      setShowModal(false);
      return;
    }
    setShowModal(false);
    setErrorMsg("");
    setIsUploading(true);

    try {
      const signRes = await fetch(`${API_BASE_URL}/api/upload/signed-url`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Admin-Email": user?.email || "",
          "X-Auth-Token": user?.authToken || ""
        },
        body: JSON.stringify({
          originalName: fileMeta.name,
          contentType: fileMeta.type,
          userId: user?.email || "anonymous",
          meetingType: "venta",
        }),
      });

      const signData = await signRes.json();
      if (!signRes.ok || !signData.ok) {
        throw new Error(signData?.error || "No se pudo generar URL de subida.");
      }

      const { uploadUrl, objectPath } = signData;
      setCurrentObjectPath(objectPath); 

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", fileMeta.type);

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.round((evt.loaded / evt.total) * 100);
            setProgress(percent);
            setStatus("SUBIENDO...");
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Error subiendo a GCS (status ${xhr.status})`));
        };

        xhr.onerror = () => reject(new Error("Error de red subiendo a GCS."));
        xhr.send(fileMeta);
      });

      setStatus("SUBIDA EXITOSA");
      setSuccessStep(1); 
      setShowSuccessModal(true);
    } catch (err) {
      const msg = err.message || "Error desconocido.";
      if (msg.includes("Failed to fetch")) {
        setErrorMsg("Error de red: No se pudo contactar al servidor. Revisa tu conexión.");
      } else {
        setErrorMsg(msg);
      }
      setStatus("ERROR");
    } finally {
      setIsUploading(false);
    }
  };

  // Short audio: wait for /complete and show the report card immediately
  const startEmailProcess = async () => {
    try {
      const completeRes = await fetch(`${API_BASE_URL}/api/upload/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Email": user?.email || "",
          "X-Auth-Token": user?.authToken || ""
        },
        body: JSON.stringify({ objectPath: currentObjectPath, userEmail: user?.email || "anonymous" }),
      });

      const completeData = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(completeData?.error || "No se pudo procesar el análisis.");
      }

      if (completeData.report) {
        sessionStorage.removeItem('kinedrik_upload_step');
        sessionStorage.removeItem('kinedrik_upload_path');
        sessionStorage.removeItem('kinedrik_upload_large');
        setSuccessStep(0);
        setReportData(completeData.report);
        setFileMeta(null);
        setProgress(0);
        setStatus("");
        setCurrentObjectPath("");
        if (inputRef.current) inputRef.current.value = "";
        if (user?.email) { fetchRecentSessions(user.email); fetchFollowUps(user.email); }
      } else {
        setSuccessStep(3);
        setShowSuccessModal(true);
      }
    } catch (err) {
      console.error(err);
      sessionStorage.removeItem('kinedrik_upload_step');
      sessionStorage.removeItem('kinedrik_upload_path');
      sessionStorage.removeItem('kinedrik_upload_large');
      setErrorMsg("El análisis de tu audio fue enviado al servidor. Recibirás tu reporte por correo en unos minutos.");
      setSuccessStep(0);
    }
  };

  // Large audio: fire /complete without blocking the UI
  const triggerAnalysisBackground = () => {
    fetch(`${API_BASE_URL}/api/upload/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Email": user?.email || "",
        "X-Auth-Token": user?.authToken || ""
      },
      body: JSON.stringify({ objectPath: currentObjectPath, userEmail: user?.email || "anonymous" }),
    }).catch((err) => console.error("Background analysis trigger:", err));
  };

  const handleSuccessClose = () => {
    if (successStep === 1) {
      // ~30 MB ≈ 45 min at typical voice recording bitrates — must match backend threshold
      const large = fileMeta && fileMeta.size > 30 * 1024 * 1024;
      sessionStorage.setItem('kinedrik_upload_step', '2');
      sessionStorage.setItem('kinedrik_upload_path', currentObjectPath);
      sessionStorage.setItem('kinedrik_upload_large', String(large));
      if (large) {
        setIsLargeFile(true);
        setShowSuccessModal(false);
        setSuccessStep(2);
        triggerAnalysisBackground();
        setPollingObjectPath(currentObjectPath);
      } else {
        setShowSuccessModal(false);
        setSuccessStep(2);
        startEmailProcess();
      }
    } else if (successStep === 3) {
      sessionStorage.removeItem('kinedrik_upload_step');
      sessionStorage.removeItem('kinedrik_upload_path');
      sessionStorage.removeItem('kinedrik_upload_large');
      setShowSuccessModal(false);
      setSuccessStep(0);
      setIsLargeFile(false);
      setFileMeta(null);
      setProgress(0);
      setStatus("");
      setCurrentObjectPath("");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      if (user?.email) {
        fetchRecentSessions(user.email);
        fetchFollowUps(user.email);
      }
    }
  };

  const handleNo = () => {
    setShowModal(false);
    setFileMeta(null);
    setProgress(0);
    setStatus("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleReportClose = () => {
    setReportData(null);
  };

  const handleOpenSession = async (session) => {
    setSessionLoading(session.id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${session.id}`, {
        headers: {
          "X-Admin-Email": user?.email || "",
          "X-Auth-Token": user?.authToken || "",
        },
      });
      const data = await res.json();
      if (data.ok) setReportData(data.report);
    } catch {
      // red inestable, ignorar
    } finally {
      setSessionLoading(null);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  const onDragOver = (e) => {
    e.preventDefault();
  };

  const getSuccessMessage = () => {
    if (successStep === 1) return "Gracias, por tu gran trabajo, pronto recibirás más información";
    if (successStep === 3) return "Correo enviado correctamente. Sigue con tu excelente trabajo consultor";
    return "";
  };

  return (
    <>
      <Sidebar />
      <div className={`appShell${waOpen ? " waPanelActive" : " waPanelCollapsedShell"}`}>
        <main className="mainContent">
          <div className="uploadBody">
          <div className="container">
            <div className={`uploadIntro${todaySessions.length > 0 ? " uploadIntroHidden" : ""}`}>
              <h1 className="title">
                Transforma tus reuniones en <span className="highlight">insights</span>
                <br />accionables
              </h1>
              <div className="welcomeText">
                <p className="subtitle highlightText">
                  <strong>Gracias por ser parte del equipo de consultores de venta.</strong>
                </p>
                <p className="subtitleText">
                  Al finalizar cada sesión, carga tu audio y transforma tu experiencia en crecimiento para todos.
                </p>
              </div>
            </div>

            {isOffline && (
              <div className="offlineWarning">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
                </svg>
                <span>Sin conexión a internet. Algunas funciones pueden no estar disponibles.</span>
              </div>
            )}

            {successStep === 2 ? (
              <div className="analyzingWidget">
                <div className="spinnerGlow"></div>
                <div className="analyzingText">{analysisText}</div>
              </div>
            ) : (
              <div className="dropZone" onDrop={onDrop} onDragOver={onDragOver} onClick={() => inputRef.current.click()}>
              <div className="micCircle">
                <div className="pulseRing"></div>
                <div className="pulseRing double"></div>
                <MicIcon />
              </div>

              <h3>Arrastra tu archivo de audio aqui</h3>
              <p>o haz clic para buscar en tu computadora</p>
              
              <div className="formatTags">
                <span className="formatTag">MP3</span>
                <span className="formatTag">WAV</span>
                <span className="formatTag">M4A</span>
                <span className="formatTag">OGG</span>
              </div>

              <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => handleFile(e.target.files[0])} />
            </div>
            )}

            {fileMeta && (progress > 0 || isUploading) && (
              <div className="progressSection">
                <div className="progressTop">
                  <div className="fileInfo">
                    <span>{fileMeta.name}</span>
                  </div>
                  <span className="percent">{progress}%</span>
                </div>

                <div className="progressBar">
                  <div className="progressFill" style={{ width: `${progress}%` }}></div>
                </div>

                <div className="progressBottom">
                  <span>{status}</span>
                  <span>
                    {formatMB((fileMeta.size * progress) / 100)} DE {formatMB(fileMeta.size)}
                  </span>
                </div>
              </div>
            )}

            {isUploading && <p>Subiendo archivo...</p>}
            {errorMsg && <p className="errorMessage">{errorMsg}</p>}

            {todaySessions.length > 0 && (
              <div className="recentSessionsContainer">
                <h3 className="recentTitle">Tus sesiones del día de hoy</h3>
                <div className="recentList">
                  {todaySessions.map((session) => (
                    <div
                      key={session.id}
                      className="sessionCard"
                      onClick={() => handleOpenSession(session)}
                      style={{ cursor: sessionLoading === session.id ? "wait" : "pointer" }}
                    >
                      <div className="sessionIcon">
                        {sessionLoading === session.id ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0040A4" strokeWidth="2.5" strokeLinecap="round">
                            <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
                            <path d="M12 3a9 9 0 0 1 9 9" strokeOpacity="1">
                              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
                            </path>
                          </svg>
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </div>
                      <div className="sessionInfo">
                        <div className="sessionName">{session.filename}</div>
                        <div className="sessionDate">
                          {new Date(session.date).toLocaleDateString()} - {session.duration}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <footer className="footer">© KINEDRIꓘ TODOS LOS DERECHOS RESERVADOS.</footer>
          </div>

          <aside className={`waPanel${waOpen ? "" : " waPanelCollapsed"}`}>
            {waOpen ? (
              <div className="waPanelInner">
                <div className="waPanelHeader" onClick={() => setWaOpen(false)} title="Retraer" style={{ cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  <span>Seguimientos</span>
                  {followUps.length > 0 && <span className="waPanelCount">{followUps.length}</span>}
                </div>
                {followUps.length > 0 ? (
                  <div className="waCardList">
                    {followUps.map((fu) => (
                      <WaCard key={fu.id} followUp={fu} onSent={handleMarkSent} onDismiss={handleDismiss} />
                    ))}
                  </div>
                ) : (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, opacity: 0.45 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="#25D366">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    <span style={{ color: "rgba(4,0,37,0.45)", fontSize: 12, fontWeight: 600, textAlign: "center" }}>Sin seguimientos<br/>pendientes</span>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="waPanelCollapsedBtn"
                onClick={() => setWaOpen(true)}
                aria-label="Ver seguimientos de WhatsApp"
              >
                <div className="waCollapsedTrigger">
                  <div className="waPanelCollapsedIcon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    {followUps.length > 0 && <span className="waPanelCount">{followUps.length}</span>}
                  </div>
                  <span className="waCollapsedLabel">Seguimientos</span>
                </div>
              </button>
            )}
          </aside>
          </div>
        </main>

        <Modal
          isOpen={showModal}
          message="El archivo de audio se ha cargado correctamente. Desea enviarlo ahora?"
          onYes={handleYes}
          onNo={handleNo}
        />

        <SuccessModal isOpen={showSuccessModal} message={getSuccessMessage()} onClose={handleSuccessClose} />

        {reportData && <ReportDetail report={reportData} onClose={handleReportClose} />}

        {isToastVisible && (
          <div className="toastNotice">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Pendiente envío del correo...</span>
          </div>
        )}
      </div>
    </>
  );
}
