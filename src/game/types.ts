import type { PHASES, SUITS } from "./config";
export type Phase = (typeof PHASES)[number];
export type Card = {
  id: string;
  suit: (typeof SUITS)[number];
  rank: number;
  value: number;
};
export type HeldCard = { card: Card; revealed: boolean; dealOrder: number };
export type GamePlayer = {
  id: string;
  hand: HeldCard[];
  initialCount: number | null;
  firstReceived: number;
  firstDone: boolean;
  secondDone: boolean;
};
export type GameEvent = {
  id: number;
  kind:
    | "burn"
    | "deal"
    | "reveal"
    | "draw"
    | "pass"
    | "phase"
    | "skip"
    | "result";
  text: string;
  playerId?: string;
};
export type Result = {
  playerId: string;
  total: number;
  distance: number;
  side: "below" | "exact" | "above";
  winner: boolean;
  rank: number;
  points: number;
};
export type GameState = {
  round: number;
  target: number;
  phase: Phase;
  order: string[];
  starterIndex: number;
  cursor: number;
  players: GamePlayer[];
  deck: Card[];
  burns: { playerId: string; card: Card }[];
  events: GameEvent[];
  results: Result[];
  tiebreakApplied: boolean;
  finalReveal: { total: number; revealed: number; lastSlotId: string | null } | null;
};
export type PlayerCommand = {
  type: "select" | "add";
  count: number;
  round: number;
  phase: Phase;
};
export type RandomInt = (upperExclusive: number) => number;
export type CardView = {
  slotId: string;
  card: Card | null;
  public: boolean;
  dealOrder: number;
};
export type GameView = Omit<GameState, "deck" | "players"> & {
  deckCount: number;
  players: {
    id: string;
    hand: CardView[];
    committed: boolean;
    initialCount: number | null;
    firstReceived: number;
    firstDone: boolean;
    secondDone: boolean;
    cap: number;
  }[];
  activePlayerId: string | null;
};
