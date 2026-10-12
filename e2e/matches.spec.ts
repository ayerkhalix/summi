import { expect, test, type Page } from "@playwright/test";
import type { RoomView } from "../src/server/types";
import { score } from "../src/game/engine";

async function state(page: Page, code: string): Promise<RoomView> {
  const response = await page.request.get(`/api/rooms/${code}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

test("custom identity, sequential final reveals, automatic next rounds and final match standings", async ({ page }) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Play with bots", exact: true }).click();
  await page.getByRole("button", { name: "1 bot", exact: true }).click();
  await page.getByRole("button", { name: "King icon", exact: true }).click();
  await page.getByLabel("Custom icon color").fill("#719fbb");
  await page.getByLabel("Match length").selectOption("3");
  await page.getByRole("button", { name: "Start bot match", exact: true }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
  const code = page.url().split("/").at(-1)!;
  let room = await state(page, code);
  expect(room.backend).toBe(process.env.PLAYWRIGHT_BACKEND || "local");
  expect(room.members.find((m) => m.id === room.me)?.profile).toEqual({ icon: "king", color: "#719fbb" });
  expect(room.roundLimit).toBe(3);
  let sawReveal = false, sawHold = false;
  let resultAt = 0;
  const pointTotals = new Map<string, number>();
  for (let round = 1; round <= 3; round++) {
    let hiddenBefore: number | undefined, lastCardAt = 0;
    for (let step = 0; step < 100; step++) {
      room = await state(page, code);
      const game = room.game!;
      expect(room.match.round).toBe(round);
      if (room.status === "results") { resultAt = Date.now(); break; }
      if (game.phase === "initial_selection" && !game.players.find((p) => p.id === room.me)!.committed) {
        await page.getByRole("button", { name: "Confirm 7 cards" }).click();
      } else if (game.activePlayerId === room.me) {
        await page.getByRole("button", { name: "Confirm pass" }).click();
      }
      if (game.phase === "final_reveal") {
        sawReveal = true;
        const hidden = game.players.flatMap((p) => p.hand).filter((c) => !c.public).length;
        expect(game.results).toEqual([]);
        for (const player of game.players) expect(player.hand.filter((c) => !c.public).every((c) => c.card === null)).toBe(true);
        if (hiddenBefore !== undefined) expect(hiddenBefore - hidden).toBeLessThanOrEqual(1);
        hiddenBefore = hidden;
        if (!hidden && !lastCardAt) {
          lastCardAt = Date.now(); sawHold = true;
          await expect(page.getByRole("region", { name: "Dramatic final reveal" })).toBeVisible();
          await expect(page.getByRole("region", { name: "Round results", exact: true })).toHaveCount(0);
          if (round === 1) await page.screenshot({ path: "test-results/final-reveal-desktop.png", fullPage: true });
        }
      }
      await page.waitForTimeout(800);
    }
    expect(room.status).toBe("results");
    expect(resultAt - lastCardAt).toBeGreaterThanOrEqual(2800);
    for (const result of room.game!.results) pointTotals.set(result.playerId, (pointTotals.get(result.playerId) ?? 0) + result.points);
    for (const row of room.match.standings) expect(row.points).toBe(pointTotals.get(row.playerId));
    await expect(page.getByRole("region", { name: "Round results", exact: true })).toBeVisible();
    if (round < 3) {
      await expect(page.getByRole("timer").last()).toContainText("Next round in");
      await expect.poll(async () => (await state(page, code)).match.round, { timeout: 40000, intervals: [1000] }).toBe(round + 1);
    }
  }
  expect(sawReveal && sawHold).toBe(true);
  expect(room.match.complete).toBe(true);
  expect(room.match.nextRoundAt).toBeNull();
  await expect(page.getByRole("dialog", { name: "The match champions." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play the next round" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/match-champions-desktop.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("dialog", { name: "The match champions." })).toBeVisible();
  expect((await state(page, code)).match.standings).toEqual(room.match.standings);
  expect(errors).toEqual([]);
});

test("friends choose icons and colors before joining, and only the host sets match length", async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Create a room", exact: true }).click();
  await page.getByLabel("Your display name").fill("Host");
  await page.getByRole("button", { name: "Queen icon", exact: true }).click();
  await page.getByLabel("Match length").selectOption("12");
  await page.getByRole("button", { name: "Create my room" }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
  const code = page.url().split("/").at(-1)!;
  const context = await browser.newContext();
  const friend = await context.newPage();
  await friend.goto(`/room/${code}`);
  await friend.getByLabel("Your display name").fill("Friend");
  await friend.getByRole("button", { name: "Clubs icon", exact: true }).click();
  await friend.getByLabel("Custom icon color").fill("#b85b76");
  await friend.getByRole("button", { name: "Join the room", exact: true }).click();
  await expect(friend.getByLabel("Match length")).toBeDisabled();
  await page.getByLabel("Match length").selectOption("20");
  await expect(friend.getByLabel("Match length")).toHaveValue("20");
  await expect(page.getByRole("img", { name: "Friend: Clubs icon", exact: true })).toBeVisible();
  await friend.reload();
  expect((await state(friend, code)).members.find((m) => m.name === "Friend")?.profile).toEqual({ icon: "clubs", color: "#b85b76" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/match-lobby-mobile.png", fullPage: true });
  await context.close();
});

test("three consecutive wins highlight the public player panel and icon", async ({ page }) => {
  const response = await page.request.post("/api/rooms", { data: { mode: "bots", botCount: 1 } });
  const room: RoomView = await response.json();
  room.version = Number.MAX_SAFE_INTEGER;
  const opponent = room.members.find((m) => m.isBot)!;
  room.match.standings.find((row) => row.playerId === opponent.id)!.streak = 3;
  await page.route(`**/api/rooms/${room.code}`, async (route) => {
    if (route.request().method() === "GET") await route.fulfill({ json: room }); else await route.continue();
  });
  await page.route(`**/api/rooms/${room.code}/events`, (route) => route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify(room)}\n\n` }));
  await page.goto(`/room/${room.code}`);
  await expect(page.locator(".opponent.on-streak")).toHaveCount(1);
  await expect(page.locator(".opponent .streak-avatar")).toHaveAccessibleName(/3 round winning streak/);
  await expect(page.locator(".opponent-heading")).toContainText("3 win streak");
});

for (const shared of [false, true]) test(`match champion follows accumulated points and handles shared victory (${shared})`, async ({ page }) => {
  const response = await page.request.post("/api/rooms", { data: { mode: "bots", botCount: 1 } });
  const room: RoomView = await response.json();
  room.version = Number.MAX_SAFE_INTEGER;
  room.status = "results";
  room.roundLimit = 3;
  room.roundNumber = 3;
  room.game!.round = 3;
  room.game!.phase = "round_results";
  room.game!.target = 100;
  // The bot wins the last round. The human has the highest match total, or
  // shares it, so the final round winner cannot determine the champion.
  room.game!.results = score(room.members.map((m) => ({ playerId: m.id, total: m.isBot ? 100 : 99 })), 100).results;
  room.match = { ...room.match, round: 3, roundLimit: 3, complete: true, nextRoundAt: null,
    standings: room.match.standings.map((row) => ({ ...row, points: row.playerId === room.me || shared ? 5 : 4, rank: row.playerId === room.me || shared ? 1 : 2 })).sort((a, b) => a.rank - b.rank) };
  await page.route(`**/api/rooms/${room.code}`, async (route) => {
    if (route.request().method() === "GET") await route.fulfill({ json: room }); else await route.continue();
  });
  await page.route(`**/api/rooms/${room.code}/events`, (route) => route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify(room)}\n\n` }));
  await page.goto(`/room/${room.code}`);
  const dialog = page.getByRole("dialog", { name: "The match champions." });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".match-champions h2")).toContainText("You");
  const botName = room.members.find((m) => m.isBot)!.name;
  if (shared) {
    await expect(dialog.locator(".match-champions")).toContainText("SHARED MATCH VICTORY");
    await expect(dialog.locator(".match-champions h2")).toContainText(botName);
  } else await expect(dialog.locator(".match-champions h2")).toHaveText("You");
  await page.screenshot({ path: `test-results/match-champion-shared-${shared}.png` });
});
