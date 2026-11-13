import { useCallback, useEffect, useRef, useState } from "react";
import { transition, type GameAction, type GameState } from "./engine";
export function useAinSeenEngine() {
  const [state, setState] = useState<GameState | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ain-offline-match-v1") || "null");
      if (!saved || saved.version !== 1 || !saved.game?.teams || !Array.isArray(saved.game?.cells)) return null;
      return { ...saved.game, deadline: saved.game.deadline === null ? null : performance.now() + Math.max(0, saved.remaining) };
    } catch { return null; }
  });
  const ref = useRef(state);
  const [now, setNow] = useState(performance.now());
  const dispatch = useCallback((action: GameAction) => {
    const current = ref.current;
    if (!current) return;
    const next = transition(current, action, performance.now());
    ref.current = next;
    setState(next);
  }, []);
  const start = useCallback((game: GameState) => {
    ref.current = game;
    setState(game);
  }, []);
  const reset = useCallback(() => {
    try { localStorage.removeItem("ain-offline-match-v1"); } catch { /* optional storage */ }
    ref.current = null;
    setState(null);
  }, []);
  useEffect(() => {
    const save = () => {
      const game = ref.current;
      if (!game) return;
      try { localStorage.setItem("ain-offline-match-v1", JSON.stringify({ version: 1, game, remaining: game.deadline === null ? null : Math.max(0, game.deadline - performance.now()) })); } catch { /* storage may be unavailable */ }
    };
    save();
    const timer = window.setInterval(save, 1000);
    window.addEventListener("pagehide", save);
    return () => { clearInterval(timer); window.removeEventListener("pagehide", save); };
  }, [state]);
  useEffect(() => {
    const tick = () => {
      const time = performance.now();
      setNow(time);
      const current = ref.current;
      if (
        current?.deadline !== null &&
        current?.deadline !== undefined &&
        time >= current.deadline
      )
        dispatch({ type: "EXPIRE_TIMER", timerId: current.timerId });
    };
    const timer = window.setInterval(tick, 50);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [dispatch]);
  return {
    state,
    start,
    reset,
    dispatch,
    remaining:
      state?.deadline === null
        ? 0
        : Math.max(0, (state?.deadline ?? now) - now),
  };
}
