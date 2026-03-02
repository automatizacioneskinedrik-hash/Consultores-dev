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

function SuccessModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modalOverlay">
      <div className="modalContent">
        <p>El archivo se ha enviado correctamente</p>
        <div className="modalButtons">
          <button className="btnYes" onClick={onClose}>
            OK
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

      setStatus("COMPLETADO");

      const completeRes = await fetch(`${API_BASE_URL}/api/uploads/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath }),
      });

      const completeData = await completeRes.json();
      if (!completeRes.ok || !completeData.ok) {
        throw new Error(completeData?.error || "No se pudo confirmar la subida.");
      }

      setShowSuccessModal(true);
    } catch (err) {
      setErrorMsg(err.message || "Error desconocido.");
      setStatus("ERROR");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    setFileMeta(null);
    setProgress(0);
    setStatus("");
    if (inputRef.current) {
      inputRef.current.value = "";
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
              Al finalizar cada sesion, carga tu audio y transforma tu experiencia en crecimiento para todos.
            </p>

            <div className="dropZone" onDrop={onDrop} onDragOver={onDragOver} onClick={() => inputRef.current.click()}>
              <div className="micCircle">
                <MicIcon />
              </div>

              <h3>Arrastra tu archivo de audio aqui</h3>
              <p>o haz clic para buscar en tu computadora</p>

              <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => handleFile(e.target.files[0])} />
            </div>

            {fileMeta && (
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

            <footer className="footer">© KINEDRIK TODOS LOS DERECHOS RESERVADOS.</footer>
          </div>
        </main>

        <Modal
          isOpen={showModal}
          message="El archivo de audio se ha cargado correctamente. Desea enviarlo ahora?"
          onYes={handleYes}
          onNo={handleNo}
        />

        <SuccessModal isOpen={showSuccessModal} onClose={handleSuccessClose} />
      </div>
    </>
  );
}
