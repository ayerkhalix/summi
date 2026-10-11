import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RuleError } from "@/game/engine";
import { PHASES } from "@/game/config";
import { ApiError } from "./errors";
import { hashToken, RoomService } from "./rooms";
import { getStore } from "./store";
export const COOKIE = "summin_guest";
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/, "Enter a valid six-character room code.");
export const nameSchema = z
  .string()
  .transform((s) => s.normalize("NFKC").trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(2, "Use at least two characters.")
      .max(20, "Use at most 20 characters.")
      .regex(
        /^[\p{L}\p{N} ._'’-]+$/u,
        "Use letters, numbers, spaces, periods, apostrophes or hyphens.",
      ),
  );
const actionSchema = z
  .object({
    type: z.enum(["select", "add"]),
    count: z.number().int().min(0).max(15),
    round: z.number().int().positive(),
    phase: z.enum(PHASES),
  })
  .strict();
export const commandSchema = z
  .object({
    requestId: z.uuid(),
    expectedRound: z.number().int().nonnegative().optional(),
    command: z.discriminatedUnion("type", [
      z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
      z
        .object({
          type: z.enum(["start", "lobby", "leave", "claim", "heartbeat"]),
        })
        .strict(),
      z.object({ type: z.literal("game"), action: actionSchema }).strict(),
    ]),
  })
  .strict()
  .refine(
    (input) =>
      input.command.type !== "start" || input.expectedRound !== undefined,
    "Starting a round requires its current round number.",
  );
export function token(req: NextRequest, create = false) {
  const current = req.cookies.get(COOKIE)?.value;
  if (current && /^[a-f0-9]{64}$/.test(current)) return current;
  if (!create)
    throw new ApiError(
      401,
      "Your guest session has expired. Join the room again.",
    );
  return randomBytes(32).toString("hex");
}
export async function body(req: NextRequest) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 4096) throw new ApiError(413, "Request too large.");
  const raw = await req.text();
  if (raw.length > 4096) throw new ApiError(413, "Request too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Invalid request body.");
  }
}
export function protectOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const production = process.env.NODE_ENV === "production";
  const configured = process.env.APP_ORIGIN;
  if (production && !configured)
    throw new ApiError(
      503,
      "Configure APP_ORIGIN before enabling production rooms.",
    );
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "Cross-site requests are not allowed.");
  if (!origin) return;
  let allowed = false;
  try {
    const browser = new URL(origin);
    // Next's internal URL can use localhost even when the browser uses a LAN
    // address or 127.0.0.1. Host is the address the browser actually requested.
    const incoming = new URL(
      `${req.nextUrl.protocol}//${req.headers.get("host") || req.nextUrl.host}`,
    );
    allowed = production
      ? browser.origin === new URL(configured!).origin
      : browser.origin === incoming.origin;
    allowed &&= browser.origin === origin;
  } catch {
    /* Malformed and opaque origins are rejected. */
  }
  if (!allowed)
    throw new ApiError(403, "This request came from an unauthorized origin.");
}
export function service() {
  return new RoomService(getStore());
}
export async function limit(
  req: NextRequest,
  tokenValue: string,
  category: "create" | "join" | "command" | "stream" | "read",
) {
  const store = getStore();
  const [max, seconds] =
    category === "create"
      ? [8, 3600]
      : category === "join"
        ? [30, 60]
        : category === "stream"
          ? [20, 60]
          : category === "read"
            ? [300, 60]
            : [100, 60];
  if (!(await store.rate(`${category}:${hashToken(tokenValue)}`, max, seconds)))
    throw new ApiError(429, "Too many requests. Please wait and try again.");
  if (category === "create" || category === "join") {
    const ip =
      process.env.TRUST_PROXY === "true"
        ? req.headers.get(process.env.PROXY_IP_HEADER || "x-real-ip") ||
          "unknown"
        : "shared-network";
    if (
      !(await store.rate(
        `network:${category}:${hashToken(ip)}`,
        category === "create" ? 60 : 300,
        60,
      ))
    )
      throw new ApiError(429, "Too many room requests. Please wait a minute.");
  }
}
export function json(data: unknown, guestToken?: string) {
  const res = NextResponse.json(data, {
    headers: { "Cache-Control": "no-store, private" },
  });
  if (guestToken)
    res.cookies.set(COOKIE, guestToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 604800,
      path: "/",
    });
  return res;
}
export function failure(e: unknown) {
  if (e instanceof z.ZodError)
    return NextResponse.json(
      { error: e.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  if (e instanceof ApiError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof RuleError)
    return NextResponse.json({ error: e.message }, { status: 409 });
  // Never log room records, commands, secrets, or raw provider error bodies.
  console.error(
    "SUMMIN server request failed",
    e instanceof Error ? e.name : "UnknownError",
  );
  return NextResponse.json(
    { error: "The server could not finish this request. Please try again." },
    { status: 500 },
  );
}
