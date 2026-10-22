import { useEffect, useMemo, useRef, useState } from "react";
import { MASTERY_BADGE, badgeSrc, phaseBadge, ruleBadge } from "../utils/badges";
import "./MiCamino.css";

// Where each phase stands on the background's marble platforms (x and the platform's top, in % of the scene).
// The last platform, higher up, is for Maestría del speech.
const PLATFORMS = [[9.5, 76], [23.5, 76], [38.5, 70], [54, 62], [68, 55], [79.5, 50]];
const MASTERY_SPOT = [92.5, 42];
const HELD = new Set(["earned", "risk"]);

// Phases take the platforms in order (a spare one stays before Maestría); with more phases, they share the line.
function spots(count) {
  if (count <= PLATFORMS.length) return PLATFORMS.slice(0, count);
  const line = [...PLATFORMS, MASTERY_SPOT];
  return Array.from({ length: count }, (_, i) => {
    const t = (i / count) * (line.length - 1);
    const a = line[Math.floor(t)];
    const b = line[Math.min(Math.floor(t) + 1, line.length - 1)];
    const f = t - Math.floor(t);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  });
}

const RULE_TEXT = {
  earned: "Ganada",
  risk: "En riesgo: tus últimas llamadas van mal en esta regla.",
  lost: "Perdida en tus últimas llamadas. Recupérala con 3 de 5.",
  pending: "Por ganar",
};

function Badge({ id, className, onOpen, label, delay }) {
  return <button type="button" className={`camBadge ${className}`} onClick={onOpen} aria-label={label} style={{ "--float-delay": `${delay}s` }}>
    {id ? <img src={badgeSrc(id)} alt="" loading="lazy" draggable="false" /> : <span className="camSilhouette" aria-hidden="true" />}
  </button>;
}

function Detail({ item, path, onClose }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="coachOverlay" onMouseDown={onClose}>
    <div className="camDetail" role="dialog" aria-label={item.title} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="camClose" onClick={onClose} aria-label="Cerrar">×</button>
      {item.badge ? <img className={`camDetailImg ${item.held ? "" : "dim"}`} src={badgeSrc(item.badge, "l")} alt="" /> : <span className="camSilhouette big" aria-hidden="true" />}
      <small>{item.kind}</small>
      <h3>{item.title}</h3>
      <p className={`camDetailState ${item.state || ""}`}>{item.stateText}</p>
      {item.recent && <div className="camDots" aria-label="Tus últimas llamadas en esta regla">
        {Array.from({ length: path.window }, (_, index) => {
          const value = item.recent[index];
          return <i key={index} className={value === true ? "ok" : value === false ? "bad" : ""} title={value === undefined ? "Sin llamada" : value ? "Excelente o Bien" : "Por debajo de Bien"} />;
        })}
        <span>Últimas {path.window} llamadas, de la más reciente a la más antigua</span>
      </div>}
      {item.tip && <div className="camTip"><b>Cómo mejorarla</b>{item.tip}</div>}
    </div>
  </div>;
}

export default function MiCamino({ path, storageKey }) {
  const [detail, setDetail] = useState(null);
  const scrollRef = useRef(null);
  const phases = path.phases;
  const places = useMemo(() => spots(phases.length), [phases.length]);
  const currentIndex = phases.findIndex((phase) => !phase.earned);

  // Insignias won since the last visit get their entrance animation once.
  const heldIds = useMemo(() => [
    ...phases.filter((phase) => phase.earned).map((phase) => `f:${phase.id}`),
    ...phases.flatMap((phase) => phase.rules.filter((rule) => HELD.has(rule.state)).map((rule) => `r:${rule.id}`)),
    ...(path.mastered ? ["mastery"] : []),
  ], [phases, path.mastered]);
  const [fresh] = useState(() => {
    try {
      const seen = JSON.parse(localStorage.getItem(storageKey) || "null");
      return seen ? new Set(heldIds.filter((id) => !seen.includes(id))) : new Set();
    } catch { return new Set(); }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(heldIds)); } catch { /* sin almacenamiento, sin animación de novedad */ }
  }, [storageKey, heldIds]);

  // Start the scroll near the phase being worked on when the scene is wider than the card.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || box.scrollWidth <= box.clientWidth) return;
    const target = places[Math.max(currentIndex, 0)];
    if (target) box.scrollLeft = (target[0] / 100) * box.scrollWidth - box.clientWidth / 2;
  }, [places, currentIndex]);

  const nextPhase = phases[currentIndex];
  const missing = nextPhase ? nextPhase.rules.length - nextPhase.earnedRules : 0;

  return <section className="coachCard camCard" aria-label="Mi camino">
    <div className="camHead">
      <h3>Mi camino</h3>
      <p>Dominas el <b>{path.pct} %</b> del speech{nextPhase ? <> · te {missing === 1 ? "falta 1 insignia" : `faltan ${missing} insignias`} para completar <b>{nextPhase.name}</b></> : " · camino completo"}</p>
    </div>
    <div className="camScroll" ref={scrollRef}>
      <div className="camScene">
        {phases.map((phase, index) => {
          const [x, y] = places[index];
          const status = phase.earned ? "earned" : index === currentIndex ? "current" : "pending";
          const badge = phaseBadge(phase);
          return <div key={phase.id} className={`camPhase ${status}`} style={{ left: `${x}%`, "--top": `${y}%` }}>
            <div className="camPlatformGlow" aria-hidden="true" />
            <Badge id={badge} delay={index * -0.7}
              className={`camPhaseBadge ${status} ${fresh.has(`f:${phase.id}`) ? "isNew" : ""}`}
              label={`Insignia de la fase ${phase.name}: ${phase.earned ? "ganada" : `${phase.earnedRules} de ${phase.rules.length}`}`}
              onOpen={() => setDetail({ badge, title: phase.name, kind: "Insignia de fase", held: phase.earned, stateText: phase.earned ? "Ganada: tienes todas las insignias de sus reglas." : `${phase.earnedRules} de ${phase.rules.length} insignias de regla. Gánalas todas para obtenerla.` })} />
            <div className="camLabel"><b>{phase.name}</b><span>{phase.earnedRules} de {phase.rules.length}{status === "current" ? " · siguiente" : ""}</span></div>
            <div className={`camRules ${phase.rules.length > 3 ? "two" : ""}`}>
              {phase.rules.map((rule, ruleIndex) => {
                const id = ruleBadge(rule);
                return <Badge key={rule.id} id={id} delay={(index + ruleIndex) * -0.45}
                  className={`camRuleBadge ${rule.state} ${fresh.has(`r:${rule.id}`) ? "isNew" : ""}`}
                  label={`${rule.title}: ${RULE_TEXT[rule.state]}`}
                  onOpen={() => setDetail({ badge: id, title: rule.title, kind: `Insignia de regla · ${phase.name}`, held: HELD.has(rule.state), state: rule.state, stateText: RULE_TEXT[rule.state], recent: rule.recent, tip: rule.tip })} />;
              })}
            </div>
          </div>;
        })}
        <div className={`camPhase mastery ${path.mastered ? "earned" : "pending"}`} style={{ left: `${MASTERY_SPOT[0]}%`, "--top": `${MASTERY_SPOT[1]}%` }}>
          <div className="camPlatformGlow" aria-hidden="true" />
          <Badge id={MASTERY_BADGE} delay={-1.3} className={`camPhaseBadge camMastery ${path.mastered ? "earned" : "pending"} ${fresh.has("mastery") ? "isNew" : ""}`}
            label={`Maestría del speech: ${path.mastered ? "ganada" : "domina todas las fases"}`}
            onOpen={() => setDetail({ badge: MASTERY_BADGE, title: "Maestría del speech", kind: "Meta del camino", held: path.mastered, stateText: path.mastered ? "Dominas todas las fases del speech." : "Domina todas las fases para obtenerla." })} />
          <div className="camLabel"><b>Maestría del speech</b><span>{path.mastered ? "Ganada" : "Domina todas las fases"}</span></div>
        </div>
      </div>
    </div>
    {detail && <Detail item={detail} path={path} onClose={() => setDetail(null)} />}
  </section>;
}
