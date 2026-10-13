import { describe, expect, it } from "vitest";
import { advance, projectGame } from "@/game/engine";
import { DEFAULT_PROFILE } from "@/game/profile";
import { completedHand, distanceText, resultHeroes, resultRounds } from "@/components/results-data";
import type { RoomView } from "@/server/types";
import { firstWindow, toFirst } from "./fixtures";

function resultRoom(): RoomView {
  let { state } = toFirst();
  const { rng } = toFirst();
  state = firstWindow(state, [0, 0], rng);
  state = advance(state, rng);
  state = firstWindow(state, [0, 0], rng);
  while (state.phase !== "round_results") state = advance(state, rng);
  return {
    id: "result-room", code: "ABCDEF", version: 1, createdAt: 0, lastActivity: 1,
    hostId: "p0", status: "results", mode: "bots", backend: "local", me: "p0", paused: [],
    members: state.players.map((player, index) => ({ id: player.id, name: index ? "Sage" : "You", isBot: !!index, role: "player", ready: true, joinedAt: 0, disconnectedAt: null, profile: DEFAULT_PROFILE })),
    game: projectGame(state), history: [], endedReason: null, roundNumber: 1, roundLimit: 3, matchStartRound: 1, matchNumber: 1,
    match: { round: 1, roundLimit: 3, complete: false, nextRoundAt: 30000,
      standings: state.results.map((row) => ({ playerId: row.playerId, name: row.playerId === "p0" ? "You" : "Sage", profile: DEFAULT_PROFILE, points: row.points, wins: Number(row.winner), streak: Number(row.winner), rank: row.rank })) },
  };
}

describe("authoritative results presentation", () => {
  it("uses the overall champions at match end even when they lost the final round", () => {
    const room = resultRoom();
    const loser = room.game!.results.find((row) => !row.winner)!;
    room.match.complete = true;
    for (const row of room.match.standings) row.rank = row.playerId === loser.playerId ? 1 : 2;
    expect(resultHeroes(room).map((row) => row.playerId)).toEqual([loser.playerId]);
    expect(resultHeroes(room)[0].result!.winner).toBe(false);
  });
  it("preserves every shared champion and their actual identity", () => {
    const room = resultRoom(); room.match.complete = true;
    for (const row of room.match.standings) row.rank = 1;
    expect(resultHeroes(room).map((row) => row.name).sort()).toEqual(["Sage", "You"]);
    expect(resultHeroes(room).find((row) => row.name === "Sage")!.isBot).toBe(true);
  });
  it("shows only round winners before match completion", () => {
    const room = resultRoom();
    expect(resultHeroes(room).map((row) => row.playerId)).toEqual(room.game!.results.filter((row) => row.winner).map((row) => row.playerId));
  });
  it("returns the actual public final hand in deal order without mutating it", () => {
    const room = resultRoom(); const own = room.game!.players[0]; own.hand.reverse();
    const original = structuredClone(room);
    const hand = completedHand(room, own.id)!;
    expect(hand.map((row) => row.dealOrder)).toEqual([...hand.map((row) => row.dealOrder)].sort((a, b) => a - b));
    expect(hand.reduce((sum, row) => sum + row.card!.value, 0)).toBe(room.game!.results.find((row) => row.playerId === own.id)!.total);
    expect(room).toEqual(original);
  });
  it("omits partial, missing, duplicated or inconsistent hands rather than inventing cards", () => {
    for (const corrupt of ["private", "missing", "duplicate", "total"] as const) {
      const room = resultRoom(), own = room.game!.players[0];
      if (corrupt === "private") own.hand[0].public = false;
      if (corrupt === "missing") own.hand[0].card = null;
      if (corrupt === "duplicate") own.hand[0].card = own.hand[1].card;
      if (corrupt === "total") room.game!.results.find((row) => row.playerId === own.id)!.total++;
      expect(completedHand(room, own.id)).toBeNull();
    }
  });
  it("never presents a hand or results before scoring completes", () => {
    const room = resultRoom(); room.game!.phase = "final_reveal";
    expect(completedHand(room, "p0")).toBeNull(); expect(resultHeroes(room)).toEqual([]); expect(resultRounds(room)).toEqual([]);
  });
  it("filters previous matches and uses authoritative current scores when history is stale", () => {
    const room = resultRoom(); room.game!.round = 6; room.matchStartRound = 4;
    const summary = { target: 100, deckCount: 10, completedAt: 1, results: room.game!.results.map((row) => ({ ...row, name: "Recorded name" })) };
    room.history = [3, 4, 5, 6, 7].map((round) => ({ ...summary, round }));
    const original = structuredClone(room);
    const rounds = resultRounds(room);
    expect(rounds.map((row) => row.round)).toEqual([4, 5, 6]);
    expect(rounds[0].results[0].name).toBe("Recorded name");
    expect(rounds[2].target).toBe(room.game!.target);
    for (const row of rounds[2].results) expect(row).toMatchObject(room.game!.results.find((result) => result.playerId === row.playerId)!);
    expect(room).toEqual(original);
  });
  it("explains absolute distance on either side without introducing a tiebreak", () => {
    const result = resultRoom().game!.results[0];
    expect(distanceText({ ...result, distance: 1, side: "above" })).toBe("1 above target");
    expect(distanceText({ ...result, distance: 1, side: "below" })).toBe("1 below target");
    expect(distanceText({ ...result, distance: 0, side: "exact" })).toBe("Exactly on target");
  });
});
