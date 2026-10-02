import { getAnalysisPrompt } from "./analysisPrompt.js";

function replaceSection(prompt, start, end, replacement) {
  const first = prompt.indexOf(start);
  const last = prompt.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`No se encontró la sección ${start} del prompt.`);
  return prompt.slice(0, first) + replacement + "\n" + prompt.slice(last);
}

export function getDynamicAnalysisPrompt(durationStr, additionalInstructions, transcriptionText, followupInstruction, speech) {
  let prompt = getAnalysisPrompt(durationStr, additionalInstructions, transcriptionText, followupInstruction);
  const codes = speech.phases.map((phase) => phase.id);
  const codeList = codes.join(" → ");
  const validCodes = codes.map((code) => `"${code}"`).join(", ");
  const phases = speech.phases.map((phase, index) =>
    `   - ${index + 1}. ID ${phase.id}, ${phase.name}. Objetivo: ${phase.objective} Detección: ${phase.detection} Evaluación: ${phase.evaluation}`
  ).join("\n");

  prompt = replaceSection(prompt, "F. HITOS DE CONTROL", "G. SCORE DE MULETILLAS", `F. HITOS DE CONTROL: ${speech.rules.milestones}`);
  prompt = replaceSection(prompt, "H. PARTICIPACIÓN Y RATIO DE HABLA", "Q. SCORE DE CIERRE", `H. PARTICIPACIÓN Y RATIO DE HABLA: ${speech.rules.participation}`);
  prompt = replaceSection(prompt, "Q. SCORE DE CIERRE", "R. SCORE DE PROPUESTA DE VALOR", `Q. SCORE DE CIERRE Y NEGOCIACIÓN: ${speech.rules.closing}`);
  prompt = replaceSection(prompt, "R. SCORE DE PROPUESTA DE VALOR", "I. FASES DE LA SESIÓN", `R. SCORE DE PROPUESTA DE VALOR: ${speech.rules.proposal}`);

  prompt = replaceSection(prompt, "I. FASES DE LA SESIÓN", "J. MOMENTO DEL PRECIO", `I. FASES DE LA SESIÓN (versión ${speech.id}: ${speech.name}):
   - Usa exclusivamente los ID estables indicados abajo. El número y el orden de fases de esta versión son los oficiales para este análisis.
${phases}
${speech.extraRules ? `REGLAS COMERCIALES ADICIONALES: ${speech.extraRules}` : ""}`);

  prompt = replaceSection(prompt, "J. MOMENTO DEL PRECIO", "K. TIPO DE COMPROMISO DE CIERRE", `J. MOMENTO DEL PRECIO: ${speech.rules.price} Usa exclusivamente uno de estos ID: ${validCodes}, o "No mencionado".`);
  prompt = replaceSection(prompt, "K. TIPO DE COMPROMISO DE CIERRE", "L. PREGUNTAS DE DESCUBRIMIENTO", `K. TIPO DE COMPROMISO DE CIERRE: ${speech.rules.commitment}`);
  prompt = replaceSection(prompt, "L. PREGUNTAS DE DESCUBRIMIENTO", "O. FASES ALCANZADAS", `L. PREGUNTAS DE DESCUBRIMIENTO: ${speech.rules.discovery}`);

  prompt = replaceSection(prompt, "O. FASES ALCANZADAS:", "M. OBJECIONES", `O. FASES ALCANZADAS:
   - Revisa la transcripción y devuelve en fases_alcanzadas solo los ID de las fases claramente presentes, en orden de aparición: ${validCodes}. No inventes identificadores.
P. ADHERENCIA AL GUION COMERCIAL:
   - Evalúa la secuencia ${codeList}. El score empieza en 100: resta ${speech.scoring.omissionPenalty} por cada fase omitida y ${speech.scoring.inversionPenalty} si hubo alguna inversión. Mínimo 0.
   - orden_correcto es true si todas las fases presentes respetan el orden de esta versión. Describe el principal desvío.`);

  prompt = replaceSection(prompt, "M. OBJECIONES", "N. SEGUIMIENTO COMERCIAL", `M. OBJECIONES: ${speech.rules.objections}`);
  prompt = prompt.replace(/"codigo_fase": "F1-Apertura \/ F2-Diagnóstico \/ F3-Visión \/ F4-Propuesta \/ F5-Cierre"/, `"codigo_fase": "Uno de estos ID: ${codes.join(" / ")}"`);
  prompt = prompt.replace(/"fases_alcanzadas": \["F1", "F2", "F3", "F4", "F5"\]/, `"fases_alcanzadas": [${validCodes}]`);
  prompt = prompt.replace(/"fase_aparicion": "F2 \/ F3 \/ F4 \/ F5 \/ No mencionado"/, `"fase_aparicion": "${codes.join(" / ")} / No mencionado"`);
  prompt = prompt.replace(
    "INSTRUCCIONES ADICIONALES (PRIORIDAD ALTA — no anulan las reglas de seguridad ni el formato JSON):",
    "INSTRUCCIONES ADICIONALES (no cambian los ID, el orden ni los criterios de la versión de speech publicada):"
  );
  return prompt;
}
