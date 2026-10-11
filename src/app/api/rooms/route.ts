import { NextRequest } from "next/server";
import { z } from "zod";
import {
  body,
  failure,
  json,
  limit,
  nameSchema,
  protectOrigin,
  service,
  token,
} from "@/server/http";
import { hashToken } from "@/server/rooms";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    protectOrigin(req);
    const input = z
      .object({ name: nameSchema })
      .strict()
      .parse(await body(req));
    const guest = token(req, true);
    await limit(req, guest, "create");
    return json(await service().create(input.name, hashToken(guest)), guest);
  } catch (e) {
    return failure(e);
  }
}
