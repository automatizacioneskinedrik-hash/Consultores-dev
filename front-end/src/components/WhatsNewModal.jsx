import React, { useState, useEffect } from 'react';
import { X, MessageCircle, Clock, Zap } from 'lucide-react';
import './WhatsNewModal.css';

const VERSION = '3.0';

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
          <div className="whatsNewVersion whatsNewVersionV3">🚀 Nueva versión v3.0</div>
          <h1 className="whatsNewTitle">La plataforma da un salto.<br />Tú también.</h1>
          <p className="whatsNewSubtitle">
            Esta versión redefine la velocidad de análisis, la inteligencia de seguimiento
            y la visibilidad de tus sesiones — todo desde una sola pantalla.
          </p>
        </div>

        <div className="whatsNewFeatures">

          <div className="wnFeature">
            <div className="wnIconWrap whatsapp">
              <MessageCircle size={22} />
            </div>
            <div className="wnFeatureBody">
              <h3>Seguimiento WhatsApp semiautomático <span className="wnBadgeNew">NUEVO</span> <span className="wnBadgeBeta">BETA</span></h3>
              <p>
                Tras cada sesión, la IA analiza la transcripción y genera un mensaje personalizado
                conectado con el dolor real del cliente — usando sus propias palabras. Aparece
                en tu panel lateral al instante, listo para enviar en un clic directo a WhatsApp.
                Sin copiar. Sin improvisar.
              </p>
              <p className="wnBetaNote">
                ⚠️ Funcionalidad en etapa inicial (beta). Los mensajes generados pueden requerir
                revisión antes de enviarse. Seguiremos refinando la precisión con cada versión.
              </p>
            </div>
          </div>

          <div className="wnFeature">
            <div className="wnIconWrap history">
              <Clock size={22} />
            </div>
            <div className="wnFeatureBody">
              <h3>Historial integrado en la pantalla de carga <span className="wnBadgeNew">NUEVO</span></h3>
              <p>
                Tus sesiones del día aparecen directamente en la ventana de carga, sin cambiar
                de sección. Accede al informe completo de cualquier sesión con un solo clic —
                score, KPIs, puntos de mejora y resumen ejecutivo, en tiempo real.
              </p>
            </div>
          </div>

          <div className="wnFeature wnFeatureHighlight">
            <div className="wnIconWrap speed">
              <Zap size={22} />
            </div>
            <div className="wnFeatureBody">
              <h3>Motor Assembly — transcripción 50% más rápida <span className="wnBadgeSpeed">⚡ +VELOCIDAD</span></h3>
              <p>
                Hemos migrado el pipeline de transcripción al modelo <strong style={{color:'#fbbf24'}}>AssemblyAI</strong>,
                con detección automática de idioma y diarización de hablantes de última generación.
                El tiempo de procesamiento se reduce hasta un <strong style={{color:'#fbbf24'}}>50%</strong> sin
                sacrificar ni un punto de precisión en el análisis.
              </p>
            </div>
          </div>

        </div>

        <div className="whatsNewFooter">
          <span className="whatsNewFooterNote">KINEDRIꓘ Speech · v3.0</span>
          <button className="whatsNewBtn" onClick={handleClose}>
            Explorar la plataforma →
          </button>
        </div>
      </div>
    </div>
  );
}
