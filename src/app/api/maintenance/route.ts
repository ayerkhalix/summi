import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { failure, json, service } from "@/server/http";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ""}`);
  if (
    !process.env.CRON_SECRET ||
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    return json(await service().sweep());
  } catch (e) {
    return failure(e);
  }
}
