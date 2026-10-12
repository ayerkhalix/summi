"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Icon } from "./icon";
import { Modal } from "./dialogs";
import type { RoomProps } from "./table-shared";

export function RoundResults(props: RoomProps) {
  const [open, setOpen] = useState(true);
  const own = props.room.game!.results.find((result) => result.playerId === props.room.me);
  return (
    <>
      <section className="decision-panel round-complete" aria-label="Round complete">
        <Icon name="crown" size={26} />
        <span className="eyebrow">ALL CARDS REVEALED</span>
        <h2>{own?.winner ? "Your closest call." : "The numbers are in."}</h2>
        <p>{own ? `Your total: ${own.total}. ${own.distance} from the target.` : "Every hand is now public. See how the table finished."}</p>
        <button className="button primary" onClick={() => setOpen(true)}>View results <Icon name="arrow" /></button>
      </section>
      {open && (
        <Modal title="The final numbers." wide onClose={() => setOpen(false)}>
          <Results {...props} />
          <button className="text-button review-table" onClick={() => setOpen(false)}>Review the revealed table <Icon name="eye" size={16} /></button>
        </Modal>
      )}
    </>
  );
}

function Results({ room, busy, send }: RoomProps) {
  const game = room.game!,
    winners = game.results.filter((r) => r.winner),
    playerName = (id: string) =>
      room.members.find((m) => m.id === id)?.name ?? "Former player";
  return (
    <motion.section
      className="results-panel"
      aria-label="Round results"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span className="eyebrow">
        <Icon name="crown" size={16} />
        {winners.length > 1 ? "SHARED VICTORY" : "THE CLOSEST CALL"}
      </span>
      <h2>
        {winners.map((w) => playerName(w.playerId)).join(" & ")}{" "}
        {winners.length > 1 ? "share the win." : "takes the round."}
      </h2>
      <p className="muted">
        {winners[0].distance === 0
          ? "Right on the number. An exact match."
          : `${winners[0].distance} away from ${game.target}.`}
        {game.tiebreakApplied &&
          " Tiebreak: below the target beats above at equal distance."}
      </p>
      <div className="results-table" role="table" aria-label="Final totals">
        <div className="results-row results-labels" role="row">
          <span role="columnheader">PLAYER</span>
          <span role="columnheader">TOTAL</span>
          <span role="columnheader">DISTANCE</span>
          <span role="columnheader">RESULT</span>
        </div>
        {game.results.map((r, i) => (
          <motion.div
            className={`results-row ${r.winner ? "winner" : ""}`}
            role="row"
            key={r.playerId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.12 }}
          >
            <span role="cell">
              {r.winner && <Icon name="crown" size={16} />}
              {playerName(r.playerId)}
            </span>
            <strong role="cell">{r.total}</strong>
            <span role="cell">
              {r.distance} <small>{r.side}</small>
            </span>
            <span role="cell">
              {r.winner
                ? winners.length > 1
                  ? "Shared win"
                  : "Winner"
                : "Next time"}
            </span>
          </motion.div>
        ))}
      </div>
      <div className="results-actions">
        {room.hostId === room.me && (
          <button
            className="button primary"
            disabled={
              busy ||
              room.members.filter(
                (m) => m.role === "player" && m.disconnectedAt === null,
              ).length < 2
            }
            onClick={() => {
              void send({ type: "start" });
            }}
          >
            Play the next round
            <Icon name="arrow" />
          </button>
        )}
        {room.hostId === room.me && <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            void send({ type: "lobby" });
          }}
        >
          Return to lobby
        </button>}
        {room.mode === "friends" &&
          room.members.find((m) => m.id === room.me)?.role === "spectator" && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                void send({ type: "claim" });
              }}
            >
              Take an open seat
              <Icon name="plus" />
            </button>
          )}
      </div>
      <p className="fine-print">
        {game.deckCount} cards remain. The starting player rotates next round.
      </p>
    </motion.section>
  );
}
