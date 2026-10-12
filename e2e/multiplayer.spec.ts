import { expect, test, type Page } from "@playwright/test";
import type { RoomView } from "../src/server/types";
async function state(page: Page, code: string): Promise<RoomView> {
  const response = await page.request.get(`/api/rooms/${code}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function phase(page: Page, code: string, value: string) {
  await expect
    .poll(async () => (await state(page, code)).game?.phase, { timeout: 25000 })
    .toBe(value);
  return state(page, code);
}
test("complete real multiplayer match, privacy, spectators, mobile, rematch and reconnect", async ({
  browser,
  page,
}) => {
  // Includes an intentional offline window and two complete rounds.
  test.setTimeout(240000);
  const clientErrors: string[] = [];
  page.on("pageerror", (error) => clientErrors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Read the table/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/landing-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page.getByLabel("Your display name").fill("Ayer");
  await page.getByRole("button", { name: "Create my room" }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
  const code = page.url().split("/").at(-1)!;
  const second = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    friend = await second.newPage();
  friend.on("pageerror", (error) => clientErrors.push(error.message));
  await friend.goto("/");
  await friend.getByRole("button", { name: "Join with a code" }).click();
  await friend.getByLabel("Your display name").fill("Mika");
  await friend.getByLabel("Room code", { exact: true }).fill(code);
  await friend
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(friend).toHaveURL(`/room/${code}`);
  await expect(page.getByText("Mika", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await friend.getByRole("button", { name: "I’m ready", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start the round" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Start the round" }).click();
  const first = await phase(page, code, "initial_selection"),
    firstStarter = first.game!.order[0];
  await expect(
    page.getByRole("button", { name: "Confirm 8 cards" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm 8 cards" }).click();
  await expect(
    page.getByText("Your choice is committed.", { exact: false }),
  ).toBeVisible();
  const committed = await state(friend, code);
  expect(
    committed.game!.players.find((p) => p.id === first.me)!.initialCount,
  ).toBeNull();
  await friend.getByRole("button", { name: "More initial cards" }).click();
  await friend.getByRole("button", { name: "More initial cards" }).click();
  await friend.getByRole("button", { name: "Confirm 10 cards" }).click();
  const addition = await phase(page, code, "first_additions");
  const friendState = await state(friend, code),
    own = addition.game!.players.find((p) => p.id === addition.me)!,
    theirs = friendState.game!.players.find((p) => p.id === friendState.me)!;
  for (const player of [own, theirs]) {
    expect(player.hand.filter((c) => !c.public).every((c) => c.card === null)).toBe(true);
    expect(player.hand.filter((c) => c.public)).toHaveLength(Math.floor(player.hand.length / 2));
  }
  await expect(page.locator('.own-hand [data-card="hidden"]')).toHaveCount(4);
  await expect(friend.locator('.own-hand [data-card="hidden"]')).toHaveCount(5);
  await expect(
    page.locator('[aria-label="Other players"] [data-card="hidden"]'),
  ).toHaveCount(5);
  await page.screenshot({
    path: "test-results/game-desktop.png",
    fullPage: true,
  });
  await friend.screenshot({
    path: "test-results/game-mobile.png",
    fullPage: true,
  });
  expect(
    await friend.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const third = await browser.newContext(),
    spectator = await third.newPage();
  expect((await spectator.request.get(`/api/rooms/${code}`)).status()).toBe(
    401,
  );
  await spectator.goto(`/room/${code}`);
  await spectator.getByLabel("Your display name").fill("Sam");
  await spectator.getByRole("radio", { name: "Spectator" }).check();
  await spectator
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(
    spectator.getByText(/SPECTATING/, { exact: false }).first(),
  ).toBeVisible();
  const publicView = await state(spectator, code);
  expect(
    publicView.game!.players.every((p) =>
      p.hand.filter((c) => !c.public).every((c) => c.card === null),
    ),
  ).toBe(true);
  expect(publicView.game!.players).toEqual(addition.game!.players);
  const rejected = await spectator.request.patch(`/api/rooms/${code}`, {
    data: {
      requestId: crypto.randomUUID(),
      command: {
        type: "game",
        action: { type: "add", count: 1, round: 1, phase: "first_additions" },
      },
    },
  });
  expect(rejected.status()).toBe(403);
  const seats = new Map([
    [addition.me, page],
    [friendState.me, friend],
  ]);
  await second.setOffline(true);
  await expect(
    friend.getByText("Connection interrupted.", { exact: false }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await state(page, code)).paused.some(
          (p) => p.playerId === friendState.me,
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  const paused = await state(page, code);
  expect(paused.game!.phase).toBe("first_additions");
  expect(paused.game!.players.every((p) => !p.firstDone)).toBe(true);
  await expect(page.getByText("Match paused.", { exact: false })).toBeVisible();
  await second.setOffline(false);
  await expect
    .poll(async () => (await state(page, code)).paused.length)
    .toBe(0);
  expect((await state(friend, code)).me).toBe(friendState.me);
  for (let i = 0; i < 2; i++) {
    const current = await state(page, code),
      acting = seats.get(current.game!.activePlayerId!)!,
      count = current.game!.activePlayerId === addition.me ? 2 : 3;
    await acting
      .getByRole("button", { name: `+${count}`, exact: true })
      .click();
    await acting
      .getByRole("button", { name: `Add ${count} cards`, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await state(page, code)).game!.players.filter((p) => p.firstDone)
            .length,
      )
      .toBe(i + 1);
  }
  const secondWindow = await phase(page, code, "second_additions");
  for (const p of secondWindow.game!.players)
    expect(p.hand.filter((c) => !c.public)).toHaveLength(1);
  for (let i = 0; i < 2; i++) {
    const current = await state(page, code),
      acting = seats.get(current.game!.activePlayerId!)!,
      add = current.game!.activePlayerId === addition.me;
    if (add) {
      await acting.getByRole("button", { name: "+1", exact: true }).click();
      await acting
        .getByRole("button", { name: "Add 1 card", exact: true })
        .click();
    } else
      await acting
        .getByRole("button", { name: "Confirm pass", exact: true })
        .click();
    await expect
      .poll(
        async () =>
          (await state(page, code)).game!.players.filter((p) => p.secondDone)
            .length,
      )
      .toBe(i + 1);
  }
  const result = await phase(page, code, "round_results");
  await expect(
    page.getByRole("region", { name: "Round results" }),
  ).toBeVisible();
  for (const p of result.game!.players) {
    expect(p.hand.every((c) => c.card && c.public)).toBe(true);
    expect(result.game!.results.find((r) => r.playerId === p.id)!.total).toBe(
      p.hand.reduce((sum, c) => sum + c.card!.value, 0),
    );
  }
  const sorted = [...result.game!.results].sort(
    (a, b) => a.distance - b.distance || a.total - b.total,
  );
  expect(sorted[0].winner).toBe(true);
  expect(result.history).toHaveLength(1);
  await page.screenshot({
    path: "test-results/results-desktop.png",
    fullPage: true,
  });
  const identity = (await state(friend, code)).me;
  await friend.reload();
  await expect(
    friend.getByRole("region", { name: "Round results" }),
  ).toBeVisible();
  expect((await state(friend, code)).me).toBe(identity);
  await page.getByRole("button", { name: "Play the next round" }).click();
  const next = await phase(page, code, "initial_selection");
  expect(next.game!.round).toBe(2);
  expect(next.game!.order[0]).not.toBe(firstStarter);
  expect(next.history).toHaveLength(1);
  await page.getByRole("button", { name: "Confirm 8 cards" }).click();
  await friend.getByRole("button", { name: "Confirm 8 cards" }).click();
  await phase(page, code, "first_additions");
  for (let i = 0; i < 2; i++) {
    const current = await state(page, code),
      acting = seats.get(current.game!.activePlayerId!)!;
    await acting.getByRole("button", { name: "Confirm pass" }).click();
    await expect
      .poll(
        async () =>
          (await state(page, code)).game!.players.filter((p) => p.firstDone)
            .length,
      )
      .toBe(i + 1);
  }
  const nextResult = await phase(page, code, "round_results");
  expect(nextResult.history).toHaveLength(2);
  expect(nextResult.game!.events.filter((e) => e.kind === "skip")).toHaveLength(
    2,
  );
  await friend.getByRole("button", { name: "Review the revealed table" }).click();
  await friend.getByRole("button", { name: "Open settings" }).click();
  await expect(friend.getByRole("dialog")).toBeVisible();
  await friend.getByRole("switch", { name: "Ambient music" }).click();
  await expect(
    friend.getByRole("switch", { name: "Ambient music" }),
  ).toBeChecked();
  await friend.getByLabel("Effects volume").fill("0.2");
  await friend.getByRole("button", { name: "Play selected sound" }).click();
  await friend.getByRole("switch", { name: "Reduce animations" }).click();
  await friend.getByRole("button", { name: "Close dialog" }).click();
  await friend.reload();
  await expect(
    friend.getByRole("region", { name: "Round results" }),
  ).toBeVisible();
  await friend.getByRole("button", { name: "Review the revealed table" }).click();
  await friend.getByRole("button", { name: "Open settings" }).click();
  await expect(friend.getByLabel("Effects volume")).toHaveValue("0.2");
  await expect(
    friend.getByRole("switch", { name: "Reduce animations" }),
  ).toBeChecked();
  await friend.getByRole("button", { name: "Close dialog" }).click();
  expect(
    await friend.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await spectator.getByRole("button", { name: "Take an open seat" }).click();
  await expect
    .poll(async () => {
      const r = await state(spectator, code);
      return r.members.find((m) => m.id === r.me)?.role;
    })
    .toBe("player");
  expect(clientErrors).toEqual([]);
  await second.close();
  await third.close();
});

test("tutorial follows real rules and dialogs manage focus on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "Take a practice seat" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("slider", { name: "Your initial hand: 8 cards" })
    .fill("10");
  await page.getByRole("button", { name: "Confirm & deal" }).click();
  await expect(
    page.getByText("Your hand ·", { exact: false }),
  ).toContainText("5 cards public");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Pass", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Your cap is zero", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Ready to play" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "The rules", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/landing-mobile.png",
    fullPage: true,
  });
});
