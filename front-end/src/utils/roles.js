// Mirror of back-end/src/roles.js: the backend enforces it, this only decides what the screens show.
export const CARGOS = [
  { id: "atencion_temprana", label: "Atención temprana", seesAll: false, manages: false },
  { id: "waymaker", label: "Waymaker", seesAll: false, manages: false },
  { id: "kadvisor", label: "KAdvisor", seesAll: false, manages: false },
  { id: "coordinador_calidad", label: "Coordinador de calidad", seesAll: true, manages: true },
  { id: "supervisor_operacion", label: "Supervisor de operación", seesAll: true, manages: true },
  { id: "directivo", label: "Directivo", seesAll: true, manages: true },
  { id: "ingeniero", label: "Ingeniero", seesAll: true, manages: true },
];

const MASTER_ENGINEER_EMAIL = "adminkinedrik@eadic.com";
const BY_ID = new Map(CARGOS.map((cargo) => [cargo.id, cargo]));

// Sessions saved before the cargos existed only have the old role.
export function cargoOf(user = {}) {
  if (String(user.email || "").toLowerCase() === MASTER_ENGINEER_EMAIL) return BY_ID.get("ingeniero");
  if (BY_ID.has(user.cargo)) return BY_ID.get(user.cargo);
  return BY_ID.get(user.role === "admin" || user.role === "superadmin" ? "ingeniero" : "kadvisor");
}

export const seesAll = (user) => cargoOf(user).seesAll;
export const canManage = (user) => cargoOf(user).manages;
