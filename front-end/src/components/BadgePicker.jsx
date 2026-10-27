import { useEffect, useState } from "react";
import { PHASE_BADGES, RULE_BADGES, badgeSrc, badgeTitle } from "../utils/badges";
import "./BadgePicker.css";

// The insignia library as a grid; phases pick from phase insignias, rules from rule insignias. Free ones first.
function BadgeLibrary({ kind, value, onPick, onClose, usedBy = {} }) {
  const library = kind === "phase" ? PHASE_BADGES : RULE_BADGES;
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="badgeOverlay" onMouseDown={onClose}>
    <div className="badgeDialog" role="dialog" aria-label={kind === "phase" ? "Insignias de fase" : "Insignias de regla"} onMouseDown={(event) => event.stopPropagation()}>
      <header><h3>{kind === "phase" ? "Insignias de fase" : "Insignias de regla"}</h3><button type="button" onClick={onClose} aria-label="Cerrar">×</button></header>
      <div className="badgeGrid">
        {[...library].sort((x, y) => Number(Boolean(x.id !== value && usedBy[x.id])) - Number(Boolean(y.id !== value && usedBy[y.id]))).map((badge) => {
          const taken = badge.id !== value && usedBy[badge.id];
          return <button key={badge.id} type="button" className={`badgeOption ${taken ? "taken" : ""}`} aria-pressed={badge.id === value} disabled={Boolean(taken)} onClick={() => onPick(badge.id)}
            title={taken ? `Ya está en ${taken}` : badge.title}>
            <img src={badgeSrc(badge.id)} alt="" loading="lazy" /><span>{badge.title}</span>
            {taken && <small>En {taken}</small>}
          </button>;
        })}
      </div>
    </div>
  </div>;
}

// Speech comercial: the insignia of a phase or a rule. With openOnly, only the library is shown (the matrix has its own thumbnail).
export default function BadgeField({ kind, value, editable, onChange, openOnly = false, onClose, usedBy }) {
  const [open, setOpen] = useState(false);
  if (openOnly) return <BadgeLibrary kind={kind} value={value} onPick={onChange} onClose={onClose} usedBy={usedBy} />;
  return <div className="badgeField">
    <span className="badgeThumb">{value ? <img src={badgeSrc(value)} alt="" /> : <i aria-hidden="true" />}</span>
    <div className="badgeFieldText"><b>Insignia</b><span>{value ? badgeTitle(value) : "Sin insignia"}</span></div>
    {editable && <button type="button" className="speechSecondaryButton" onClick={() => setOpen(true)}>Elegir insignia</button>}
    {open && <BadgeLibrary kind={kind} value={value} onPick={(id) => { onChange(id); setOpen(false); }} onClose={() => setOpen(false)} />}
  </div>;
}
