"use client";
import { useLayoutEffect, useState } from "react";
import { motion } from "motion/react";
import { PlayingCard } from "./card";
import type { Card } from "@/game/types";

type Position = { x: number; y: number; scale: number };
const faces: (Card | null)[] = [
  { id: "spades-13", rank: 13, value: 13, suit: "spades" },
  { id: "diamonds-7", rank: 7, value: 7, suit: "diamonds" },
  null,
];

// The same three DOM cards exist from the landing page through the table.
// Only their destinations change; room navigation never replaces this scene.
export function SceneCards({
  scene,
  reduced,
}: {
  scene: string;
  reduced: boolean;
}) {
  const [positions, setPositions] = useState<Position[]>([]);
  const landing = scene === "landing";
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = document.querySelector(".app")?.getBoundingClientRect();
        const destination = document
          .querySelector("[data-scene-deck]")
          ?.getBoundingClientRect();
        const measured = [0, 1, 2].map((i) => {
          const rect = landing
            ? document
                .querySelector(`[data-scene-anchor="${i}"]`)
                ?.getBoundingClientRect()
            : destination;
          return rect && root
            ? {
                x: rect.left - root.left + (landing ? 0 : i * 2),
                y: rect.top - root.top - (landing ? 0 : i * 2),
                scale: rect.width / 131,
              }
            : null;
        });
        if (measured.every((p): p is Position => p !== null))
          setPositions(measured);
        else setPositions([]);
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    const anchor = document.querySelector(
      landing ? ".hero" : "[data-scene-deck]",
    );
    if (anchor) observer.observe(anchor);
    const table = document.querySelector(".game-page, .lobby");
    if (table) observer.observe(table);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [scene, landing]);
  return (
    <div
      className={`scene-cards ${landing ? "at-landing" : "at-deck"}`}
      aria-hidden="true"
      data-scene={scene}
    >
      {positions.map((position, i) => (
        <motion.div
          key={i}
          className="scene-card"
          data-flight-card={i}
          initial={false}
          animate={{
            ...position,
            opacity: 1,
          }}
          transition={{
            type: "spring",
            duration: reduced ? 0 : 1.15,
            bounce: 0.12,
            delay: reduced ? 0 : i * 0.065,
          }}
          style={{ transformOrigin: "top left" }}
        >
          <motion.div
            animate={{
              rotateZ: landing ? [-16, 18, -9][i] : 0,
              rotateX: landing ? [12, -9, 14][i] : 10,
              rotateY: landing ? [-16, 16, -12][i] : 0,
            }}
            transition={{
              duration: reduced ? 0 : 0.9,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              transformPerspective: 1000,
              transformStyle: "preserve-3d",
            }}
          >
            <div className="scene-card-content">
              <PlayingCard
                card={landing ? faces[i] : null}
                size="hero"
                silent
              />
            </div>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}

export function SceneDeck() {
  return (
    <div
      className="deck-stack scene-deck"
      data-deck
      data-scene-deck
      aria-label="Shared deck"
    >
      <PlayingCard card={null} size="small" silent />
    </div>
  );
}
