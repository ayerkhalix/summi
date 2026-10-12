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
      const clock = Date.now();
      const store = new SupabaseStore(url!, key!),
        rooms = new RoomService(store, () => clock),
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
    }, 120000);
    it("delivers server-only revision signals and atomically shares commands between server instances", async () => {
      const clock = Date.now();
      const store = new SupabaseStore(url!, key!);
      const host = hashToken(randomUUID()), friend = hashToken(randomUUID());
      const rooms = new RoomService(store, () => clock);
      const otherServer = new RoomService(new SupabaseStore(url!, key!), () => clock);
      const room = await rooms.create("Signal host", host);
      let revision = -1;
      const channel = store.client.channel(`test-${randomUUID()}`, {
        config: { postgres_changes_options: { wait: true, timeout: 15000 } },
      }).on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "summin_room_signals", filter: `id=eq.${room.id}`,
      }, ({ new: payload }) => { revision = Number(payload.revision); });
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Realtime subscription timed out")), 20000);
          channel.subscribe((status) => {
            if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              clearTimeout(timeout); reject(new Error("Realtime subscription unavailable"));
            }
          });
        });
        const joined = await otherServer.join(room.code, "Signal friend", "player", friend);
        await expect.poll(() => revision, { timeout: 15000 }).toBe(joined.version);
        await Promise.all([
          rooms.command(room.code, host, randomUUID(), { type: "ready", ready: true }),
          otherServer.command(room.code, friend, randomUUID(), { type: "ready", ready: true }),
        ]);
        const shared = await rooms.read(room.code, host);
        expect(shared.members.every((m) => m.ready)).toBe(true);
        const started = (await rooms.command(room.code, host, randomUUID(), { type: "start" }, 0))!;
        expect(started.game?.phase).toBe("burn");
        const friendView = await otherServer.read(room.code, friend);
        expect(friendView.game).toEqual(started.game);
        expect(JSON.stringify(friendView)).not.toContain("tokenHash");
      } finally {
        await store.client.removeChannel(channel);
        await store.client.from("summin_rooms").delete().eq("code", room.code);
      }
    }, 120000);
  },
);
