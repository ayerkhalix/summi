import { TIMING } from "@/game/config";
import type { RoomView } from "@/server/types";
import { request, RequestError } from "./api";

export function connectRoom(code: string, callbacks: {
  room: (room: RoomView) => void;
  connection: (connected: boolean) => void;
  error: (message: string) => void;
}) {
  let active = true, online = true, failures = 0, pendingBeat = false;
  let nextBeat = 0;
  let source: EventSource | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const connection = (value: boolean) => {
    if (active && online !== value) {
      online = value;
      callbacks.connection(value);
    }
  };
  const open = () => {
    if (!active) return;
    let rotating = false;
    const stream = new EventSource(`/api/rooms/${code}/events`);
    source = stream;
    const retry = () => {
      if (!active || source !== stream) return;
      stream.close();
      source = undefined;
      if (!rotating) connection(false);
      const delay = rotating ? 500 : Math.min(30000, 2000 * 2 ** Math.min(failures++, 4));
      reconnect = setTimeout(open, delay);
    };
    stream.addEventListener("rotate", () => { rotating = true; });
    stream.onmessage = (event) => {
      if (!active || source !== stream) return;
      try {
        const data = JSON.parse(event.data) as RoomView & { error?: string };
        if (data.error || data.code !== code || !Number.isInteger(data.version)) {
          retry();
          return;
        }
        failures = 0;
        connection(true);
        callbacks.room(data);
      } catch {
        retry();
      }
    };
    stream.onerror = retry;
  };
  const beat = async () => {
    if (!active || pendingBeat || Date.now() < nextBeat) return;
    if (!navigator.onLine) { connection(false); return; }
    pendingBeat = true;
    nextBeat = Date.now() + TIMING.heartbeat;
    try {
      const room = await request<RoomView>(`/api/rooms/${code}`, "PATCH", {
        requestId: crypto.randomUUID(), command: { type: "heartbeat" },
      }, controller.signal);
      if (active) {
        connection(true);
        callbacks.room(room);
      }
    } catch (error) {
      if (!active) return;
      if (error instanceof RequestError && error.status === 429) {
        nextBeat = Date.now() + error.retryAfter * 1000;
      } else {
        connection(false);
        if (error instanceof RequestError && [401, 403, 404, 410].includes(error.status)) {
          callbacks.error(error.message);
          source?.close();
          clearTimeout(reconnect);
          clearInterval(heartbeat);
          active = false;
        }
      }
    } finally {
      pendingBeat = false;
    }
  };
  const heartbeat = setInterval(() => void beat(), TIMING.heartbeat);
  const refresh = () => void beat();
  open();
  void beat();
  window.addEventListener("online", refresh);
  window.addEventListener("focus", refresh);
  return () => {
    active = false;
    controller.abort();
    source?.close();
    clearInterval(heartbeat);
    clearTimeout(reconnect);
    window.removeEventListener("online", refresh);
    window.removeEventListener("focus", refresh);
  };
}
