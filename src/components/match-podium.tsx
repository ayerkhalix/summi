"use client";
import type { CSSProperties } from "react";
import type { RoomView } from "@/server/types";
import { Avatar } from "./player-profile";
import { Icon } from "./icon";
import { Suit } from "./card";

export function MatchPodium({ room }: { room: RoomView }) {
  const leaders = [...room.match.standings].filter(row => row.rank <= 3).sort((a, b) => a.rank - b.rank);
  const shared = new Set(leaders.map(row => row.rank)).size !== leaders.length;
  return <section className="match-podium" aria-label="Championship podium">
    <div className="podium-orbit" aria-hidden="true"><span /><span /><span /></div>
    <ol className={`podium-platform ${shared ? "podium-shared" : ""}`} data-players={leaders.length}>
      {leaders.map(row => <li key={row.playerId} className={`podium-place podium-place-${row.rank}`}
        data-rank={row.rank} style={{ "--podium-arrival": `${row.rank === 1 ? 1.15 : row.rank === 2 ? .6 : .3}s`,
          order: !shared && leaders.length === 3 && row.rank === 2 ? -1 : undefined } as CSSProperties}
        aria-label={`Rank ${row.rank}: ${row.name}, ${row.points} match points`}>
        <div className="podium-player-card">
          <div className="podium-card-back" aria-hidden="true"><Suit suit="spades" /><span>SUMMIN</span></div>
          <div className="podium-card-front">
            <span className="podium-corner" aria-hidden="true">{row.rank}<Suit suit={row.rank === 1 ? "hearts" : row.rank === 2 ? "spades" : "diamonds"} /></span>
            <span className="podium-corner corner-bottom" aria-hidden="true">{row.rank}<Suit suit={row.rank === 1 ? "hearts" : row.rank === 2 ? "spades" : "diamonds"} /></span>
            {row.rank === 1 && <span className="podium-crown" aria-hidden="true"><Icon name="crown" size={24} /></span>}
            <Avatar name={row.name} profile={row.profile} />
            <strong className="podium-player-name">{row.name}</strong>
            <span className="podium-card-score">{row.points}<small>POINTS</small></span>
            <span className="podium-card-wins">{row.wins} {row.wins === 1 ? "round won" : "rounds won"}</span>
          </div>
        </div>
        <div className="podium-plinth"><span>{row.rank === 1 ? shared && leaders.filter(player => player.rank === 1).length > 1 ? "CO-CHAMPION" : "CHAMPION" : `PLACE ${row.rank}`}</span></div>
      </li>)}
    </ol>
    <p className="podium-caption">THE FINAL TABLE <span aria-hidden="true">◆</span> {room.match.round} ROUNDS PLAYED</p>
  </section>;
}
