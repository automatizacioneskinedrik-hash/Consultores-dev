// Time between two repetitions of the same muletilla, shared by the speech slicer and the call report.
// Mirrors back-end/src/prompts/pointsEngine.js (muletillaGapKinds) and speechRules.js (DEFAULT_MULETILLAS.gaps).

export const DEFAULT_GAPS = Object.freeze({ tic: 20, normal: 60 });

// Slicer stops: every 5 s up to 1 min, every 30 s up to 5 min, every minute up to 10 min.
export const GAP_STOPS = Object.freeze([
  ...Array.from({ length: 13 }, (_, i) => i * 5),
  ...Array.from({ length: 8 }, (_, i) => 90 + i * 30),
  ...Array.from({ length: 5 }, (_, i) => 360 + i * 60),
]);

export const GAP_KINDS = Object.freeze({
  tic: { label: "Tic", effect: "resta fuerte", color: "#FF5900", text: "#fff" },
  alerta: { label: "Alerta", effect: "resta poco", color: "#FBB42A", text: "#040025" },
  normal: { label: "Normal", effect: "no resta", color: "#8ABC43", text: "#040025" },
});

export const formatClock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
export const formatGap = (seconds) => seconds < 60 ? `${seconds} s` : seconds % 60 ? `${formatClock(seconds)} min` : `${seconds / 60} min`;

// Nearest slicer stop for a stored value, so speeches saved with any number still place the handle.
export const stopIndex = (seconds) => GAP_STOPS.reduce((best, stop, index) => Math.abs(stop - seconds) < Math.abs(GAP_STOPS[best] - seconds) ? index : best, 0);

// Each repetition is judged by the time since the previous one; the first one is normal.
export function gapKinds(times, { tic, normal }) {
  return times.map((second, index) => {
    const gap = index ? second - times[index - 1] : null;
    if (gap == null || gap >= normal) return "normal";
    return gap < tic ? "tic" : "alerta";
  });
}
