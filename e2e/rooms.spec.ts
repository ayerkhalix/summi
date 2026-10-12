import { expect, test } from "@playwright/test";
import type { RoomView } from "../src/server/types";

test("repeated room generation stays usable in the same guest session", async ({ page, browser }) => {
  const rooms: RoomView[] = [];
  const friend = await browser.newContext();
  try {
    for (let i = 0; i < 12; i++) {
      const response = await page.request.post("/api/rooms", { data: { name: "Room host", mode: "friends" } });
      expect(response.status()).toBe(200);
      const room = await response.json() as RoomView;
      if (process.env.PLAYWRIGHT_BACKEND) expect(room.backend).toBe(process.env.PLAYWRIGHT_BACKEND);
      expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      rooms.push(room);
    }
    expect(new Set(rooms.map((room) => room.code)).size).toBe(12);
    const last = rooms.at(-1)!;
    const joined = await friend.request.post(`/api/rooms/${last.code}`, { data: { name: "Room friend", role: "player" } });
    expect(joined.status()).toBe(200);
    await page.goto(`/room/${last.code}`);
    await expect(page.getByText("Room friend", { exact: true })).toBeVisible();
    const state = await page.request.get(`/api/rooms/${last.code}`);
    expect((await state.json() as RoomView).me).toBe(last.me);
  } finally {
    for (const room of rooms)
      await page.request.patch(`/api/rooms/${room.code}`, { data: { requestId: crypto.randomUUID(), command: { type: "leave" } } });
    await friend.close();
  }
});
