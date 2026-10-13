import { describe, expect, it } from "vitest";
import {
  act,
  advance,
  assertInventory,
  makeRound,
  projectGame,
  score,
} from "@/game/engine";
import { createDeck, shuffle } from "@/game/deck";
import { FIRST_ADDITION_MAX, RULES, secondCap, type PlayerCount } from "@/game/config";
import { firstWindow, seeded, selected, toFirst } from "./fixtures";

describe("official deck and setup", () => {
  it.each([
    [2, 70, 150], [3, 45, 110], [4, 30, 85], [5, 20, 70],
  ] as const)("uses the lowered minimum and unchanged maximum for %i players", (count, min, max) => {
    const ids = Array.from({ length: count }, (_, index) => `p${index}`);
    expect(makeRound(ids, 1, 0, () => 0).target).toBe(min);
    expect(makeRound(ids, 1, 0, (upper) => upper - 1).target).toBe(max);
  });
  it("creates 52 unique physical cards, with every rank mapped correctly", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    for (const c of deck) expect(c.value).toBe(c.rank);
    expect(deck.filter((c) => c.rank === 13)).toHaveLength(4);
  });
  it("shuffles deterministically with a fixture, without changing inventory", () => {
    expect(shuffle(createDeck(), seeded())).toEqual(
      shuffle(createDeck(), seeded()),
    );
    expect(shuffle(createDeck(), seeded())).not.toEqual(createDeck());
  });
  it.each([2, 3, 4, 5] as PlayerCount[])(
    "uses inclusive target limits and one permanent burn per player (%i)",
    (n) => {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const lo = makeRound(ids, 1, 0, () => 0),
        hi = makeRound(ids, 1, 0, (max) => max - 1);
      expect(lo.target).toBe(RULES[n].target[0]);
      expect(hi.target).toBe(RULES[n].target[1]);
      expect(lo.burns.map((b) => b.playerId)).toEqual(ids);
      expect(lo.deck).toHaveLength(52 - n);
      for (const b of lo.burns)
        expect(lo.deck.some((c) => c.id === b.card.id)).toBe(false);
      assertInventory(lo);
    },
  );
  it.each([2, 3, 4, 5] as PlayerCount[])(
    "enforces both initial hand bounds (%i)",
    (n) => {
      const rng = seeded(),
        s = advance(
          makeRound(
            Array.from({ length: n }, (_, i) => `p${i}`),
            1,
            0,
            rng,
          ),
          rng,
        );
      const choose = (count: number) =>
        act(s, "p0", { type: "select", count, phase: s.phase, round: 1 }, rng);
      expect(() => choose(RULES[n].initial[0] - 1)).toThrow();
      expect(() => choose(RULES[n].initial[1] + 1)).toThrow();
      expect(choose(RULES[n].initial[0]).players[0].initialCount).toBe(
        RULES[n].initial[0],
      );
      expect(choose(RULES[n].initial[1]).players[0].initialCount).toBe(
        RULES[n].initial[1],
      );
    },
  );
  it("conceals committed sizes until everyone commits; cannot recommit", () => {
    const rng = seeded();
    let s = advance(makeRound(["a", "b"], 1, 0, rng), rng);
    s = act(
      s,
      "a",
      { type: "select", count: 15, phase: s.phase, round: 1 },
      rng,
    );
    expect(projectGame(s).players[0]).toMatchObject({
      committed: true,
      initialCount: null,
    });
    expect(() =>
      act(s, "a", { type: "select", count: 8, phase: s.phase, round: 1 }, rng),
    ).toThrow();
  });
  it("deals one card per player repeatedly, stopping at each chosen size", () => {
    const rng = seeded();
    let s = advance(makeRound(["a", "b", "c"], 1, 1, rng), rng);
    const deck = [...s.deck];
    for (const [id, count] of [
      ["a", 6],
      ["b", 8],
      ["c", 10],
    ] as const)
      s = act(s, id, { type: "select", count, phase: s.phase, round: 1 }, rng);
    expect(s.players.find((p) => p.id === "b")!.hand[0].card).toEqual(deck[0]);
    expect(s.players.find((p) => p.id === "b")!.hand[0].dealOrder).toBe(0);
    expect(s.players.find((p) => p.id === "c")!.hand[0].dealOrder).toBe(1);
    expect(s.players.find((p) => p.id === "c")!.hand[0].card).toEqual(deck[1]);
    expect(s.players.find((p) => p.id === "a")!.hand[0].card).toEqual(deck[2]);
    expect(s.players.map((p) => p.hand.length)).toEqual([6, 8, 10]);
    expect(s.players.find((p) => p.id === "c")!.hand[9].card).toEqual(deck[23]);
    assertInventory(s);
  });
});

describe("reveals and addition windows", () => {
  it("moves highlights between reveal waves, accumulates final flips, and preserves them on refresh", () => {
    let { state } = toFirst();
    const rng = seeded();
    const highlights = () => projectGame(state).players.flatMap((p) => p.hand).filter((held) => held.newlyRevealed).map((held) => held.card!.id);
    const first = highlights();
    expect(first).toHaveLength(8);
    expect(state.latestReveal).toBe("first");
    state = act(state, "p0", { type: "add", count: 2, phase: state.phase, round: 1 }, rng);
    expect(highlights()).toEqual(first);
    expect(projectGame(state).players.flatMap((p) => p.hand).filter((held) => !held.public).every((held) => !held.newlyRevealed)).toBe(true);
    state = act(state, "p1", { type: "add", count: 3, phase: state.phase, round: 1 }, rng);
    const second = highlights();
    expect(state.latestReveal).toBe("second");
    expect(second).toHaveLength(11);
    expect(second.every((id) => !first.includes(id))).toBe(true);
    expect(projectGame(JSON.parse(JSON.stringify(state)))).toEqual(projectGame(state));
    state = advance(state, rng);
    state = firstWindow(state, [1, 0], rng);
    expect(state.phase).toBe("final_reveal");
    expect(highlights()).toEqual(second);
    for (let count = 1; count <= 3; count++) {
      state = advance(state, rng);
      expect(state.latestReveal).toBe("final");
      const final = highlights();
      expect(final).toHaveLength(count);
      expect(final.every((id) => !first.includes(id) && !second.includes(id))).toBe(true);
    }
    const final = highlights();
    state = advance(state, rng);
    expect(state.phase).toBe("round_results");
    expect(highlights()).toEqual(final);
    expect(projectGame(JSON.parse(JSON.stringify(state)))).toEqual(projectGame(state));
    state = makeRound(["p0", "p1"], 2, 1, rng);
    expect(state.latestReveal).toBeNull();
    expect(highlights()).toEqual([]);
  });
  it("starts tracking the next reveal safely in older rooms without reveal metadata", () => {
    const { state, rng } = toFirst();
    const previouslyRevealed = state.players.flatMap((p) => p.hand).filter((held) => held.revealed).map((held) => held.card.id);
    delete state.latestReveal;
    for (const held of state.players.flatMap((p) => p.hand)) delete held.revealedIn;
    expect(projectGame(state).players.flatMap((p) => p.hand).some((held) => held.newlyRevealed)).toBe(false);
    const updated = firstWindow(state, [0, 0], rng);
    const highlighted = projectGame(updated).players.flatMap((p) => p.hand).filter((held) => held.newlyRevealed);
    expect(highlighted).toHaveLength(6);
    expect(highlighted.every((held) => held.public && held.card && !previouslyRevealed.includes(held.card.id))).toBe(true);
  });
  it("first reveal shows floor(initial/2), with no duplicates", () => {
    const { state, rng } = selected(2, [9, 15]),
      s = advance(state, rng);
    expect(
      s.players.map((p) => p.hand.filter((c) => c.revealed).length),
    ).toEqual([4, 7]);
    assertInventory(s);
  });
  it.each([-1, 5, 1.5])(
    "rejects illegal first addition %s without mutating input",
    (count) => {
      const { state, rng } = toFirst();
      const before = structuredClone(state);
      expect(() =>
        act(
          state,
          "p0",
          { type: "add", count, phase: state.phase, round: 1 },
          rng,
        ),
      ).toThrow();
      expect(state).toEqual(before);
    },
  );
  it.each([0, 1, 2, 3, 4])(
    "accepts first addition %i; second cap uses actual receipt",
    (count) => {
      const { state, rng } = toFirst();
      const s = act(
        state,
        "p0",
        { type: "add", count, phase: state.phase, round: 1 },
        rng,
      );
      expect(s.players[0].firstReceived).toBe(count);
      expect(secondCap(s.players[0].firstReceived)).toBe([1, 1, 2, 2, 3][count]);
      expect(s.deck.length).toBe(state.deck.length - count);
      expect(s.players[0].hand.slice(8).every((c) => !c.revealed)).toBe(true);
    },
  );
  it("rejects out-of-turn, repeated, stale-round, stale-phase and invalid transitions", () => {
    const { state, rng } = toFirst();
    const cmd = {
      type: "add" as const,
      count: 0,
      round: 1,
      phase: state.phase,
    };
    expect(() => act(state, "p1", cmd, rng)).toThrow("turn");
    const passed = act(state, "p0", cmd, rng);
    expect(() => act(passed, "p0", { ...cmd, count: 3 }, rng)).toThrow();
    expect(() => act(state, "p0", { ...cmd, round: 2 }, rng)).toThrow("stale");
    expect(() =>
      act(state, "p0", { ...cmd, phase: "second_additions" }, rng),
    ).toThrow("stale");
    expect(() => advance(state, rng)).toThrow();
  });
  it("second reveal includes additions, leaves one hidden, never reverses public cards", () => {
    const { state, rng } = toFirst(2, [9, 15]);
    const publicBefore = state.players.flatMap((p) =>
      p.hand.filter((c) => c.revealed).map((c) => c.card.id),
    );
    const s = firstWindow(state, [3, 2], rng);
    for (const p of s.players)
      expect(p.hand.filter((c) => !c.revealed)).toHaveLength(1);
    for (const id of publicBefore)
      expect(
        s.players.flatMap((p) => p.hand).find((c) => c.card.id === id)
          ?.revealed,
      ).toBe(true);
    expect(
      s.events.filter((e) => e.kind === "reveal").map((e) => e.text),
    ).toEqual([
      "Revealed 4 cards.",
      "Revealed 7 cards.",
      "Revealed 7 cards.",
      "Revealed 9 cards.",
    ]);
  });
  it("allows a final card after passing earlier, and rejects excessive second additions", () => {
    const { state, rng } = toFirst(3);
    let s = advance(firstWindow(state, [0, 2, 3], rng), rng);
    expect(s.players[0].secondDone).toBe(false);
    expect(projectGame(s).activePlayerId).toBe("p0");
    s = act(s, "p0", { type: "add", count: 1, round: 1, phase: s.phase }, rng);
    expect(() =>
      act(s, "p1", { type: "add", count: 3, round: 1, phase: s.phase }, rng),
    ).toThrow();
    s = act(s, "p1", { type: "add", count: 1, round: 1, phase: s.phase }, rng);
    expect(secondCap(s.players[2].firstReceived)).toBe(2);
  });
  it("final reveal exposes every card and counts each once, with no further actions", () => {
    const { state, rng } = toFirst();
    let s = advance(firstWindow(state, [2, 3], rng), rng);
    s = firstWindow(s, [1, 0], rng);
    expect(s.phase).toBe("final_reveal");
    expect(s.results).toEqual([]);
    expect(s.finalReveal?.total).toBe(3);
    for (let n = 1; n <= 3; n++) {
      const before = s.players.flatMap((p) => p.hand).filter((c) => c.revealed).length;
      s = advance(s, rng);
      expect(s.players.flatMap((p) => p.hand).filter((c) => c.revealed)).toHaveLength(before + 1);
      expect(s.phase).toBe("final_reveal");
      expect(s.results).toEqual([]);
      const view = projectGame(s), json = JSON.stringify(view);
      for (const held of s.players.flatMap((p) => p.hand).filter((c) => !c.revealed))
        expect(json).not.toContain(JSON.stringify(held.card.id));
      expect(s.finalReveal?.revealed).toBe(n);
    }
    s = advance(s, rng);
    for (const p of s.players) {
      expect(p.hand.every((c) => c.revealed)).toBe(true);
      expect(s.results.find((r) => r.playerId === p.id)?.total).toBe(
        p.hand.reduce((sum, c) => sum + c.card.value, 0),
      );
    }
    assertInventory(s);
    expect(s.phase).toBe("round_results");
    expect(() =>
      act(s, "p0", { type: "add", count: 1, phase: s.phase, round: 1 }, rng),
    ).toThrow();
  });
  it.each([2, 3, 4, 5] as PlayerCount[])(
    "safely stops at the end of the shared deck with widened maximums (%i players)",
    (n) => {
      const { state, rng } = toFirst(n, Array(n).fill(RULES[n].initial[1]));
      let s = state;
      for (let step = 0; s.phase !== "round_results" && step < 100; step++) {
        const view = projectGame(s);
        if (view.activePlayerId) {
          const player = view.players.find((p) => p.id === view.activePlayerId)!;
          const cap = Math.min(s.phase === "first_additions" ? FIRST_ADDITION_MAX : player.cap, s.deck.length);
          s = act(s, player.id, { type: "add", count: cap, phase: s.phase, round: 1 }, rng);
        } else s = advance(s, rng);
        assertInventory(s);
      }
      expect(s.phase).toBe("round_results");
      expect(s.deck.length).toBe(n === 2 ? 4 : 0);
      assertInventory(s);
    },
  );
  it("rotates starting positions and burns in that order", () => {
    expect(makeRound(["a", "b", "c"], 2, 1, seeded()).order).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
});

describe("scoring and private projections", () => {
  const winners = (totals: number[], target = 100) =>
    score(
      totals.map((total, i) => ({ playerId: String(i), total })),
      target,
    )
      .results.filter((r) => r.winner)
      .map((r) => r.playerId);
  it("exact match beats all other totals", () =>
    expect(winners([99, 100, 101])).toEqual(["1"]));
  it("equidistant below and above share the win, including -1 and +1", () => {
    expect(winners([99, 101])).toEqual(["0", "1"]);
    expect(winners([98, 102])).toEqual(["0", "1"]);
    expect(
      score(
        [
          { playerId: "a", total: 98 },
          { playerId: "b", total: 102 },
        ],
        100,
      ).tiebreakApplied,
    ).toBe(false);
  });
  it("awards rank-based points with equal distances sharing a rank and points", () => {
    const results = score([99, 101, 103, 103, 110].map((total, i) => ({ playerId: String(i), total })), 100).results;
    expect(results.map((r) => r.rank)).toEqual([1, 1, 3, 3, 5]);
    expect(results.map((r) => r.points)).toEqual([5, 5, 3, 3, 1]);
  });
  it("same-side ties share wins, including multiple exacts", () => {
    expect(winners([98, 98, 105])).toEqual(["0", "1"]);
    expect(winners([102, 102, 97])).toEqual(["0", "1"]);
    expect(winners([100, 100])).toEqual(["0", "1"]);
  });
  it("overshooting remains eligible", () =>
    expect(winners([80, 101])).toEqual(["1"]));
  it("never serializes hidden identities, including the player's own cards", () => {
    const { state } = toFirst();
    const view = projectGame(state),
      json = JSON.stringify(view);
    expect(json).not.toContain('"deck":');
    for (const p of state.players)
      for (const c of p.hand.filter((c) => !c.revealed))
        expect(json).not.toContain(JSON.stringify(c.card.id));
    for (const p of view.players)
      for (const c of p.hand)
        if (!c.public) expect(c.card).toBeNull();
  });
});

describe("complete rounds across different draws", () => {
  it.each([2, 3, 4, 5] as PlayerCount[])("conserves cards and conceals every unknown face across 32 %i-player rounds", (count) => {
    for (let seed = 1; seed <= 32; seed++) {
      const rng = seeded(seed);
      let state = makeRound(Array.from({ length: count }, (_, i) => `p${i}`), seed, seed % count, rng);
      const revealed = new Set<string>();
      for (let step = 0; state.phase !== "round_results" && step < 100; step++) {
        const view = projectGame(state);
        const serialized = JSON.stringify(view);
        for (const player of state.players)
          for (const held of player.hand) {
            if (revealed.has(held.card.id)) expect(held.revealed).toBe(true);
            if (held.revealed) revealed.add(held.card.id);
            else expect(serialized).not.toContain(JSON.stringify(held.card.id));
          }
        if (state.phase === "initial_selection") {
          const [min, max] = RULES[count].initial;
          const player = state.players.find((p) => p.initialCount === null)!;
          state = act(state, player.id, { type: "select", count: min + rng(max - min + 1), phase: state.phase, round: seed }, rng);
        } else if (view.activePlayerId) {
          const player = view.players.find((p) => p.id === view.activePlayerId)!;
          const cap = Math.min(state.phase === "first_additions" ? FIRST_ADDITION_MAX : player.cap, state.deck.length);
          state = act(state, player.id, { type: "add", count: rng(cap + 1), phase: state.phase, round: seed }, rng);
        } else state = advance(state, rng);
        assertInventory(state);
      }
      expect(state.phase).toBe("round_results");
      expect(state.players.every((p) => p.hand.every((held) => held.revealed))).toBe(true);
      for (const result of state.results)
        expect(result.total).toBe(state.players.find((p) => p.id === result.playerId)!.hand.reduce((sum, held) => sum + held.card.value, 0));
      const closest = Math.min(...state.results.map((r) => Math.abs(r.total - state.target)));
      expect(state.results.filter((r) => r.winner).every((r) => Math.abs(r.total - state.target) === closest)).toBe(true);
      expect(state.results.some((r) => r.winner)).toBe(true);
    }
  });
});
