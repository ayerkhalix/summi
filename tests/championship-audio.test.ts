import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function audioDevice() {
  const parameter = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() });
  const nodes: ReturnType<typeof node>[] = [];
  function node() {
    return { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as null | (() => void),
      gain: parameter(), frequency: parameter(), detune: parameter(), type: "", buffer: null };
  }
  const makeNode = () => { const value = node(); nodes.push(value); return value; };
  const context = { state: "running", currentTime: 10, sampleRate: 8000, destination: {},
    createGain: makeNode, createOscillator: makeNode, createBiquadFilter: makeNode, createBufferSource: makeNode,
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }), resume: vi.fn() };
  vi.stubGlobal("AudioContext", function () { return context; });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal("window", {});
  return { context, nodes, sources: () => nodes.filter(value => value.start.mock.calls.length) };
}

describe("championship sound lifecycle", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());
  it("requires an unlocked, running audio device and respects mute and effects volume", async () => {
    const device = audioDevice(), { audio } = await import("@/audio/manager");
    audio.championship(); expect(device.sources()).toHaveLength(0);
    await audio.unlock();
    audio.update({ muted: true }); audio.championship(); expect(device.sources()).toHaveLength(0);
    audio.update({ muted: false, effects: 0 }); audio.championship(); expect(device.sources()).toHaveLength(0);
    audio.update({ effects: .45 }); device.context.state = "suspended";
    audio.championship(); expect(device.sources()).toHaveLength(0);
  });
  it("builds to a later resolution, ends within three seconds and cancels all scheduled voices", async () => {
    const device = audioDevice(), { audio } = await import("@/audio/manager");
    await audio.unlock(); const stop = audio.championship();
    const sources = device.sources(); expect(sources.length).toBeGreaterThan(1);
    expect(sources.some(source => source.start.mock.calls[0][0] > device.context.currentTime + 1)).toBe(true);
    expect(sources.every(source => source.stop.mock.calls[0][0] <= device.context.currentTime + 3)).toBe(true);
    stop(); stop();
    for (const source of sources) {
      expect(source.stop).toHaveBeenLastCalledWith();
      expect(source.disconnect).toHaveBeenCalled(); expect(source.onended).toBeNull();
    }
  });
  it("stops an active celebration when muted or effects are disabled", async () => {
    const device = audioDevice(), { audio } = await import("@/audio/manager"); await audio.unlock();
    for (const prefs of [{ muted: true }, { effects: 0 }]) {
      audio.update({ muted: false, effects: .45 }); audio.championship();
      const sources = device.sources().filter(source => source.onended !== null);
      expect(sources.length).toBeGreaterThan(0); audio.update(prefs);
      expect(sources.every(source => source.onended === null)).toBe(true);
    }
  });
  it("releases completed nodes and never overlaps two celebration sequences", async () => {
    const device = audioDevice(), { audio } = await import("@/audio/manager"); await audio.unlock();
    audio.championship(); const first = device.sources();
    first[0].onended!(); expect(first[0].disconnect).toHaveBeenCalled();
    const stop = audio.championship();
    expect(first.slice(1).every(source => source.onended === null)).toBe(true);
    stop();
  });
  it("cleans up the buildup if a device fails while scheduling the remaining sound", async () => {
    const device = audioDevice(), { audio } = await import("@/audio/manager"); await audio.unlock();
    device.context.createBuffer = () => { throw new Error("Unavailable device"); };
    expect(() => audio.championship()).not.toThrow();
    expect(device.sources().length).toBeGreaterThan(0);
    expect(device.sources().every(source => source.onended === null)).toBe(true);
  });
});
