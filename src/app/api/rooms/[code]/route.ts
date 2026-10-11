import { NextRequest } from "next/server";
import { z } from "zod";
import {
  body,
  codeSchema,
  commandSchema,
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
type Context = { params: Promise<{ code: string }> };
export async function GET(req: NextRequest, context: Context) {
  try {
    const guest = token(req);
    await limit(req, guest, "read");
    return json(
      await service().read(
        codeSchema.parse((await context.params).code),
        hashToken(guest),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    protectOrigin(req);
    const code = codeSchema.parse((await context.params).code);
    const input = z
      .object({ name: nameSchema, role: z.enum(["player", "spectator"]) })
      .strict()
      .parse(await body(req));
    const guest = token(req, true);
    await limit(req, guest, "join");
    return json(
      await service().join(code, input.name, input.role, hashToken(guest)),
      guest,
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: NextRequest, context: Context) {
  try {
    protectOrigin(req);
    const code = codeSchema.parse((await context.params).code);
    const { requestId, command, expectedRound } = commandSchema.parse(
      await body(req),
    );
    const guest = token(req);
    await limit(req, guest, "command");
    return json(
      await service().command(
        code,
        hashToken(guest),
        requestId,
        command,
        expectedRound,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
