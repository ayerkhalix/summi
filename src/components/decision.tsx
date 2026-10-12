"use client";
import { useState } from "react";
import { audio } from "@/audio/manager";
import { FIRST_ADDITION_MAX, PHASE_LABELS, rulesFor } from "@/game/config";
import { Icon } from "./icon";
import type { RoomProps } from "./table-shared";

export function Decision({
  room,
  busy,
  send,
  activeName,
}: RoomProps & { activeName: string | null }) {
  const game = room.game!,
    own = game.players.find((p) => p.id === room.me),
    config = rulesFor(game.players.length);
  const [choice, setChoice] = useState(
    game.phase === "initial_selection" ? (config.initial[0] as number) : 0,
  );
  const selecting = game.phase === "initial_selection",
    adding =
      game.phase === "first_additions" || game.phase === "second_additions";
  const mine =
    own &&
    (selecting ? !own.committed : adding && game.activePlayerId === room.me);
  const cap =
    game.phase === "first_additions"
      ? Math.min(FIRST_ADDITION_MAX, game.deckCount)
      : Math.min(own?.cap ?? 0, game.deckCount);
  const message =
    room.members.find((m) => m.id === room.me)?.role === "spectator"
      ? room.mode === "friends"
        ? "You’re watching the public table. Player seats open in the lobby between matches."
        : "You’re watching a practice table. Player seats are reserved; unrevealed cards stay hidden."
      : selecting && own?.committed
        ? "Your choice is committed. Dealing begins when everyone is ready."
        : game.phase === "second_additions" && own?.cap === 0
          ? `Final addition skipped: ${own.firstReceived} first additions gives a cap of 0. ${activeName ? `Waiting for ${activeName}.` : ""}`
          : adding
            ? `Waiting for ${activeName ?? "the table"}. Your revealed cards stay in your hand.`
            : game.phase === "burn"
              ? "One burn per player, out of play. Next: choose your hand size."
              : game.phase === "initial_deal"
                ? "Cards arrive face down. Next: half your initial hand is revealed."
                : game.phase.includes("reveal")
                  ? game.phase === "first_reveal"
                    ? "Half your initial hand turns over. Next: add up to 4 or pass."
                    : game.phase === "second_reveal"
                      ? "One card stays hidden. Next: your final addition, if eligible."
                      : "Every card turns over. Next: the closest total wins."
                  : "Waiting for the next phase.";
  if (!mine)
    return (
      <div className="decision-panel waiting" aria-live="polite">
        <span className="waiting-symbol">
          <Icon
            name={game.phase.includes("reveal") ? "eye" : "users"}
            size={22}
          />
        </span>
        <div>
          <span className="eyebrow">
            {selecting
              ? "WAITING FOR COMMITMENTS"
              : adding
                ? `${activeName ?? "PLAYER"}’S TURN`
                : PHASE_LABELS[game.phase].toUpperCase()}
          </span>
          <p>{message}</p>
        </div>
      </div>
    );
  return (
    <section className="decision-panel" aria-label="Your decision">
      <div className="decision-copy">
        <span className="eyebrow">
          <span className="connection-dot" />
          YOUR {selecting ? "CHOICE" : "TURN"}
        </span>
        <h2>
          {selecting
            ? "Choose your hand."
            : game.phase === "first_additions"
              ? "Add or pass?"
              : "Your final call."}
        </h2>
        <p>
          {selecting
            ? `${config.initial[0]}–${config.initial[1]} cards, dealt face down. Confirming locks your choice.`
            : `Add 0–${cap} cards. ${game.phase === "second_additions" ? `Cap: floor(${own.firstReceived} ÷ 2) + 1 = ${own.cap}, limited by the shared deck. Then the final reveal.` : "Then reveal all but one. Your decision is final."}`}
        </p>
      </div>
      <div className="decision-controls">
        {selecting ? (
          <div className="hand-size-control">
            <button
              aria-label="Fewer initial cards"
              disabled={busy || choice <= config.initial[0]}
              onClick={() => {
                setChoice(choice - 1);
                audio.play("hover");
              }}
            >
              −
            </button>
            <strong>
              {choice}
              <small>CARDS</small>
            </strong>
            <button
              aria-label="More initial cards"
              disabled={busy || choice >= config.initial[1]}
              onClick={() => {
                setChoice(choice + 1);
                audio.play("hover");
              }}
            >
              +
            </button>
          </div>
        ) : (
          <div className="choice-row">
            {Array.from({ length: cap + 1 }, (_, n) => (
              <button
                key={n}
                disabled={busy}
                aria-pressed={choice === n}
                className={`choice ${choice === n ? "selected" : ""}`}
                onClick={() => {
                  setChoice(n);
                  audio.play("hover");
                }}
              >
                {n === 0 ? "Pass" : `+${n}`}
              </button>
            ))}
          </div>
        )}
        <button
          className="button primary"
          disabled={busy}
          onClick={() => {
            void send({
              type: "game",
              action: {
                type: selecting ? "select" : "add",
                count: choice,
                round: game.round,
                phase: game.phase,
              },
            });
          }}
        >
          {busy
            ? "Submitting…"
            : selecting
              ? `Confirm ${choice} cards`
              : choice === 0
                ? "Confirm pass"
                : `Add ${choice} ${choice === 1 ? "card" : "cards"}`}
          <Icon name="arrow" />
        </button>
      </div>
    </section>
  );
}
