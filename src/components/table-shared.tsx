import type { RoomCommand, RoomView } from "@/server/types";

export type RoomProps = {
  room: RoomView;
  busy: boolean;
  send: (command: RoomCommand) => Promise<void>;
};

export { Avatar } from "./player-profile";

export function History({ room }: { room: RoomView }) {
  if (!room.history.length) return null;
  return (
    <section className="history">
      <h2>Your table’s story.</h2>
      <div>
        {[...room.history].reverse().map((round) => (
          <article key={round.round}>
            <span className="eyebrow">
              ROUND {round.round.toString().padStart(2, "0")}
            </span>
            <strong>
              {round.results
                .filter((r) => r.winner)
                .map((r) => r.name)
                .join(" & ")}
            </strong>
            <p>
              Target {round.target} ·{" "}
              {round.results.filter((r) => r.winner)[0]?.distance} away ·{" "}
              {round.deckCount} cards left
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
