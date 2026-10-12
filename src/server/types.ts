import type { GameState, GameView, PlayerCommand, Result } from "@/game/types";
export type GameMode = "friends" | "bots";
export type Member = {
  isBot?: boolean;
  id: string;
  tokenHash: string;
  name: string;
  role: "player" | "spectator";
  ready: boolean;
  joinedAt: number;
  lastSeen: number;
  disconnectedAt: number | null;
};
export type RoundSummary = {
  round: number;
  target: number;
  results: (Result & { name: string })[];
  deckCount: number;
  completedAt: number;
};
export type Room = {
  mode?: GameMode;
  id: string;
  code: string;
  version: number;
  createdAt: number;
  lastActivity: number;
  hostId: string | null;
  members: Member[];
  status: "lobby" | "playing" | "results" | "abandoned";
  game: GameState | null;
  history: RoundSummary[];
  autoAt: number | null;
  endedReason: string | null;
  processed: string[];
  roundNumber: number;
  previousStarter: string | null;
};
export type RoomView = Omit<
  Room,
  "members" | "game" | "processed" | "autoAt" | "previousStarter" | "mode"
> & {
  mode: GameMode;
  members: Omit<Member, "tokenHash" | "lastSeen">[];
  game: GameView | null;
  me: string;
  paused: { playerId: string; name: string; deadline: number }[];
  backend: "local" | "supabase";
};
export type RoomCommand =
  | { type: "ready"; ready: boolean }
  | { type: "start" | "lobby" | "leave" | "claim" | "heartbeat" }
  | { type: "game"; action: PlayerCommand };
export interface RoomStore {
  kind: "local" | "supabase";
  create(room: Room): Promise<boolean>;
  get(code: string): Promise<Room | null>;
  update(code: string, mutate: (room: Room) => Room): Promise<Room>;
  listActive(): Promise<string[]>;
  rate(key: string, max: number, windowSeconds: number): Promise<boolean>;
}
