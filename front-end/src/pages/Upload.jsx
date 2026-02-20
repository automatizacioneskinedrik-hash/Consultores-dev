import { useRef, useState, useEffect } from "react";
import { getUser, setUser as storeUser } from "../utils/user";
import Sidebar from "../components/Sidebar";
import "../App.css";

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
            Sí
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
        <p>✓ El archivo se ha enviado correctamente</p>
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
      <path
        d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3Z"
        fill="#2b6cff"
      />
      <path
        d="M7 11a5 5 0 0 0 10 0"
        fill="none"
        stroke="#2b6cff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 16v4"
        fill="none"
        stroke="#2b6cff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9 20h6"
        fill="none"
        stroke="#2b6cff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Upload() {
  const inputRef = useRef(null);

  // Usuario: ahora se inicializa desde storage (preparado para reemplazar por DB/API)
  const [user] = useState(() => getUser());

  useEffect(() => {
    // Guardar cambios localmente (esto servirá como fallback hasta que usemos DB)
    if (user && user.fullName) {
      storeUser(user);
    }
  }, [user]);

  // Ejemplo de cómo más adelante podríamos reemplazar los datos estáticos
  // por una llamada a la API que devuelva el usuario y luego llame a `setUser(fetched)`.
  // useEffect(() => {
  //   fetch('/api/me').then(r=>r.json()).then(data => setUser({ fullName: data.name, email: data.email }));
  // }, []);

  const [fileMeta, setFileMeta] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleFile = (file) => {
    if (!file) return;

    setFileMeta(file);
    setProgress(0);
    setStatus("SUBIENDO...");

    simulateUpload(file);
  };

  const simulateUpload = (file) => {
    let uploaded = 0;
    const total = file.size;
    const chunk = total / 100;

    const interval = setInterval(() => {
      uploaded += chunk;

      const percent = Math.min(Math.round((uploaded / total) * 100), 100);

      setProgress(percent);

      if (percent >= 100) {
        clearInterval(interval);
        setStatus("COMPLETADO");
        setShowModal(true);
      }
    }, 40);
  };

  const handleYes = () => {
    setShowModal(false);
    // Mostrar modal de éxito
    setShowSuccessModal(true);

    // Aquí puedes agregar la lógica para enviar el archivo a tu API
    console.log("Enviando archivo:", fileMeta.name);
  };

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    // Resetear todo después de cerrar el modal de éxito
    setFileMeta(null);
    setProgress(0);
    setStatus("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleNo = () => {
    setShowModal(false);
    // Resetear el estado para permitir otra carga
    setFileMeta(null);
    setProgress(0);
    setStatus("");
    // Resetear el input para permitir seleccionar el mismo archivo de nuevo
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
        {/* user name moved to sidebar badge; top-right small block removed */}
        <main className="mainContent">
          <div className="container">
            <h1 className="title">
              Transforma tus reuniones en{" "}
              <span className="highlight">insights</span>
              <br />
              accionables
            </h1>

            <p className="subtitle">
              <strong>
                Gracias por ser parte del equipo de consultores de venta.
              </strong>
              <br />
              Al finalizar cada sesión, carga tu audio y transforma tu
              experiencia en crecimiento para todos.
            </p>

            <div
              className="dropZone"
              onDrop={onDrop}
              onDragOver={onDragOver}
              onClick={() => inputRef.current.click()}
            >
              <div className="micCircle">
                <MicIcon />
              </div>

              <h3>Arrastra tu archivo de audio aquí</h3>
              <p>o haz clic para buscar en tu computadora</p>

              <input
                ref={inputRef}
                type="file"
                accept="audio/*"
                hidden
                onChange={(e) => handleFile(e.target.files[0])}
              />
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
                  <div
                    className="progressFill"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>

                <div className="progressBottom">
                  <span>{status}</span>
                  <span>
                    {formatMB((fileMeta.size * progress) / 100)} DE{" "}
                    {formatMB(fileMeta.size)}
                  </span>
                </div>
              </div>
            )}

            <footer className="footer">
              © KINEDRIꓘ TODOS LOS DERECHOS RESERVADOS.
            </footer>
          </div>
        </main>

        <Modal
          isOpen={showModal}
          message="El archivo de audio se ha cargado correctamente. ¿Desea enviarlo ahora?"
          onYes={handleYes}
          onNo={handleNo}
        />

        <SuccessModal isOpen={showSuccessModal} onClose={handleSuccessClose} />
      </div>
    </>
  );
}
