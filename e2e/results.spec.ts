import { expect, test, type Page } from "@playwright/test";
import { act, advance, makeRound, projectGame, score } from "../src/game/engine";
import { RULES, secondCap, type PlayerCount } from "../src/game/config";
import { seeded } from "../tests/fixtures";
import type { RoomView, RoundSummary } from "../src/server/types";

async function fixture(page: Page, outcome: "human" | "bot" | "shared", players: PlayerCount = 2, large = false) {
  const response = await page.request.post("/api/rooms", { data: { mode: "bots", botCount: players - 1, roundLimit: 3 } });
  expect(response.ok()).toBe(true);
  const room: RoomView = await response.json();
  const ids = room.game!.players.map((row) => row.id), rng = seeded(67);
  let game = makeRound(ids, 3, 0, rng);
  for (let step = 0; game.phase !== "round_results" && step < 100; step++) {
    if (game.phase === "initial_selection") {
      for (const id of ids) game = act(game, id, { type: "select", count: large ? RULES[players].initial[1] : players === 2 ? 7 : 6, phase: game.phase, round: 3 }, rng);
    } else if (game.phase === "first_additions" || game.phase === "second_additions") {
      const own = game.players.find((row) => row.id === game.order[game.cursor])!;
      game = act(game, own.id, { type: "add", count: large ? Math.min(game.phase === "first_additions" ? 4 : secondCap(own.firstReceived), game.deck.length) : 0, phase: game.phase, round: 3 }, rng);
    } else game = advance(game, rng);
  }
  expect(game.phase).toBe("round_results");
  room.game = projectGame(game); room.status = "results"; room.roundNumber = 3; room.roundLimit = 3; room.matchStartRound = 1;
  const champion = outcome === "bot" ? ids.find((id) => id !== room.me)! : room.me;
  const past = (round: number, totals: number[]): RoundSummary => ({ round, target: 100, deckCount: 10, completedAt: round,
    results: score(ids.map((playerId, index) => ({ playerId, total: totals[index] })), 100).results.map((row) => ({ ...row, name: room.members.find((member) => member.id === row.playerId)!.name })) });
  room.history = outcome === "shared"
    ? [past(1, [99, 101]), past(2, ids.map((id) => game.results.find((row) => row.playerId === id)!.winner ? 110 : 100))]
    : [past(1, ids.map((id) => id === champion ? 100 : 120)), past(2, ids.map((id) => id === champion ? 100 : 120))];
  room.history.push({ round: 3, target: game.target, deckCount: game.deck.length, completedAt: 3, results: game.results.map((row) => ({ ...row, name: room.members.find((member) => member.id === row.playerId)!.name })) });
  const standings = room.match.standings.map((row) => {
    const results = room.history.map((round) => round.results.find((result) => result.playerId === row.playerId)!);
    let streak = 0; for (const result of results) streak = result.winner ? streak + 1 : 0;
    return { ...row, points: results.reduce((sum, result) => sum + result.points, 0), wins: results.filter((result) => result.winner).length, streak };
  });
  for (const row of standings) row.rank = 1 + standings.filter((other) => other.points > row.points).length;
  room.match = { round: 3, roundLimit: 3, complete: true, nextRoundAt: null, standings: standings.sort((a, b) => a.rank - b.rank) };
  room.version = Number.MAX_SAFE_INTEGER;
  const mutations: string[] = [];
  await page.route(`**/api/rooms/${room.code}`, async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: room });
    const type = route.request().postDataJSON()?.command?.type;
    if (type !== "heartbeat") mutations.push(type);
    return route.fulfill({ json: room });
  });
  await page.route(`**/api/rooms/${room.code}/events`, (route) => route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify(room)}\n\n` }));
  return { room, mutations };
}

for (const width of [1440, 390]) for (const outcome of ["human", "bot", "shared"] as const) {
  test(`championship ${outcome} is accurate, accessible and scrolls once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { room, mutations } = await fixture(page, outcome);
    await page.goto(`/room/${room.code}`);
    const dialog = page.getByRole("dialog", { name: "The match champions." });
    await expect(dialog).toBeVisible();
    const champions = room.match.standings.filter((row) => row.rank === 1);
    const podium = dialog.getByRole("region", { name: "Championship podium" });
    await expect(podium).toBeVisible();
    await expect(podium.locator('.podium-place[data-rank="1"]')).toHaveCount(champions.length);
    for (const row of room.match.standings.filter(row => row.rank <= 3)) {
      await expect(podium.getByRole("listitem", { name: `Rank ${row.rank}: ${row.name}, ${row.points} match points`, exact: true })).toBeVisible();
    }
    const championHeights = await podium.locator('.podium-place[data-rank="1"]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
    expect(new Set(championHeights.map(height => Math.round(height))).size).toBe(1);
    await expect(podium.locator('.podium-player-card').first()).toHaveCSS("animation-name", "none");
    await expect(dialog.locator(".champion-hero h2")).toHaveText(champions.map((row) => row.name).join(" & "));
    await expect(dialog.locator(".result-count")).toHaveText(String(champions[0].points));
    await expect(dialog.locator(".championship")).toHaveAttribute("data-reduced", "true");
    await expect(dialog.locator(".champion-card").first()).toHaveCSS("animation-name", "none");
    if (outcome === "bot") await expect(dialog.locator(".champion-message")).not.toContainText("You took");
    if (outcome === "shared") expect(champions).toHaveLength(2);
    for (const champion of champions) {
      if (champions.length > 1) await dialog.getByRole("button", { name: champion.name, exact: true }).click();
      const player = room.game!.players.find((row) => row.id === champion.playerId)!;
      await expect(dialog.locator(".champion-cards .playing-card")).toHaveCount(player.hand.length);
      expect(await dialog.locator(".champion-cards .playing-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-card"))))
        .toEqual([...player.hand].sort((a, b) => a.dealOrder - b.dealOrder).map((held) => held.card!.id));
      const result = room.game!.results.find((row) => row.playerId === champion.playerId)!;
      await expect(dialog.locator(".decisive-result dd").nth(0)).toHaveText(String(room.game!.target));
      await expect(dialog.locator(".decisive-result dd").nth(1)).toHaveText(String(result.total));
      await expect(dialog.locator(".decisive-result dd").nth(2)).toContainText(String(result.distance));
    }
    await expect(dialog.locator(".championship-standings li.podium-rank-1")).toHaveCount(champions.length);
    await dialog.getByLabel("Select round", { exact: true }).selectOption("1");
    await expect(dialog.getByRole("table", { name: "Round 1 totals" })).toBeVisible();
    await expect(dialog.locator(".round-target")).toContainText("Target 100");
    for (const result of room.history[0].results) {
      const row = dialog.getByRole("row").filter({ has: page.getByRole("cell", { name: new RegExp(result.name) }) });
      await expect(row.getByRole("cell").nth(1)).toHaveText(String(result.total));
      await expect(row.getByRole("cell").nth(3)).toHaveText(`+${result.points} pts`);
    }
    await expect(dialog.locator(".champion-hero h2")).toHaveText(champions.map((row) => row.name).join(" & "));
    const layout = await dialog.evaluate((el) => ({
      rootLocked: getComputedStyle(document.documentElement).overflow === "hidden",
      overflows: [...el.querySelectorAll("*")].filter((node) => node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY)).map((node) => node.className),
      horizontal: el.scrollWidth > el.clientWidth || document.documentElement.scrollWidth > innerWidth,
    }));
    expect(layout.rootLocked).toBe(true); expect(layout.horizontal).toBe(false);
    expect(layout.overflows.every((name) => name === "results-scroll")).toBe(true);
    await dialog.locator(".results-scroll").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeInViewport();
    await page.screenshot({ path: `test-results/championship-${outcome}-${width}-details.png` });
    await dialog.locator(".results-scroll").evaluate((el) => { el.scrollTop = 0; });
    await page.screenshot({ path: `test-results/championship-${outcome}-${width}.png` });
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
    await page.getByRole("button", { name: "View results" }).click();
    await expect(dialog.locator(".championship")).toHaveAttribute("data-celebrate", "false");
    await expect(dialog.locator(".result-count")).toHaveText(String(champions[0].points));
    await page.reload();
    await expect(dialog.locator(".championship")).toHaveAttribute("data-celebrate", "false");
    expect(mutations).toEqual([]);
  });
}

test("five-player standings and large final hands remain readable on small phones", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { room } = await fixture(page, "bot", 5);
  await page.goto(`/room/${room.code}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".championship-standings li")).toHaveCount(5);
  for (const rank of [1, 2, 3, 4]) await expect(dialog.locator(`.championship-standings .podium-rank-${rank}`))
    .toHaveCount(room.match.standings.filter((row) => Math.min(row.rank, 4) === rank).length);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(dialog.locator('.podium-place')).toHaveCount(room.match.standings.filter(row => row.rank <= 3).length);
  await page.screenshot({ path: "test-results/championship-five-320.png" });
  await page.getByRole("button", { name: "Close dialog" }).click();
  const big = await fixture(page, "human", 2, true);
  await page.goto(`/room/${big.room.code}`);
  await expect(dialog.locator(".champion-card")).toHaveCount(23);
  expect(await dialog.locator(".champion-card").evaluateAll((cards) => cards.every((card) => {
    const rect = card.getBoundingClientRect(), scroll = card.closest(".results-scroll")!.getBoundingClientRect();
    return rect.width >= 68 && rect.left >= scroll.left && rect.right <= scroll.right;
  }))).toBe(true);
  await page.screenshot({ path: "test-results/championship-large-320.png" });
});

test("score count finishes once, controls work immediately and device motion settings are respected", async ({ page }) => {
  const { room, mutations } = await fixture(page, "human");
  await page.goto(`/room/${room.code}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".championship")).toHaveAttribute("data-reduced", "false");
  await expect(dialog.locator('.podium-place-1 .podium-player-card').first()).toHaveCSS("animation-name", "podium-turn");
  const points = room.match.standings.find((row) => row.rank === 1)!.points;
  await expect(dialog.locator(".result-count")).toHaveText(String(points));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(dialog.locator(".result-count")).toHaveText(String(points));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(dialog.locator(".result-count")).toHaveText(String(points));
  await dialog.getByLabel("Select round").selectOption("1");
  await expect(dialog.locator(".result-count")).toHaveText(String(points));
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "View results" }).click();
  await expect(dialog.locator(".result-count")).toHaveText(String(points));
  await expect(dialog).toHaveAttribute("data-celebrate", "false");
  await expect(dialog.locator('.podium-player-card').first()).toHaveCSS("animation-name", "none");
  expect(mutations).toEqual([]);
  await page.evaluate(() => localStorage.setItem("summin-audio", JSON.stringify({ reducedMotion: true })));
  await page.reload();
  await expect(dialog.locator(".championship")).toHaveAttribute("data-reduced", "true");
});
