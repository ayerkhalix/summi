import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseStore } from "@/server/store";
import { hashToken, RoomService } from "@/server/rooms";
const url = process.env.SUPABASE_TEST_URL,
  key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
  anon = process.env.SUPABASE_TEST_ANON_KEY;
describe.skipIf(!url || !key || !anon)(
  "isolated Supabase authorization and transactions",
  () => {
    it("denies anon private reads, writes, RPCs and Realtime signal reads; CAS handles concurrent joins", async () => {
      const store = new SupabaseStore(url!, key!),
        rooms = new RoomService(store),
        token = hashToken(randomUUID());
      const room = await rooms.create("Test host", token);
      try {
        const publicClient = createClient(url!, anon!, {
          auth: { persistSession: false },
        });
        for (const table of [
          "summin_rooms",
          "summin_room_signals",
          "summin_rate_limits",
        ]) {
          const { data, error } = await publicClient.from(table).select("*");
          expect(Boolean(error) || data?.length === 0).toBe(true);
        }
        expect(
          (
            await publicClient
              .from("summin_rooms")
              .update({ version: 999 })
              .eq("code", room.code)
          ).error,
        ).toBeTruthy();
        expect(
          (
            await publicClient.rpc("summin_commit_room", {
              p_code: room.code,
              p_expected_version: 0,
              p_state: {},
            })
          ).error,
        ).toBeTruthy();
        const joined = await Promise.allSettled(
          Array.from({ length: 8 }, (_, i) =>
            rooms.join(
              room.code,
              `Test ${i}`,
              "player",
              hashToken(randomUUID()),
            ),
          ),
        );
        expect(joined.filter((r) => r.status === "fulfilled")).toHaveLength(4);
        expect((await rooms.read(room.code, token)).members).toHaveLength(5);
      } finally {
        await store.client.from("summin_rooms").delete().eq("code", room.code);
      }
    });
  },
);
