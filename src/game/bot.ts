import { rulesFor } from "./config";
import type { GameView, PlayerCommand } from "./types";

// The policy accepts a privacy-filtered view, never the authoritative deck.
// It minimizes expected absolute distance using the remaining unseen ranks.
export function botDecision(game: GameView, id: string): PlayerCommand | null {
  const own = game.players.find((p) => p.id === id);
  if (!own) return null;
  const base = { round: game.round, phase: game.phase };
  if (game.phase === "initial_selection" && !own.committed) {
    const [min, max] = rulesFor(game.players.length).initial;
    const burns = game.burns.reduce((n, b) => n + b.card.value, 0);
    const mean = (364 - burns) / (52 - game.burns.length);
    return {
      ...base,
      type: "select",
      count: Math.max(min, Math.min(max, Math.round(game.target / mean))),
    };
  }
  if (
    game.activePlayerId !== id ||
    !["first_additions", "second_additions"].includes(game.phase)
  )
    return null;
  const ranks = Array<number>(14).fill(4);
  ranks[0] = 0;
  for (const burn of game.burns) ranks[burn.card.rank]--;
  for (const player of game.players)
    for (const held of player.hand) if (held.card) ranks[held.card.rank]--;
  const total = own.hand.reduce((n, held) => n + (held.card?.value ?? 0), 0);
  const unseen = ranks.reduce((n, count) => n + count, 0);
  const cap = Math.min(
    game.phase === "first_additions" ? 3 : own.cap,
    game.deckCount,
  );
  function loss(draws: number, sum: number, remaining: number): number {
    if (!draws) return Math.abs(sum - game.target);
    let result = 0;
    for (let rank = 1; rank <= 13; rank++) {
      const count = ranks[rank];
      if (!count) continue;
      ranks[rank]--;
      result +=
        (count / remaining) * loss(draws - 1, sum + rank, remaining - 1);
      ranks[rank]++;
    }
    return result;
  }
  let count = 0,
    best = loss(0, total, unseen);
  for (let n = 1; n <= cap; n++) {
    const expected = loss(n, total, unseen);
    if (expected < best) {
      best = expected;
      count = n;
    }
  }
  return { ...base, type: "add", count };
}
