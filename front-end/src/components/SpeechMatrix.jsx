import { useState } from "react";
import { Trash2 } from "lucide-react";
import BadgeField from "./BadgePicker";
import { badgeSrc, phaseBadge, ruleBadge } from "../utils/badges";
import "./SpeechMatrix.css";

// Kinedrik colours in a fixed order, the same in the phase pills and in each phase's number.
const PHASE_COLORS = [["#040025", "#fff"], ["#0040A4", "#fff"], ["#2885FF", "#fff"], ["#BB8AFF", "#040025"], ["#8ABC43", "#040025"], ["#FBB42A", "#040025"]];
const phaseColor = (index) => PHASE_COLORS[index % PHASE_COLORS.length];
const sumPoints = (rules) => rules.reduce((sum, rule) => sum + (Number(rule.points) || 0), 0);

// Text cells grow with what is written; pasting keeps it inside the cell as plain text.
function TextCell({ value, onChange, label, className = "", required = false, readOnly }) {
  if (readOnly) return <div className={`smCell smText ${className}`}>{value || <span className="smEmpty">—</span>}</div>;
  return <textarea className={`smCell smText ${className} ${required && !String(value || "").trim() ? "smErr" : ""}`} rows={1} value={value || ""} aria-label={label}
    onChange={(event) => onChange(event.target.value)}
    onPaste={(event) => {
      event.preventDefault();
      const text = (event.clipboardData.getData("text/plain") || "").replace(/\t/g, " ").replace(/\r/g, "");
      const el = event.currentTarget;
      onChange(el.value.slice(0, el.selectionStart) + text + el.value.slice(el.selectionEnd));
    }}
    onKeyDown={(event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      const column = event.currentTarget.dataset.col;
      const cells = [...event.currentTarget.closest("table").querySelectorAll(`[data-col="${column}"]`)];
      cells[cells.indexOf(event.currentTarget) + 1]?.focus();
    }}
    data-col={className.includes("smName") ? "name" : label.startsWith("Ayuda") ? "guidance" : "title"} />;
}

// Points: digits only, no paste.
function PointsCell({ value, onChange, label, readOnly }) {
  if (readOnly) return <div className="smCell smPts">{value}</div>;
  const set = (next) => onChange(Math.max(1, Math.min(100, next)));
  return <div className="smPtsEdit">
    <button type="button" tabIndex={-1} aria-label="Restar un punto" onClick={() => set((Number(value) || 0) - 1)}>−</button>
    <input className="smCell smPts" inputMode="numeric" value={value} aria-label={label}
      onKeyDown={(event) => { if (event.key.length === 1 && !/\d/.test(event.key) && !event.ctrlKey && !event.metaKey) event.preventDefault(); }}
      onPaste={(event) => event.preventDefault()}
      onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 3); onChange(digits === "" ? 0 : Number(digits)); }}
      onBlur={() => { if (!Number(value)) set(1); }} />
    <button type="button" tabIndex={-1} aria-label="Sumar un punto" onClick={() => set((Number(value) || 0) + 1)}>+</button>
  </div>;
}

function Badge({ kind, value, editable, onChange, label }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="smBadge" onClick={() => editable && setOpen(true)} disabled={!editable} aria-label={label}>
      {value ? <img src={badgeSrc(value)} alt="" /> : <span className="smNoBadge" aria-hidden="true" />}
    </button>
    {open && <BadgeField kind={kind} value={value} editable onChange={(id) => { onChange(id); setOpen(false); }} openOnly onClose={() => setOpen(false)} />}
  </>;
}

function Trash({ label, onConfirm, disabled }) {
  const [asking, setAsking] = useState(false);
  if (asking) return <div className="smConfirm"><span>¿Eliminar?</span><button type="button" onClick={() => setAsking(false)}>No</button><button type="button" className="yes" onClick={onConfirm}>Sí</button></div>;
  return <button type="button" className="smTrash" aria-label={label} title={label} onClick={() => setAsking(true)} disabled={disabled}><Trash2 size={16} /></button>;
}

// Speech comercial as one uniform grid: each phase row has the same columns as its rules (1, 1.1, 1.2…).
export default function SpeechMatrix({ speech, editable, onChange, ratioPoints, muletillasPoints, newId }) {
  const total = sumPoints(speech.rules) + ratioPoints + muletillasPoints;
  const setPhase = (id, field, value) => onChange({ phases: speech.phases.map((phase) => phase.id === id ? { ...phase, [field]: value } : phase) });
  const setRule = (id, field, value) => onChange({ rules: speech.rules.map((rule) => rule.id === id ? { ...rule, [field]: value } : rule) });
  const addRule = (phaseId) => onChange({ rules: [...speech.rules, { id: newId("regla"), phaseId, title: "", guidance: "", points: 1, allowNotApplicable: false }] });
  const addPhase = () => onChange({ phases: [...speech.phases, { id: newId("fase"), name: "", objective: "" }] });
  // Changing a rule's phase moves it to the end of that phase and keeps its id, text, insignia and history.
  const moveRule = (id, phaseId) => {
    const rule = speech.rules.find((entry) => entry.id === id);
    onChange({ rules: [...speech.rules.filter((entry) => entry.id !== id), { ...rule, phaseId }] });
  };

  return <section className="smCard" aria-label="Fases y reglas">
    <div className="smHead">
      <h2>Fases y reglas</h2>
      <div className="smPills">
        {speech.phases.map((phase, index) => <span key={phase.id} className="smPill" style={{ "--c": phaseColor(index)[0], "--ink-c": phaseColor(index)[1] }}>
          <i>{index + 1}</i>{phase.name || "Fase sin nombre"} <b>{sumPoints(speech.rules.filter((rule) => rule.phaseId === phase.id))} pts</b>
        </span>)}
        <span className="smPill plain">Ratio de habla <b>{ratioPoints} pts</b></span>
        <span className="smPill plain">Muletillas <b>{muletillasPoints} pts</b></span>
        <span className={`smTotal ${total === 100 ? "" : "bad"}`}>Total {total} / 100 pts</span>
      </div>
    </div>
    <div className="smWrap">
      <table className="smTable">
        <colgroup><col className="cNum" /><col className="cPhase" /><col /><col /><col className="cPts" /><col className="cNa" /><col className="cBadge" />{editable && <col className="cDel" />}</colgroup>
        <thead><tr><th>#</th><th>Fase</th><th>Qué debe pasar</th><th>Ayuda para la IA</th><th>Puntos</th><th>No resta</th><th>Insignia</th>{editable && <th aria-label="Eliminar" />}</tr></thead>
        <tbody>
          {speech.phases.map((phase, phaseIndex) => {
            const rules = speech.rules.filter((rule) => rule.phaseId === phase.id);
            const [color, ink] = phaseColor(phaseIndex);
            return [
              <tr key={phase.id} className="smPhase">
                <td className="smNum"><span className="smStep" style={{ background: color, color: ink }}>{phaseIndex + 1}</span></td>
                <td><TextCell className="smName" value={phase.name} required readOnly={!editable} label={`Nombre de la fase ${phaseIndex + 1}`} onChange={(value) => setPhase(phase.id, "name", value)} /></td>
                <td><TextCell className="smObjective" value={phase.objective} readOnly={!editable} label={`Objetivo de la fase ${phaseIndex + 1}`} onChange={(value) => setPhase(phase.id, "objective", value)} /></td>
                <td />
                <td><div className="smCell smSum">{sumPoints(rules)}</div></td>
                <td />
                <td><Badge kind="phase" value={phaseBadge(phase)} editable={editable} label={`Insignia de la fase ${phase.name}`} onChange={(id) => setPhase(phase.id, "badge", id)} /></td>
                {editable && <td><Trash label={`Eliminar la fase ${phase.name}`} disabled={speech.phases.length === 1} onConfirm={() => onChange({ phases: speech.phases.filter((entry) => entry.id !== phase.id), rules: speech.rules.filter((rule) => rule.phaseId !== phase.id) })} /></td>}
              </tr>,
              ...rules.map((rule, ruleIndex) => {
                const number = `${phaseIndex + 1}.${ruleIndex + 1}`;
                return <tr key={rule.id}>
                  <td className="smNum smRuleNum">{number}</td>
                  <td>{editable
                    ? <select className="smCell smSelect" value={rule.phaseId} aria-label={`Fase de la regla ${number}`} onChange={(event) => moveRule(rule.id, event.target.value)}>
                      {speech.phases.map((option) => <option key={option.id} value={option.id}>{option.name || "Fase sin nombre"}</option>)}
                    </select>
                    : <div className="smCell smMuted">{phase.name}</div>}</td>
                  <td><TextCell value={rule.title} required readOnly={!editable} label={`Qué debe pasar, regla ${number}`} onChange={(value) => setRule(rule.id, "title", value)} /></td>
                  <td><TextCell value={rule.guidance} readOnly={!editable} label={`Ayuda para la IA, regla ${number}`} onChange={(value) => setRule(rule.id, "guidance", value)} /></td>
                  <td><PointsCell value={rule.points} readOnly={!editable} label={`Puntos de la regla ${number}`} onChange={(value) => setRule(rule.id, "points", value)} /></td>
                  <td><div className="smCheck"><input type="checkbox" checked={Boolean(rule.allowNotApplicable)} disabled={!editable} aria-label={`No resta si no ocurre, regla ${number}`} onChange={(event) => setRule(rule.id, "allowNotApplicable", event.target.checked)} /></div></td>
                  <td><Badge kind="rule" value={ruleBadge(rule)} editable={editable} label={`Insignia de la regla ${number}`} onChange={(id) => setRule(rule.id, "badge", id)} /></td>
                  {editable && <td><Trash label={`Eliminar la regla ${number}`} onConfirm={() => onChange({ rules: speech.rules.filter((entry) => entry.id !== rule.id) })} /></td>}
                </tr>;
              }),
              editable && <tr key={`${phase.id}-add`} className="smAddRow"><td /><td colSpan={7}><button type="button" className="smAdd" onClick={() => addRule(phase.id)}>+ Añadir regla a {phase.name || "esta fase"}</button></td></tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
    {editable && <div className="smFoot"><button type="button" className="smAdd" onClick={addPhase} disabled={speech.phases.length >= 12}>+ Añadir fase</button></div>}
  </section>;
}
