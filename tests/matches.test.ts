import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { RULES, ROUND_LIMITS, TIMING } from "@/game/config";
import { score } from "@/game/engine";
import { DEFAULT_PROFILE } from "@/game/profile";
import { commandSchema, profileSchema } from "@/server/http";
import { hashToken, RoomService, standings } from "@/server/rooms";
import { MemoryStore } from "@/server/store";
import type { Room, RoomCommand, RoomView } from "@/server/types";
import type { Result } from "@/game/types";

describe("multi-round matches", () => {
  let now: number, store: MemoryStore, service: RoomService;
  const a = hashToken("host"), b = hashToken("friend"), watcher = hashToken("watcher");
  beforeEach(() => { now = 1_000_000; store = new MemoryStore(); service = new RoomService(store, () => now); });
  const send = (code: string, who: string, command: RoomCommand) => service.command(code, who, randomUUID(), command);
  async function create(roundLimit = 3 as (typeof ROUND_LIMITS)[number]) {
    const room = await service.create("Host", a, { roundLimit, profile: { icon: "king", color: "#7650A8" } });
    await service.join(room.code, "Friend", "player", b, { icon: "hearts", color: "#D12C50" });
    await send(room.code, a, { type: "ready", ready: true });
    await send(room.code, b, { type: "ready", ready: true });
    return (await send(room.code, a, { type: "start" }))!;
  }
  async function keepAlive(code: string, milliseconds: number) {
    const end = now + milliseconds;
    while (now < end) {
      now = Math.min(end, now + 5000);
      for (const who of [a, b]) await send(code, who, { type: "heartbeat" });
    }
    return service.read(code, a);
  }
  async function finishRound(room: RoomView) {
    for (let step = 0; room.status === "playing" && step < 100; step++) {
      const game = room.game!;
      if (game.phase === "initial_selection") {
        for (const who of [a, b]) await send(room.code, who, { type: "game", action: { type: "select", count: RULES[2].initial[0], round: game.round, phase: game.phase } });
      } else if (game.activePlayerId) {
        await send(room.code, game.activePlayerId === room.me ? a : b, { type: "game", action: { type: "add", count: 0, round: game.round, phase: game.phase } });
      }
      room = await keepAlive(room.code, 1600);
    }
    expect(room.status).toBe("results");
    return room;
  }
  it.each(ROUND_LIMITS)("finishes exactly %i rounds, accumulates points once, and resets only for a new match", async (limit) => {
    let room = await create(limit);
    const totals = new Map<string, number>();
    for (let round = 1; round <= limit; round++) {
      expect(room.match.round).toBe(round);
      room = await finishRound(room);
      expect(room.match.complete).toBe(round === limit);
      for (const result of room.game!.results) totals.set(result.playerId, (totals.get(result.playerId) ?? 0) + result.points);
      for (const row of room.match.standings) expect(row.points).toBe(totals.get(row.playerId));
      const count = room.history.length;
      for (let poll = 0; poll < 3; poll++) await service.read(room.code, a);
      expect((await service.read(room.code, a)).history).toHaveLength(count);
      if (round < limit) {
        const before = room.game!.order[0];
        room = await keepAlive(room.code, TIMING.nextRound);
        expect(room.status).toBe("playing");
        expect(room.game!.order[0]).not.toBe(before);
      }
    }
    expect(room.match.nextRoundAt).toBeNull();
    expect((await keepAlive(room.code, TIMING.nextRound * 2)).status).toBe("results");
    await expect(send(room.code, a, { type: "start" })).rejects.toThrow("complete");
    await send(room.code, a, { type: "lobby" });
    for (const who of [a, b]) await send(room.code, who, { type: "ready", ready: true });
    room = (await send(room.code, a, { type: "start" }))!;
    expect(room.match.round).toBe(1);
    expect(room.matchNumber).toBe(2);
    expect(room.match.standings.every((row) => row.points === 0 && row.streak === 0)).toBe(true);
    expect(room.history).toHaveLength(limit);
  });
  it("validates round settings, protects them from guests, and requires readiness again after changes", async () => {
    const room = await service.create("Host", a);
    await service.join(room.code, "Friend", "player", b);
    await send(room.code, b, { type: "ready", ready: true });
    await expect(send(room.code, b, { type: "settings", roundLimit: 10 })).rejects.toThrow("host");
    const updated = (await send(room.code, a, { type: "settings", roundLimit: 12 }))!;
    expect(updated.roundLimit).toBe(12);
    expect(updated.members.every((m) => !m.ready)).toBe(true);
    expect(() => commandSchema.parse({ requestId: randomUUID(), command: { type: "settings", roundLimit: 7 } })).toThrow();
    await expect(service.create("Host", a, { roundLimit: 7 as 3 })).rejects.toThrow("Choose");
    for (const who of [a, b]) await send(room.code, who, { type: "ready", ready: true });
    await send(room.code, a, { type: "start" });
    await expect(send(room.code, a, { type: "settings", roundLimit: 3 })).rejects.toThrow("lobby");
  });
  it("persists chosen profiles, reserves the match roster, and allows seats again in the lobby", async () => {
    const room = await finishRound(await create());
    expect(room.members.find((m) => m.id === room.me)?.profile).toEqual({ icon: "king", color: "#7650A8" });
    const watch = await service.join(room.code, "Watcher", "spectator", watcher, { icon: "queen", color: "#B85B76" });
    await expect(send(room.code, watcher, { type: "claim" })).rejects.toThrow("lobby");
    expect(watch.match.standings).toHaveLength(2);
    await expect(service.join(room.code, "New player", "player", hashToken("new"))).rejects.toThrow("spectator");
    await send(room.code, a, { type: "lobby" });
    const joined = (await send(room.code, watcher, { type: "claim" }))!;
    expect(joined.members.find((m) => m.id === joined.me)?.profile?.icon).toBe("queen");
    expect(profileSchema.parse(DEFAULT_PROFILE)).toEqual(DEFAULT_PROFILE);
    expect(() => profileSchema.parse({ icon: "king", color: "url(evil)" })).toThrow();
    expect(() => profileSchema.parse({ icon: "script", color: "#000000" })).toThrow();
  });
  it("waits the full reveal hold, exposes one face per transition, and never publishes results early", async () => {
    let room = await create();
    while (room.game!.phase !== "final_reveal") {
      const game = room.game!;
      if (game.phase === "initial_selection") {
        for (const who of [a, b]) await send(room.code, who, { type: "game", action: { type: "select", count: 7, round: 1, phase: game.phase } });
      } else if (game.activePlayerId) await send(room.code, game.activePlayerId === room.me ? a : b, { type: "game", action: { type: "add", count: 0, round: 1, phase: game.phase } });
      room = await keepAlive(room.code, 1200);
    }
    const hidden = () => room.game!.players.flatMap((p) => p.hand).filter((c) => !c.public).length;
    while (hidden()) {
      const before = hidden();
      room = await keepAlive(room.code, TIMING.finalCard);
      expect(hidden()).toBe(before - 1);
      expect(room.game!.results).toEqual([]);
      expect(room.history).toHaveLength(0);
    }
    room = await keepAlive(room.code, TIMING.finalHold - 1);
    expect(room.game!.phase).toBe("final_reveal");
    room = await keepAlive(room.code, 1);
    expect(room.game!.phase).toBe("round_results");
    expect(room.match.nextRoundAt).toBe(now + TIMING.nextRound);
  });
  it("pauses automatic next rounds for disconnects, and ends the match if the player never returns", async () => {
    let room = await finishRound(await create());
    for (let step = 0; step < 7; step++) { now += 5000; await send(room.code, a, { type: "heartbeat" }); }
    room = await service.read(room.code, a);
    expect(room.status).toBe("results");
    expect(room.paused).toHaveLength(1);
    expect(room.roundNumber).toBe(1);
    await send(room.code, b, { type: "heartbeat" });
    room = await service.read(room.code, a);
    expect(room.roundNumber).toBe(2);
    room = await finishRound(room);
    for (let step = 0; step < 24; step++) { now += 5000; await send(room.code, a, { type: "heartbeat" }); }
    expect((await service.read(room.code, a)).status).toBe("abandoned");
    expect((await service.read(room.code, a)).history).toHaveLength(2);
  });
  it("counts shared wins toward streaks, resets on a loss, and ranks match ties equally", async () => {
    const created = await create();
    const room = (await store.get(created.code))!;
    const ids = room.members.map((m) => m.id);
    room.history = [1, 2, 3].map((round) => ({ round, target: 100, deckCount: 10, completedAt: now, results: score(ids.map((playerId, i) => ({ playerId, total: i ? 101 : 99 })), 100).results.map((r) => ({ ...r, name: room.members.find((m) => m.id === r.playerId)!.name })) }));
    expect(standings(room).map((r) => [r.points, r.streak, r.rank])).toEqual([[6, 3, 1], [6, 3, 1]]);
    room.history.push({ round: 4, target: 100, deckCount: 10, completedAt: now, results: score(ids.map((playerId, i) => ({ playerId, total: i ? 100 : 110 })), 100).results.map((r) => ({ ...r, name: "Player" })) });
    expect(standings(room).find((r) => r.playerId === ids[0])?.streak).toBe(0);
    expect(standings(room).find((r) => r.playerId === ids[1])?.streak).toBe(4);
  });
  it.each(["leave", "expire"])("recovers the lobby when every match player loses their seat via %s", async (reason) => {
    const room = await finishRound(await create());
    await service.join(room.code, "Watcher", "spectator", watcher);
    if (reason === "leave") for (const who of [a, b]) await send(room.code, who, { type: "leave" });
    else now += TIMING.stale + TIMING.reconnect + 1;
    const recovered = (await send(room.code, watcher, { type: "heartbeat" }))!;
    expect(recovered.status).toBe("lobby");
    expect(recovered.history).toHaveLength(1);
    const seated = (await send(room.code, watcher, { type: "claim" }))!;
    expect(seated.hostId).toBe(seated.me);
    expect(seated.match.nextRoundAt).toBeNull();
  });
  it("upgrades existing stored rooms and fixes their old below-versus-above results", async () => {
    const finished = await finishRound(await create());
    await store.update(finished.code, (room) => {
      for (const key of ["roundLimit", "matchStartRound", "matchNumber"] as const) delete (room as Partial<Room>)[key];
      room.game!.target = room.history[0].target = 100;
      room.game!.results = room.history[0].results.map((r, i) => {
        const legacy: Partial<Result> = { ...r, total: i ? 101 : 99, distance: 1, side: i ? "above" : "below", winner: i === 0 };
        delete legacy.points; delete legacy.rank;
        return legacy as Result;
      });
      room.history[0].results = room.game!.results.map((r) => ({ ...r, name: "Former name" }));
      room.game!.tiebreakApplied = true;
      return room;
    });
    const upgraded = await service.read(finished.code, a);
    expect(upgraded.roundLimit).toBe(5);
    expect(upgraded.game!.tiebreakApplied).toBe(false);
    expect(upgraded.game!.results.map((r) => [r.winner, r.points])).toEqual([[true, 2], [true, 2]]);
    expect(upgraded.history[0].results.every((r) => r.winner && r.name === "Former name")).toBe(true);
    expect(upgraded.match.standings.map((r) => r.points)).toEqual([2, 2]);
  });
});
