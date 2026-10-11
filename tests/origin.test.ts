import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { protectOrigin } from "@/server/http";

afterEach(() => vi.unstubAllEnvs());
const request = (origin: string, host: string, site = "same-origin") =>
  new NextRequest("http://localhost:3000/api/rooms", {
    headers: { origin, host, "sec-fetch-site": site },
  });
describe("entry origin validation", () => {
  it.each(["127.0.0.1:3000", "localhost:3000", "192.168.1.50:3000"])(
    "accepts the browser's actual local Host %s despite an internal localhost URL",
    (host) => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
      expect(() =>
        protectOrigin(request(`http://${host}`, host)),
      ).not.toThrow();
    },
  );
  it("rejects foreign origins, wrong ports and opaque origins in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const origin of [
      "https://attacker.example",
      "http://localhost:4000",
      "null",
      "http://localhost:3000/other",
    ])
      expect(() => protectOrigin(request(origin, "localhost:3000"))).toThrow(
        "origin",
      );
  });
  it("rejects cross-site metadata even if the origin matches", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() =>
      protectOrigin(
        request("http://localhost:3000", "localhost:3000", "cross-site"),
      ),
    ).toThrow("Cross-site");
  });
  it("keeps production pinned to the explicit public origin behind a proxy", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://summin.example/");
    expect(() =>
      protectOrigin(request("https://summin.example", "internal:3000")),
    ).not.toThrow();
    expect(() =>
      protectOrigin(request("http://internal:3000", "internal:3000")),
    ).toThrow("origin");
    vi.stubEnv("APP_ORIGIN", "");
    expect(() =>
      protectOrigin(request("https://summin.example", "internal:3000")),
    ).toThrow("APP_ORIGIN");
  });
});
