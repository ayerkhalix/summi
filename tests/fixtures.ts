import { advance, act, makeRound } from "@/game/engine";
import type { GameState, RandomInt } from "@/game/types";
export function seeded(seed = 42): RandomInt {
  return (max) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 4294967296) * max);
  };
}
export function selected(count = 2, sizes?: number[]) {
  const rng = seeded();
  let state = advance(
    makeRound(
      Array.from({ length: count }, (_, i) => `p${i}`),
      1,
      0,
      rng,
    ),
    rng,
  );
  for (const [i, id] of state.order.entries())
    state = act(
      state,
      id,
      {
        type: "select",
        count: sizes?.[i] ?? { 2: 8, 3: 6, 4: 5, 5: 4 }[count]!,
        round: 1,
        phase: state.phase,
      },
      rng,
    );
  return { state, rng };
}
export function toFirst(count = 2, sizes?: number[]) {
  const { state, rng } = selected(count, sizes);
  return { state: advance(advance(state, rng), rng), rng };
}
export function firstWindow(
  state: GameState,
  counts: number[],
  rng: RandomInt,
) {
  for (const [i, id] of state.order.entries())
    state = act(
      state,
      id,
      { type: "add", count: counts[i], round: state.round, phase: state.phase },
      rng,
    );
  return state;
}
