"use client";
import { scheduleChampionship } from "./championship";
export const SOUNDS = [
  "click",
  "hover",
  "created",
  "joined",
  "left",
  "ready",
  "copy",
  "error",
  "lost",
  "restored",
  "shuffle",
  "deal",
  "slide",
  "flip",
  "reveal",
  "add",
  "pass",
  "final",
  "target",
  "phase",
  "turn",
  "resolution",
  "victory",
  "defeat",
  "shared",
] as const;
export type Sound = (typeof SOUNDS)[number];
export type AudioPreferences = {
  muted: boolean;
  effects: number;
  music: number;
  musicEnabled: boolean;
  reducedMotion: boolean;
};
export const DEFAULT_AUDIO: AudioPreferences = {
  muted: false,
  effects: 0.45,
  music: 0.16,
  musicEnabled: false,
  reducedMotion: false,
};
const presets: Record<
  Sound,
  { notes: number[]; duration: number; noise?: boolean }
> = {
  click: { notes: [440, 660], duration: 0.06 },
  hover: { notes: [330], duration: 0.04 },
  created: { notes: [262, 392, 524], duration: 0.16 },
  joined: { notes: [330, 440], duration: 0.13 },
  left: { notes: [330, 220], duration: 0.14 },
  ready: { notes: [440, 554], duration: 0.1 },
  copy: { notes: [660, 880], duration: 0.07 },
  error: { notes: [196, 185], duration: 0.14 },
  lost: { notes: [294, 220, 147], duration: 0.18 },
  restored: { notes: [220, 330, 440], duration: 0.15 },
  shuffle: { notes: [120, 180, 140], duration: 0.08, noise: true },
  deal: { notes: [180], duration: 0.065, noise: true },
  slide: { notes: [230], duration: 0.1, noise: true },
  flip: { notes: [300, 500], duration: 0.045, noise: true },
  reveal: { notes: [392, 588], duration: 0.11 },
  add: { notes: [294, 440], duration: 0.11 },
  pass: { notes: [262, 220], duration: 0.09 },
  final: { notes: [262, 392, 524, 660], duration: 0.17 },
  target: { notes: [131, 262, 392], duration: 0.18 },
  phase: { notes: [220, 330], duration: 0.12 },
  turn: { notes: [524, 660], duration: 0.12 },
  resolution: { notes: [196, 294, 392], duration: 0.2 },
  victory: { notes: [262, 330, 392, 524], duration: 0.18 },
  defeat: { notes: [294, 262, 196], duration: 0.18 },
  shared: { notes: [262, 392, 330, 524, 660], duration: 0.16 },
};
class AudioManager {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private ambient: GainNode | null = null;
  private ambientNodes: OscillatorNode[] = [];
  private voices = new Set<OscillatorNode | AudioBufferSourceNode>();
  private listeners = new Set<() => void>();
  private loaded = false;
  private prefs = DEFAULT_AUDIO;
  private lastPlay = new Map<string, number>();
  private stopChampionship = () => {};
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => {
    if (!this.loaded && typeof window !== "undefined") {
      this.loaded = true;
      try {
        const raw = JSON.parse(localStorage.getItem("summin-audio") || "{}");
        this.prefs = {
          muted: typeof raw.muted === "boolean" ? raw.muted : false,
          effects:
            typeof raw.effects === "number"
              ? Math.max(0, Math.min(1, raw.effects))
              : 0.45,
          music:
            typeof raw.music === "number"
              ? Math.max(0, Math.min(1, raw.music))
              : 0.16,
          musicEnabled: raw.musicEnabled === true,
          reducedMotion: raw.reducedMotion === true,
        };
      } catch {
        this.prefs = DEFAULT_AUDIO;
      }
    }
    return this.prefs;
  };
  update(partial: Partial<AudioPreferences>) {
    this.prefs = { ...this.snapshot(), ...partial };
    if (this.prefs.muted || this.prefs.effects === 0) this.stopChampionship();
    try {
      localStorage.setItem("summin-audio", JSON.stringify(this.prefs));
    } catch {
      /* Storage is optional. */
    }
    if (this.context && this.output)
      this.output.gain.setTargetAtTime(
        this.prefs.muted ? 0 : this.prefs.effects * 0.19,
        this.context.currentTime,
        0.025,
      );
    this.syncMusic();
    this.listeners.forEach((fn) => fn());
  }
  async unlock() {
    try {
      this.snapshot();
      if (!this.context) {
        this.context = new AudioContext();
        this.output = this.context.createGain();
        this.output.gain.value = this.prefs.muted
          ? 0
          : this.prefs.effects * 0.19;
        this.output.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
      this.syncMusic();
    } catch {
      /* Audio never blocks play. */
    }
  }
  championship() {
    this.stopChampionship();
    if (!this.context || !this.output || this.context.state !== "running" ||
      this.prefs.muted || this.prefs.effects === 0) return () => {};
    try {
      this.stopChampionship = scheduleChampionship(this.context, this.output);
      return this.stopChampionship;
    } catch { return () => {}; /* Sound never blocks the results. */ }
  }
  play(sound: Sound) {
    try {
      if (
        !this.context ||
        !this.output ||
        this.prefs.muted ||
        this.context.state !== "running"
      )
        return;
      const now = this.context.currentTime;
      if (
        now - (this.lastPlay.get(sound) ?? -1) < 0.045 ||
        this.voices.size > 20
      )
        return;
      this.lastPlay.set(sound, now);
      const preset = presets[sound];
      preset.notes.forEach((note, i) => {
        const start = now + i * preset.duration * 0.65;
        const gain = this.context!.createGain();
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.48, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, start + preset.duration);
        gain.connect(this.output!);
        let voice: OscillatorNode | AudioBufferSourceNode;
        if (preset.noise) {
          const buffer = this.context!.createBuffer(
            1,
            Math.ceil(this.context!.sampleRate * preset.duration),
            this.context!.sampleRate,
          );
          const data = buffer.getChannelData(0);
          for (let n = 0; n < data.length; n++)
            data[n] = (Math.random() * 2 - 1) * 0.4;
          const noise = this.context!.createBufferSource();
          noise.buffer = buffer;
          const filter = this.context!.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = note * 4;
          noise.connect(filter);
          filter.connect(gain);
          voice = noise;
        } else {
          const osc = this.context!.createOscillator();
          osc.type = "sine";
          osc.frequency.setValueAtTime(note, start);
          osc.frequency.exponentialRampToValueAtTime(
            note * 0.92,
            start + preset.duration,
          );
          osc.connect(gain);
          voice = osc;
        }
        this.voices.add(voice);
        voice.start(start);
        voice.stop(start + preset.duration + 0.015);
        voice.onended = () => {
          this.voices.delete(voice);
          voice.disconnect();
          gain.disconnect();
        };
      });
    } catch {
      /* Unsupported audio devices remain playable. */
    }
  }
  private syncMusic() {
    if (!this.context) return;
    if (this.prefs.musicEnabled && !this.ambient) {
      this.ambient = this.context.createGain();
      this.ambient.gain.value = 0;
      this.ambient.connect(this.context.destination);
      [65.406, 98, 130.813, 164.814].forEach((hz, i) => {
        const osc = this.context!.createOscillator();
        osc.type = "sine";
        osc.frequency.value = hz;
        osc.detune.value = i % 2 ? 3 : -3;
        osc.connect(this.ambient!);
        osc.start();
        this.ambientNodes.push(osc);
      });
    }
    if (this.ambient)
      this.ambient.gain.setTargetAtTime(
        this.prefs.muted || !this.prefs.musicEnabled
          ? 0
          : this.prefs.music * 0.028,
        this.context.currentTime,
        0.4,
      );
    if (!this.prefs.musicEnabled && this.ambient) {
      const old = this.ambient,
        nodes = this.ambientNodes;
      this.ambient = null;
      this.ambientNodes = [];
      for (const osc of nodes) osc.stop(this.context.currentTime + 1);
      setTimeout(() => {
        nodes.forEach((n) => n.disconnect());
        old.disconnect();
      }, 1200);
    }
  }
}
export const audio = new AudioManager();
