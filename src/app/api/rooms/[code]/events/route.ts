import { NextRequest } from "next/server";
import { codeSchema, failure, limit, service, token } from "@/server/http";
import { hashToken } from "@/server/rooms";
import { SupabaseStore } from "@/server/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeSchema.parse((await context.params).code),
      guest = token(req);
    await limit(req, guest, "stream");
    const rooms = service(),
      identity = hashToken(guest);
    const first = await rooms.read(code, identity);
    const encoder = new TextEncoder();
    let stopped = false,
      inFlight = false,
      last = "";
    let interval: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let subscription:
      | ReturnType<SupabaseStore["client"]["channel"]>
      | undefined;
    const cleanup = () => {
      stopped = true;
      clearInterval(interval);
      clearTimeout(timeout);
      if (subscription && rooms.store instanceof SupabaseStore)
        void rooms.store.client.removeChannel(subscription);
    };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const emit = (data: unknown) => {
          if (!stopped)
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
            );
        };
        const refresh = async () => {
          if (stopped || inFlight) return;
          inFlight = true;
          try {
            const view = await rooms.read(code, identity);
            const encoded = JSON.stringify(view);
            if (encoded !== last) {
              emit(view);
              last = encoded;
            }
          } catch {
            emit({ error: "Room connection interrupted. Reconnecting…" });
            cleanup();
            controller.close();
          } finally {
            inFlight = false;
          }
        };
        emit(first);
        last = JSON.stringify(first);
        // Server-side Realtime receives only UUID/revision signals. All card views are reauthorized here.
        if (rooms.store instanceof SupabaseStore) {
          subscription = rooms.store.client
            .channel(`room-${first.id}-${crypto.randomUUID()}`)
            .on(
              "postgres_changes",
              {
                event: "UPDATE",
                schema: "public",
                table: "summin_room_signals",
                filter: `id=eq.${first.id}`,
              },
              () => {
                void refresh();
              },
            )
            .subscribe();
        }
        interval = setInterval(() => {
          void refresh();
        }, 1500); // local transport + reliable Realtime fallback
        timeout = setTimeout(() => {
          if (!stopped)
            controller.enqueue(encoder.encode("event: rotate\ndata: {}\n\n"));
          cleanup();
          controller.close();
        }, 50000); // EventSource reconnects on serverless hosts without a false outage notification.
        req.signal.addEventListener(
          "abort",
          () => {
            if (!stopped) {
              cleanup();
              controller.close();
            }
          },
          { once: true },
        );
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store, private",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
