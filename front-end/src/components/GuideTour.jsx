import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { getUser } from "../utils/user";
import "./GuideTour.css";

const GUIDE_WIDTH = 440;
const GAP = 16;
const MARGIN = 16;

// Steps whose target is missing or hidden (closed menu, small screen) are skipped.
function visibleTarget(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? el : null;
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
export default function GuideTour({ id, steps, mascot, mascotName }) {
  const storageKey = `kinedrik_tour_${id}_${(getUser().email || "anon").toLowerCase()}`;
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  // The mascot hops while it walks to a new step: it has not settled on the current index yet.
  const [settled, setSettled] = useState(-1);
  const moving = settled !== index;

  const available = steps.filter((step) => !step.target || visibleTarget(step.target));
  const step = available[index];

  const finish = useCallback(() => {
    setActive(false);
    setRect(null);
    try { localStorage.setItem(storageKey, "done"); } catch { /* storage blocked: the tour simply shows again */ }
  }, [storageKey]);

  const start = () => { setIndex(0); setActive(true); };

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(storageKey) === "done"; } catch { /* treat as not seen */ }
    if (seen) return undefined;
    const timer = setTimeout(() => { setIndex(0); setActive(true); }, 700);
    return () => clearTimeout(timer);
  }, [storageKey]);

  const measure = useCallback(() => {
    const el = step && visibleTarget(step.target);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom });
  }, [step]);

  useLayoutEffect(() => {
    if (!active || !step) return undefined;
    const el = visibleTarget(step.target);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = setTimeout(() => { measure(); setSettled(index); }, el ? 380 : 60);
    return () => clearTimeout(timer);
  }, [active, step, index, measure]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight" || event.key === "Enter") setIndex((i) => (i < available.length - 1 ? i + 1 : i));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, available.length, finish, measure]);

  const isLast = index === available.length - 1;
  const guide = placeGuide(step?.target ? rect : null);
  const pad = 10;

  return <>
    {!active && <button type="button" className="tourLauncher" onClick={start} aria-label={`Ver el recorrido de esta sección con ${mascotName}`}>
      <img src={mascot} alt="" />
      <span className="tourLauncherHint">¿Te explico esta sección?</span>
    </button>}

    {active && step && <div className="tourLayer" role="dialog" aria-modal="true" aria-label={`Recorrido guiado por ${mascotName}`}>
      <div className="tourBlocker" />
      {step.target && rect
        ? <div className="tourSpot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
        : <div className="tourDim" />}

      <div className={`tourGuide ${moving ? "isMoving" : ""}`} style={{ left: guide.left, top: guide.top, width: guide.width }}>
        <img className="tourMascot" src={mascot} alt={mascotName} />
        <div className="tourBubble" aria-live="polite">
          {step.title && <strong>{step.title}</strong>}
          <p>{step.text}</p>
          <div className="tourActions">
            <span className="tourCount">{index + 1} de {available.length}</span>
            <button type="button" className="tourSkip" onClick={finish}>{isLast ? "Cerrar" : "Saltar"}</button>
            {index > 0 && <button type="button" className="tourBack" onClick={() => setIndex(index - 1)}>Atrás</button>}
            <button type="button" className="tourNext" onClick={() => (isLast ? finish() : setIndex(index + 1))} autoFocus>
              {isLast ? "¡Entendido!" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>}
  </>;
}
