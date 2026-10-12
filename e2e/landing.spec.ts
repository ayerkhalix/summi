import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 900 }, { width: 834, height: 1112 },
  { width: 390, height: 844 }, { width: 320, height: 740 },
]) {
  test(`six living cards frame an unobstructed landing page at ${viewport.width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(page.locator(".scene-running .scene-card")).toHaveCount(6);
    const initial = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      hero: document.querySelector(".hero")!.getBoundingClientRect().height,
      faces: [...document.querySelectorAll(".scene-card [data-card]")].map((card) => card.getAttribute("data-card")),
    }));
    await expect.poll(async () => {
      const face = await page.locator('.scene-card [data-card]').first().getAttribute("data-card");
      return face !== initial.faces[0] && face !== "hidden";
    }).toBe(true);
    const layout = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".scene-card")].map((card) => card.getBoundingClientRect());
      const targets = [document.querySelector(".hero h1")!, ...document.querySelectorAll(".hero button")];
      const overlap = targets.some((target) => {
        const box = target.getBoundingClientRect();
        return cards.some((card) => card.left < box.right && card.right > box.left && card.top < box.bottom && card.bottom > box.top);
      });
      return {
        overlap, overflow: document.documentElement.scrollWidth > innerWidth,
        height: document.documentElement.scrollHeight,
        hero: document.querySelector(".hero")!.getBoundingClientRect().height,
        durations: [...document.querySelectorAll(".scene-card-content")].map((card) => getComputedStyle(card).animationDuration),
        faces: [...document.querySelectorAll(".scene-card [data-card]")].map((card) => card.getAttribute("data-card")),
      };
    });
    expect(layout.overlap).toBe(false);
    expect(layout.overflow).toBe(false);
    expect(layout.height).toBe(initial.height);
    expect(layout.hero).toBe(initial.hero);
    expect(new Set(layout.durations).size).toBe(6);
    expect(layout.faces.some((face, index) => face === initial.faces[index])).toBe(true);
    await page.screenshot({ path: `test-results/landing-${viewport.width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Play with bots", exact: true }).click();
    await expect(page.getByRole("button", { name: "Start bot match" })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("saved reduced motion stops the showcase without changing its layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".scene-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("switch", { name: "Reduce animations" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await expect(page.locator(".scene-paused .scene-card")).toHaveCount(6);
  const faces = await page.locator(".scene-card [data-card]").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-card")));
  await page.waitForTimeout(3500);
  expect(await page.locator(".scene-card [data-card]").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-card")))).toEqual(faces);
  expect(await page.locator(".scene-card-content").evaluateAll((cards) => cards.every((card) => getComputedStyle(card).animationName === "none"))).toBe(true);
});
