"use client";
import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import type { Card as CardType } from "@/game/types";
import { audio } from "@/audio/manager";
import { MOTION } from "@/game/config";
export function Suit({
  suit,
  className = "",
}: {
  suit: CardType["suit"];
  className?: string;
}) {
  const path = {
    hearts:
      "M12 21S2 14.5 2 7.8C2 1.8 9 .2 12 5.5 15 .2 22 1.8 22 7.8 22 14.5 12 21 12 21Z",
    diamonds: "M12 1 22 12 12 23 2 12Z",
    spades:
      "M12 1C9 5 2 9.5 2 14a5 5 0 0 0 8.8 3.3L9 23h6l-1.8-5.7A5 5 0 0 0 22 14C22 9.5 15 5 12 1Z",
    clubs:
      "M12 1a4.8 4.8 0 0 0-3.6 8 5 5 0 1 0 2.4 8.4L9 23h6l-1.8-5.6A5 5 0 1 0 15.6 9 4.8 4.8 0 0 0 12 1Z",
  }[suit];
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  );
}
export const rankLabel = (rank: number) =>
  ({ 1: "A", 11: "J", 12: "Q", 13: "K" })[rank] ?? String(rank);
export const PlayingCard = memo(function PlayingCard({
  card,
  isPublic = false,
  size = "normal",
  delay = 0,
  silent = false,
}: {
  card: CardType | null;
  isPublic?: boolean;
  size?: "normal" | "small" | "hero";
  delay?: number;
  silent?: boolean;
}) {
  const reduce = useReducedMotion();
  const previous = useRef(card?.id ?? null);
  const element = useRef<HTMLDivElement>(null),
    movement = useAnimationControls();
  useLayoutEffect(() => {
    if (reduce || audio.snapshot().reducedMotion || silent) {
      movement.set({ opacity: 1, x: 0, y: 0, scale: 1 });
      return;
    }
    const destination = element.current?.getBoundingClientRect();
    const source = document
      .querySelector("[data-deck]")
      ?.getBoundingClientRect();
    const dx =
      source && destination
        ? source.left +
          source.width / 2 -
          destination.left -
          destination.width / 2
        : 0;
    const dy =
      source && destination
        ? source.top +
          source.height / 2 -
          destination.top -
          destination.height / 2
        : -20;
    const wait = Math.min(delay, MOTION.maxStagger);
    movement.set({ opacity: 0, x: dx, y: dy, scale: 0.75 });
    void movement.start({
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: {
        delay: wait,
        duration: MOTION.deal,
        ease: [0.22, 0.7, 0.3, 1],
      },
    });
    const timer = setTimeout(() => audio.play("deal"), wait * 1000);
    return () => {
      clearTimeout(timer);
      movement.stop();
    };
  }, [delay, movement, reduce, silent]);
  useEffect(() => {
    if (card && !previous.current && !silent) {
      const timer = setTimeout(
        () => {
          audio.play("flip");
        },
        reduce ? 0 : 120,
      );
      previous.current = card.id;
      return () => clearTimeout(timer);
    }
    previous.current = card?.id ?? null;
  }, [card, reduce, silent]);
  const red = card?.suit === "hearts" || card?.suit === "diamonds";
  return (
    <motion.div
      ref={element}
      className={`playing-card card-${size} ${red ? "red" : "black"} ${isPublic ? "is-public" : ""}`}
      initial={false}
      animate={movement}
      role="img"
      aria-label={
        card
          ? `${rankLabel(card.rank)} of ${card.suit}, value ${card.value}${isPublic ? ", public" : ", private"}`
          : "Hidden card"
      }
      data-card={card?.id ?? "hidden"}
    >
      <motion.div
        className="card-flipper"
        animate={{ rotateY: card ? 0 : 180 }}
        initial={isPublic && !silent && !reduce ? { rotateY: 180 } : false}
        transition={{
          duration: reduce || audio.snapshot().reducedMotion ? 0 : MOTION.flip,
        }}
      >
        <div className="card-front">
          {card && (
            <>
              <div className="card-corner">
                <b>{rankLabel(card.rank)}</b>
                <Suit suit={card.suit} />
              </div>
              {card.rank > 10 ? (
                <div className="court-art">
                  <svg viewBox="0 0 80 105" aria-hidden="true">
                    <path
                      d="m18 20 5 15h34l5-15-15 8-7-15-7 15ZM24 41h32v18L40 72 24 59ZM30 45v10m20-10v10M18 91l10-22 12 10 12-10 10 22M27 89h26M40 80v12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="m7 50 7 7-7 7-7-7ZM73 50l7 7-7 7-7-7Z"
                      fill="currentColor"
                    />
                  </svg>
                  <span>{rankLabel(card.rank)}</span>
                </div>
              ) : (
                <div className="card-center">
                  <Suit suit={card.suit} />
                  <span>{card.value}</span>
                </div>
              )}
              <div className="card-corner bottom">
                <b>{rankLabel(card.rank)}</b>
                <Suit suit={card.suit} />
              </div>
              {isPublic && <span className="public-dot" title="Public card" />}
            </>
          )}
        </div>
        <div className="card-back">
          <div className="back-border">
            <svg viewBox="0 0 80 110" aria-hidden="true">
              <path
                d="m40 10 28 45-28 45L12 55ZM40 25l19 30-19 30-19-30Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
              <path d="m40 39 10 16-10 16-10-16Z" fill="currentColor" />
            </svg>
            <span>S</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});
