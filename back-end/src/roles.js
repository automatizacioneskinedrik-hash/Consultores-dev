// Cargos of the commercial team and what each one can see (agreed on 14 October 2026).
// The matrix lives only here; the frontend mirrors it in front-end/src/utils/roles.js.
//   seesAll  → Historial and Panel show everyone's calls and metrics (otherwise only their own)
//   manages  → Gestionar usuarios, Speech comercial and Configuración avanzada
export const CARGOS = [
  { id: "atencion_temprana", label: "Atención temprana", seesAll: false, manages: false },
  { id: "waymaker", label: "Waymaker", seesAll: false, manages: false },
  { id: "kadvisor", label: "KAdvisor", seesAll: false, manages: false },
  { id: "coordinador_calidad", label: "Coordinador de calidad", seesAll: true, manages: true },
  { id: "supervisor_operacion", label: "Supervisor de operación", seesAll: true, manages: true },
  { id: "directivo", label: "Directivo", seesAll: true, manages: true },
  { id: "ingeniero", label: "Ingeniero", seesAll: true, manages: true },
];

export const MASTER_ENGINEER_EMAIL = "adminkinedrik@eadic.com";
const BY_ID = new Map(CARGOS.map((cargo) => [cargo.id, cargo]));

export const isCargo = (id) => BY_ID.has(id);

// Production still reads the old `role` field (user / admin / superadmin) from the same database,
// so users without a cargo get one derived from it, and every cargo change also updates `role`.
export function cargoOf(user = {}) {
  if (String(user.email || "").toLowerCase() === MASTER_ENGINEER_EMAIL) return BY_ID.get("ingeniero");
  if (BY_ID.has(user.cargo)) return BY_ID.get(user.cargo);
  return BY_ID.get(user.role === "admin" || user.role === "superadmin" ? "ingeniero" : "kadvisor");
}

export function legacyRoleFor(cargoId) {
  if (cargoId === "ingeniero") return "superadmin";
  return BY_ID.get(cargoId)?.manages ? "admin" : "user";
}
