import { expect, test } from "@playwright/test";
import type { RoomView } from "../src/server/types";
import { rulesFor } from "../src/game/config";

for (const botCount of [1, 2, 3, 4])
  test(`complete ${botCount}-bot match with continuous cards and centered controls`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator(".scene-card")).toHaveCount(6);
    const physicalCard = await page
      .locator(".scene-card")
      .first()
      .elementHandle();
    await expect(page.getByRole("button", { name: "Solo challenge", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Play with bots", exact: true }).click();
    await expect(page.getByLabel("Your display name")).toHaveCount(0);
    await page.getByRole("button", {
      name: `${botCount} ${botCount === 1 ? "bot" : "bots"}`, exact: true,
    }).click();
    await page
      .getByRole("button", {
        name: "Start bot match",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
    const code = page.url().split("/").at(-1)!;
    await expect(
      page.getByRole("region", { name: "Your decision", exact: true }),
    ).toBeVisible();
    expect(await physicalCard!.evaluate((element) => element.isConnected)).toBe(
      true,
    );
    await page.waitForTimeout(1400);
    const geometry = await page.evaluate(() => {
      const deck = document
        .querySelector("[data-scene-deck]")!
        .getBoundingClientRect();
      const card = document
        .querySelector(".scene-card")!
        .getBoundingClientRect();
      const button = document
        .querySelector(".decision-controls > .button")!
        .getBoundingClientRect();
      const panel = document
        .querySelector(".decision-panel")!
        .getBoundingClientRect();
      return {
        deckX: Math.abs(deck.left - card.left),
        deckY: Math.abs(deck.top - card.top),
        center: Math.abs(
          button.left + button.width / 2 - (panel.left + panel.width / 2),
        ),
      };
    });
    expect(geometry.deckX).toBeLessThan(8);
    expect(geometry.deckY).toBeLessThan(8);
    expect(geometry.center).toBeLessThan(3);
    const [min, max] = rulesFor(botCount + 1).initial;
    await expect(page.getByRole("button", { name: "Fewer initial cards" })).toBeDisabled();
    await expect(page.getByRole("button", { name: `Confirm ${min} cards`, exact: true })).toBeVisible();
    for (let count = min; count < max; count++)
      await page.getByRole("button", { name: "More initial cards" }).click();
    await expect(page.getByRole("button", { name: "More initial cards" })).toBeDisabled();
    await page.getByRole("button", { name: `Confirm ${max} cards`, exact: true }).click();
    let completed: RoomView | undefined;
    for (let step = 0; step < 120; step++) {
      const response = await page.request.get(`/api/rooms/${code}`);
      expect(response.ok()).toBeTruthy();
      const room: RoomView = await response.json();
      for (const player of room.game!.players)
        expect(
          player.hand.filter((c) => !c.public).every((c) => c.card === null),
        ).toBe(true);
      if (room.status === "results") {
        completed = room;
        break;
      }
      if (room.game!.activePlayerId === room.me) {
        await expect(
          page.getByRole("region", { name: "Your decision", exact: true }),
        ).toBeVisible();
        const n = room.game!.phase === "first_additions" ? 3 : 1;
        await page.getByRole("button", { name: `+${n}`, exact: true }).click();
        if (botCount === 4 && room.game!.phase === "first_additions") {
          await page.screenshot({
            path: "test-results/bots-desktop.png",
            fullPage: true,
          });
          await page.setViewportSize({ width: 390, height: 844 });
          await page.screenshot({
            path: "test-results/bots-mobile.png",
            fullPage: true,
          });
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
        }
        await page
          .getByRole("button", {
            name: `Add ${n} ${n === 1 ? "card" : "cards"}`,
            exact: true,
          })
          .click();
        await expect.poll(async () => {
          const latest: RoomView = await (await page.request.get(`/api/rooms/${code}`)).json();
          const own = latest.game!.players.find((player) => player.id === latest.me)!;
          return room.game!.phase === "first_additions" ? own.firstDone : own.secondDone;
        }).toBe(true);
      }
      await page.waitForTimeout(300);
    }
    expect(completed?.history).toHaveLength(1);
    await expect(
      page.getByRole("region", { name: "Round results", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Play the next round" }).click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/api/rooms/${code}`)).json())
            .roundNumber,
      )
      .toBe(2);
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Your decision", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

test("guest entry works through 127.0.0.1 when APP_ORIGIN uses localhost", async ({
  page,
  baseURL,
}) => {
  await page.goto(baseURL!.replace("localhost", "127.0.0.1"));
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page.getByLabel("Your display name").fill("Loopback Guest");
  await page.getByRole("button", { name: "Create my room" }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1.*\/room\/[A-Z2-9]{6}$/);
  await expect(
    page.getByRole("heading", { name: "Your table", exact: true }),
  ).toBeVisible();
});
