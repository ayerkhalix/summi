import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  act,
  advance,
  assertInventory,
  makeRound,
  projectGame,
} from "@/game/engine";
import { botDecision } from "@/game/bot";
import { rulesFor, TIMING } from "@/game/config";
import { MemoryStore } from "@/server/store";
import { hashToken, RoomService } from "@/server/rooms";

describe("computer opponents", () => {
  it("requires an opponent for every round", () => {
    expect(() => makeRound(["human"], 1, 0, () => 0)).toThrow("2–5");
  });
  it("rejects the removed solo mode at the service boundary", async () => {
    await expect(new RoomService(new MemoryStore()).create(
      "Guest", hashToken(randomUUID()),
      { mode: "solo" as "bots" },
    )).rejects.toThrow("Choose friends or bot mode.");
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
  it.each([1, 2, 3, 4])(
    "completes and rematches a server-authoritative practice table with %s bots",
    async (botCount) => {
      let now = 1000000;
      const store = new MemoryStore(),
        service = new RoomService(store, () => now),
        token = hashToken(randomUUID());
      let room = await service.create("Human", token, {
        mode: "bots",
        botCount,
      });
      const send = (command: Parameters<RoomService["command"]>[3]) =>
        service.command(room.code, token, randomUUID(), command);
      expect(room.game!.players).toHaveLength(botCount + 1);
      expect(room.mode).toBe("bots");
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
        for (const player of room.game!.players)
          expect(
            player.hand.filter((c) => !c.public).every((c) => c.card === null),
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
    const back = (await service.command(created.code, token, randomUUID(), { type: "heartbeat" }))!;
    expect(back.status).toBe("abandoned");
    expect(back.me).toBe(created.me);
    expect(back.members.find((m) => m.id === back.me)?.role).toBe("player");
    expect(back.hostId).toBe(back.me);
    await expect(service.command(created.code, spectator, randomUUID(), { type: "claim" })).rejects.toThrow("reserved");
    await service.command(created.code, token, randomUUID(), { type: "lobby" });
    await service.command(created.code, token, randomUUID(), { type: "ready", ready: true });
    const next = (await service.command(created.code, token, randomUUID(), { type: "start" }, 1))!;
    expect(next.game?.round).toBe(2);
    expect(next.members.filter((m) => m.role === "player")).toHaveLength(5);
  });
  it("bots cannot use any hidden identities or deck order", () => {
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
    const before = projectGame(game);
    const hidden = game.players[1].hand.find((c) => !c.revealed)!;
    [hidden.card, game.deck[0]] = [game.deck[0], hidden.card];
    const ownHidden = game.players[0].hand.find((c) => !c.revealed)!;
    [ownHidden.card, game.deck[1]] = [game.deck[1], ownHidden.card];
    game.deck.reverse();
    const after = projectGame(game);
    expect(after).toEqual(before);
    expect(botDecision(after, "bot")).toEqual(botDecision(before, "bot"));
    expect(botDecision(after, "human")).toBeNull();
  });
});
