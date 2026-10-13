import { FIRST_ADDITION_MAX, rulesFor, secondCap } from "./config";
import { createDeck, shuffle } from "./deck";
import type {
  GamePlayer,
  GameState,
  GameView,
  PlayerCommand,
  RandomInt,
  Result,
  RevealStage,
} from "./types";

export class RuleError extends Error {}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
function event(
  s: GameState,
  kind: GameState["events"][number]["kind"],
  text: string,
  playerId?: string,
) {
  s.events.push({
    id: s.events.length + 1,
    kind,
    text,
    ...(playerId ? { playerId } : {}),
  });
}
export function makeRound(
  ids: string[],
  round: number,
  starterIndex: number,
  random: RandomInt,
): GameState {
  requireRule(
    ids.length >= 2 && ids.length <= 5 && new Set(ids).size === ids.length,
    "A round needs 2–5 distinct players.",
  );
  const range = rulesFor(ids.length);
  const order = [
    ...ids.slice(starterIndex % ids.length),
    ...ids.slice(0, starterIndex % ids.length),
  ];
  const s: GameState = {
    round,
    target: range.target[0] + random(range.target[1] - range.target[0] + 1),
    phase: "burn",
    order,
    starterIndex: starterIndex % ids.length,
    cursor: 0,
    deck: shuffle(createDeck(), random),
    burns: [],
    events: [],
    results: [],
    tiebreakApplied: false,
    latestReveal: null,
    finalReveal: null,
    players: ids.map((id) => ({
      id,
      hand: [],
      initialCount: null,
      firstReceived: 0,
      firstDone: false,
      secondDone: false,
    })),
  };
  for (const id of order) {
    s.burns.push({ playerId: id, card: s.deck.shift()! });
    event(s, "burn", "Burned one card face up.", id);
  }
  assertInventory(s);
  return s;
}
function deal(s: GameState, p: GamePlayer, count: number) {
  requireRule(
    count <= s.deck.length,
    "There are not enough cards in the shared deck.",
  );
  for (let i = 0; i < count; i++)
    p.hand.push({
      card: s.deck.shift()!,
      revealed: false,
      dealOrder: s.players.reduce((n, player) => n + player.hand.length, 0),
    });
}
function reveal(s: GameState, p: GamePlayer, count: number, random: RandomInt, stage: RevealStage) {
  const hidden = shuffle(
    p.hand.filter((c) => !c.revealed),
    random,
  );
  for (const c of hidden.slice(0, count)) {
    c.revealed = true;
    c.revealedIn = stage;
    s.latestReveal = stage;
  }
  if (count)
    event(
      s,
      "reveal",
      `Revealed ${count} ${count === 1 ? "card" : "cards"}.`,
      p.id,
    );
}
function finalReveal(s: GameState) {
  s.phase = "final_reveal";
  s.finalReveal = {
    total: s.players.reduce((n, p) => n + p.hand.filter((c) => !c.revealed).length, 0),
    revealed: 0,
    lastSlotId: null,
  };
  // Results must not expose hidden totals during the card-by-card reveal.
  s.results = [];
}
function resolve(s: GameState) {
  const resolution = score(
    s.players.map((p) => ({
      playerId: p.id,
      total: p.hand.reduce((n, c) => n + c.card.value, 0),
    })),
    s.target,
  );
  s.results = resolution.results;
  s.tiebreakApplied = resolution.tiebreakApplied;
}
export function score(
  totals: { playerId: string; total: number }[],
  target: number,
): { results: Result[]; tiebreakApplied: boolean } {
  requireRule(
    totals.length > 0 &&
      Number.isInteger(target) &&
      totals.every((t) => Number.isInteger(t.total)),
    "Scoring requires integer totals.",
  );
  const distance = Math.min(...totals.map((t) => Math.abs(t.total - target)));
  return {
    tiebreakApplied: false,
    results: totals.map((t) => ({
      ...t,
      distance: Math.abs(t.total - target),
      side: t.total < target ? "below" : t.total > target ? "above" : "exact",
      winner: Math.abs(t.total - target) === distance,
      rank: 1 + totals.filter((other) => Math.abs(other.total - target) < Math.abs(t.total - target)).length,
      points: totals.length - totals.filter((other) => Math.abs(other.total - target) < Math.abs(t.total - target)).length,
    })),
  };
}
export function advance(state: GameState, random: RandomInt): GameState {
  const s = structuredClone(state);
  switch (s.phase) {
    case "burn":
      s.phase = "initial_selection";
      break;
    case "initial_deal":
      for (const p of s.players)
        reveal(s, p, Math.floor(p.hand.length / 2), random, "first");
      s.phase = "first_reveal";
      break;
    case "first_reveal":
      s.phase = "first_additions";
      s.cursor = 0;
      break;
    case "second_reveal": {
      s.phase = "second_additions";
      s.cursor = 0;
      for (const p of s.players)
        if (Math.min(secondCap(p.firstReceived), s.deck.length) === 0) {
          p.secondDone = true;
          event(
            s,
            "skip",
            "No final addition: the shared deck is empty.",
            p.id,
          );
        }
      while (
        s.cursor < s.order.length &&
        s.players.find((p) => p.id === s.order[s.cursor])!.secondDone
      )
        s.cursor++;
      if (s.cursor === s.order.length) finalReveal(s);
      break;
    }
    case "final_reveal": {
      // Deal order is stable across every client and reconnect. Only one face
      // enters the public projection per server transition.
      const next = s.players.flatMap((p) => p.hand.map((held, index) => ({ p, held, index })))
        .filter(({ held }) => !held.revealed)
        .sort((a, b) => a.held.dealOrder - b.held.dealOrder)[0];
      if (next) {
        s.finalReveal ??= { total: s.players.reduce((n, p) => n + p.hand.filter((c) => !c.revealed).length, 0), revealed: 0, lastSlotId: null };
        next.held.revealed = true;
        next.held.revealedIn = "final";
        s.latestReveal = "final";
        s.finalReveal.revealed++;
        s.finalReveal.lastSlotId = `${s.round}:${next.p.id}:${next.index}`;
        event(s, "reveal", "The final card turns over.", next.p.id);
        break;
      }
      resolve(s);
      s.phase = "round_results";
      event(s, "result", "Round complete. Closest to the target wins.");
      break;
    }
    default:
      throw new RuleError("This phase is waiting for a player decision.");
  }
  event(s, "phase", s.phase.replaceAll("_", " "));
  assertInventory(s);
  return s;
}
export function act(
  state: GameState,
  playerId: string,
  command: PlayerCommand,
  random: RandomInt,
): GameState {
  requireRule(
    command.round === state.round && command.phase === state.phase,
    "That decision is stale. Refresh your room state.",
  );
  const s = structuredClone(state),
    p = s.players.find((p) => p.id === playerId);
  requireRule(p, "Only seated players can make decisions.");
  requireRule(
    Number.isInteger(command.count),
    "Choose a whole number of cards.",
  );
  if (command.type === "select") {
    requireRule(
      s.phase === "initial_selection",
      "Initial selection is closed.",
    );
    requireRule(
      p.initialCount === null,
      "Your initial choice is already committed.",
    );
    const [min, max] = rulesFor(s.players.length).initial;
    requireRule(
      command.count >= min && command.count <= max,
      `Choose between ${min} and ${max} cards.`,
    );
    p.initialCount = command.count;
    if (s.players.every((p) => p.initialCount !== null)) {
      for (let n = 0; n < max; n++)
        for (const id of s.order) {
          const receiver = s.players.find((p) => p.id === id)!;
          if (n < receiver.initialCount!) deal(s, receiver, 1);
        }
      for (const p of s.players)
        event(s, "deal", `Received ${p.hand.length} initial cards.`, p.id);
      s.phase = "initial_deal";
    }
  } else {
    requireRule(
      s.phase === "first_additions" || s.phase === "second_additions",
      "Cards cannot be added in this phase.",
    );
    requireRule(s.order[s.cursor] === playerId, "Wait for your turn.");
    const first = s.phase === "first_additions";
    requireRule(
      first ? !p.firstDone : !p.secondDone,
      "This decision has already been completed.",
    );
    const cap = Math.min(
      first ? FIRST_ADDITION_MAX : secondCap(p.firstReceived),
      s.deck.length,
    );
    requireRule(
      command.count >= 0 && command.count <= cap,
      `You may add 0–${cap} cards.`,
    );
    deal(s, p, command.count);
    if (first) {
      p.firstReceived = command.count;
      p.firstDone = true;
    } else p.secondDone = true;
    event(
      s,
      command.count ? "draw" : "pass",
      command.count
        ? `Added ${command.count} ${command.count === 1 ? "card" : "cards"}.`
        : "Passed. This addition decision is final.",
      p.id,
    );
    s.cursor++;
    if (!first)
      while (
        s.cursor < s.order.length &&
        s.players.find((p) => p.id === s.order[s.cursor])!.secondDone
      )
        s.cursor++;
    if (s.cursor === s.order.length) {
      if (first) {
        for (const p of s.players)
          reveal(
            s,
            p,
            Math.max(0, p.hand.filter((c) => !c.revealed).length - 1),
            random,
            "second",
          );
        s.phase = "second_reveal";
      } else finalReveal(s);
    }
  }
  assertInventory(s);
  return s;
}
// A card is unknown to everyone, including its owner, until a staged reveal.
export function projectGame(s: GameState): GameView {
  const { deck, players, ...publicState } = s;
  return {
    ...structuredClone(publicState),
    deckCount: deck.length,
    activePlayerId:
      s.phase === "first_additions" || s.phase === "second_additions"
        ? (s.order[s.cursor] ?? null)
        : null,
    players: players.map((p) => ({
      id: p.id,
      committed: p.initialCount !== null,
      initialCount:
        s.phase === "initial_selection" || s.phase === "burn"
          ? null
          : p.initialCount,
      firstReceived: p.firstReceived,
      firstDone: p.firstDone,
      secondDone: p.secondDone,
      cap: secondCap(p.firstReceived),
      hand: p.hand.map((c, i) => ({
        slotId: `${s.round}:${p.id}:${i}`,
        public: c.revealed,
        newlyRevealed: c.revealed && !!s.latestReveal && c.revealedIn === s.latestReveal,
        dealOrder: c.dealOrder,
        card: c.revealed ? { ...c.card } : null,
      })),
    })),
  };
}
export function assertInventory(s: GameState) {
  const all = [
    ...s.deck,
    ...s.burns.map((b) => b.card),
    ...s.players.flatMap((p) => p.hand.map((c) => c.card)),
  ];
  if (all.length !== 52 || new Set(all.map((c) => c.id)).size !== 52)
    throw new Error("Card inventory invariant failed");
}
