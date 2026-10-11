import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/server/store";
import { hashToken, RoomService } from "@/server/rooms";
import { TIMING } from "@/game/config";
import type { RoomCommand } from "@/server/types";
import { nameSchema, commandSchema } from "@/server/http";

describe("authoritative rooms", () => {
  let clock: number, store: MemoryStore, rooms: RoomService;
  const a = hashToken("a"),
    b = hashToken("b"),
    s = hashToken("spectator");
  beforeEach(() => {
    clock = 1000000;
    store = new MemoryStore();
    rooms = new RoomService(store, () => clock);
  });
  const command = (
    code: string,
    who: string,
    cmd: RoomCommand,
    request = randomUUID(),
  ) => rooms.command(code, who, request, cmd);
  async function pair() {
    const r = await rooms.create("Ayer", a);
    await rooms.join(r.code, "Mika", "player", b);
    await command(r.code, a, { type: "ready", ready: true });
    await command(r.code, b, { type: "ready", ready: true });
    return await rooms.read(r.code, a);
  }
  async function start() {
    const r = await pair();
    return (await command(r.code, a, { type: "start" }))!;
  }
  it("creates a real room and joins idempotently with a recoverable identity", async () => {
    const r = await pair();
    expect(r.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(r.members).toHaveLength(2);
    const joined = await rooms.join(r.code, "Different name", "player", a);
    expect(joined.me).toBe(r.me);
    expect(joined.members).toHaveLength(2);
    expect(JSON.stringify(joined)).not.toContain("tokenHash");
  });
  it("rejects invalid rooms and unauthorized retrieval", async () => {
    const r = await pair();
    await expect(rooms.read(r.code, s)).rejects.toThrow("participant");
    await expect(rooms.read("XXXXXX", a)).rejects.toThrow("not found");
  });
  it("enforces host, readiness, and minimum players", async () => {
    const r = await rooms.create("Ayer", a);
    await expect(command(r.code, a, { type: "start" })).rejects.toThrow("2–5");
    await rooms.join(r.code, "Mika", "player", b);
    await expect(command(r.code, b, { type: "start" })).rejects.toThrow("host");
    await expect(command(r.code, a, { type: "start" })).rejects.toThrow(
      "ready",
    );
  });
  it("concurrent joins cannot overfill five seats", async () => {
    const r = await rooms.create("Ayer", a);
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        rooms.join(r.code, `Guest ${i}`, "player", hashToken(String(i))),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    expect((await rooms.read(r.code, a)).members).toHaveLength(5);
  });
  it("concurrent selections both commit without losing state; duplicates are rejected", async () => {
    const r = await start();
    clock += 1300;
    await rooms.read(r.code, a);
    const request = randomUUID(),
      cmd = {
        type: "game" as const,
        action: {
          type: "select" as const,
          count: 8,
          phase: "initial_selection" as const,
          round: 1,
        },
      };
    await Promise.all([
      command(r.code, a, cmd, request),
      command(r.code, b, cmd),
    ]);
    const after = await rooms.read(r.code, a);
    expect(after.game?.phase).toBe("initial_deal");
    expect(after.game?.players.map((p) => p.hand.length)).toEqual([8, 8]);
    await expect(command(r.code, a, cmd, request)).rejects.toThrow(
      "already completed",
    );
    expect((await rooms.read(r.code, a)).game?.deckCount).toBe(34);
  });
  it("permits late spectators, denies their actions and mid-round seat claims", async () => {
    const r = await start();
    await expect(rooms.join(r.code, "Sam", "player", s)).rejects.toThrow(
      "spectator",
    );
    const spectator = await rooms.join(r.code, "Sam", "spectator", s);
    expect(spectator.members.find((m) => m.id === spectator.me)?.role).toBe(
      "spectator",
    );
    await expect(command(r.code, s, { type: "claim" })).rejects.toThrow(
      "between rounds",
    );
    await expect(
      command(r.code, s, {
        type: "game",
        action: { type: "select", count: 8, phase: "burn", round: 1 },
      }),
    ).rejects.toThrow("Spectators");
  });
  it("pauses after missed heartbeat, migrates host, resumes within 90 seconds without taking actions", async () => {
    const r = await start();
    clock += TIMING.stale + 1;
    await command(r.code, b, { type: "heartbeat" });
    const paused = await rooms.read(r.code, b);
    expect(paused.paused.map((p) => p.name)).toEqual(["Ayer"]);
    expect(paused.hostId).not.toBe(r.hostId);
    const phase = paused.game?.phase;
    clock += 60000;
    await command(r.code, b, { type: "heartbeat" });
    const back = (await command(r.code, a, { type: "heartbeat" }))!;
    expect(back.paused).toHaveLength(0);
    expect(back.game?.phase).toBe(phase);
    expect(back.game?.players.every((p) => !p.committed)).toBe(true);
    clock += 1;
    expect((await rooms.read(r.code, a)).status).toBe("playing");
  });
  it("ends a match at the grace deadline, preserves room/history, permits a new lobby", async () => {
    const r = await start();
    clock += TIMING.stale + 1;
    await command(r.code, b, { type: "heartbeat" });
    clock += TIMING.reconnect;
    const ended = (await command(r.code, b, { type: "heartbeat" }))!;
    expect(ended.status).toBe("abandoned");
    expect(ended.endedReason).toContain("90 seconds");
    expect(ended.game?.players.every((p) => p.hand.length === 0)).toBe(true);
    const lobby = (await command(r.code, b, { type: "lobby" }))!;
    expect(lobby.status).toBe("lobby");
    expect(lobby.code).toBe(r.code);
  });
  it("permanent host departure transfers deterministically and ends the active match", async () => {
    const r = await start(),
      other = r.members.find((m) => m.id !== r.me)!;
    await command(r.code, a, { type: "leave" });
    const state = await rooms.read(r.code, b);
    expect(state.hostId).toBe(other.id);
    expect(state.status).toBe("abandoned");
    expect(state.members).toHaveLength(1);
    await expect(rooms.read(r.code, a)).rejects.toThrow("participant");
  });
  it("has no decision countdown, expiry, or automatic strategic decisions while heartbeats continue", async () => {
    const r = await start();
    clock += 1500;
    await rooms.read(r.code, a);
    for (let i = 0; i < 60; i++) {
      clock += 10000;
      await command(r.code, a, { type: "heartbeat" });
      await command(r.code, b, { type: "heartbeat" });
    }
    const state = await rooms.read(r.code, a);
    expect(state.game?.phase).toBe("initial_selection");
    expect(state.game?.players.every((p) => !p.committed)).toBe(true);
  });
  it("a disconnected spectator neither pauses the match nor causes repeated maintenance writes", async () => {
    const r = await start();
    await rooms.join(r.code, "Observer", "spectator", s);
    for (let i = 0; i < 14; i++) {
      clock += 10000;
      await command(r.code, a, { type: "heartbeat" });
      await command(r.code, b, { type: "heartbeat" });
    }
    const current = await rooms.read(r.code, a),
      next = await rooms.read(r.code, a);
    expect(current.paused).toHaveLength(0);
    expect(next.version).toBe(current.version);
    expect(next.game!.phase).toBe("initial_selection");
    expect(
      next.members.find((m) => m.role === "spectator")!.disconnectedAt,
    ).not.toBeNull();
  });
  it("expired seat reservations cannot deadlock a full lobby after other players disappear", async () => {
    const r = await rooms.create("Host", a);
    for (let i = 0; i < 4; i++)
      await rooms.join(
        r.code,
        `Absent ${i}`,
        "player",
        hashToken(`absent-${i}`),
      );
    for (let i = 0; i < 12; i++) {
      clock += 10000;
      await command(r.code, a, { type: "heartbeat" });
    }
    const reclaimed = await rooms.join(r.code, "New friend", "player", b);
    expect(reclaimed.members.filter((m) => m.role === "player")).toHaveLength(
      2,
    );
    expect(
      reclaimed.members.filter((m) => m.role === "spectator"),
    ).toHaveLength(4);
    expect(reclaimed.hostId).toBe(r.hostId);
  });
  it("completes a match, saves results, rotates starter, lets a spectator claim between rounds", async () => {
    let r = await start();
    const code = r.code,
      first = r.game!.order[0];
    for (let tries = 0; tries < 30 && r.status !== "results"; tries++) {
      const g = r.game!;
      if (g.phase === "initial_selection")
        for (const t of [a, b])
          await command(code, t, {
            type: "game",
            action: {
              type: "select",
              count: 8,
              round: g.round,
              phase: g.phase,
            },
          });
      else if (g.activePlayerId)
        await command(code, g.activePlayerId === r.me ? a : b, {
          type: "game",
          action: { type: "add", count: 0, round: g.round, phase: g.phase },
        });
      clock += 1300;
      r = await rooms.read(code, a);
    }
    expect(r.status).toBe("results");
    expect(r.history).toHaveLength(1);
    expect(
      r.game?.players.every((p) => p.hand.every((c) => c.card !== null)),
    ).toBe(true);
    await command(code, a, { type: "start" });
    r = await rooms.read(code, a);
    expect(r.game!.order[0]).not.toBe(first);
    expect(r.history).toHaveLength(1);
    await command(code, b, { type: "leave" });
    await command(code, a, { type: "lobby" });
    await rooms.join(code, "Sam", "spectator", s);
    const seated = (await command(code, s, { type: "claim" }))!;
    expect(seated.members.find((m) => m.id === seated.me)?.role).toBe("player");
  });
  it("rate limits requests and resets expired buckets", async () => {
    expect(await store.rate("a", 1, 60)).toBe(true);
    expect(await store.rate("a", 1, 60)).toBe(false);
  });
  it("heartbeats cannot evict a decision's duplicate protection; old start requests stay stale", async () => {
    const r = await pair(),
      startId = randomUUID();
    await rooms.command(r.code, a, startId, { type: "start" }, 0);
    for (let i = 0; i < 300; i++)
      await command(r.code, a, { type: "heartbeat" });
    await expect(
      rooms.command(r.code, a, startId, { type: "start" }, 0),
    ).rejects.toThrow("already completed");
    await expect(
      rooms.command(r.code, a, randomUUID(), { type: "start" }, 0),
    ).rejects.toThrow("stale");
  });
  it.each([3, 4, 5])(
    "completes a real %i-player room at maximum draws with all cards conserved",
    async (n) => {
      const tokens = Array.from({ length: n }, (_, i) =>
        hashToken(`multi-${i}`),
      );
      let r = await rooms.create("Host", tokens[0]);
      for (let i = 1; i < n; i++)
        await rooms.join(r.code, `Player ${i}`, "player", tokens[i]);
      for (const who of tokens)
        await command(r.code, who, { type: "ready", ready: true });
      r = (await command(r.code, tokens[0], { type: "start" }))!;
      const ids = new Map(r.members.map((m, i) => [m.id, tokens[i]]));
      const max = ({ 3: 10, 4: 7, 5: 5 } as Record<number, number>)[n];
      for (let tries = 0; tries < 50 && r.status !== "results"; tries++) {
        const g = r.game!;
        if (g.phase === "initial_selection")
          await Promise.all(
            tokens.map((who) =>
              command(r.code, who, {
                type: "game",
                action: {
                  type: "select",
                  count: max,
                  round: g.round,
                  phase: g.phase,
                },
              }),
            ),
          );
        else if (g.activePlayerId)
          await command(r.code, ids.get(g.activePlayerId)!, {
            type: "game",
            action: {
              type: "add",
              count: g.phase === "first_additions" ? 3 : 1,
              round: g.round,
              phase: g.phase,
            },
          });
        clock += 1300;
        r = await rooms.read(r.code, tokens[0]);
      }
      expect(r.status).toBe("results");
      expect(r.game!.deckCount).toBe(52 - n * (max + 5));
      expect(
        r.game!.players.every(
          (p) => p.hand.length === max + 4 && p.hand.every((c) => c.public),
        ),
      ).toBe(true);
      const cards = r.game!.players.flatMap((p) =>
        p.hand.map((c) => c.card!.id),
      );
      expect(new Set(cards).size).toBe(cards.length);
      expect(r.history).toHaveLength(1);
    },
  );
  it("normalizes and validates names and rejects forged command properties", () => {
    expect(nameSchema.parse("  Ayer   Smith  ")).toBe("Ayer Smith");
    expect(() => nameSchema.parse("<script>evil</script>")).toThrow();
    expect(() =>
      commandSchema.parse({
        requestId: randomUUID(),
        command: { type: "start", deck: [] },
      }),
    ).toThrow();
  });
});
