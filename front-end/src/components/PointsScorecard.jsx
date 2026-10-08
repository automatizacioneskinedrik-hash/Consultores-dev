import { useState } from "react";
import { LEVELS, levelForPercent } from "../utils/scoreLevels";
import "./PointsScorecard.css";

const ZONE_COLORS = [LEVELS.excelente.color, LEVELS.bien.color, LEVELS.regular.color, LEVELS.debil.color];

const formatPoints = (value) => (Math.round(value * 100) / 100).toLocaleString("es-CO");

function RuleFeedback({ rule, item }) {
  const level = LEVELS[item.level] || LEVELS.no_lo_hizo;
  const notApplicable = item.level === "no_aplica";
  return <div className="psRule" style={{ "--ps-level": level.color }}>
    <div className="psRuleTop">
      <strong>{rule.title}</strong>
      <span className="psChip"><i style={{ background: level.color }} />{level.label}{notApplicable ? "" : ` · ${formatPoints(item.earned)}/${item.points} pts`}</span>
    </div>
    {item.frase && <p className="psQuote">{item.frase}</p>}
    {item.que_paso && <p>{item.que_paso}</p>}
    {item.level === "excelente" && <div className="psGood">✓ Sigue así.</div>}
    {item.como_mejorar && <div className="psFix"><b>Cómo mejorarlo:</b> {item.como_mejorar}</div>}
    {item.proxima_llamada && <div className="psNext"><b>Próxima llamada:</b> {item.proxima_llamada}</div>}
  </div>;
}

function TrafficBar({ limits, value }) {
  return <>
    <div className="psSemaforo">
      {limits.map((limit, index) => {
        const from = index ? limits[index - 1] : 0;
        return <span key={limit} style={{ left: `${from}%`, width: `${limit - from}%`, background: ZONE_COLORS[index] }} />;
      })}
      <b className="psMarker" style={{ left: `${Math.min(Math.max(value, 0), 100)}%` }}><em>{value} %</em></b>
    </div>
    <div className="psScale"><span>0 %</span><span>100 %</span></div>
  </>;
}

// Scorecard for sessions graded with a points speech: one card per phase, then the two indicators.
// Every rule is rendered so the printed PDF shows all feedback; collapsed ones are hidden on screen only.
export default function PointsScorecard({ scoring, speech, clientName }) {
  const [open, setOpen] = useState(() => new Set());
  const items = new Map((scoring.items || []).map((item) => [item.ruleId, item]));
  const toggle = (id) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const ratioItem = items.get("talk-ratio");
  const muletillasItem = items.get("muletillas");
  const ratioLevel = LEVELS[ratioItem?.level] || null;
  const muletillasLevel = LEVELS[muletillasItem?.level] || null;
  const limits = scoring.talkRatio?.limits || [];
  const pct = scoring.talkRatio?.consultantPct;

  return <div className="psList">
    {(speech?.phases || []).map((phase, index) => {
      const rules = (speech.rules || []).filter((rule) => rule.phaseId === phase.id && items.has(rule.id));
      if (!rules.length) return null;
      const scored = rules.map((rule) => items.get(rule.id)).filter((item) => item.level !== "no_aplica");
      const earned = scored.reduce((sum, item) => sum + item.earned, 0);
      const possible = scored.reduce((sum, item) => sum + item.points, 0);
      const level = possible ? levelForPercent((earned / possible) * 100) : LEVELS.no_aplica;
      const isOpen = open.has(phase.id);
      return <section className="psCard" key={phase.id}>
        <div className="psCardTop">
          <strong>{index + 1}. {phase.name}</strong>
          <span className="psPoints" style={{ color: level.color === LEVELS.no_lo_hizo.color ? "#64748b" : level.color }}>{formatPoints(earned)} <small>/ {possible} pts</small></span>
        </div>
        <div className="psProgress"><span style={{ width: `${possible ? (earned / possible) * 100 : 0}%`, background: level.color }} /></div>
        {phase.objective && <p className="psObjective"><b>Objetivo:</b> {phase.objective}</p>}
        <button type="button" className="psToggle" aria-expanded={isOpen} onClick={() => toggle(phase.id)}>
          {isOpen ? "Ocultar reglas ▲" : `Ver ${rules.length} ${rules.length === 1 ? "regla" : "reglas"} ▼`}
        </button>
        <div className={`psRules ${isOpen ? "" : "psCollapsed"}`}>
          {rules.map((rule) => <RuleFeedback key={rule.id} rule={rule} item={items.get(rule.id)} />)}
        </div>
      </section>;
    })}

    {ratioItem && <section className="psCard">
      <div className="psCardTop">
        <strong>Ratio de habla</strong>
        <span className="psPoints" style={{ color: ratioLevel.color }}>{formatPoints(ratioItem.earned)} <small>/ {ratioItem.points} pts</small></span>
      </div>
      {limits.length > 0 && Number.isFinite(pct) && <TrafficBar limits={limits} value={pct} />}
      <p className="psObjective">Hablaste el {pct} % de la llamada{clientName ? ` con ${clientName}` : ""}: <b>{ratioLevel.label}</b>.{limits.length ? ` El ideal es hasta ${limits[0]} %.` : ""}</p>
    </section>}

    {muletillasItem && <section className="psCard">
      <div className="psCardTop">
        <strong>Muletillas</strong>
        <span className="psPoints" style={{ color: muletillasLevel.color }}>{formatPoints(muletillasItem.earned)} <small>/ {muletillasItem.points} pts</small></span>
      </div>
      <p className="psObjective">
        <span className="psChip"><i style={{ background: muletillasLevel.color }} />{muletillasLevel.label}</span>
        {scoring.muletillas?.perMinute != null && <> · {scoring.muletillas.perMinute.toLocaleString("es-CO")} por minuto</>}
      </p>
      {scoring.muletillas?.byWord?.length > 0 && <>
        <p className="psObjective">Las que más repetiste:</p>
        <div className="psWords">{scoring.muletillas.byWord.slice(0, 8).map((entry) => <span key={entry.word}>{entry.word} · {entry.count}</span>)}</div>
      </>}
      {scoring.muletillas?.notListed?.length > 0 && <>
        <p className="psObjective">Otras repeticiones detectadas:</p>
        <div className="psWords">{scoring.muletillas.notListed.map((word) => <span key={word}>{word}</span>)}</div>
      </>}
      {muletillasItem.que_paso && <p>{muletillasItem.que_paso}</p>}
      {muletillasItem.como_mejorar && <div className="psFix"><b>Cómo mejorarlo:</b> {muletillasItem.como_mejorar}</div>}
    </section>}
  </div>;
}
