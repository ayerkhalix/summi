import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MemoryStore } from "@/server/store";
import { failure, limit } from "@/server/http";
import { ApiError } from "@/server/errors";

vi.mock("@/server/store", async (original) => {
  const actual = await original<typeof import("@/server/store")>();
  return { ...actual, getStore: () => store };
});
let store: MemoryStore;
const req = (ip?: string) => new NextRequest("https://summin.example/api/rooms", {
  headers: ip ? { "x-vercel-forwarded-for": ip, "x-real-ip": ip } : {},
});
beforeEach(() => {
  store = new MemoryStore();
  vi.useFakeTimers();
  vi.setSystemTime(1000000);
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("TRUST_PROXY", undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("normal play and abuse limits", () => {
  it("allows repeated bot/room creation and resets a throttled session after five minutes", async () => {
    for (let i = 0; i < 30; i++) await limit(req(), "guest", "create");
    await expect(limit(req(), "guest", "create")).rejects.toMatchObject({ status: 429, retryAfter: 300 });
    vi.advanceTimersByTime(300001);
    await expect(limit(req(), "guest", "create")).resolves.toBeUndefined();
  });
  it("keeps heartbeat traffic separate from player decisions", async () => {
    for (let i = 0; i < 60; i++) await limit(req(), "guest", "heartbeat");
    await expect(limit(req(), "guest", "heartbeat")).rejects.toMatchObject({ status: 429 });
    for (let i = 0; i < 100; i++) await limit(req(), "guest", "command");
    await expect(limit(req(), "guest", "command")).rejects.toMatchObject({ status: 429 });
  });
  it("does not combine unrelated visitors into an unknown-address quota", async () => {
    for (let i = 0; i < 65; i++) await limit(req(), `guest-${i}`, "create");
    vi.stubEnv("TRUST_PROXY", "true");
    for (let i = 0; i < 65; i++) await limit(req(), `proxy-guest-${i}`, "create");
  });
  it("enforces a trusted Vercel network limit without blocking another address", async () => {
    vi.stubEnv("VERCEL", "1");
    for (let i = 0; i < 60; i++) await limit(req("203.0.113.1"), `guest-${i}`, "create");
    await expect(limit(req("203.0.113.1"), "another", "create")).rejects.toMatchObject({ status: 429 });
    await expect(limit(req("203.0.113.2"), "different", "create")).resolves.toBeUndefined();
  });
  it("returns a retry duration that clients can honor", async () => {
    const response = failure(new ApiError(429, "Please wait.", 60));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({ error: "Please wait.", retryAfter: 60 });
  });
});
