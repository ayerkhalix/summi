import type { CardView, Result } from "@/game/types";
import type { RoomView, RoundSummary } from "@/server/types";

export function resultHeroes(room: RoomView) {
  if (room.status !== "results" || room.game?.phase !== "round_results") return [];
  const ids = room.match.complete
    ? room.match.standings.filter((row) => row.rank === 1).map((row) => row.playerId)
    : room.game.results.filter((row) => row.winner).map((row) => row.playerId);
  return ids.map((playerId) => {
    const standing = room.match.standings.find((row) => row.playerId === playerId);
    const member = room.members.find((row) => row.id === playerId);
    return {
      playerId, standing, result: room.game!.results.find((row) => row.playerId === playerId),
      name: standing?.name ?? member?.name ?? "Former player", isBot: member?.isBot === true,
      profile: standing?.profile ?? member?.profile,
    };
  });
}

// History stores scores, not cards. Only use the current, fully public final hand.
export function completedHand(room: RoomView, playerId: string): CardView[] | null {
  if (room.status !== "results" || room.game?.phase !== "round_results") return null;
  const result = room.game.results.find((row) => row.playerId === playerId);
  const hand = room.game.players.find((player) => player.id === playerId)?.hand;
  if (!result || !hand?.length || hand.some((held) => !held.public || !held.card)) return null;
  if (new Set(hand.map((held) => held.card!.id)).size !== hand.length ||
    hand.reduce((sum, held) => sum + held.card!.value, 0) !== result.total) return null;
  return [...hand].sort((a, b) => a.dealOrder - b.dealOrder);
}

export function resultRounds(room: RoomView): RoundSummary[] {
  const game = room.game;
  if (room.status !== "results" || game?.phase !== "round_results") return [];
  const rounds = room.history.filter((round) => round.round >= room.matchStartRound && round.round < game.round);
  // The current game is authoritative even if an older room has no history entry.
  return [...rounds, {
    round: game.round, target: game.target, deckCount: game.deckCount, completedAt: room.lastActivity,
    results: game.results.map((row) => ({ ...row, name: room.members.find((member) => member.id === row.playerId)?.name ??
      room.match.standings.find((standing) => standing.playerId === row.playerId)?.name ?? "Former player" })),
  }].sort((a, b) => a.round - b.round);
}

export function distanceText(result: Result) {
  return result.side === "exact" ? "Exactly on target" : `${result.distance} ${result.side} target`;
}
