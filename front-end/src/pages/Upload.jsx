import { useRef, useState, useEffect } from "react";
import { getUser, setUser as storeUser } from "../utils/user";
import Sidebar from "../components/Sidebar";
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

export default function Upload() {
  const inputRef = useRef(null);
  const [user] = useState(() => getUser());

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
  const [successStep, setSuccessStep] = useState(0); // 0: none, 1: upload success message, 2: pending email, 3: email sent message
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [currentObjectPath, setCurrentObjectPath] = useState("");
  const [analysisText, setAnalysisText] = useState("Procesando información...");
  const [recentSessions, setRecentSessions] = useState([]);

  const fetchRecentSessions = async (email) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/recent?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.ok) {
        setRecentSessions(data.sessions || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (user?.email) {
      fetchRecentSessions(user.email);
    }
  }, [user?.email]);

  useEffect(() => {
    if (successStep === 2) {
      const texts = [
        "Identificando patrones del cliente...",
        "Analizando muletillas...",
        "Extrayendo puntos de mejora y validación de fases...",
        "Calculando score de la sesión...",
        "Elaborando el reporte avanzado..."
      ];
      let i = 0;
      setAnalysisText(texts[0]);
      const interval = setInterval(() => {
        i = (i + 1) % texts.length;
        setAnalysisText(texts[i]);
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [successStep]);

  const handleResendEmail = async (sessionId) => {
    alert("Procesando reenvío de reporte...");
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, email: user.email })
      });
      const data = await res.json();
      if (data.ok) {
        alert("Reporte reenviado con éxito a tu correo.");
      } else {
        alert("Error al enviar: " + (data.error || "Desconocido"));
      }
    } catch (err) {
      alert("Error contactando al servidor.");
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
    setShowModal(false);
    setErrorMsg("");
    setIsUploading(true);

    try {
      const signRes = await fetch(`${API_BASE_URL}/api/uploads/signed-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setCurrentObjectPath(objectPath); // Guardar para el paso de envío de correo

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
      setSuccessStep(1); // Primer mensaje motivador
      setShowSuccessModal(true);
    } catch (err) {
      setErrorMsg(err.message || "Error desconocido.");
      setStatus("ERROR");
    } finally {
      setIsUploading(false);
    }
  };

  const startEmailProcess = async () => {
    try {
      const completeRes = await fetch(`${API_BASE_URL}/api/uploads/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath: currentObjectPath, userEmail: user?.email || "anonymous" }),
      });

      const completeData = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(completeData?.error || "No se pudo enviar el correo.");
      }

      setSuccessStep(3); // Mensaje final de correo enviado
      setShowSuccessModal(true);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Error enviando correo.");
      setSuccessStep(0);
    }
  };

  const handleSuccessClose = () => {
    if (successStep === 1) {
      setShowSuccessModal(false);
      setSuccessStep(2); // Iniciar proceso de envío de correo
      
      // Iniciar el fetch al backend
      startEmailProcess();

      // Removed setting toast timeout
    } else if (successStep === 3) {
      // Reiniciar todo
      setShowSuccessModal(false);
      setSuccessStep(0);
      setFileMeta(null);
      setProgress(0);
      setStatus("");
      setCurrentObjectPath("");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      if (user?.email) {
        fetchRecentSessions(user.email);
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

  const onDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  const onDragOver = (e) => {
    e.preventDefault();
  };

  const getSuccessMessage = () => {
    if (successStep === 1) {
      return "Gracias, por tu gran trabajo, pronto recibirás más información";
    }
    if (successStep === 3) {
      return "Correo enviado correctamente. Sigue con tu excelente trabajo consultor";
    }
    return "";
  };

  return (
    <>
      <Sidebar />
      <div className="appShell">
        <main className="mainContent">
          <div className="container">
            <h1 className="title">
              Transforma tus reuniones en <span className="highlight">insights</span>
              <br />
              accionables
            </h1>

            <p className="subtitle">
              <strong>Gracias por ser parte del equipo de consultores de venta.</strong>
              <br />
              Al finalizar cada sesión, carga tu audio y transforma tu experiencia en crecimiento para todos.
            </p>

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

            {recentSessions.length > 0 && (
              <div className="recentSessionsContainer">
                <h3 className="recentTitle">Últimas sesiones procesadas</h3>
                <div className="recentList">
                  {recentSessions.map((session) => (
                    <div key={session.id} className="sessionCard">
                      <div className="sessionIcon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </div>
                      <div className="sessionInfo">
                        <div className="sessionName">{session.filename}</div>
                        <div className="sessionDate">
                          {new Date(session.date).toLocaleDateString()} - {session.duration}
                        </div>
                      </div>
                      <button className="resendBtn" onClick={() => handleResendEmail(session.id)}>
                        Reenviar reporte
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <footer className="footer">© KINEDRIꓘ TODOS LOS DERECHOS RESERVADOS.</footer>
          </div>
        </main>

        <Modal
          isOpen={showModal}
          message="El archivo de audio se ha cargado correctamente. Desea enviarlo ahora?"
          onYes={handleYes}
          onNo={handleNo}
        />

        <SuccessModal isOpen={showSuccessModal} message={getSuccessMessage()} onClose={handleSuccessClose} />

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
