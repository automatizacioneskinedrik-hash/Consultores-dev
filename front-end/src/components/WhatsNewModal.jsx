import React, { useState, useEffect } from 'react';
import { X, History, Zap, MessageSquare, FileText } from 'lucide-react';
import './WhatsNewModal.css';

const VERSION = '1.2';

export default function WhatsNewModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem(`hasSeenWhatsNew_${VERSION}`);
    if (!hasSeen) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(`hasSeenWhatsNew_${VERSION}`, 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="whatsNewOverlay">
      <div className="whatsNewCard">
        <button className="closeWhatsNew" onClick={handleClose}>
          <X size={20} />
        </button>

        <div className="whatsNewVersion">Novedades v1.2</div>
        
        <h1 className="whatsNewTitle">¡Bienvenido a Kinedriꓘ Speech v1.2!</h1>
        <p className="whatsNewSubtitle">Hemos evolucionado para llevar tus ventas al siguiente nivel.</p>

        <div className="whatsNewGrid">
          <div className="wnFeature">
            <div className="wnIcon history">
              <History size={20} />
            </div>
            <h3>¡Historial en Tiempo Real!</h3>
            <p>Consulta al instante <b>fecha, duración y score</b> de tus sesiones. Ahora puedes acceder a tus reportes y resúmenes completos en cualquier momento.</p>
          </div>

          <div className="wnFeature">
            <div className="wnIcon prompt">
              <Zap size={20} />
            </div>
            <h3>¡Máxima Flexibilidad!</h3>
            <p>Hemos evolucionado: ahora los puntos de mejora son dinámicos <b>(de 0 a 5)</b>. Recibe un feedback positivo y adaptado a la realidad de tu llamada para potenciar tu éxito.</p>
          </div>

          <div className="wnFeature">
            <div className="wnIcon muletillas">
              <MessageSquare size={20} />
            </div>
            <h3>Radar de Muletillas</h3>
            <p>Detectamos los vicios del lenguaje y te decimos exactamente <b>qué palabras repetir menos</b> para que tu oratoria brille.</p>
          </div>

          <div className="wnFeature">
            <div className="wnIcon reports">
              <FileText size={20} />
            </div>
            <h3>Resumen Web Activo</h3>
            <p>¡Adiós a los correos perdidos! Ahora puedes visualizar el resumen completo y detallado directamente dentro del aplicativo web.</p>
          </div>
        </div>

        <button className="whatsNewBtn" onClick={handleClose}>
          ¡Sigue transformando diálogos en decisiones!
        </button>
      </div>
    </div>
  );
}
