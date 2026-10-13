"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { Icon } from "./icon";
import { Modal } from "./dialogs";
import { PlayingCard } from "./card";
import { Avatar } from "./player-profile";
import type { RoomProps } from "./table-shared";
import { completedHand, distanceText, resultHeroes, resultRounds } from "./results-data";
import { ResultCount, ResultParticles, useResultsReducedMotion } from "./results-animation";

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
  const { room } = props;
  const [open, setOpen] = useState(true);
  const reduced = useResultsReducedMotion();
  const celebrationKey = `summin-result:${room.id}:${room.matchNumber}:${room.game!.round}`;
  const [celebrate, setCelebrate] = useState(() => {
    try { return sessionStorage.getItem(celebrationKey) !== "seen"; } catch { return true; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(celebrationKey, "seen"); } catch { /* Storage is optional. */ }
  }, [celebrationKey]);
  const close = () => { setOpen(false); setCelebrate(false); };
  const own = room.game!.results.find((result) => result.playerId === room.me);
  return <>
    <section className="decision-panel round-complete" aria-label="Round complete">
      <Icon name="crown" size={26} />
      <span className="eyebrow">ALL CARDS REVEALED</span>
      <h2>{room.match.complete ? "The match is settled." : own?.winner ? "Your closest call." : "The numbers are in."}</h2>
      <p>{own ? `Your total: ${own.total}. ${own.distance} from the target.` : "Every hand is now public. See how the table finished."}</p>
      <button className="button primary" onClick={() => setOpen(true)}>View results <Icon name="arrow" /></button>
      <NextRoundTimer room={room} />
    </section>
    {open && <Modal title={room.match.complete ? "The match champions." : "The final numbers."} wide variant="results"
      celebrate={celebrate && !reduced} onClose={close}>
      <Results {...props} celebrate={celebrate} reduced={reduced} onClose={close} />
    </Modal>}
  </>;
}

function Results({ room, busy, send, celebrate, reduced, onClose }: RoomProps & {
  celebrate: boolean; reduced: boolean; onClose: () => void;
}) {
  const game = room.game!;
  const heroes = resultHeroes(room);
  const [selectedHero, setSelectedHero] = useState(heroes[0]?.playerId);
  const hero = heroes.find((row) => row.playerId === selectedHero) ?? heroes[0];
  const rounds = resultRounds(room);
  const [selectedRound, setSelectedRound] = useState(game.round);
  const round = rounds.find((row) => row.round === selectedRound) ?? rounds.at(-1);
  const hand = hero ? completedHand(room, hero.playerId) : null;
  const winners = game.results.filter((row) => row.winner);
  const name = (id: string) => room.members.find((member) => member.id === id)?.name ??
    room.match.standings.find((row) => row.playerId === id)?.name ?? "Former player";
  const shared = heroes.length > 1;
  const humanWon = heroes.some((row) => row.playerId === room.me);
  const host = room.hostId === room.me;
  const points = room.match.complete ? heroes[0]?.standing?.points : heroes[0]?.result?.points;
  const lastRoundNumber = game.round - room.matchStartRound + 1;
  const message = room.match.complete
    ? shared ? "Level on points. A championship shared." : humanWon ? "You played the odds. You took the match." : "The table has its champion. A match well played."
    : shared ? "Equally close. A round shared." : humanWon ? "Your closest call. This round is yours." : "The closest hand takes the round.";
  return <section className="results-panel championship" aria-label="Round results" data-celebrate={celebrate} data-reduced={reduced}>
    <div className="championship-feature">
    <header className={`champion-hero ${room.match.complete ? "match-champions" : "round-victory"} ${humanWon ? "human-victory" : ""}`}>
      <ResultParticles />
      <div className="champion-emblem" aria-hidden="true"><Icon name="crown" size={30} /></div>
      <span className="eyebrow">{room.match.complete ? shared ? "SHARED MATCH VICTORY" : "MATCH CHAMPION" : shared ? "SHARED ROUND VICTORY" : "ROUND CHAMPION"}</span>
      <h2>{heroes.map((row) => row.name).join(" & ") || "The table is settled."}</h2>
      <p className="champion-message">{message}</p>
      {points !== undefined && <div className="champion-score">
        <strong><ResultCount value={points} play={celebrate} reduced={reduced} label={room.match.complete ? "match points" : "round points"} /></strong>
        <span>{room.match.complete ? "MATCH POINTS" : "ROUND POINTS"}<small>{room.match.complete ? `across ${room.match.round} rounds` : `Round ${lastRoundNumber} of ${room.roundLimit}`}</small></span>
        {heroes.length === 1 && hero?.standing && <span className="champion-wins"><b>{hero.standing.wins}</b> {hero.standing.wins === 1 ? "round won" : "rounds won"}</span>}
      </div>}
    </header>

    {hero && <section className="champion-hand-section" aria-label="Champion's final hand">
      <div className="champion-hand-heading">
        <div><span className="eyebrow">{room.match.complete ? "CHAMPION’S FINAL HAND" : "THE WINNING HAND"}</span>
          <p>{hero.name}{hero.isBot && !hero.name.endsWith("· Bot") && <small> · BOT</small>}<small> · Round {lastRoundNumber}{shared && hero.standing ? ` · ${hero.standing.wins} rounds won` : ""}</small></p></div>
        <Avatar name={hero.name} profile={hero.profile} />
      </div>
      {shared && <div className="champion-choices" role="group" aria-label="Choose a champion's hand">
        {heroes.map((row) => <button key={row.playerId} type="button" aria-pressed={row.playerId === hero.playerId}
          onClick={() => setSelectedHero(row.playerId)}>{row.name}</button>)}
      </div>}
      {hand ? <div className="champion-cards" key={hero.playerId} role="list" aria-label={`${hero.name}'s final cards in deal order`}>
        {hand.map((held, index) => <div className="champion-card" role="listitem" key={held.slotId}
          style={{ "--card-arrival": `${0.32 + Math.min(index * 0.045, 0.85)}s` } as CSSProperties}>
          <PlayingCard card={held.card} faceUp isPublic silent />
        </div>)}
      </div> : <p className="hand-unavailable">The final hand is unavailable. The recorded result is shown below.</p>}
      {hero.result && <>
        <dl className="decisive-result" aria-label={`${hero.name}'s final round result`}>
          <div><dt>TARGET</dt><dd>{game.target}</dd></div><span aria-hidden="true">→</span>
          <div><dt>FINAL TOTAL</dt><dd>{hero.result.total}</dd></div><span aria-hidden="true">→</span>
          <div><dt>DISTANCE</dt><dd>{hero.result.distance}<small>{hero.result.side === "exact" ? "on target" : `${hero.result.side} target`}</small></dd></div>
        </dl>
        <p className="decisive-explanation">{room.match.complete ? <>
          {shared ? "The champions share" : "The champion holds"} the highest accumulated match points. {hero.result.winner ? `This hand also ${winners.length > 1 ? "shares the win in" : "wins"} the final round.` : "This hand didn’t win the final round; the championship is decided across the whole match."}
        </> : hero.result.distance === 0 ? "Exactly on the target. No hand can get closer." : `${hero.result.distance} from the target is the closest distance this round. Equal distance shares the win, above or below.`}</p>
      </>}
      {room.match.complete && <p className="final-round-note"><span className="eyebrow">FINAL ROUND</span> Target {game.target} · {winners.length > 1 ? "Round winners" : "Round winner"}: {winners.map((row) => name(row.playerId)).join(" & ")}</p>}
    </section>}
    </div>

    <section className="championship-standings" aria-label="Match standings">
      <div className="result-section-heading"><h3>{room.match.complete ? "Final standings" : "The match so far"}</h3><span>{room.match.round} / {room.roundLimit} rounds</span></div>
      <ol>{[...room.match.standings].sort((a, b) => a.rank - b.rank).map((row, index) => <li key={row.playerId}
        className={`podium-rank-${Math.min(row.rank, 4)}`} style={{ "--standing-arrival": `${0.65 + index * 0.08}s` } as CSSProperties}
        aria-label={`Rank ${row.rank}: ${row.name}, ${row.points} points`}>
        <span className="podium-rank" aria-hidden="true"><b>{row.rank}</b>{row.rank === 1 && <Icon name="crown" size={14} />}</span>
        <Avatar name={row.name} profile={row.profile} streak={row.streak} />
        <span className="podium-name">{row.name}{row.playerId === room.me && row.name !== "You" && <small> YOU</small>}<small className="podium-record">{row.wins} {row.wins === 1 ? "round won" : "rounds won"}{row.streak > 1 && ` · ${row.streak} win streak`}</small></span>
        <strong>{row.points}<small> PTS</small></strong>
      </li>)}</ol>
    </section>

    {round && <section className="results-breakdown" aria-label="Round breakdown">
      <div className="result-section-heading"><h3>Round by round</h3>
        <label className="result-round-select"><span className="sr-only">Select round</span>
          <select aria-label="Select round" value={round.round} onChange={(event) => setSelectedRound(Number(event.target.value))}>
            {rounds.map((row) => <option key={row.round} value={row.round}>Round {row.round - room.matchStartRound + 1}{row.round === game.round ? " · latest" : ""}</option>)}
          </select>
        </label>
      </div>
      <p className="round-target">ROUND {round.round - room.matchStartRound + 1} <span>Target <b>{round.target}</b></span></p>
      <div className="results-table" role="table" aria-label={`Round ${round.round - room.matchStartRound + 1} totals`}>
        <div className="results-row results-labels" role="row"><span role="columnheader">PLAYER</span><span role="columnheader">TOTAL</span><span role="columnheader">DISTANCE</span><span role="columnheader">POINTS</span></div>
        {[...round.results].sort((a, b) => a.rank - b.rank).map((row) => <div className={`results-row ${row.winner ? "winner" : ""}`} role="row" key={row.playerId}>
          <span role="cell" className="round-player">{row.winner && <Icon name="crown" size={14} />}<span>{row.name}{row.winner && <small>ROUND WINNER</small>}</span></span>
          <strong role="cell">{row.total}</strong><span role="cell" aria-label={distanceText(row)}>{row.distance}<small>{row.side === "exact" ? "on target" : `${row.side} target`}</small></span>
          <span role="cell">+{row.points} pts</span>
        </div>)}
      </div>
    </section>}

    <footer className="championship-actions">
      <NextRoundTimer room={room} />
      {!host && <p className="results-host-note">{room.match.complete ? "The host can return everyone to the lobby for another match." : "The next round starts automatically, or the host can start it sooner."}</p>}
      <div className="results-actions">
        {host && !room.match.complete && <button className="button primary" disabled={busy || room.paused.length > 0 || room.members.filter((member) => member.role === "player" && member.disconnectedAt === null).length < 2}
          onClick={() => void send({ type: "start" })}>Play the next round <Icon name="arrow" /></button>}
        {host && <button className={`button ${room.match.complete ? "primary" : "secondary"}`} disabled={busy} onClick={() => void send({ type: "lobby" })}>Return to lobby <Icon name="arrow" /></button>}
        <button className={host ? "text-button review-table" : "button primary review-table"} onClick={onClose}>Review the revealed table <Icon name="eye" size={16} /></button>
      </div>
    </footer>
  </section>;
}
