import { createHash, randomInt, randomUUID } from "node:crypto";
import {
  act,
  advance,
  makeRound,
  projectGame,
  score,
} from "@/game/engine";
import { botDecision } from "@/game/bot";
import { DEFAULT_ROUND_LIMIT, ROUND_LIMITS, TIMING, type RoundLimit } from "@/game/config";
import { DEFAULT_PROFILE, PLAYER_ICONS, PROFILE_COLORS, type PlayerProfile } from "@/game/profile";
import { ApiError } from "./errors";
import type {
  GameMode,
  Member,
  Room,
  RoomCommand,
  RoomStore,
  RoomView,
  Standing,
} from "./types";

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const automatic = new Set([
  "burn",
  "initial_deal",
  "first_reveal",
  "second_reveal",
  "final_reveal",
]);
function member(room: Room, tokenHash: string) {
  const m = room.members.find((m) => m.tokenHash === tokenHash);
  if (!m) throw new ApiError(403, "You are not a participant in this room.");
  return m;
}
function checkExpiry(room: Room, now: number) {
  if (now - room.lastActivity > 86400000)
    throw new ApiError(410, "This room has expired. Create a new room.");
}
function normalizeRoom(room: Room) {
  // Rooms already saved in Supabase can finish without a database migration.
  room.roundLimit ??= DEFAULT_ROUND_LIMIT;
  room.matchStartRound ??= Math.max(1, room.roundNumber);
  room.matchNumber ??= room.roundNumber ? 1 : 0;
  // Upgrade completed results from rooms created before match points and fair
  // cross-target ties were introduced. Keep their original names and totals.
  for (const round of room.history) {
    if (round.results.some((r) => r.points === undefined || r.rank === undefined)) {
      const repaired = score(round.results, round.target).results;
      round.results = round.results.map((r) => ({ ...r, ...repaired.find((next) => next.playerId === r.playerId)! }));
    }
  }
  if (room.game?.results.length && (room.game.tiebreakApplied || room.game.results.some((r) => r.points === undefined || r.rank === undefined))) {
    room.game.results = score(room.game.results, room.game.target).results;
    room.game.tiebreakApplied = false;
  }
}
function matchRounds(room: Room) {
  return room.history.filter((round) => round.round >= room.matchStartRound);
}
function matchComplete(room: Room) {
  return matchRounds(room).length >= room.roundLimit;
}
export function standings(room: Room): Standing[] {
  const rounds = matchRounds(room);
  const ids = new Set([
    ...room.members.filter((m) => m.role === "player").map((m) => m.id),
    ...rounds.flatMap((round) => round.results.map((r) => r.playerId)),
  ]);
  const rows = [...ids].map((playerId) => {
    const m = room.members.find((m) => m.id === playerId);
    let points = 0, wins = 0, streak = 0;
    for (const round of rounds) {
      const result = round.results.find((r) => r.playerId === playerId);
      if (result) {
        // Older saved results predate points; rank them by absolute distance.
        points += result.points ?? round.results.length - round.results.filter((r) => r.distance < result.distance).length;
        if (result.winner) wins++;
      }
      streak = result?.winner ? streak + 1 : 0;
    }
    return { playerId, name: m?.name ?? rounds.flatMap((r) => r.results).find((r) => r.playerId === playerId)?.name ?? "Former player", profile: m?.profile ?? DEFAULT_PROFILE, points, wins, streak, rank: 1 };
  });
  for (const row of rows) row.rank = 1 + rows.filter((other) => other.points > row.points).length;
  return rows.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}
function reconnectMember(room: Room, m: Member, now: number) {
  m.lastSeen = now;
  m.disconnectedAt = null;
  // A practice owner's seat stays reserved even after the interrupted round ends.
  if (room.mode === "bots" && !m.isBot && room.game?.players.some((p) => p.id === m.id)) {
    m.role = "player";
  }
}
export function migrateHost(room: Room) {
  const current = room.members.find((m) => m.id === room.hostId);
  if (
    current?.role === "player" &&
    !current.isBot &&
    current.disconnectedAt === null
  )
    return;
  room.hostId =
    room.members
      .filter(
        (m) => m.role === "player" && !m.isBot && m.disconnectedAt === null,
      )
      .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))[0]
      ?.id ?? null;
}
export function pausedPlayers(room: Room) {
  if ((room.status !== "playing" && !(room.status === "results" && !matchComplete(room))) || !room.game) return [];
  return room.members
    .filter(
      (m) =>
        room.game!.players.some((p) => p.id === m.id) &&
        m.disconnectedAt !== null,
    )
    .map((m) => ({
      playerId: m.id,
      name: m.name,
      deadline: m.disconnectedAt! + TIMING.reconnect,
    }));
}
function endMatch(room: Room, reason: string) {
  room.status = "abandoned";
  room.endedReason = reason;
  room.autoAt = null;
}
export function maintain(room: Room, now: number): Room {
  normalizeRoom(room);
  checkExpiry(room, now);
  for (const m of room.members)
    if (
      !m.isBot &&
      m.disconnectedAt === null &&
      now - m.lastSeen >= TIMING.stale
    )
      m.disconnectedAt = m.lastSeen + TIMING.stale;
  migrateHost(room);
  const paused = pausedPlayers(room);
  const expired = paused.find((p) => now >= p.deadline);
  if (expired)
    endMatch(
      room,
      `${expired.name} did not reconnect within 90 seconds. The match has ended; completed rounds are saved.`,
    );
  if (room.status !== "playing") {
    // Expired reservations must not fill every seat and prevent a new match.
    for (const m of room.members)
      if (
        m.role === "player" &&
        m.disconnectedAt !== null &&
        now >= m.disconnectedAt + TIMING.reconnect
      ) {
        m.role = "spectator";
        m.ready = false;
      }
    migrateHost(room);
    // A fixed match roster must not strand spectators when every player has
    // left or their seat reservation has expired. Keep the completed history.
    if ((room.mode ?? "friends") === "friends" && room.status !== "lobby" && !room.members.some((m) => m.role === "player")) {
      room.status = "lobby";
      room.autoAt = null;
      room.endedReason = null;
    }
  }
  if (room.status === "results" && !matchComplete(room) && room.autoAt !== null && now >= room.autoAt) {
    const players = room.members.filter((m) => room.game?.players.some((p) => p.id === m.id));
    // Keep the same roster and pause the break while someone reconnects.
    if (players.length === room.game?.players.length && players.every((m) => m.role === "player" && m.ready && m.disconnectedAt === null))
      startRound(room, now);
    return room;
  }
  if (
    room.status === "playing" &&
    pausedPlayers(room).length === 0 &&
    room.game &&
    room.autoAt !== null &&
    now >= room.autoAt
  ) {
    if (automatic.has(room.game.phase))
      room.game = advance(room.game, randomInt);
    else {
      const bot = pendingBot(room);
      const decision =
        bot && botDecision(projectGame(room.game), bot.id);
      if (bot && decision)
        room.game = act(room.game, bot.id, decision, randomInt);
    }
    if (room.game.phase === "round_results") {
      room.status = "results";
      room.history.push({
        round: room.game.round,
        target: room.game.target,
        results: room.game.results.map((r) => ({
          ...r,
          name:
            room.members.find((m) => m.id === r.playerId)?.name ??
            "Former player",
        })),
        deckCount: room.game.deck.length,
        completedAt: now,
      });
      // Retain every result in the current match, plus recent table history.
      room.history = room.history.slice(-100);
    }
    setAutomatic(room, now);
  }
  return room;
}
function setAutomatic(room: Room, now: number) {
  if (room.status === "results") {
    room.autoAt = matchComplete(room) ? null : now + TIMING.nextRound;
    return;
  }
  const final = room.game?.phase === "final_reveal";
  const finalHidden = room.game?.players.some((p) => p.hand.some((c) => !c.revealed));
  room.autoAt =
    room.status === "playing" &&
    room.game &&
    (automatic.has(room.game.phase) || pendingBot(room))
      ? now + (final ? finalHidden ? TIMING.finalCard : TIMING.finalHold : automatic.has(room.game.phase) ? TIMING.automaticPhase : 900)
      : null;
}
function pendingBot(room: Room) {
  const game = room.game;
  if (!game) return undefined;
  return room.members.find(
    (m) =>
      m.isBot &&
      m.role === "player" &&
      (game.phase === "initial_selection"
        ? game.players.some((p) => p.id === m.id && p.initialCount === null)
        : (game.phase === "first_additions" ||
            game.phase === "second_additions") &&
          game.order[game.cursor] === m.id),
  );
}
function startRound(room: Room, now: number) {
  if (room.status === "results" && matchComplete(room))
    throw new ApiError(409, "This match is complete. Return to the lobby for a new match.");
  if (room.status === "abandoned")
    throw new ApiError(409, "Return to the lobby to start a new match.");
  const players = room.members.filter(
    (m) => m.role === "player" && m.disconnectedAt === null,
  );
  if (
    players.length < 2 ||
    players.length > 5 ||
    players.some((m) => !m.ready)
  )
    throw new ApiError(
      409,
      "You need 2–5 connected players, all ready, to start.",
    );
  for (const former of room.members)
    if (former.role === "player" && former.disconnectedAt !== null) {
      former.role = "spectator";
      former.ready = false;
    }
  const ids = players.map((p) => p.id);
  if (room.status === "results" && (ids.length !== room.game?.players.length || room.game.players.some((p) => !ids.includes(p.id))))
    throw new ApiError(409, "Wait for every match player to reconnect, or return to the lobby.");
  const previous = room.previousStarter
    ? ids.indexOf(room.previousStarter)
    : -1;
  const starter =
    previous >= 0
      ? (previous + 1) % ids.length
      : room.roundNumber
        ? 0
        : randomInt(ids.length);
  if (room.status === "lobby") {
    room.matchStartRound = room.roundNumber + 1;
    room.matchNumber++;
  }
  room.game = makeRound(ids, ++room.roundNumber, starter, randomInt);
  room.previousStarter = ids[starter];
  room.status = "playing";
  room.endedReason = null;
  setAutomatic(room, now);
}
export function viewRoom(
  room: Room,
  tokenHash: string,
  backend: RoomStore["kind"],
): RoomView {
  normalizeRoom(room);
  const me = member(room, tokenHash);
  return {
    id: room.id,
    mode: room.mode ?? "friends",
    code: room.code,
    version: room.version,
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
    hostId: room.hostId,
    status: room.status,
    history: structuredClone(room.history),
    endedReason: room.endedReason,
    roundNumber: room.roundNumber,
    backend,
    me: me.id,
    paused: pausedPlayers(room),
    roundLimit: room.roundLimit,
    matchStartRound: room.matchStartRound,
    matchNumber: room.matchNumber,
    match: {
      round: room.roundNumber ? room.roundNumber - room.matchStartRound + 1 : 1,
      roundLimit: room.roundLimit,
      complete: matchComplete(room),
      standings: standings(room),
      nextRoundAt: room.status === "results" ? room.autoAt : null,
    },
    members: room.members.map((m) => ({
      id: m.id,
      isBot: !!m.isBot,
      name: m.name,
      profile: m.profile ?? DEFAULT_PROFILE,
      role: m.role,
      ready: m.ready,
      joinedAt: m.joinedAt,
      disconnectedAt: m.disconnectedAt,
    })),
    game: room.game ? projectGame(room.game) : null,
  };
}
export class RoomService {
  constructor(
    readonly store: RoomStore,
    readonly now: () => number = Date.now,
  ) {}
  async create(
    name: string,
    tokenHash: string,
    options: { mode?: GameMode; botCount?: number; roundLimit?: RoundLimit; profile?: PlayerProfile } = {},
  ) {
    const now = this.now();
    const mode = options.mode ?? "friends";
    const botCount = options.botCount ?? 2;
    const roundLimit = options.roundLimit ?? DEFAULT_ROUND_LIMIT;
    if (!ROUND_LIMITS.includes(roundLimit)) throw new ApiError(400, "Choose 3, 5, 10, 12, 15 or 20 rounds.");
    if (!["friends", "bots"].includes(mode))
      throw new ApiError(400, "Choose friends or bot mode.");
    if (
      mode === "bots" &&
      (!Number.isInteger(botCount) || botCount < 1 || botCount > 4)
    )
      throw new ApiError(400, "Choose one to four bot opponents.");
    const m: Member = {
      id: randomUUID(),
      tokenHash,
      name: mode === "bots" && !name.trim() ? "You" : name,
      profile: options.profile ?? DEFAULT_PROFILE,
      role: "player",
      ready: mode !== "friends",
      joinedAt: now,
      lastSeen: now,
      disconnectedAt: null,
    };
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = Array.from(
        { length: 6 },
        () => alphabet[randomInt(alphabet.length)],
      ).join("");
      const room: Room = {
        mode,
        id: randomUUID(),
        code,
        version: 0,
        createdAt: now,
        lastActivity: now,
        hostId: m.id,
        members: [m],
        status: "lobby",
        game: null,
        history: [],
        autoAt: null,
        endedReason: null,
        processed: [],
        roundNumber: 0,
        previousStarter: null,
        roundLimit,
        matchStartRound: 1,
        matchNumber: 0,
      };
      if (mode === "bots")
        for (let i = 0; i < botCount; i++)
          room.members.push({
            id: randomUUID(),
            tokenHash: `bot:${randomUUID()}`,
            name: ["Sage", "Cleo", "Atlas", "Juno"][i] + " · Bot",
            role: "player",
            ready: true,
            joinedAt: now + i + 1,
            lastSeen: now,
            disconnectedAt: null,
            isBot: true,
            profile: { icon: PLAYER_ICONS[i + 1], color: PROFILE_COLORS[i] },
          });
      if (mode !== "friends") startRound(room, now);
      if (await this.store.create(room))
        return viewRoom(room, tokenHash, this.store.kind);
    }
    throw new ApiError(503, "A room could not be created. Try again.");
  }
  async join(
    code: string,
    name: string,
    role: Member["role"],
    tokenHash: string,
    profile: PlayerProfile = DEFAULT_PROFILE,
  ) {
    const now = this.now();
    const room = await this.store.update(code, (room) => {
      maintain(room, now);
      const existing = room.members.find((m) => m.tokenHash === tokenHash);
      if (existing) {
        reconnectMember(room, existing, now);
        migrateHost(room);
        return room;
      }
      if (role === "player" && room.mode && room.mode !== "friends")
        throw new ApiError(
          409,
          "This is a practice table. You can join as a spectator.",
        );
      if (room.members.length >= 25)
        throw new ApiError(409, "This room has reached its spectator limit.");
      if (role === "player" && room.status !== "lobby")
        throw new ApiError(
          409,
          "This match has started. Join as a spectator, then request a seat in the lobby.",
        );
      if (
        role === "player" &&
        room.members.filter((m) => m.role === "player").length >= 5
      )
        throw new ApiError(
          409,
          "All five player seats are occupied. You can still spectate.",
        );
      room.members.push({
        id: randomUUID(),
        tokenHash,
        name,
        profile,
        role,
        ready: false,
        joinedAt: now,
        lastSeen: now,
        disconnectedAt: null,
      });
      room.lastActivity = now;
      migrateHost(room);
      return room;
    });
    return viewRoom(room, tokenHash, this.store.kind);
  }
  async read(code: string, tokenHash: string, maintenance = true) {
    const current = await this.store.get(code);
    if (!current)
      throw new ApiError(404, "Room not found. Check the invitation code.");
    normalizeRoom(current);
    member(current, tokenHash);
    checkExpiry(current, this.now());
    const now = this.now();
    const needsMaintenance =
      (current.autoAt !== null &&
        now >= current.autoAt &&
        pausedPlayers(current).length === 0 &&
        (current.status !== "results" || current.members.filter((m) => current.game?.players.some((p) => p.id === m.id)).every((m) => m.disconnectedAt === null))) ||
      current.members.some(
        (m) =>
          (!m.isBot &&
            m.disconnectedAt === null &&
            now - m.lastSeen >= TIMING.stale) ||
          ((current.status === "playing"
            ? current.game?.players.some((p) => p.id === m.id)
            : m.role === "player") &&
            m.disconnectedAt !== null &&
            now >= m.disconnectedAt + TIMING.reconnect),
      );
    const room =
      maintenance && needsMaintenance
        ? await this.store.update(code, (r) => maintain(r, now))
        : current;
    return viewRoom(room, tokenHash, this.store.kind);
  }
  async command(
    code: string,
    tokenHash: string,
    requestId: string,
    command: RoomCommand,
    expectedRound?: number,
  ) {
    const now = this.now();
    let leaving = false;
    const room = await this.store.update(code, (room) => {
      const m = member(room, tokenHash);
      maintain(room, now);
      const key = `${m.id}:${requestId}`;
      if (room.processed.includes(key))
        throw new ApiError(
          409,
          "This request was already completed. Your room state has been refreshed.",
        );
      if (command.type !== "leave") {
        reconnectMember(room, m, now);
      }
      migrateHost(room);
      switch (command.type) {
        case "settings":
          if (room.hostId !== m.id) throw new ApiError(403, "Only the host can change the round limit.");
          if (room.status !== "lobby") throw new ApiError(409, "Round settings can only change in the lobby.");
          if (!ROUND_LIMITS.includes(command.roundLimit)) throw new ApiError(400, "Choose a supported round limit.");
          room.roundLimit = command.roundLimit;
          for (const player of room.members) player.ready = !!player.isBot;
          break;
        case "heartbeat":
          break;
        case "ready":
          if (room.status !== "lobby" || m.role !== "player")
            throw new ApiError(
              409,
              "Ready status can only change in the lobby.",
            );
          m.ready = command.ready;
          break;
        case "start": {
          if (expectedRound !== undefined && expectedRound !== room.roundNumber)
            throw new ApiError(
              409,
              "That start request is stale. Refresh the room before starting another round.",
            );
          if (room.hostId !== m.id)
            throw new ApiError(403, "Only the host can start a round.");
          if (room.status === "playing")
            throw new ApiError(409, "A round is already in progress.");
          startRound(room, now);
          break;
        }
        case "game":
          if (room.status !== "playing" || !room.game)
            throw new ApiError(409, "There is no active round.");
          if (m.role !== "player")
            throw new ApiError(403, "Spectators cannot make player decisions.");
          if (pausedPlayers(room).length)
            throw new ApiError(
              409,
              "The match is paused while a player reconnects.",
            );
          room.game = act(room.game, m.id, command.action, randomInt);
          setAutomatic(room, now);
          break;
        case "lobby":
          if (room.hostId !== m.id)
            throw new ApiError(403, "Only the host can return the table to the lobby.");
          if (room.status === "playing")
            throw new ApiError(
              409,
              "Finish or leave the current match before returning to the lobby.",
            );
          room.status = "lobby";
          room.autoAt = null;
          room.endedReason = null;
          // Keep the previous game and history until the next round explicitly starts.
          for (const player of room.members) player.ready = !!player.isBot;
          break;
        case "claim":
          if (room.mode && room.mode !== "friends")
            throw new ApiError(
              409,
              "Practice tables are reserved for their original player.",
            );
          if (room.status !== "lobby")
            throw new ApiError(
              409,
              "Player seats can only be claimed between matches in the lobby.",
            );
          if (m.role === "player")
            throw new ApiError(409, "You already have a player seat.");
          if (room.members.filter((m) => m.role === "player").length >= 5)
            throw new ApiError(409, "All player seats are occupied.");
          m.role = "player";
          m.ready = false;
          migrateHost(room);
          break;
        case "leave":
          if ((room.status === "playing" || (room.status === "results" && !matchComplete(room))) && m.role === "player")
            endMatch(
              room,
              `${m.name} left the match. Completed round history is preserved.`,
            );
          room.members = room.members.filter((p) => p.id !== m.id);
          migrateHost(room);
          leaving = true;
          break;
      }
      room.lastActivity = now;
      if (command.type !== "heartbeat")
        room.processed = [...room.processed, key].slice(-1024);
      return room;
    });
    return leaving ? null : viewRoom(room, tokenHash, this.store.kind);
  }
  async sweep() {
    const codes = await this.store.listActive();
    const results = await Promise.allSettled(
      codes.map((code) =>
        this.store.update(code, (r) => maintain(r, this.now())),
      ),
    );
    return {
      rooms: codes.length,
      failed: results.filter((r) => r.status === "rejected").length,
    };
  }
}
