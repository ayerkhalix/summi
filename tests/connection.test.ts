import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectRoom } from "@/lib/room-connection";

class Stream extends EventTarget {
  static all: Stream[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor() { super(); Stream.all.push(this); }
  close() { this.closed = true; }
  message(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent); }
}
let stop: (() => void) | undefined;
const callbacks = () => ({ room: vi.fn(), connection: vi.fn(), error: vi.fn() });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000000);
  Stream.all = [];
  vi.stubGlobal("EventSource", Stream);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ code: "ABC234", version: 1 })));
});
afterEach(() => {
  stop?.(); stop = undefined;
  vi.useRealTimers(); vi.unstubAllGlobals();
});
describe("room connection recovery", () => {
  it("serializes slow heartbeats and debounces repeated browser focus", async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    stop = connectRoom("ABC234", callbacks());
    for (let i = 0; i < 100; i++) window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(15000);
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(Response.json({ code: "ABC234", version: 2 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("honors Retry-After without declaring a healthy stream disconnected", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "Please wait." }, { status: 429, headers: { "Retry-After": "60" } }));
    const events = callbacks();
    stop = connectRoom("ABC234", events);
    await vi.advanceTimersByTimeAsync(55000);
    for (let i = 0; i < 30; i++) window.dispatchEvent(new Event("focus"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(events.connection).not.toHaveBeenCalledWith(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("backs off repeated stream failures and cancels reconnects when leaving", async () => {
    stop = connectRoom("ABC234", callbacks());
    for (const delay of [2000, 4000, 8000, 16000, 30000]) {
      const previous = Stream.all.length;
      Stream.all.at(-1)!.onerror?.();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(Stream.all).toHaveLength(previous);
      await vi.advanceTimersByTimeAsync(1);
      expect(Stream.all).toHaveLength(previous + 1);
    }
    Stream.all.at(-1)!.onerror?.();
    const count = Stream.all.length;
    stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(Stream.all).toHaveLength(count);
  });
  it("rotates scheduled streams without showing a lost connection", async () => {
    const events = callbacks();
    stop = connectRoom("ABC234", events);
    const stream = Stream.all[0];
    stream.dispatchEvent(new Event("rotate"));
    stream.onerror?.();
    await vi.advanceTimersByTimeAsync(500);
    expect(Stream.all).toHaveLength(2);
    expect(events.connection).not.toHaveBeenCalledWith(false);
  });
  it("stops reconnecting when a room is gone", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "Room not found." }, { status: 404 }));
    const events = callbacks();
    stop = connectRoom("ABC234", events);
    await vi.advanceTimersByTimeAsync(60000);
    expect(events.error).toHaveBeenCalledWith("Room not found.");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(Stream.all[0].closed).toBe(true);
  });
});
