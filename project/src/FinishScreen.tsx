import type { GameState } from "./engine";

export function FinishScreen({ game, onReplay }: { game: Pick<GameState, "teams" | "winner">; onReplay: () => void }) {
  const teams = (["red", "blue"] as const).map((id) => game.teams[id]);
  return <section className="finish-celebration" aria-label="نتيجة المباراة">
    <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} className={i % 2 ? "from-left" : "from-right"} style={{ "--piece": i } as React.CSSProperties} />)}</div>
    <img className="finish-logo" src="./redesign/brand/wordmark-nav.svg" alt="عين سين" />
    <h1 className="winner-banner">{game.winner ? `الفائز: ${game.teams[game.winner].name}` : "انتهت المباراة بالتعادل"}</h1>
    <div className="finish-scores">{teams.map((team) => <div className="finish-score" key={team.id}><b>{team.name}</b><strong>{team.score.toLocaleString("ar-SA")} نقطة</strong></div>)}</div>
    <div className="finish-actions"><button className="primary" onClick={onReplay}>العب مرة أخرى</button><a href="#">العودة للقائمة الرئيسية</a></div>
  </section>;
}
