import { useCallback, useEffect, useState } from "react";
import { getUser } from "../utils/user";
import "./GuideTour.css";

const GUIDE_WIDTH = 440;
const GAP = 16;
const MARGIN = 16;
const ACTION_PAUSE = 420;
const TARGET_WAIT = 2500;

// Steps whose target is missing or hidden (closed menu, small screen) are skipped.
function visibleTarget(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? el : null;
}

// Actions the mascot does for the user before explaining a step. They only open or close views
// (tabs, phases, reports, forms); they never press buttons that save, publish, activate or delete.
//   { click: selector }            always clicks
//   { show: [button, result] }     clicks the button only if the result is not on screen yet
//   { hide: [button, result] }     clicks the button only if the result is on screen
function runAction(action) {
  if (action.click) document.querySelector(action.click)?.click();
  if (action.show && !document.querySelector(action.show[1])) document.querySelector(action.show[0])?.click();
  if (action.hide && document.querySelector(action.hide[1])) document.querySelector(action.hide[0])?.click();
}

// Puts the mascot and its speech bubble below the target, or above when there is no room.
function placeGuide(rect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(GUIDE_WIDTH, vw - MARGIN * 2);
  if (!rect) return { left: (vw - width) / 2, top: Math.max(MARGIN, vh / 2 - 110), width };
  const left = Math.min(Math.max(MARGIN, rect.left), vw - width - MARGIN);
  const below = rect.bottom + GAP;
  const top = below + 220 < vh ? below : Math.max(MARGIN, rect.top - GAP - 220);
  return { left, top, width };
}

// Guided tour: the section's mascot walks to each feature and explains it in a comic bubble.
// It starts by itself the first time a user opens the section; clicking the mascot replays it.
export default function GuideTour({ id, steps, mascot, mascotName, aura, delay = 700, cleanup = [], hideLauncher = false }) {
  const storageKey = `kinedrik_tour_${id}_${(getUser().email || "anon").toLowerCase()}`;
  const auraStyle = aura ? { "--tour-aura": aura } : undefined;
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [rect, setRect] = useState(null);
  // The mascot hops while it walks to a new step: it has not settled on the current index yet.
  const [settled, setSettled] = useState(-1);
  const moving = settled !== index;

  const tourSteps = steps;
  const step = tourSteps[index];

  const finish = useCallback(() => {
    cleanup.forEach(runAction);
    setActive(false);
    setRect(null);
    setSettled(-1);
    try { localStorage.setItem(storageKey, "done"); } catch { /* storage blocked: the tour simply shows again */ }
  }, [cleanup, storageKey]);

  const begin = useCallback(() => {
    setIndex(0);
    setDirection(1);
    setSettled(-1);
    setActive(true);
  }, []);

  const goTo = (next) => {
    setDirection(next > index ? 1 : -1);
    setIndex(next);
  };

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(storageKey) === "done"; } catch { /* treat as not seen */ }
    if (seen) return undefined;
    const timer = setTimeout(begin, delay);
    return () => clearTimeout(timer);
  }, [storageKey, delay, begin]);

  const measure = useCallback(() => {
    const el = step && visibleTarget(step.target);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom });
  }, [step]);

  // On every step: do its actions, wait for its target, scroll to it and settle the mascot there.
  // A step whose target never shows up (no sessions yet, no permission) is skipped.
  useEffect(() => {
    if (!active || !step) return undefined;
    let cancelled = false;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(() => { if (!cancelled) fn(); }, ms));

    const actions = step.do || [];
    actions.forEach((action, i) => later(() => runAction(action), i * ACTION_PAUSE));
    const startWaiting = actions.length * ACTION_PAUSE;

    if (!step.target) {
      later(() => { setRect(null); setSettled(index); }, startWaiting + 60);
    } else {
      // Only steps that open something need to wait for it to appear.
      const deadline = startWaiting + (step.wait ?? (actions.length ? TARGET_WAIT : 0));
      const look = (elapsed) => {
        const el = visibleTarget(step.target);
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          later(() => { measure(); setSettled(index); }, 400);
        } else if (elapsed < deadline) {
          later(() => look(elapsed + 150), 150);
        } else {
          const next = index + direction;
          if (next >= 0 && next < tourSteps.length) setIndex(next);
          else { setRect(null); setSettled(index); }
        }
      };
      later(() => look(startWaiting), startWaiting);
    }
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [active, step, index, direction, tourSteps.length, measure]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight" || event.key === "Enter") {
        setDirection(1);
        setIndex((i) => (i < tourSteps.length - 1 ? i + 1 : i));
      }
      if (event.key === "ArrowLeft") {
        setDirection(-1);
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, tourSteps.length, finish, measure]);

  const isLast = index === tourSteps.length - 1;
  const guide = placeGuide(step?.target ? rect : null);
  const pad = 10;

  return <>
    {!active && !hideLauncher && <button type="button" className="tourLauncher" style={auraStyle} onClick={begin} aria-label={`Ver el recorrido de esta sección con ${mascotName}`}>
      <img src={mascot} alt="" />
      <span className="tourLauncherHint">¿Te explico esta sección?</span>
    </button>}

    {active && step && <div className="tourLayer" role="dialog" aria-modal="true" aria-label={`Recorrido guiado por ${mascotName}`}>
      <div className="tourBlocker" />
      {step.target && rect && !moving
        ? <div className="tourSpot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
        : <div className="tourDim" />}

      <div className={`tourGuide ${moving ? "isMoving" : ""}`} style={{ ...auraStyle, left: guide.left, top: guide.top, width: guide.width }}>
        <img className="tourMascot" src={mascot} alt={mascotName} />
        <div className="tourBubble" aria-live="polite" key={index}>
          {step.title && <strong>{step.title}</strong>}
          <p>{step.text}</p>
          <div className="tourActions">
            <span className="tourCount">{index + 1} de {tourSteps.length}</span>
            <button type="button" className="tourSkip" onClick={finish}>{isLast ? "Cerrar" : "Saltar"}</button>
            {index > 0 && <button type="button" className="tourBack" onClick={() => goTo(index - 1)}>Atrás</button>}
            <button type="button" className="tourNext" onClick={() => (isLast ? finish() : goTo(index + 1))} autoFocus>
              {isLast ? "¡Entendido!" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>}
  </>;
}
