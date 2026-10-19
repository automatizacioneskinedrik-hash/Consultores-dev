import { useRef, useState, useEffect, useMemo } from "react";
import { Eye, X } from "lucide-react";
import { getUser, setUser as storeUser } from "../utils/user";
import Sidebar from "../components/Sidebar";
import ReportDetail from "../components/ReportDetail";
import GuideTour from "../components/GuideTour";
import OwnerPicker from "../components/OwnerPicker";
import UserAvatar from "../components/UserAvatar";
import { seesAll } from "../utils/roles";
import "../App.css";

const UPLOAD_TOUR = [
  { title: "¡Hola! Yo escucho tus llamadas", text: "Te muestro en menos de un minuto cómo funciona esta pantalla. Puedes saltar el recorrido cuando quieras." },
  { target: ".ownerPicker", title: "¿De quién es la llamada?", text: "Si subes la llamada de otra persona, elígela aquí antes de subirla. Quedará en su historial y en sus métricas." },
  { target: ".dropZone", title: "Aquí subes tu llamada", text: "Arrastra la grabación hasta este recuadro o haz clic en él para buscarla en tu computador." },
  { target: ".formatTags", title: "Formatos que entiendo", text: "Acepto audios en MP3, WAV, M4A u OGG. Si tu archivo tiene otro formato, conviértelo primero a uno de estos." },
  { target: ".dropZone", title: "Luego yo hago el resto", text: "Transcribo la llamada, la califico con el speech comercial y te muestro tu reporte: la nota de 100 y qué decir distinto la próxima vez." },
  { target: ".recentSessionsContainer", title: "Tus llamadas de hoy", text: "Las llamadas que subes hoy aparecen aquí. Con Ver resumen abres su reporte sin salir de esta pantalla." },
  { target: '.sidebarItem[title="Métricas"]', title: "Tus reportes quedan guardados", text: "En Métricas, en la pestaña Historial, encuentras todas tus llamadas analizadas, por si quieres volver a verlas o descargar el PDF." },
  { target: ".waFloatBtn", title: "Seguimientos por WhatsApp", text: "Después de cada llamada te sugiero un mensaje de seguimiento para tu cliente. Lo encuentras aquí." },
  { do: [{ show: [".waFloatBtn", ".waPanel:not(.waPanelHidden)"] }], target: ".waPanel", title: "Tus mensajes pendientes", text: "Aquí se juntan los mensajes sugeridos. Cada tarjeta es un cliente y te recuerda enviarlo en las próximas 24 horas." },
  { target: ".waCardMsg", title: "Revisa el mensaje", text: "Puedes leer el mensaje sugerido y cambiar lo que quieras antes de enviarlo." },
  { target: ".waCardPhone", title: "El número del cliente", text: "Elige el país y escribe su número de WhatsApp. Sin número, el botón de enviar no se activa." },
  { target: ".waCardBtn", title: "Envíalo con un clic", text: "Se abre WhatsApp con el mensaje ya escrito, listo para que lo mandes." },
  { target: ".waCardDismiss", title: "¿No lo necesitas?", text: "Con la X descartas el mensaje y desaparece de tu lista." },
  { do: [{ hide: [".waFloatBtn", ".waPanel:not(.waPanelHidden)"] }], target: ".accountAvatarButton", title: "Tu cuenta", text: "Aquí está tu foto. Haz clic en ella cuando quieras cerrar sesión." },
  { target: ".sidebarBrandToggle", title: "Más espacio en pantalla", text: "Haz clic aquí para plegar o desplegar el menú lateral." },
  { title: "¡Listo, ya sabes lo básico!", text: "Si algo no te quedó claro, haz clic en mí, abajo a la izquierda, y repetimos el recorrido." },
];
const UPLOAD_TOUR_CLEANUP = [{ hide: [".waFloatBtn", ".waPanel:not(.waPanelHidden)"] }];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";


// The three steps of a call, shown in each row of "Tus sesiones del día de hoy".
const STEPS = ["Subir", "Transcribir", "Calificar"];
const STEP_INDEX = { uploading: 0, queued: 1, transcribing: 1, grading: 2 };
const ACTIVE_STAGES = ["queued", "transcribing", "grading"];
const startOfToday = () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date.toISOString(); };
// Today's list, kept while the app is open, so coming back to Subir archivo shows it at once without animation.
const todayCache = { key: "", statuses: null, sessions: null };

function CallRow({ stage, name, percent, owner, score, scoreFormat, duration, error, loading, onOpen, onDismiss }) {
  const current = STEP_INDEX[stage];
  const status = {
    uploading: `Subiendo ${percent ?? 0} %`,
    queued: "En cola · empieza en unos segundos",
    transcribing: "Transcribiendo la llamada…",
    grading: "Calificando con el speech…",
    done: `Lista${duration ? ` · ${duration}` : ""}`,
    error,
  }[stage];
  return <div className={`callRow is-${stage}`}>
    <div className="callMain">
      <div className="callName">{name}</div>
      <div className="callStatus">{status}</div>
      {current !== undefined && <div className="callSteps" aria-label={`Paso ${current + 1} de 3`}>
        {STEPS.map((step, index) => <span key={step} className={index < current ? "done" : index === current ? "now" : ""}>
          <i style={index === 0 && stage === "uploading" ? { "--fill": `${percent ?? 0}%` } : undefined} />{step}
        </span>)}
      </div>}
    </div>
    {owner ? <span className="callOwner"><UserAvatar name={owner.name} email={owner.email} picture={owner.picture} className="avatarSm" />{owner.name}</span> : <span />}
    <div className="callActions">
      {stage === "done" && <>
        {score != null && <span className={`callScore ${score >= 70 ? "high" : score >= 40 ? "mid" : "low"}`}>{scoreFormat === "points" ? `${Number(score).toLocaleString("es-CO")} pts` : `${score}%`}</span>}
        <button className="viewSummaryBtn" type="button" onClick={onOpen} disabled={loading}><Eye size={14} /><span>{loading ? "Abriendo…" : "Ver Resumen"}</span></button>
      </>}
      {stage === "error" && <button className="callDismiss" type="button" aria-label="Quitar de la lista" onClick={onDismiss}><X size={14} /></button>}
    </div>
  </div>;
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
  const [user] = useState(() => getUser() || {});
  // Roles that see everyone may upload a call for someone else; read at upload time through a ref.
  const canChooseOwner = seesAll(user);
  const [ownerEmail, setOwnerEmail] = useState(user.email || "");
  const ownerRef = useRef(ownerEmail);
  const chooseOwner = (email) => { ownerRef.current = email; setOwnerEmail(email); };

  useEffect(() => {
    if (user && user.fullName) {
      storeUser(user);
    }
  }, [user]);

  const cacheKey = `${user.email}|${startOfToday()}`;
  const cached = todayCache.key === cacheKey ? todayCache : null;
  const [errorMsg, setErrorMsg] = useState("");
  const [reportData, setReportData] = useState(null);
  // The call being uploaded from this browser, until the server reports its step.
  const [uploading, setUploading] = useState(null);
  // Today's calls with their real step, written by the server while it analyzes them.
  const [statuses, setStatuses] = useState(() => cached?.statuses || []);
  const [loaded, setLoaded] = useState(() => Boolean(cached?.statuses));
  const [analysisText, setAnalysisText] = useState("Procesando información...");
  const [recentSessions, setRecentSessions] = useState(() => cached?.sessions || []);
  const [sessionsLoaded, setSessionsLoaded] = useState(() => Boolean(cached?.sessions));
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
        todayCache.key = cacheKey;
        todayCache.sessions = data.sessions || [];
      }
      setSessionsLoaded(true);
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

  const analyzing = Boolean(uploading) || statuses.some((entry) => ACTIVE_STAGES.includes(entry.stage));

  useEffect(() => {
    if (analyzing) {
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
        "Una apertura bien ejecutada facilita el cierre. El rapport es tu base estructural.",
        "Ante un 'lo tengo que pensar': '¿Qué es lo que necesitas pensar?' devuelve la conversación.",
        "No preguntes '¿Tienes preguntas?' — pregunta '¿Qué es lo que más te resuena de esto?'",
        "Un monólogo de más de 2 minutos borra la confianza que tardaste 10 minutos en construir.",
        "El objetivo del diagnóstico es que el lead exprese sus necesidades con sus propias palabras.",
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
  }, [analyzing]);

  const fetchStatuses = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/statuses?since=${encodeURIComponent(startOfToday())}`, {
        headers: { "X-Admin-Email": user?.email || "", "X-Auth-Token": user?.authToken || "" },
      });
      const data = await res.json();
      if (data.ok) {
        setStatuses(data.statuses || []);
        todayCache.key = cacheKey;
        todayCache.statuses = data.statuses || [];
      }
    } catch { /* red inestable: lo intenta en la siguiente vuelta */ }
    setLoaded(true);
  };

  useEffect(() => {
    if (user?.email && user?.authToken) fetchStatuses();
  }, [user?.email, user?.authToken]);

  // While a call is in progress, its step is checked every 4 seconds.
  useEffect(() => {
    if (!analyzing) return;
    const timer = setInterval(fetchStatuses, 4000);
    return () => clearInterval(timer);
  }, [analyzing]);

  // When a call finishes, refresh today's list and the WhatsApp follow-ups it may have created.
  const activeIds = useRef(new Set());
  useEffect(() => {
    const finished = [...activeIds.current].some((id) => statuses.find((entry) => entry.id === id && entry.stage === "done"));
    activeIds.current = new Set(statuses.filter((entry) => ACTIVE_STAGES.includes(entry.stage)).map((entry) => entry.id));
    if (finished && user?.email) { fetchRecentSessions(user.email); fetchFollowUps(user.email); }
  }, [statuses]);

  // The browser's own upload row gives way to the server's row once it exists.
  useEffect(() => {
    if (uploading?.objectPath && statuses.some((entry) => entry.objectPath === uploading.objectPath)) setUploading(null);
  }, [statuses, uploading?.objectPath]);

  // Today's calls that have no step record (uploaded before this list existed) still show as done.
  const legacySessions = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const withStatus = new Set(statuses.map((entry) => entry.sessionId).filter(Boolean));
    return recentSessions.filter((session) => session.date && new Date(session.date) >= todayStart && !withStatus.has(session.id));
  }, [recentSessions, statuses]);

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


  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  // Choosing or dropping the audio uploads it right away; the analysis starts when the upload ends.
  const handleFile = async (file) => {
    if (!file || analyzing) return;
    if (!navigator.onLine) {
      setErrorMsg("No tienes conexión a internet. Por favor, conéctate e intenta de nuevo.");
      return;
    }
    setErrorMsg("");
    setUploading({ name: file.name, percent: 0 });
    const headers = { "Content-Type": "application/json", "X-Admin-Email": user?.email || "", "X-Auth-Token": user?.authToken || "" };

    try {
      const signRes = await fetch(`${API_BASE_URL}/api/upload/signed-url`, {
        method: "POST",
        headers,
        body: JSON.stringify({ originalName: file.name, contentType: file.type, userId: user?.email || "anonymous", meetingType: "venta" }),
      });
      const signData = await signRes.json();
      if (!signRes.ok || !signData.ok) throw new Error(signData?.error || "No se pudo generar URL de subida.");
      const { uploadUrl, objectPath } = signData;

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) setUploading({ name: file.name, percent: Math.round((evt.loaded / evt.total) * 100) });
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Error subiendo a GCS (status ${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Error de red subiendo a GCS."));
        xhr.send(file);
      });

      // The analysis starts now. Short calls keep this request open until they finish; long ones answer at
      // once and go on in the server. Either way the row follows the real step.
      setUploading({ name: file.name, percent: 100, objectPath });
      resetInput();
      fetch(`${API_BASE_URL}/api/upload/complete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ objectPath, ownerEmail: ownerRef.current, fileName: file.name }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok && res.status < 500) { setUploading(null); setErrorMsg(data?.error || "No se pudo enviar la llamada a analizar."); }
        })
        .catch(() => { /* the row keeps following the server's status */ })
        .finally(fetchStatuses);
      setTimeout(fetchStatuses, 1500);
    } catch (err) {
      const msg = err.message || "Error desconocido.";
      setErrorMsg(msg.includes("Failed to fetch") ? "Error de red: No se pudo contactar al servidor. Revisa tu conexión." : msg);
      setUploading(null);
      resetInput();
    }
  };

  const dismissStatus = async (id) => {
    setStatuses((current) => current.filter((entry) => entry.id !== id));
    try {
      await fetch(`${API_BASE_URL}/api/sessions/statuses/${id}/dismiss`, {
        method: "POST",
        headers: { "X-Admin-Email": user?.email || "", "X-Auth-Token": user?.authToken || "" },
      });
    } catch { /* se oculta igual en esta pantalla */ }
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

  return (
    <>
      <Sidebar />
      <GuideTour id="upload" steps={UPLOAD_TOUR} cleanup={UPLOAD_TOUR_CLEANUP}mascot="/mascots/dots/dot-azul-escucha-guia.webp" mascotName="el personaje azul" aura="rgba(40, 133, 255, .5)" />
      <div className={`appShell${waOpen ? " waPanelActive" : ""}`}>
        <main className="mainContent">
          <div className="uploadBody">
          <div className="container">
            {loaded && sessionsLoaded && !uploading && statuses.length === 0 && legacySessions.length === 0 && <div className="uploadIntro">
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
            </div>}

            {isOffline && (
              <div className="offlineWarning">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
                </svg>
                <span>Sin conexión a internet. Algunas funciones pueden no estar disponibles.</span>
              </div>
            )}

            {canChooseOwner && <OwnerPicker user={user} value={ownerEmail} onChange={chooseOwner} disabled={analyzing} />}
            {(
              <div className={`dropZone${analyzing ? " dropZoneBusy" : ""}`} onDrop={onDrop} onDragOver={onDragOver} onClick={() => { if (!analyzing) inputRef.current.click(); }} aria-disabled={analyzing}>
              <div className="micCircle">
                <div className="pulseRing"></div>
                <div className="pulseRing double"></div>
                <MicIcon />
              </div>

              <h3>{analyzing ? "Analizando tu llamada" : "Arrastra tu archivo de audio aqui"}</h3>
              <p>{analyzing ? "Espera a que termine la llamada en curso para subir otra." : "o haz clic para buscar en tu computadora"}</p>
              
              <div className="formatTags">
                <span className="formatTag">MP3</span>
                <span className="formatTag">WAV</span>
                <span className="formatTag">M4A</span>
                <span className="formatTag">OGG</span>
              </div>

              <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => handleFile(e.target.files[0])} />
            </div>
            )}

            {errorMsg && <p className="errorMessage">{errorMsg}</p>}

            {(uploading || statuses.length > 0 || legacySessions.length > 0) && (
              <div className="recentSessionsContainer">
                <div className="callsHead">
                  <h3 className="recentTitle">Tus sesiones del día de hoy</h3>
                  {analyzing && <span className="callsHint">{analysisText}</span>}
                </div>
                <div className="callList">
                  {uploading && !statuses.some((entry) => entry.objectPath === uploading.objectPath) && <CallRow stage="uploading" name={uploading.name} percent={uploading.percent} />}
                  {statuses.map((entry) => <CallRow
                    key={entry.id}
                    stage={entry.stage}
                    name={entry.clientName ? `Reunión con ${entry.clientName}` : entry.fileName}
                    owner={entry.userEmail !== String(user.email || "").toLowerCase() ? { name: entry.ownerName || entry.userEmail, email: entry.userEmail } : null}
                    score={entry.score}
                    scoreFormat={entry.scoreFormat}
                    duration={entry.duration}
                    error={entry.error}
                    loading={sessionLoading === entry.sessionId}
                    onOpen={() => handleOpenSession({ id: entry.sessionId })}
                    onDismiss={() => dismissStatus(entry.id)}
                  />)}
                  {legacySessions.map((session) => <CallRow
                    key={session.id}
                    stage="done"
                    name={session.filename}
                    score={session.score}
                    scoreFormat={session.scoreFormat}
                    duration={session.duration}
                    loading={sessionLoading === session.id}
                    onOpen={() => handleOpenSession(session)}
                  />)}
                </div>
              </div>
            )}

            <footer className="footer">© KINEDRIꓘ TODOS LOS DERECHOS RESERVADOS.</footer>
          </div>

          {/* Botón flotante — siempre visible, abre/cierra el panel */}
          <div className="waFloatBtnWrap">
            <button
              className={`waFloatBtn${waOpen ? " waFloatBtnOpen" : ""}`}
              onClick={() => setWaOpen(prev => !prev)}
              aria-label={waOpen ? "Cerrar panel de seguimientos" : "Abrir panel de seguimientos"}
            >
              <div className="waFloatBtnIcon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#25D366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <span className="waFloatBtnLabel">Seguimientos</span>
            </button>
            {followUps.length > 0 && <span className="waFloatBtnBadge">{followUps.length}</span>}
          </div>

          {/* Panel expandido */}
          <aside className={`waPanel${waOpen ? "" : " waPanelHidden"}`}>
              <div className="waPanelInner">
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
            </aside>
          </div>
        </main>

        {reportData && <ReportDetail report={reportData} onClose={handleReportClose} />}
      </div>
    </>
  );
}
