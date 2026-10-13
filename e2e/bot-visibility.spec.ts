import { expect, test, type Page } from "@playwright/test";
import type { RoomView } from "../src/server/types";

async function state(page: Page, code: string): Promise<RoomView> {
  const response = await page.request.get(`/api/rooms/${code}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function waitForPhase(page: Page, code: string, phase: string, turn = false) {
  await expect.poll(async () => {
    const room = await state(page, code);
    return room.game!.phase === phase && (!turn || room.game!.activePlayerId === room.me);
  }, { timeout: 45000 }).toBe(true);
  return state(page, code);
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      return { top: box.top + scrollY, width: box.width, height: box.height };
    };
    return {
      board: rect(".table-main"), hand: rect(".own-hand"),
      deck: rect("[data-scene-deck]"),
      height: document.documentElement.scrollHeight, scroll: scrollY,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

for (const viewport of [
  { width: 1280, height: 900 }, { width: 834, height: 1112 },
  { width: 390, height: 844 }, { width: 320, height: 740 },
]) {
  test(`bot match conceals cards and keeps the table steady at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Solo challenge", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Play with bots", exact: true }).click();
    await expect(page.getByLabel("Your display name")).toHaveCount(0);
    await page.getByRole("button", { name: "1 bot", exact: true }).click();
    await page.getByRole("button", { name: "Start bot match", exact: true }).click();
    await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
    const code = page.url().split("/").at(-1)!;
    let room = await waitForPhase(page, code, "initial_selection");
    await expect.poll(async () => {
      room = await state(page, code);
      return room.game!.players.filter((player) => player.id !== room.me).every((player) => player.committed);
    }).toBe(true);
    expect(room.members.find((member) => member.id === room.me)!.name).toBe("You");
    await expect(page.getByRole("region", { name: "Your decision", exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 250, behavior: "instant" }));
    const initial = await geometry(page);
    if (viewport.width >= 1000) expect(initial.board.top + initial.board.height).toBeLessThan(viewport.height);

    const stable = async () => {
      const current = await geometry(page);
      for (const selector of ["board", "hand", "deck"] as const)
        for (const dimension of ["top", "width", "height"] as const)
          expect(current[selector][dimension]).toBeCloseTo(initial[selector][dimension], 0);
      expect(current.height).toBe(initial.height);
      expect(current.scroll).toBe(initial.scroll);
      expect(current.overflow).toBe(false);
    };
    const act = async (count: number) => {
      const response = await page.request.patch(`/api/rooms/${code}`, {
        data: {
          requestId: crypto.randomUUID(), command: {
            type: "game", action: {
              type: room.game!.phase === "initial_selection" ? "select" : "add",
              round: room.game!.round, phase: room.game!.phase, count,
            },
          },
        },
      });
      expect(response.ok()).toBe(true);
      return (await response.json()) as RoomView;
    };
    const visibleHand = async (hidden: number) => {
      const own = room.game!.players.find((player) => player.id === room.me)!;
      expect(own.hand.filter((card) => !card.public)).toHaveLength(hidden);
      for (const player of room.game!.players)
        expect(player.hand.filter((card) => !card.public).every((card) => card.card === null)).toBe(true);
      await expect(page.locator('.own-hand [data-card="hidden"]')).toHaveCount(hidden);
      await expect(page.locator(".own-hand .playing-card")).toHaveCount(own.hand.length);
      if (own.hand.length) {
        const card = await page.locator(".own-hand .playing-card").first().boundingBox();
        expect(card!.width).toBeGreaterThanOrEqual(85);
        expect(card!.width / card!.height).toBeCloseTo(5 / 7, 2);
      }
      await expect(page.locator('.own-hand [data-card="hidden"] .card-front')).toHaveText(Array(hidden).fill(""));
      await expect(page.locator(".own-total > strong")).toHaveText(
        String(own.hand.reduce((sum, card) => sum + (card.card?.value ?? 0), 0)),
      );
      await expect(page.locator(".own-total > span")).toHaveText(hidden ? "REVEALED TOTAL" : "YOUR TOTAL");
      const expectedOwn = own.hand.filter((held) => held.newlyRevealed).map((held) => held.card!.id).sort();
      const expectedOthers = room.game!.players.filter((player) => player.id !== room.me)
        .flatMap((player) => player.hand.filter((held) => held.newlyRevealed).map((held) => held.card!.id)).sort();
      await expect.poll(() => page.locator(".own-hand .new-reveal .playing-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-card")).sort())).toEqual(expectedOwn);
      await expect.poll(() => page.locator(".opponents .new-reveal .playing-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-card")).sort())).toEqual(expectedOthers);
      await expect(page.locator('.new-reveal [data-card="hidden"]')).toHaveCount(0);
      await stable();
    };

    // Submit through the UI so its acknowledged deal is rendered immediately;
    // the periodic stream may next arrive after the brief dealing phase.
    for (let count = 7; count < 15; count++)
      await page.getByRole("button", { name: "More initial cards" }).click();
    const selectionResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/rooms/${code}`) &&
      response.request().method() === "PATCH" &&
      response.request().postDataJSON()?.command?.action?.type === "select",
    );
    await page.getByRole("button", { name: "Confirm 15 cards", exact: true }).click();
    const selected = await selectionResponse;
    expect(selected.ok()).toBe(true);
    room = await selected.json() as RoomView;
    expect(room.game!.phase).toBe("initial_deal");
    expect(room.game!.players.every((player) => player.hand.every((card) => card.card === null))).toBe(true);
    await expect(page.locator('.own-hand [data-card="hidden"]')).toHaveCount(15);
    room = await waitForPhase(page, code, "first_additions", true);
    await visibleHand(8);
    const inspectHidden = page.locator('.own-hand .inspect-card:has([data-card="hidden"])').first();
    await inspectHidden.click();
    await expect(inspectHidden).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".hand-inspection")).toHaveText("Hidden card · unknown until its reveal");
    await inspectHidden.press("Space");
    await expect(inspectHidden).toHaveAttribute("aria-pressed", "false");
    expect((await state(page, code)).game!.players.find((player) => player.id === room.me)!.firstDone).toBe(false);
    await stable();
    if (viewport.width === 1280 || viewport.width === 390)
      await page.screenshot({ path: `test-results/bot-visibility-${viewport.width}.png`, fullPage: true });
    await page.reload();
    room = await waitForPhase(page, code, "first_additions", true);
    await expect(page.locator('.own-hand [data-card="hidden"]')).toHaveCount(8);
    await page.evaluate(() => window.scrollTo({ top: 250, behavior: "instant" }));
    await visibleHand(8);

    room = await act(3);
    const afterAdding = room.game!.players.find((player) => player.id === room.me)!;
    expect(afterAdding.hand).toHaveLength(18);
    if (room.game!.phase === "first_additions") {
      expect(afterAdding.hand.slice(-3).every((card) => !card.public && card.card === null)).toBe(true);
    } else {
      // The last player's addition immediately triggers the second reveal.
      expect(room.game!.phase).toBe("second_reveal");
      expect(afterAdding.hand.filter((card) => !card.public)).toHaveLength(1);
    }
    expect(afterAdding.hand.filter((card) => !card.public).every((card) => card.card === null)).toBe(true);
    room = await waitForPhase(page, code, "second_additions", true);
    await visibleHand(1);
    await act(1);
    room = await waitForPhase(page, code, "round_results");
    await expect(page.getByRole("region", { name: "Round results", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Review the revealed table" }).click();
    expect(room.game!.players.find((player) => player.id === room.me)!.hand).toHaveLength(19);
    await visibleHand(0);
    await page.reload();
    await waitForPhase(page, code, "round_results");
    await expect(page.locator('.own-hand [data-card="hidden"]')).toHaveCount(0);
    await expect(page.locator(".own-hand .new-reveal")).toHaveCount(2);
  });
}

test("bot cards need a reveal even when an older payload includes their faces", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.request.post("/api/rooms", { data: { mode: "bots", botCount: 1 } });
  expect(response.ok()).toBe(true);
  const room: RoomView = await response.json();
  room.version = Number.MAX_SAFE_INTEGER;
  room.game!.phase = "first_additions";
  room.game!.activePlayerId = room.me;
  for (const player of room.game!.players)
    player.hand = Array.from({ length: 8 }, (_, index) => ({
      slotId: `${player.id}:${index}`, dealOrder: index, public: index < 4, newlyRevealed: true,
      card: { id: "spades-13", suit: "spades", rank: 13, value: 13 },
    }));
  await page.route(`**/api/rooms/${room.code}`, async (route) => {
    if (route.request().method() === "GET") await route.fulfill({ json: room });
    else await route.continue();
  });
  await page.route(`**/api/rooms/${room.code}/events`, (route) => route.fulfill({
    contentType: "text/event-stream", body: `data: ${JSON.stringify(room)}\n\n`,
  }));
  await page.goto(`/room/${room.code}`);
  await expect(page.locator('.own-hand [data-card="hidden"]')).toHaveCount(4);
  await expect(page.locator('.opponents [data-card="hidden"]')).toHaveCount(4);
  await expect(page.locator('.hand-card [data-card="hidden"] .card-front')).toHaveText(Array(8).fill(""));
  await expect(page.locator(".own-total > strong")).toHaveText("52");
  await expect(page.locator(".hand-card.new-reveal")).toHaveCount(8);
  await expect(page.locator('.new-reveal [data-card="hidden"]')).toHaveCount(0);
});

test("bot matches need no name and the removed solo mode is rejected", async ({ request }) => {
  for (const data of [{}, { mode: "friends" }, { mode: "solo", name: "Guest" }]) {
    const response = await request.post("/api/rooms", { data });
    expect(response.status()).toBe(400);
  }
  const response = await request.post("/api/rooms", { data: { mode: "bots", botCount: 1 } });
  expect(response.ok()).toBe(true);
  const room = (await response.json()) as RoomView;
  expect(room.mode).toBe("bots");
  expect(room.members[0].name).toBe("You");
  expect(room.game!.players).toHaveLength(2);
});
