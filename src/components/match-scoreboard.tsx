import type { RoomView } from "@/server/types";
import { Avatar } from "./player-profile";

export function MatchScoreboard({ room, compact = false }: { room: RoomView; compact?: boolean }) {
  return <section className={`match-scoreboard ${compact ? "compact" : ""}`} aria-label="Match standings">
    <div className="scoreboard-heading"><span className="eyebrow">{room.match.complete ? "FINAL STANDINGS" : "MATCH STANDINGS"}</span><span>{Math.min(room.match.round, room.match.roundLimit)} / {room.match.roundLimit} rounds</span></div>
    <ol>{room.match.standings.map((row) => <li key={row.playerId} className={row.streak >= 3 ? "on-streak" : ""}>
      <span className="standing-rank">{row.rank}</span><Avatar name={row.name} profile={row.profile} streak={row.streak} />
      <span className="standing-name">{row.name}{row.playerId === room.me && <small> YOU</small>}{row.streak >= 3 && <small className="streak-label">{row.streak} win streak</small>}</span>
      <strong>{row.points}<small> PTS</small></strong>
    </li>)}</ol>
  </section>;
}
