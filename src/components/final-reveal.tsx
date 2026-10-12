"use client";
import { motion, useReducedMotion } from "motion/react";
import type { RoomView } from "@/server/types";
import { PlayingCard } from "./card";
import { audio } from "@/audio/manager";

export function FinalReveal({ room }: { room: RoomView }) {
  const game = room.game!;
  const progress = game.finalReveal;
  const last = game.players.flatMap((p) => p.hand.map((held) => ({ held, playerId: p.id })))
    .find(({ held }) => held.slotId === progress?.lastSlotId);
  const complete = game.players.every((p) => p.hand.every((c) => c.public));
  const reduce = useReducedMotion() || audio.snapshot().reducedMotion;
  return <section className="decision-panel final-reveal-stage" aria-label="Dramatic final reveal" aria-live="polite">
    <span className="eyebrow">{complete ? "ALL CARDS REVEALED" : "THE LAST SECRETS"}</span>
    <div className="reveal-card-space">
      {last?.held.card ? <motion.div key={last.held.slotId} className="reveal-spotlight"
        initial={reduce ? false : { rotateY: 180, scale: 0.88, y: 8 }}
        animate={{ rotateY: 0, scale: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 0.7, 0.3, 1] }}>
        <PlayingCard card={last.held.card} isPublic silent />
      </motion.div> : <div className="reveal-spotlight"><PlayingCard card={null} silent /></div>}
    </div>
    <strong>{last ? room.members.find((m) => m.id === last.playerId)?.name ?? "Former player" : "Hold your breath."}</strong>
    <p>{complete ? "Let the numbers sink in. Results in 3 seconds." : `${progress?.revealed ?? 0} of ${progress?.total ?? 0} final cards revealed`}</p>
    <div className="reveal-progress"><span style={{ width: `${((progress?.revealed ?? 0) / Math.max(1, progress?.total ?? 1)) * 100}%` }} /></div>
  </section>;
}
