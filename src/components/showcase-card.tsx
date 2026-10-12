"use client";
import { useEffect, useState } from "react";
import type { Card } from "@/game/types";
import { PlayingCard } from "./card";

const faces: (Card | null)[] = [
  { id: "spades-1", rank: 1, value: 1, suit: "spades" },
  { id: "diamonds-7", rank: 7, value: 7, suit: "diamonds" },
  { id: "clubs-12", rank: 12, value: 12, suit: "clubs" },
  { id: "hearts-10", rank: 10, value: 10, suit: "hearts" },
  { id: "spades-13", rank: 13, value: 13, suit: "spades" },
  null,
  { id: "diamonds-11", rank: 11, value: 11, suit: "diamonds" },
  { id: "hearts-3", rank: 3, value: 3, suit: "hearts" },
  { id: "clubs-9", rank: 9, value: 9, suit: "clubs" },
];
const starts = [1800, 3400, 2600, 4900, 4100, 5800];
const intervals = [6200, 7900, 6800, 8900, 7400, 9600];

export function ShowcaseCard({ index, landing, running }: { index: number; landing: boolean; running: boolean }) {
  const [face, setFace] = useState(index);
  const [faceUp, setFaceUp] = useState(true);
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout>;
    const cycle = () => {
      setFaceUp(false);
      // Change the face only once the plum back fully covers it.
      timer = setTimeout(() => {
        setFace((previous) => (previous + 2 + index % 2) % faces.length);
        timer = setTimeout(() => {
          setFaceUp(true);
          timer = setTimeout(cycle, intervals[index]);
        }, 320 + index * 80);
      }, 560);
    };
    timer = setTimeout(cycle, starts[index]);
    return () => clearTimeout(timer);
  }, [running, index]);
  return <PlayingCard card={landing ? faces[face] : null} showBack={!faceUp} size="hero" silent />;
}
