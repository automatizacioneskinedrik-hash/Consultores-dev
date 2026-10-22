import { useEffect, useState } from "react";
import { PHASE_BADGES, RULE_BADGES, badgeSrc, badgeTitle } from "../utils/badges";
import "./BadgePicker.css";

// Speech comercial: the insignia of a phase or a rule, chosen from the library.
export default function BadgeField({ kind, value, editable, onChange }) {
  const [open, setOpen] = useState(false);
  const library = kind === "phase" ? PHASE_BADGES : RULE_BADGES;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return <div className="badgeField">
    <span className="badgeThumb">{value ? <img src={badgeSrc(value)} alt="" /> : <i aria-hidden="true" />}</span>
    <div className="badgeFieldText"><b>Insignia</b><span>{value ? badgeTitle(value) : "Sin insignia"}</span></div>
    {editable && <button type="button" className="speechSecondaryButton" onClick={() => setOpen(true)}>Elegir insignia</button>}
    {open && <div className="badgeOverlay" onMouseDown={() => setOpen(false)}>
      <div className="badgeDialog" role="dialog" aria-label={kind === "phase" ? "Insignias de fase" : "Insignias de regla"} onMouseDown={(event) => event.stopPropagation()}>
        <header><h3>{kind === "phase" ? "Insignias de fase" : "Insignias de regla"}</h3><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar">×</button></header>
        <div className="badgeGrid">
          {library.map((badge) => <button key={badge.id} type="button" className="badgeOption" aria-pressed={badge.id === value} onClick={() => { onChange(badge.id); setOpen(false); }}>
            <img src={badgeSrc(badge.id)} alt="" loading="lazy" /><span>{badge.title}</span>
          </button>)}
        </div>
      </div>
    </div>}
  </div>;
}
