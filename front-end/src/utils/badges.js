// Insignia library (public/insignias): s/ for the page, l/ for the detail view. Speech comercial picks one per
// phase and per rule; until it does, the defaults below cover the current speech and the rest show a silhouette.
export const PHASE_BADGES = [
  ["apertura-conexion", "Apertura y conexión"],
  ["diagnostico-integral", "Diagnóstico integral"],
  ["vision-compartida", "Visión compartida"],
  ["puente-de-valor", "Puente de valor"],
  ["compromiso-cierre", "Compromiso y cierre"],
  ["escucha-activa", "Escucha activa"],
  ["preguntas-abiertas", "Preguntas abiertas"],
  ["negociacion-constructiva", "Negociación constructiva"],
  ["confianza", "Confianza"],
].map(([id, title]) => ({ id, title }));

export const RULE_BADGES = [
  ["agenda-y-proposito", "Agenda y propósito"],
  ["voz-del-cliente", "Voz del cliente"],
  ["situacion-profesional", "Situación profesional"],
  ["explorar-presupuesto", "Explorar presupuesto"],
  ["identificar-decisor", "Identificar al decisor"],
  ["raiz-de-la-necesidad", "Raíz de la necesidad"],
  ["futuro-deseado", "Futuro deseado"],
  ["conectar-programa-necesidad", "Programa y necesidad"],
  ["cuatro-elementos-clave", "Cuatro elementos clave"],
  ["comprobar-comprension", "Comprobar comprensión"],
  ["decision-antes-del-precio", "Decisión antes del precio"],
  ["espacio-para-pensar", "Espacio para pensar"],
  ["opciones-de-pago", "Opciones de pago"],
  ["gestionar-objeciones", "Gestionar objeciones"],
  ["fecha-real", "Fecha real"],
  ["claridad-verbal", "Claridad verbal"],
  ["equilibrio-conversacion", "Equilibrio al conversar"],
  ["personalizar-propuesta", "Personalizar la propuesta"],
  ["seguimiento-acordado", "Seguimiento acordado"],
  ["siguiente-paso", "Siguiente paso"],
  ["saludo-cercano", "Saludo cercano"],
  ["invitacion-camara", "Invitación a encender la cámara"],
  ["confirmar-datos", "Confirmación de los datos"],
  ["origen-del-contacto", "Procedencia del contacto"],
  ["identificar-barreras", "Identificación de barreras"],
  ["motivacion-para-actuar", "Motivación para actuar"],
  ["presentar-institucion", "Presentación de la institución"],
  ["confirmar-programa", "Confirmación del programa de interés"],
  ["ruta-formativa", "Estructura y evolución formativa"],
  ["competencias-profesionales", "Competencias y salidas profesionales"],
  ["estructura-academica", "Duración y estructura académica"],
  ["acompanamiento-academico", "Metodología y acompañamiento"],
  ["titulaciones", "Titulaciones"],
  ["certificaciones-y-recursos", "Certificaciones y recursos adicionales"],
  ["elegir-beneficio-adicional", "Selección de beneficio adicional"],
  ["valor-percibido", "Valor percibido antes del precio"],
  ["beca-transparente", "Presentación transparente de la beca"],
  ["documentacion-admision", "Documentación para admisión"],
].map(([id, title]) => ({ id, title }));

// Reserved for dominating the whole speech; not offered for phases.
export const MASTERY_BADGE = "maestria-del-speech";

const DEFAULT_PHASE_BADGES = { F1: "apertura-conexion", F2: "diagnostico-integral", F3: "vision-compartida", F4: "puente-de-valor", F5: "compromiso-cierre" };
const DEFAULT_RULE_BADGES = {
  "apertura-agenda": "agenda-y-proposito",
  "apertura-cliente-habla": "voz-del-cliente",
  "diagnostico-preguntas": "situacion-profesional",
  "diagnostico-presupuesto": "explorar-presupuesto",
  "diagnostico-decisor": "identificar-decisor",
  "vision-cliente-nombra": "raiz-de-la-necesidad",
  "vision-gap": "futuro-deseado",
  "propuesta-dolor": "conectar-programa-necesidad",
  "propuesta-foco": "cuatro-elementos-clave",
  "propuesta-pausas": "comprobar-comprension",
  "cierre-si-antes-precio": "decision-antes-del-precio",
  "cierre-silencio": "espacio-para-pensar",
  "cierre-plan-pago": "opciones-de-pago",
  "cierre-objeciones": "gestionar-objeciones",
  "cierre-beca": "fecha-real",
};

const KNOWN = new Set([...PHASE_BADGES, ...RULE_BADGES].map((badge) => badge.id).concat(MASTERY_BADGE));

export const NO_BADGE = "none";
export const phaseBadge = (phase) => (phase?.badge === NO_BADGE ? null : KNOWN.has(phase?.badge) ? phase.badge : DEFAULT_PHASE_BADGES[phase?.id] || null);
export const ruleBadge = (rule) => (rule?.badge === NO_BADGE ? null : KNOWN.has(rule?.badge) ? rule.badge : DEFAULT_RULE_BADGES[rule?.id] || null);
export const badgeSrc = (id, size = "s") => `/insignias/${size}/${id}.webp`;
export const badgeTitle = (id) => [...PHASE_BADGES, ...RULE_BADGES].find((badge) => badge.id === id)?.title || "";
