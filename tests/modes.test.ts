import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  act,
  advance,
  assertInventory,
  makeRound,
  makeSoloRound,
  projectGame,
} from "@/game/engine";
import { botDecision } from "@/game/bot";
import { rulesFor, TIMING } from "@/game/config";
import { MemoryStore } from "@/server/store";
import { hashToken, RoomService } from "@/server/rooms";

describe("solo and computer opponents", () => {
  it("keeps one-player practice separate from official 2–5-player rounds", () => {
    expect(() => makeRound(["solo"], 1, 0, () => 0)).toThrow("2–5");
    let game = makeSoloRound("solo", 1, () => 0);
    expect(game.target).toBe(80);
    expect(game.burns).toHaveLength(1);
    game = advance(game, () => 0);
    game = act(
      game,
      "solo",
      { type: "select", count: 8, round: 1, phase: game.phase },
      () => 0,
    );
    game = advance(
      advance(game, () => 0),
      () => 0,
    );
    game = act(
      game,
      "solo",
      { type: "add", count: 3, round: 1, phase: game.phase },
      () => 0,
    );
    game = advance(game, () => 0);
    game = act(
      game,
      "solo",
      { type: "add", count: 1, round: 1, phase: game.phase },
      () => 0,
    );
    game = advance(game, () => 0);
    assertInventory(game);
    expect(game.phase).toBe("round_results");
    expect(game.deck).toHaveLength(39);
    expect(game.results[0].distance).toBe(
      Math.abs(game.results[0].total - game.target),
    );
  });
  it.each([0, 5, 1.5, NaN])(
    "rejects invalid bot count %s at the service boundary",
    async (botCount) => {
      await expect(
        new RoomService(new MemoryStore()).create(
          "Guest",
          hashToken(randomUUID()),
          { mode: "bots", botCount },
        ),
      ).rejects.toThrow("one to four");
    },
  );
  it.each([0, 1, 2, 3, 4])(
    "completes and rematches a server-authoritative practice table with %s bots",
    async (botCount) => {
      let now = 1000000;
      const store = new MemoryStore(),
        service = new RoomService(store, () => now),
        token = hashToken(randomUUID());
      let room = await service.create("Human", token, {
        mode: botCount ? "bots" : "solo",
        botCount: botCount || undefined,
      });
      const send = (command: Parameters<RoomService["command"]>[3]) =>
        service.command(room.code, token, randomUUID(), command);
      expect(room.game!.players).toHaveLength(botCount + 1);
      expect(room.mode).toBe(botCount ? "bots" : "solo");
      expect(room.members.filter((m) => m.isBot)).toHaveLength(botCount);
      for (let step = 0; step < 100 && room.status === "playing"; step++) {
        now += 1300;
        room = (await send({ type: "heartbeat" }))!;
        const game = room.game!,
          own = game.players.find((p) => p.id === room.me)!;
        if (game.phase === "initial_selection" && !own.committed)
          room = (await send({
            type: "game",
            action: {
              type: "select",
              count: rulesFor(game.players.length).initial[0],
              round: game.round,
              phase: game.phase,
            },
          }))!;
        else if (game.activePlayerId === room.me)
          room = (await send({
            type: "game",
            action: {
              type: "add",
              count: game.phase === "first_additions" ? 3 : own.cap,
              round: game.round,
              phase: game.phase,
            },
          }))!;
        for (const bot of room.game!.players.filter((p) => p.id !== room.me))
          expect(
            bot.hand.filter((c) => !c.public).every((c) => c.card === null),
          ).toBe(true);
      }
      expect(room.status).toBe("results");
      expect(room.history).toHaveLength(1);
      assertInventory((await store.get(room.code))!.game!);
      const spectator = hashToken(randomUUID());
      await service.join(room.code, "Watcher", "spectator", spectator);
      await expect(
        service.command(room.code, spectator, randomUUID(), { type: "claim" }),
      ).rejects.toThrow("reserved");
      await expect(
        service.join(room.code, "Intruder", "player", hashToken(randomUUID())),
      ).rejects.toThrow("practice table");
      room = (await send({ type: "lobby" }))!;
      expect(room.members.filter((m) => m.isBot).every((m) => m.ready)).toBe(
        true,
      );
      expect(room.members.find((m) => m.id === room.me)!.ready).toBe(false);
      await send({ type: "ready", ready: true });
      room = (await send({ type: "start" }))!;
      expect(room.game!.round).toBe(2);
      expect(room.history).toHaveLength(1);
      expect(room.hostId).toBe(room.me); // A bot can never become host.
    },
  );
  it("pauses bot decisions during a human's grace period and ends without bot-host takeover", async () => {
    let now = 1000000;
    const service = new RoomService(new MemoryStore(), () => now),
      token = hashToken(randomUUID()),
      spectator = hashToken(randomUUID());
    const created = await service.create("Human", token, {
      mode: "bots",
      botCount: 4,
    });
    await service.join(created.code, "Watcher", "spectator", spectator);
    now += TIMING.stale + 1;
    let paused = (await service.command(created.code, spectator, randomUUID(), {
      type: "heartbeat",
    }))!;
    expect(paused.paused).toHaveLength(1);
    expect(paused.hostId).toBeNull();
    expect(
      paused.members
        .filter((m) => m.isBot)
        .every((m) => m.disconnectedAt === null),
    ).toBe(true);
    const snapshot = paused.game;
    now += 5000;
    paused = (await service.command(created.code, spectator, randomUUID(), {
      type: "heartbeat",
    }))!;
    expect(paused.game).toEqual(snapshot);
    now += TIMING.reconnect;
    const ended = await service.read(created.code, spectator);
    expect(ended.status).toBe("abandoned");
    expect(ended.game).toEqual(snapshot);
  });
  it("bots cannot use opponents' hidden identities or deck order", () => {
    let game = advance(
      makeRound(["bot", "human"], 1, 0, () => 0),
      () => 0,
    );
    for (const id of game.order)
      game = act(
        game,
        id,
        { type: "select", count: 8, phase: game.phase, round: 1 },
        () => 0,
      );
    game = advance(
      advance(game, () => 0),
      () => 0,
    );
    const before = projectGame(game, "bot");
    const hidden = game.players[1].hand.find((c) => !c.revealed)!;
    [hidden.card, game.deck[0]] = [game.deck[0], hidden.card];
    game.deck.reverse();
    const after = projectGame(game, "bot");
    expect(after).toEqual(before);
    expect(botDecision(after, "bot")).toEqual(botDecision(before, "bot"));
    expect(botDecision(after, "human")).toBeNull();
  });
});
