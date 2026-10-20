import { useRef, useState, useEffect, useMemo } from "react";
import { Eye, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  { target: ".waNotice", title: "Mensajes por enviar", text: "Si te quedan mensajes de WhatsApp por enviar a tus clientes, te aviso aquí. Al tocar el aviso vas a Métricas → Coach, donde cada lead tiene su mensaje listo." },
  { target: ".accountAvatarButton", title: "Tu cuenta", text: "Aquí está tu foto. Haz clic en ella cuando quieras cerrar sesión." },
  { target: ".sidebarBrandToggle", title: "Más espacio en pantalla", text: "Haz clic aquí para plegar o desplegar el menú lateral." },
  { title: "¡Listo, ya sabes lo básico!", text: "Si algo no te quedó claro, haz clic en mí, abajo a la izquierda, y repetimos el recorrido." },
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";


// The three steps of a call, shown in each row of "Tus sesiones del día de hoy".
const STEPS = ["Subir", "Transcribir", "Calificar"];
const STEP_INDEX = { uploading: 0, queued: 1, transcribing: 1, grading: 2 };
const ACTIVE_STAGES = ["queued", "transcribing", "grading"];
const startOfToday = () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date.toISOString(); };
// Today's list, kept while the app is open, so coming back to Subir archivo shows it at once without animation.
const todayCache = { key: "", statuses: null, sessions: null };

const clock = (total) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

function CallRow({ stage, name, percent, owner, score, scoreFormat, duration, analysisSeconds, error, loading, onOpen, onDismiss }) {
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
        {analysisSeconds != null && <span className="callTime" title="Desde que terminó la subida hasta que el reporte quedó listo">⏱ {clock(analysisSeconds)} de análisis</span>}
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

export default function Upload() {
  const inputRef = useRef(null);
  const navigate = useNavigate();
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
      <GuideTour id="upload" steps={UPLOAD_TOUR} mascot="/mascots/dots/dot-azul-escucha-guia.webp" mascotName="el personaje azul" aura="rgba(40, 133, 255, .5)" />
      <div className="appShell">
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

            {followUps.length > 0 && <button type="button" className="waNotice" onClick={() => navigate("/metricas/coach")}>
              💬 Tienes {followUps.length} {followUps.length === 1 ? "mensaje" : "mensajes"} de WhatsApp por enviar <span>Ver en Coach →</span>
            </button>}
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
                    analysisSeconds={entry.analysisSeconds}
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

          </div>
        </main>

        {reportData && <ReportDetail report={reportData} onClose={handleReportClose} />}
      </div>
    </>
  );
}
