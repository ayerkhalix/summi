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
  const cap = Math.min(
    game.phase === "first_additions" ? 3 : own.cap,
    game.deckCount,
  );
  // Existing face-down cards are unknown too. Count equally likely subsets
  // of unseen cards by size and sum, without inspecting any hidden identities.
  const hidden = own.hand.filter((held) => !held.card).length;
  const maxDraws = hidden + cap;
  let ways = Array.from({ length: maxDraws + 1 }, () =>
    Array<number>(maxDraws * 13 + 1).fill(0),
  );
  ways[0][0] = 1;
  for (let rank = 1; rank <= 13; rank++) {
    const next = ways.map((row) => row.map(() => 0));
    for (let draws = 0; draws <= maxDraws; draws++) {
      for (let sum = 0; sum <= draws * 13; sum++) {
        if (!ways[draws][sum]) continue;
        let combinations = 1;
        for (let take = 0; take <= Math.min(ranks[rank], maxDraws - draws); take++) {
          if (take) combinations *= (ranks[rank] - take + 1) / take;
          next[draws + take][sum + rank * take] += ways[draws][sum] * combinations;
        }
      }
    }
    ways = next;
  }
  function loss(draws: number): number {
    const outcomes = ways[draws].reduce((n, count) => n + count, 0);
    return ways[draws].reduce(
      (n, count, sum) => n + count * Math.abs(total + sum - game.target),
      0,
    ) / outcomes;
  }
  let count = 0,
    best = loss(hidden);
  for (let n = 1; n <= cap; n++) {
    const expected = loss(hidden + n);
    if (expected < best) {
      best = expected;
      count = n;
    }
  }
  return { ...base, type: "add", count };
}
