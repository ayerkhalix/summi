"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import { audio, DEFAULT_AUDIO } from "@/audio/manager";
import { Suit } from "./card";

export function useResultsReducedMotion() {
  const system = useReducedMotion();
  const prefs = useSyncExternalStore(audio.subscribe, audio.snapshot, () => DEFAULT_AUDIO);
  return !!system || prefs.reducedMotion;
}

export function ResultCount({ value, play, reduced, label }: { value: number; play: boolean; reduced: boolean; label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  useEffect(() => {
    if (!ref.current) return;
    if (!play || reduced || played.current) { ref.current.textContent = String(value); return; }
    played.current = true;
    const node = ref.current;
    const start = performance.now() + 450;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / 1000));
      node.textContent = String(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); node.textContent = String(value); };
  }, [value, play, reduced]);
  return <span aria-label={`${value} ${label}`} className="result-count"><span ref={ref} aria-hidden="true">{play && !reduced ? 0 : value}</span></span>;
}

export function ResultParticles() {
  return <div className="result-particles" aria-hidden="true">
    {(["spades", "diamonds", "clubs", "hearts", "diamonds", "spades", "hearts", "clubs"] as const).map((suit, index) =>
      <span key={index} className={`result-particle particle-${index}`}><Suit suit={suit} /></span>)}
  </div>;
}
