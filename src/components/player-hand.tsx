"use client";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { CardView, GameView } from "@/game/types";
import { MOTION } from "@/game/config";
import { PlayingCard, rankLabel } from "./card";
import { InspectableCard } from "./inspectable-card";
import { Icon } from "./icon";
import { Avatar } from "./table-shared";

type Player = GameView["players"][number];
const describeCard = (held: CardView) =>
  held.public && held.card
    ? `${rankLabel(held.card.rank)} of ${held.card.suit} · value ${held.card.value}`
    : "Hidden card · unknown until its reveal";

// Inspection only reads public faces. Selecting a card never changes the hand.
export function OwnHand({ player, name, target, active }: {
  player: Player; name: string; target: number; active: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const hidden = player.hand.filter((card) => !card.public).length;
  const total = player.hand.reduce((sum, held) => sum + (held.public ? held.card?.value ?? 0 : 0), 0);
  const inspected = player.hand.find((card) => card.slotId === selected);
  return (
    <section className={`own-hand ${active ? "your-turn" : ""}`} aria-label="Your hand">
      <div className="hand-heading">
        <div>
          <Avatar name={name} />
          <span>
            <strong>{name} <small>YOU</small></strong>
            <span className="muted">{player.hand.length} cards · {hidden} hidden</span>
          </span>
        </div>
        <div className="own-total">
          <span>{hidden ? "REVEALED TOTAL" : "YOUR TOTAL"}</span>
          <strong>{player.hand.length ? total : "—"}</strong>
          <small>{hidden ? `${hidden} still hidden` : player.hand.length ? `${Math.abs(total - target)} ${total === target ? "exact" : total < target ? "below" : "above"}` : ""}</small>
        </div>
      </div>
      <div className="hand-scroll" tabIndex={0} aria-label="Your cards; scroll to inspect the full hand">
        <div className="own-cards" style={{
          gridTemplateColumns: player.hand.length > 1 ? `repeat(${player.hand.length - 1}, minmax(44px, var(--hand-card-w))) var(--hand-card-w)` : player.hand.length ? "var(--hand-card-w)" : "1fr",
        } as CSSProperties}>
          {player.hand.length ? player.hand.map((held, index) => (
            <button
              type="button"
              key={held.slotId}
              className={`hand-card inspect-card ${selected === held.slotId ? "selected-card" : ""}`}
              aria-label={`Inspect card ${index + 1}: ${describeCard(held)}`}
              aria-pressed={selected === held.slotId}
              onClick={() => setSelected(selected === held.slotId ? null : held.slotId)}
            >
              <PlayingCard card={held.card} faceUp={held.public} isPublic={held.public} delay={held.dealOrder * MOTION.dealStagger} />
            </button>
          )) : (
            <div className="hand-placeholder">
              <Icon name="shuffle" size={26} />
              <span>Your hand starts here.</span>
              <small>Choose a count. The cards arrive face down.</small>
            </div>
          )}
        </div>
      </div>
      <p className="hand-inspection" aria-live="polite">
        {inspected ? describeCard(inspected) : player.hand.length ? "Select a card to inspect it. Hidden cards stay unknown." : "One shared deck. Every draw changes the odds."}
      </p>
      <div className="hand-legend">
        <span className="legend-public" /> Revealed
        <span className="legend-private" /> Hidden from everyone
      </div>
    </section>
  );
}

export function PlayerHand({ player, name, index, active, disconnected, phase }: {
  player: Player; name: string; index: number; active: boolean; disconnected: boolean; phase: GameView["phase"];
}) {
  const total = player.hand.reduce((sum, held) => sum + (held.public ? held.card?.value ?? 0 : 0), 0);
  const hidden = player.hand.filter((held) => !held.public).length;
  const status = disconnected ? "Disconnected" : active ? "Taking their turn" : phase === "initial_selection" ? player.committed ? "Choice committed" : "Choosing a hand" : `${player.hand.length} cards · ${hidden} hidden`;
  return (
    <article className={`opponent ${active ? "active-player" : ""}`} aria-label={`${name}'s public hand`}>
      <div className="opponent-heading">
        <Avatar name={name} index={index} />
        <div><strong title={name}>{name}</strong><span>{status}</span></div>
        <div className="public-total"><b>{player.hand.length ? total : "—"}</b><small>{phase === "round_results" ? "FINAL" : "REVEALED"}</small></div>
      </div>
      <div className="opponent-cards" tabIndex={0} aria-label={`${name}'s revealed cards`}>
        {player.hand.map((held, cardIndex) => (
          <div key={held.slotId} className="hand-card">
            <InspectableCard card={held.card} isPublic={held.public} label={`${name}'s card ${cardIndex + 1}`} delay={held.dealOrder * MOTION.dealStagger} />
          </div>
        ))}
        {!player.hand.length && <span className="muted empty-hand">{player.committed ? "Ready for the deal" : "Choosing possibilities"}</span>}
      </div>
    </article>
  );
}
