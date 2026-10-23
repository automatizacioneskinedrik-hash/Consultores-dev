import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MASTERY_BADGE, badgeSrc, phaseBadge, ruleBadge } from "../utils/badges";
import "./MiCamino.css";

// Where each phase stands on the background's marble platforms (x and the platform's top, in % of the scene).
// The last platform, higher up, is for Maestría del speech.
const PLATFORMS = [[9.5, 76], [23.5, 76], [38.5, 70], [54, 62], [68, 55], [79.5, 50]];
const MASTERY_SPOT = [92.5, 42];
const HELD = new Set(["earned", "risk"]);
const SCENE_RATIO = 3; // the background is 2172 × 724
const MAX_CELEBRATIONS = 5;
const REPLAY_MAX = 8;
const BIG = 260;

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

// Golden trail: full up to the last phase won in a row, then part of the way to the next one.
function trail(points, phases) {
  const won = phases.findIndex((phase) => !phase.earned);
  const done = won === -1 ? phases.length : won;
  if (done === 0) return [points[0]];
  const gold = points.slice(0, done);
  const next = phases[done];
  const share = next ? next.earnedRules / next.rules.length : 1;
  const a = points[done - 1];
  const b = points[done];
  if (b && share > 0) gold.push([a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share]);
  return gold;
}

const RULE_TEXT = {
  earned: "Ganada. Mantenla con Excelente o Bien en 3 de las últimas 5 llamadas.",
  risk: "En riesgo: las últimas llamadas van mal en esta regla.",
  lost: "Se perdió en las últimas llamadas. Se recupera con 3 de 5.",
  pending: "Por ganar: Excelente o Bien en 3 de las últimas 5 llamadas.",
};

function Badge({ id, dataKey, className, onOpen, label, delay }) {
  const src = id ? badgeSrc(id) : "";
  return <button type="button" className={`camBadge ${className}`} data-key={dataKey} onClick={onOpen} aria-label={label}>
    <span className="camFloat" style={{ "--float-delay": `${delay}s`, "--mask": src ? `url("${src}")` : "none" }}>
      {src ? <img src={src} alt="" loading="lazy" draggable="false" /> : <span className="camSilhouette" aria-hidden="true" />}
    </span>
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
      {item.recent && <div className="camDots" aria-label="Últimas llamadas en esta regla">
        {Array.from({ length: path.window }, (_, index) => {
          const value = item.recent[index];
          return <i key={index} className={value === true ? "ok" : value === false ? "bad" : ""} title={value === undefined ? "Sin llamada" : value ? "Excelente o Bien" : "Por debajo de Bien"} />;
        })}
        <span>Últimas {path.window} llamadas, de la más reciente a la más antigua</span>
      </div>}
      {/* Held insignias say what went well; the rest, how to improve. */}
      {item.held && item.praise && <div className="camTip good"><b>Lo que hiciste bien</b>{item.praise.text}{item.praise.quote && <q>{item.praise.quote}</q>}</div>}
      {!item.held && item.tip && <div className="camTip"><b>Cómo mejorarla</b>{item.tip}</div>}
    </div>
  </div>;
}

// own: the viewer's own path (celebrations and "tú" texts). filter: the person selector shown in the header.
export default function MiCamino({ path, title = "Tu camino", storageKey, own = true, filter = null }) {
  const [detail, setDetail] = useState(null);
  const sectionRef = useRef(null);
  const scrollRef = useRef(null);
  const phases = path.phases;
  const places = useMemo(() => spots(phases.length), [phases.length]);
  const currentIndex = phases.findIndex((phase) => !phase.earned);
  const line = useMemo(() => [...places, MASTERY_SPOT].map(([x, y]) => [x * SCENE_RATIO, y]), [places]);
  const gold = useMemo(() => trail(line, phases), [line, phases]);
  const toPoints = (points) => points.map(([x, y]) => `${x},${y}`).join(" ");

  // Everything held now, in the order a celebration should show it: rules, then phases, then Maestría.
  const held = useMemo(() => [
    ...phases.flatMap((phase) => phase.rules.filter((rule) => HELD.has(rule.state)).map((rule) => ({ key: `r:${rule.id}`, badge: ruleBadge(rule), title: rule.title, kind: `Insignia de regla · ${phase.name}` }))),
    ...phases.filter((phase) => phase.earned).map((phase) => ({ key: `f:${phase.id}`, badge: phaseBadge(phase), title: phase.name, kind: "Insignia de fase" })),
    ...(path.mastered ? [{ key: "mastery", badge: MASTERY_BADGE, title: "Maestría del speech", kind: "Meta del camino" }] : []),
  ], [phases, path.mastered]);

// On one's own path: the first visit celebrates what is already held, later visits only what is new.
  const [queue, setQueue] = useState(() => {
    if (!own) return [];
    try {
      const seen = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return held.filter((item) => item.badge && !seen.includes(item.key)).slice(0, MAX_CELEBRATIONS);
    } catch { return []; }
  });
  useEffect(() => {
    if (!own) return;
    try { localStorage.setItem(storageKey, JSON.stringify(held.map((item) => item.key))); } catch { /* sin almacenamiento, sin celebración */ }
  }, [own, storageKey, held]);

  const [step, setStep] = useState(-1);
  const [stage, setStage] = useState("idle");
  const [flyTo, setFlyTo] = useState(null);
  const [landed, setLanded] = useState(() => new Set());
  const waiting = useMemo(() => new Set(queue.filter((item) => !landed.has(item.key)).map((item) => item.key)), [queue, landed]);
  const timers = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const finish = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setLanded(new Set(queue.map((item) => item.key)));
    setStage("idle");
    setStep(queue.length);
  }, [queue]);

  // Show one insignia big, then fly it to its spot, then the next.
  useEffect(() => {
    if (step < 0 || step >= queue.length) return;
    const item = queue[step];
    later(() => { setFlyTo(null); setStage("appear"); }, 0);
    later(() => {
      const target = scrollRef.current?.querySelector(`[data-key="${item.key}"]`);
      target?.scrollIntoView({ block: "nearest", inline: "center" });
      const rect = target?.getBoundingClientRect();
      if (rect) setFlyTo({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      setStage("fly");
      later(() => {
        setLanded((current) => new Set(current).add(item.key));
        setStage("idle");
        later(() => setStep((value) => value + 1), 350);
      }, 900);
    }, 1700);
  }, [step, queue]);

  // "Ver mis insignias": play the celebration again with everything held.
  const replay = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStage("idle");
    setStep(-1);
    setLanded(new Set());
    setQueue(held.filter((item) => item.badge).slice(0, REPLAY_MAX));
  };

  // Bring the path into view, then start.
  useEffect(() => {
    if (!queue.length) return;
    later(() => sectionRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 400);
    later(() => setStep(0), 1300);
  }, [queue]);

  // Start the scroll near the phase being worked on when the scene is wider than the card.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || box.scrollWidth <= box.clientWidth) return;
    const target = places[Math.max(currentIndex, 0)];
    if (target) box.scrollLeft = (target[0] / 100) * box.scrollWidth - box.clientWidth / 2;
  }, [places, currentIndex]);

  const stateClass = (key, base) => `${base} ${waiting.has(key) ? "isWaiting" : landed.has(key) ? "isLanded" : ""}`;
  const nextPhase = phases[currentIndex];
  const missing = nextPhase ? nextPhase.rules.length - nextPhase.earnedRules : 0;
  const celebrating = step >= 0 && step < queue.length && stage !== "idle" ? queue[step] : null;
  const center = typeof window === "undefined" ? { left: 0, top: 0 } : { left: window.innerWidth / 2 - BIG / 2, top: window.innerHeight / 2 - BIG / 2 - 40 };
  const badgeBox = stage === "fly" && flyTo ? flyTo : { ...center, width: BIG, height: BIG };

  return <section className="coachCard camCard" aria-label={title} ref={sectionRef}>
    <div className="camHead">
      <h3>{title}</h3>
      <p>{own ? "Dominas" : "Domina"} el <b>{path.pct} %</b> del speech{nextPhase ? <> · {own ? "te " : ""}{missing === 1 ? "falta 1 insignia" : `faltan ${missing} insignias`} para completar <b>{nextPhase.name}</b></> : " · camino completo"}</p>
    </div>
    {(filter || (own && held.length > 0)) && <div className="camTools">
      {filter}
      {own && held.length > 0 && <button type="button" className="camReplay" onClick={replay}>Ver mis insignias</button>}
    </div>}
    <div className="camScroll" ref={scrollRef}>
      <div className="camScene">
        <svg className="camTrail" viewBox={`0 0 ${100 * SCENE_RATIO} 100`} preserveAspectRatio="none" aria-hidden="true">
          <polyline className="camTrailRest" points={toPoints(line)} />
          {gold.length > 1 && <polyline className="camTrailGold" points={toPoints(gold)} />}
          {gold.length > 1 && <polyline className="camTrailSpark" points={toPoints(gold)} />}
        </svg>
        {phases.map((phase, index) => {
          const [x, y] = places[index];
          const status = phase.earned ? "earned" : "pending";
          const badge = phaseBadge(phase);
          return <div key={phase.id} className={`camPhase ${status}`} style={{ left: `${x}%`, "--top": `${y}%` }}>
            <div className="camPlatformGlow" aria-hidden="true" />
            <Badge id={badge} dataKey={`f:${phase.id}`} delay={index * -0.7}
              className={stateClass(`f:${phase.id}`, `camPhaseBadge ${status}`)}
              label={`Insignia de la fase ${phase.name}: ${phase.earned ? "ganada" : `${phase.earnedRules} de ${phase.rules.length}`}`}
              onOpen={() => setDetail({ badge, title: phase.name, kind: "Insignia de fase", held: phase.earned, state: status, stateText: phase.earned ? "Ganada: tiene todas las insignias de sus reglas." : `${phase.earnedRules} de ${phase.rules.length} insignias de regla. Con todas se gana la de la fase.` })} />
            <div className="camLabel"><b>{phase.name}</b><span>{phase.earned ? "Ganada" : `${phase.earnedRules} de ${phase.rules.length}`}</span></div>
            <div className={`camRules ${phase.rules.length > 3 ? "two" : ""}`}>
              {phase.rules.map((rule, ruleIndex) => {
                const id = ruleBadge(rule);
                return <Badge key={rule.id} id={id} dataKey={`r:${rule.id}`} delay={(index + ruleIndex) * -0.45}
                  className={stateClass(`r:${rule.id}`, `camRuleBadge ${rule.state}`)}
                  label={`${rule.title}: ${RULE_TEXT[rule.state]}`}
                  onOpen={() => setDetail({ badge: id, title: rule.title, kind: `Insignia de regla · ${phase.name}`, held: HELD.has(rule.state), state: rule.state, stateText: RULE_TEXT[rule.state], recent: rule.recent, tip: rule.tip, praise: rule.praise })} />;
              })}
            </div>
          </div>;
        })}
        <div className={`camPhase mastery ${path.mastered ? "earned" : "pending"}`} style={{ left: `${MASTERY_SPOT[0]}%`, "--top": `${MASTERY_SPOT[1]}%` }}>
          <div className="camPlatformGlow" aria-hidden="true" />
          <Badge id={MASTERY_BADGE} dataKey="mastery" delay={-1.3} className={stateClass("mastery", `camPhaseBadge camMastery ${path.mastered ? "earned" : "pending"}`)}
            label={`Maestría del speech: ${path.mastered ? "ganada" : "domina todas las fases"}`}
            onOpen={() => setDetail({ badge: MASTERY_BADGE, title: "Maestría del speech", kind: "Meta del camino", held: path.mastered, state: path.mastered ? "earned" : "pending", stateText: path.mastered ? "Domina todas las fases del speech." : "Se gana al dominar todas las fases." })} />
          <div className="camLabel"><b>Maestría del speech</b><span>{path.mastered ? "Ganada" : "Domina todas las fases"}</span></div>
        </div>
      </div>
    </div>

    {celebrating && <>
      <div className={`camWin ${stage === "fly" ? "leaving" : ""}`} onClick={finish} role="dialog" aria-label={`Nueva insignia: ${celebrating.title}`} />
      {stage === "appear" && <div className="camWinRays" aria-hidden="true" />}
      {stage === "appear" && <div className="camWinText"><small>¡Nueva insignia!</small><b>{celebrating.title}</b><span>{celebrating.kind}</span></div>}
      <img key={celebrating.key} className={`camWinBadge ${stage === "appear" ? "appear" : "fly"}`} src={badgeSrc(celebrating.badge, "l")} alt=""
        style={{ left: badgeBox.left, top: badgeBox.top, width: badgeBox.width, height: badgeBox.height }} />
    </>}
    {detail && <Detail item={detail} path={path} onClose={() => setDetail(null)} />}
  </section>;
}
