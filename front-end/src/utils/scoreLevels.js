// Traffic light on brand colors for points scoring, shared by the report and the speech editor.
export const LEVELS = {
  excelente: { label: "Excelente", color: "#0040A4", factor: 1 },
  bien: { label: "Bien", color: "#8ABC43", factor: 0.75 },
  regular: { label: "Regular", color: "#FBB42A", factor: 0.5 },
  debil: { label: "Débil", color: "#FF5900", factor: 0.25 },
  no_lo_hizo: { label: "No lo hizo", color: "#cbd5e1", factor: 0 },
  no_aplica: { label: "No aplica", color: "#E7E7E7", factor: 0 },
};

export function levelForPercent(percent) {
  if (percent >= 87.5) return LEVELS.excelente;
  if (percent >= 62.5) return LEVELS.bien;
  if (percent >= 37.5) return LEVELS.regular;
  if (percent >= 12.5) return LEVELS.debil;
  return LEVELS.no_lo_hizo;
}
