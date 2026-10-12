import { expect, test } from "@playwright/test";
import type { RoomView } from "../src/server/types";

for (const width of [1440, 390]) {
  test(`burned and opponent cards enlarge without revealing secrets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Play with bots", exact: true }).click();
    await page.getByRole("button", { name: "1 bot", exact: true }).click();
    await page.getByRole("button", { name: "Start bot match", exact: true }).click();
    await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
    const code = page.url().split("/").at(-1)!;
    const burn = page.locator(".burn-cards .card-inspect-button").first();
    if (width === 1440) {
      await burn.hover();
      const tooltip = page.getByRole("tooltip");
      await expect(tooltip).toBeVisible();
      expect((await tooltip.locator(".playing-card").boundingBox())!.width).toBeGreaterThanOrEqual(150);
      await expect(tooltip).toContainText(/of .* · value/);
    }
    await burn.click();
    let dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect((await dialog.locator(".playing-card").boundingBox())!.width).toBeGreaterThanOrEqual(180);
    await dialog.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Confirm 7 cards", exact: true }).click();
    await expect(page.getByRole("heading", { name: "First addition", exact: true })).toBeVisible();
    const initial = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, y: scrollY }));
    const hidden = page.locator('.opponent-cards .card-inspect-button:has([data-card="hidden"])').first();
    await hidden.click();
    dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Hidden card · unknown until its reveal");
    await expect(dialog.locator(".card-front")).toBeEmpty();
    await expect(dialog.locator(".playing-card")).toHaveAttribute("data-card", "hidden");
    await dialog.press("Escape");
    await expect(dialog).toHaveCount(0);
    const publicCard = page.locator('.opponent-cards .card-inspect-button:has(.is-public)').first();
    const label = await publicCard.getAttribute("aria-label");
    await publicCard.focus();
    await publicCard.press("Enter");
    dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(label!.split(": ").slice(1).join(": "));
    await page.screenshot({ path: `test-results/card-inspection-${width}.png` });
    await dialog.getByRole("button", { name: "Close dialog" }).click();
    const state = await page.request.get(`/api/rooms/${code}`);
    expect(state.ok()).toBe(true);
    const room = await state.json() as RoomView;
    expect(room.game!.players.find((player) => player.id === room.me)!.firstDone).toBe(false);
    expect(room.game!.players.every((p) => p.hand.filter((c) => !c.public).every((c) => c.card === null))).toBe(true);
    const final = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, y: scrollY, overflow: document.documentElement.scrollWidth > innerWidth }));
    expect(final.height).toBe(initial.height);
    expect(final.y).toBe(initial.y);
    expect(final.overflow).toBe(false);
  });
}
