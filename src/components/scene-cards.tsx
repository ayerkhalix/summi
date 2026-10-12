"use client";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { motion } from "motion/react";
import { PlayingCard } from "./card";
import { ShowcaseCard } from "./showcase-card";

type Position = { x: number; y: number; scale: number };
const cards = [0, 1, 2, 3, 4, 5];
const subscribeHydration = () => () => {};

// The same six DOM cards exist from the landing page through the table.
// Only their destinations change; room navigation never replaces this scene.
export function SceneCards({
  scene,
  reduced,
}: {
  scene: string;
  reduced: boolean;
}) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const landing = scene === "landing";
  useEffect(() => {
    const visibility = () => setPageVisible(!document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    const hero = document.querySelector(".hero");
    if (!hero) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(hero);
    return () => observer.disconnect();
  }, [landing]);
  const running = hydrated && landing && !reduced && visible && pageVisible;
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = document.querySelector(".app")?.getBoundingClientRect();
        const destination = document
          .querySelector("[data-scene-deck]")
          ?.getBoundingClientRect();
        const measured = cards.map((i) => {
          const rect = landing
            ? document
                .querySelector(`[data-scene-anchor="${i}"]`)
                ?.getBoundingClientRect()
            : destination;
          return rect && root
            ? {
                x: rect.left - root.left + (landing ? 0 : i * 0.8),
                y: rect.top - root.top - (landing ? 0 : i * 0.8),
                scale: rect.width / 130,
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
    window.addEventListener("summin-table-settled", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("summin-table-settled", measure);
    };
  }, [scene, landing]);
  return (
    <div
      className={`scene-cards ${landing ? "at-landing" : "at-deck"} ${running ? "scene-running" : "scene-paused"}`}
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
              rotateZ: landing ? [-14, 15, 10, -13, -8, 17][i] : 0,
              rotateX: landing ? [8, -6, 10, -8, 6, -10][i] : 0,
              rotateY: landing ? [-12, 10, -8, 12, -6, 8][i] : 0,
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
            <div className="scene-card-content" style={{ "--drift-time": `${7 + i * 0.9}s`, "--drift-delay": `${-i * 1.7}s` } as CSSProperties}>
              <ShowcaseCard index={i} landing={landing} running={running} />
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
