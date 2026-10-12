"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Icon } from "./icon";
import { Modal } from "./dialogs";
import type { RoomProps } from "./table-shared";
import { MatchScoreboard } from "./match-scoreboard";

function NextRoundTimer({ room }: Pick<RoomProps, "room">) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  if (room.match.complete || !room.match.nextRoundAt) return null;
  return <p className="next-round-timer" role="timer" aria-label="Next round countdown">
    {room.paused.length ? "Next round waits for everyone to reconnect." : <>Next round in <strong>{Math.max(0, Math.ceil((room.match.nextRoundAt - now) / 1000))}s</strong></>}
  </p>;
}

export function RoundResults(props: RoomProps) {
  const [open, setOpen] = useState(true);
  const own = props.room.game!.results.find((result) => result.playerId === props.room.me);
  return (
    <>
      <section className="decision-panel round-complete" aria-label="Round complete">
        <Icon name="crown" size={26} />
        <span className="eyebrow">ALL CARDS REVEALED</span>
        <h2>{props.room.match.complete ? "The match is settled." : own?.winner ? "Your closest call." : "The numbers are in."}</h2>
        <p>{own ? `Your total: ${own.total}. ${own.distance} from the target.` : "Every hand is now public. See how the table finished."}</p>
        <button className="button primary" onClick={() => setOpen(true)}>View results <Icon name="arrow" /></button>
        <NextRoundTimer room={props.room} />
      </section>
      {open && (
        <Modal title={props.room.match.complete ? "The match champions." : "The final numbers."} wide onClose={() => setOpen(false)}>
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
    champions = room.match.standings.filter((row) => row.rank === 1),
    playerName = (id: string) =>
      room.members.find((m) => m.id === id)?.name ?? "Former player";
  return (
    <motion.section
      className="results-panel"
      aria-label="Round results"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className={room.match.complete ? "match-champions" : "round-victory"}>
      <span className="eyebrow">
        <Icon name="crown" size={16} />
        {room.match.complete ? champions.length > 1 ? "SHARED MATCH VICTORY" : "MATCH CHAMPION" : winners.length > 1 ? "SHARED VICTORY" : "THE CLOSEST CALL"}
      </span>
      <h2>
        {room.match.complete ? champions.map((row) => row.name).join(" & ") : <>{winners.map((w) => playerName(w.playerId)).join(" & ")}{" "}{winners.length > 1 ? "share the win." : "takes the round."}</>}
      </h2>
      <p className="muted">
        {room.match.complete ? `${champions[0]?.points} points across ${room.roundLimit} rounds.` : winners[0].distance === 0
          ? "Right on the number. An exact match."
          : `${winners[0].distance} away from ${game.target}.`}
        {!room.match.complete && " Equal distance earns equal points, on either side."}
      </p>
      </div>
      {room.match.complete && <p className="fine-print">FINAL ROUND · Target {game.target} · {winners.map((w) => playerName(w.playerId)).join(" & ")} {winners.length > 1 ? "share the round" : "takes the round"}</p>}
      <div className="results-table" role="table" aria-label="Final totals">
        <div className="results-row results-labels" role="row">
          <span role="columnheader">PLAYER</span>
          <span role="columnheader">TOTAL</span>
          <span role="columnheader">DISTANCE</span>
          <span role="columnheader">POINTS</span>
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
              +{r.points} pts
            </span>
          </motion.div>
        ))}
      </div>
      <MatchScoreboard room={room} />
      <NextRoundTimer room={room} />
      <div className="results-actions">
        {room.hostId === room.me && !room.match.complete && (
          <button
            className="button primary"
            disabled={
              busy ||
              room.paused.length > 0 ||
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
      </div>
      <p className="fine-print">
        {game.deckCount} cards remain. The starting player rotates next round.
      </p>
    </motion.section>
  );
}
