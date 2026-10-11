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
      .object({
        name: nameSchema,
        mode: z.enum(["friends", "solo", "bots"]).optional(),
        botCount: z.number().int().min(1).max(4).optional(),
      })
      .strict()
      .refine(
        (input) => input.botCount === undefined || input.mode === "bots",
        "Bot count is only available in bot mode.",
      )
      .parse(await body(req));
    const guest = token(req, true);
    await limit(req, guest, "create");
    return json(
      await service().create(input.name, hashToken(guest), input),
      guest,
    );
  } catch (e) {
    return failure(e);
  }
}
