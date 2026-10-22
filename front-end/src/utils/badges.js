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

export const phaseBadge = (phase) => (KNOWN.has(phase?.badge) ? phase.badge : DEFAULT_PHASE_BADGES[phase?.id] || null);
export const ruleBadge = (rule) => (KNOWN.has(rule?.badge) ? rule.badge : DEFAULT_RULE_BADGES[rule?.id] || null);
export const badgeSrc = (id, size = "s") => `/insignias/${size}/${id}.webp`;
export const badgeTitle = (id) => [...PHASE_BADGES, ...RULE_BADGES].find((badge) => badge.id === id)?.title || "";
