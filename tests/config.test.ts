import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getStore } from "@/server/store";
import { protectOrigin } from "@/server/http";
afterEach(() => vi.unstubAllEnvs());
describe("production backend and origin boundary", () => {
  it("fails closed in production when Supabase credentials are absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUMMIN_BACKEND", undefined);
    vi.stubEnv("SUPABASE_URL", undefined);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
    expect(() => getStore()).toThrow("Supabase is not configured");
  });
  it("rejects accidental production memory mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUMMIN_BACKEND", "local");
    vi.stubEnv("SUMMIN_ALLOW_LOCAL_PREVIEW", undefined);
    expect(() => getStore()).toThrow(
      "Production multiplayer requires Supabase",
    );
  });
  it("permits explicit local development without credentials", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SUMMIN_BACKEND", "local");
    expect(getStore().kind).toBe("local");
  });
  it("requires an exact configured production origin and rejects cross-site requests", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://summin.example.com");
    expect(() =>
      protectOrigin(
        new NextRequest("https://summin.example.com/api/rooms", {
          headers: { origin: "https://summin.example.com" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      protectOrigin(
        new NextRequest("https://summin.example.com/api/rooms", {
          headers: { origin: "https://evil.example.com" },
        }),
      ),
    ).toThrow("unauthorized origin");
    expect(() =>
      protectOrigin(
        new NextRequest("https://summin.example.com/api/rooms", {
          headers: { "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toThrow("Cross-site");
    vi.stubEnv("APP_ORIGIN", undefined);
    expect(() =>
      protectOrigin(new NextRequest("https://summin.example.com/api/rooms")),
    ).toThrow("APP_ORIGIN");
  });
});
