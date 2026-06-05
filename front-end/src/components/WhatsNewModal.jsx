import React, { useState, useEffect } from 'react';
import { X, BarChart2, Download } from 'lucide-react';
import './WhatsNewModal.css';

const VERSION = '1.3';

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
    <div className="whatsNewOverlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="whatsNewCard">
        <button className="closeWhatsNew" onClick={handleClose} aria-label="Cerrar">
          <X size={18} />
        </button>

        <div className="whatsNewHeader">
          <div className="whatsNewVersion">Actualización v1.3</div>
          <h1 className="whatsNewTitle">Nuevas funcionalidades disponibles</h1>
          <p className="whatsNewSubtitle">
            Esta versión incorpora mejoras orientadas a reducir la fricción operativa
            y facilitar el acceso a la información de cada sesión analizada.
          </p>
        </div>

        <div className="whatsNewFeatures">
          <div className="wnFeature">
            <div className="wnIconWrap analysis">
              <BarChart2 size={22} />
            </div>
            <div className="wnFeatureBody">
              <h3>Visualización inmediata del análisis</h3>
              <p>
                Al finalizar la carga de un audio, la plataforma redirige automáticamente
                al informe completo de la sesión: KPIs, score general, áreas de mejora
                y resumen ejecutivo, sin pasos adicionales.
              </p>
            </div>
          </div>

          <div className="wnFeature">
            <div className="wnIconWrap download">
              <Download size={22} />
            </div>
            <div className="wnFeatureBody">
              <h3>Descarga de grabaciones desde el historial</h3>
              <p>
                Cada registro en el historial de llamadas ahora incluye una opción
                de descarga directa del audio original, facilitando la revisión,
                la auditoría interna y el proceso de retroalimentación entre
                formadores y consultores.
              </p>
            </div>
          </div>
        </div>

        <div className="whatsNewFooter">
          <span className="whatsNewFooterNote">KINEDRIꓘ Speech · v1.3</span>
          <button className="whatsNewBtn" onClick={handleClose}>
            Continuar a la plataforma
          </button>
        </div>
      </div>
    </div>
  );
}
