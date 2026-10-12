"use client";
import { motion } from "motion/react";
import { PHASE_LABELS } from "@/game/config";
import { InspectableCard } from "./inspectable-card";
import { Decision } from "./decision";
import { Icon } from "./icon";
import { OwnHand, PlayerHand } from "./player-hand";
import { PhaseProgress } from "./phase-progress";
import { RoundResults } from "./round-results";
import { SceneDeck } from "./scene-cards";
import { History, type RoomProps } from "./table-shared";

export function GameTable({ room, busy, send, rules }: RoomProps & { rules: () => void }) {
  const game = room.game!;
  const me = room.members.find((member) => member.id === room.me)!;
  const own = game.players.find((player) => player.id === room.me);
  const name = (id: string) => room.members.find((member) => member.id === id)?.name ?? "Former player";
  const opponents = game.players.filter((player) => player.id !== room.me);
  const ended = room.status === "abandoned";
  const finished = game.phase === "round_results";
  const paused = room.paused.length > 0;
  const activeName = game.activePlayerId ? name(game.activePlayerId) : null;
  return (
    <motion.main className="game-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} onAnimationComplete={() => window.dispatchEvent(new Event("resize"))}>
      <div className="game-heading">
        <div className="phase-heading">
          <span className="eyebrow">ROUND {String(game.round).padStart(2, "0")} · {game.players.length} PLAYERS{room.mode === "bots" && " · BOTS"}{me.role === "spectator" && " · SPECTATING"}</span>
          <h1 key={game.phase}>{ended ? "Round ended" : PHASE_LABELS[game.phase]}</h1>
        </div>
        <PhaseProgress phase={game.phase} />
        <button className="text-button" aria-label="The rules" onClick={rules}><Icon name="help" size={16} /> The rules</button>
      </div>
      {(paused || ended) && (
        <div className={`pause-banner ${ended ? "ended" : ""}`} role="status">
          <Icon name="wifi" />
          <div>
            <strong>{ended ? "Match ended safely." : `Match paused. Waiting for ${room.paused.map((player) => player.name).join(", ")}.`}</strong>
            <span>{ended ? room.endedReason : "Your decision stays open during the 90-second reconnection window."}</span>
          </div>
          {ended && room.hostId === room.me && <button className="button secondary" disabled={busy} onClick={() => void send({ type: "lobby" })}>Return to lobby</button>}
        </div>
      )}
      <div className={`table-layout seats-${opponents.length}`}>
        <div className="table-main">
          <section className="public-table" aria-label="Public table">
            <div className="game-target">
              <span className="eyebrow">THE TARGET</span>
              <strong>{game.target}</strong>
              <span className="target-caption">CLOSEST WINS</span>
            </div>
            <div className="shared-deck">
              <SceneDeck />
              <span><strong>{game.deckCount}</strong> <span>cards left</span></span>
            </div>
            <div className="public-burns">
              <span className="eyebrow">BURNED · OUT OF PLAY</span>
              <div className="burn-cards">
                {game.burns.map((burn, index) => (
                  <div key={burn.card.id}>
                    <InspectableCard card={burn.card} label={`burned card for ${name(burn.playerId)}`} delay={index * 0.08} />
                    <span title={name(burn.playerId)}>{name(burn.playerId)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="opponents" aria-label="Other players" style={{ gridTemplateColumns: `repeat(${opponents.length}, minmax(0, 1fr))` }}>
            {opponents.map((player, index) => (
              <PlayerHand key={player.id} player={player} name={name(player.id)} index={index + 1} active={game.activePlayerId === player.id} disconnected={room.members.find((member) => member.id === player.id)?.disconnectedAt !== null} phase={game.phase} />
            ))}
          </section>
          <div className={`table-stage ${own ? "" : "spectator-stage"}`}>
            {own && <OwnHand key={game.round} player={own} name={me.name} target={game.target} active={game.activePlayerId === room.me} />}
            <div className="turn-area">
              {finished ? <RoundResults key={game.round} room={room} busy={busy} send={send} /> : ended ? (
                <div className="decision-panel waiting"><Icon name="shuffle" /><p>This round has ended. Return to the lobby for a fresh deck.</p></div>
              ) : <Decision key={`${game.round}:${game.phase}:${game.activePlayerId}`} room={room} busy={busy || paused} send={send} activeName={activeName} />}
            </div>
          </div>
        </div>
      </div>
      <div className="table-extras">
        <details>
          <summary>Round activity <span>{game.events.length}</span></summary>
          <ol className="event-log" aria-label="Public event history">
            {[...game.events].reverse().map((event) => (
              <li key={event.id}><span className={`event-marker event-${event.kind}`} /><div>{event.playerId && <strong>{name(event.playerId)}</strong>}<p>{event.text}</p></div></li>
            ))}
          </ol>
        </details>
        <details><summary>Past rounds <span>{room.history.length}</span></summary>{room.history.length ? <History room={room} /> : <p className="muted">Your completed rounds will appear here.</p>}</details>
        <span className="table-note">Above or below, closest wins. Ties favor below.</span>
      </div>
    </motion.main>
  );
}
