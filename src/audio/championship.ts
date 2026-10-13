// The impact and crown reveal share this cue. No game transition waits for it.
export const CHAMPIONSHIP_REVEAL_MS = 1150;

export function scheduleChampionship(context: AudioContext, output: AudioNode) {
  const voices = new Map<AudioScheduledSourceNode, AudioNode[]>();
  const now = context.currentTime;
  const stop = () => {
    for (const [source, nodes] of voices) {
      try { source.stop(); } catch { /* The source may already have ended. */ }
      source.disconnect(); nodes.forEach(node => node.disconnect());
      source.onended = null;
    }
    voices.clear();
  };
  const track = (source: AudioScheduledSourceNode, nodes: AudioNode[], start: number, end: number) => {
    voices.set(source, nodes);
    source.onended = () => {
      source.disconnect();
      nodes.forEach(node => node.disconnect());
      voices.delete(source);
    };
    source.start(now + start);
    source.stop(now + end);
  };
  const tone = (hz: number, start: number, duration: number, level: number, type: OscillatorType = "sine", endHz = hz) => {
    const voice = context.createOscillator(), gain = context.createGain();
    voice.type = type;
    voice.frequency.setValueAtTime(hz, now + start);
    voice.frequency.exponentialRampToValueAtTime(endHz, now + start + duration);
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(level, now + start + .018);
    gain.gain.exponentialRampToValueAtTime(.001, now + start + duration);
    voice.connect(gain); gain.connect(output);
    track(voice, [gain], start, start + duration + .03);
  };
  try {
  // Accelerating low pulses, then a soft filtered air swell into the reveal.
  [0, .34, .61, .82, .98].forEach((start, index) => tone(82.4 + index * 10, start, .15, .24 + index * .035, "triangle"));
  const noise = context.createBufferSource(), filter = context.createBiquadFilter(), swell = context.createGain();
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 1.25), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
  noise.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(180, now);
  filter.frequency.exponentialRampToValueAtTime(2200, now + 1.12);
  swell.gain.setValueAtTime(0, now);
  swell.gain.linearRampToValueAtTime(.22, now + 1.08);
  swell.gain.linearRampToValueAtTime(0, now + 1.25);
  noise.connect(filter); filter.connect(swell); swell.connect(output);
  track(noise, [filter, swell], 0, 1.25);
  const reveal = CHAMPIONSHIP_REVEAL_MS / 1000;
  tone(110, reveal, .45, .65, "sine", 48);
  [130.813, 196, 261.626, 329.628, 392].forEach((hz, index) => {
    tone(hz, reveal + index * .035, 1.35, index < 2 ? .22 : .16, "triangle");
    if (index > 1) tone(hz * 2, reveal + .12 + index * .045, .85, .08);
  });
  } catch (error) { stop(); throw error; }
  return stop;
}
