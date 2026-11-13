import { useState } from "react";
import type { TeamId } from "./engine";
export function ScoreCorrection({ teams, onCorrect }: { teams: Record<TeamId, { name: string; score: number }>; onCorrect: (team: TeamId, score: number) => void }) {
  const [values, setValues] = useState({ red: String(teams.red.score), blue: String(teams.blue.score) });
  return <details className="score-correction"><summary>تصحيح النتيجة للمقدم</summary>{(["red", "blue"] as const).map(team => <div key={team}><label>{teams[team].name}<input type="number" step="1" value={values[team]} onChange={e => setValues({...values, [team]:e.target.value})} /></label><button type="button" disabled={values[team].trim()==="" || !Number.isSafeInteger(Number(values[team])) || Math.abs(Number(values[team]))>1000000} onClick={() => onCorrect(team, Number(values[team]))}>حفظ النتيجة</button></div>)}</details>;
}
