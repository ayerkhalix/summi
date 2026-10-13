"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { audio, DEFAULT_AUDIO, SOUNDS } from "@/audio/manager";
import { act, advance, makeRound } from "@/game/engine";
import { FIRST_ADDITION_MAX, RULES, secondCap } from "@/game/config";
import { Icon } from "./icon";
import { PlayingCard } from "./card";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  variant,
  celebrate = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  variant?: "results";
  celebrate?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const root = document.documentElement, body = document.body;
    const rootOverflow = root.style.overflow, bodyOverflow = body.style.overflow, padding = body.style.paddingRight;
    const gutter = window.innerWidth - root.clientWidth;
    if (gutter) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + gutter}px`;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    el.showModal();
    if (variant === "results") el.focus({ preventScroll: true });
    return () => {
      el.close();
      root.style.overflow = rootOverflow;
      body.style.overflow = bodyOverflow;
      body.style.paddingRight = padding;
    };
  }, [variant]);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""} ${variant === "results" ? "results-dialog" : ""}`}
      data-celebrate={celebrate}
      tabIndex={variant === "results" ? -1 : undefined}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {variant === "results" ? <div className="results-scroll">{children}</div> : children}
    </dialog>
  );
}
export function Settings({
  onClose,
  onTutorial,
}: {
  onClose: () => void;
  onTutorial: () => void;
}) {
  const prefs = useSyncExternalStore(
    audio.subscribe,
    audio.snapshot,
    () => DEFAULT_AUDIO,
  );
  return (
    <Modal title="Make yourself comfortable." onClose={onClose}>
      <p className="muted">Your settings stay on this device.</p>
      <div className="setting-row">
        <span>Sound effects</span>
        <button
          className={`toggle ${!prefs.muted ? "on" : ""}`}
          role="switch"
          aria-checked={!prefs.muted}
          aria-label="Sound effects"
          onClick={() => audio.update({ muted: !prefs.muted })}
        >
          <span />
        </button>
      </div>
      <label className="range-label">
        Effects volume <span>{Math.round(prefs.effects * 100)}%</span>
        <input
          aria-label="Effects volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={prefs.effects}
          onChange={(e) => audio.update({ effects: Number(e.target.value) })}
        />
      </label>
      <div className="setting-row">
        <span>Ambient music</span>
        <button
          className={`toggle ${prefs.musicEnabled ? "on" : ""}`}
          role="switch"
          aria-checked={prefs.musicEnabled}
          aria-label="Ambient music"
          onClick={() => {
            void audio.unlock();
            audio.update({ musicEnabled: !prefs.musicEnabled });
          }}
        >
          <span />
        </button>
      </div>
      <label className="range-label">
        Music volume <span>{Math.round(prefs.music * 100)}%</span>
        <input
          aria-label="Music volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={prefs.music}
          onChange={(e) => audio.update({ music: Number(e.target.value) })}
        />
      </label>
      <label className="range-label">
        Test a sound
        <select aria-label="Sound to test" id="sound-test">
          {SOUNDS.map((sound) => (
            <option key={sound} value={sound}>
              {sound}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button secondary full"
        onClick={() => {
          void audio.unlock().then(() => {
            audio.play(
              (document.getElementById("sound-test") as HTMLSelectElement)
                .value as (typeof SOUNDS)[number],
            );
          });
        }}
      >
        Play selected sound <Icon name="sound" />
      </button>
      <div className="setting-row">
        <span>
          Reduce animations
          <br />
          <small className="muted">Your system preference also applies.</small>
        </span>
        <button
          className={`toggle ${prefs.reducedMotion ? "on" : ""}`}
          role="switch"
          aria-checked={prefs.reducedMotion}
          aria-label="Reduce animations"
          onClick={() => audio.update({ reducedMotion: !prefs.reducedMotion })}
        >
          <span />
        </button>
      </div>
      <button className="text-button" onClick={onTutorial}>
        Replay the guided tutorial <Icon name="arrow" size={16} />
      </button>
      <p className="fine-print">
        Original synthesized audio. No third-party tracking. A private guest
        cookie restores your seat for seven days; rooms expire after 24 hours of
        inactivity.
      </p>
    </Modal>
  );
}
export function Rules({
  onClose,
  onTutorial,
}: {
  onClose: () => void;
  onTutorial: () => void;
}) {
  return (
    <Modal title="A little knowledge. An edge." onClose={onClose} wide>
      <p className="muted">
        One shared deck. One target. Get closer than everyone else.
      </p>
      <div className="rules-grid">
        <div>
          <h3>01 / Read the table</h3>
          <p>
            A server chooses the target and burns one random card per player,
            face up. Choose your initial hand size after seeing the burns.
            Everyone commits before any sizes are shown.
          </p>
          <h3>02 / Play the odds</h3>
          <p>
            Cards start face down, hidden from everyone, including you. Half
            your initial cards, rounded down, are revealed. On your turn,
            add 0–4 cards. Zero is a final pass for that addition window. The
            next reveal leaves exactly one hidden card. A crimson glow marks
            the latest reveal; earlier revealed cards lose their glow.
          </p>
          <h3>03 / Make your final call</h3>
          <p>
            Your final addition limit is half the cards you actually received in
            the first window, rounded down, plus one: 1, 1, 2, 2, 3. All draws
            are limited by the shared deck. Then the last cards reveal one at a time.
          </p>
        </div>
        <div>
          <h3>Every card counts</h3>
          <p>
            Ace is 1. Number cards keep their value. Jack is 11, Queen 12, King
            13. All 52 cards share one deck. Burns and draws never return to it.
          </p>
          <table>
            <caption>Official player-count settings</caption>
            <thead>
              <tr>
                <th>Players</th>
                <th>Target</th>
                <th>Initial hand</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(RULES).map(([n, r]) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td>{r.target.join("–")}</td>
                  <td>{r.initial.join("–")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Closest wins. Either side.</h3>
          <p>
            The smallest absolute difference wins. Equal distance shares the win,
            above or below. Points follow rank: with five players, 5, 4, 3, 2, 1.
            Ties earn the same points. The highest points total after the chosen
            3, 5, 10, 12, 15 or 20 rounds wins the match. Shared round wins count toward streaks;
            three consecutive wins light up your icon and hand.
          </p>
        </div>
      </div>
      <p className="notice">
        Results appear three seconds after the last animated flip. The next round
        starts automatically after a 30-second break. No decision timer. A lost connection pauses the match for a 90-second grace
        period after the server detects the disconnection. If the player cannot
        return, the match ends and completed rounds remain saved.
      </p>
      <button className="button primary full" onClick={onTutorial}>
        Learn by playing <Icon name="arrow" />
      </button>
    </Modal>
  );
}
const tutorialCopy = [
  [
    "Meet your target.",
    `Every round has a public target. The closest final total wins, above or below. Your example target comes from the real two-player range: ${RULES[2].target.join("–")}.`,
  ],
  [
    "Read what is gone.",
    "One random card per player is burned face up. Both are permanently out of the shared deck. These burns give everyone the same information.",
  ],
  [
    "Choose your starting hand.",
    "With two players, choose 7–16 cards. Your choice stays concealed until everyone commits. Cards are dealt one per player in rotating order.",
  ],
  [
    "Half the picture.",
    "The server randomly reveals floor(initial size ÷ 2) of your cards. A crimson glow marks every card in this reveal. The rest stay face down, hidden from everyone, including you. Use the revealed total and unseen deck to judge your next move.",
  ],
  [
    "Add, or hold your nerve.",
    "Choose 0–4 additional cards. They stay face down until the next reveal. Choosing zero is final for this window. You cannot reopen it.",
  ],
  [
    "One secret remains.",
    "The second reveal leaves exactly one hidden card. The crimson glow moves to the newly revealed cards; earlier cards stay face up without a glow. First-window additions are included.",
  ],
  [
    "Your last decision.",
    "Your cap is floor(first-window cards actually received ÷ 2) + 1. Adding 0 or 1 earlier allows one final card, 2 or 3 allows two, and 4 allows three. An empty shared deck prevents further draws.",
  ],
  [
    "All cards on the table.",
    "The final cards turn over one at a time. Closest wins; equal distance shares victory above or below. Rank-based points add to the match scoreboard before a 30-second break.",
  ],
];
export function Tutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0),
    [initial, setInitial] = useState(8),
    [addition, setAddition] = useState(2),
    [last, setLast] = useState(0);
  const state = useMemo(() => {
    let seed = 82;
    const rng = (max: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return Math.floor((seed / 4294967296) * max);
    };
    let g = makeRound(["you", "guide"], 1, 0, rng);
    if (step < 2) return g;
    g = advance(g, rng);
    if (step === 2) return g;
    for (const [id, count] of [
      ["you", initial],
      ["guide", 10],
    ] as const)
      g = act(g, id, { type: "select", count, round: 1, phase: g.phase }, rng);
    g = advance(g, rng);
    if (step === 3) return g;
    g = advance(g, rng);
    if (step === 4) return g;
    for (const [id, count] of [
      ["you", addition],
      ["guide", 2],
    ] as const)
      g = act(g, id, { type: "add", count, round: 1, phase: g.phase }, rng);
    if (step === 5) return g;
    g = advance(g, rng);
    if (step === 6) return g;
    while (g.phase === "second_additions") {
      const id = g.order[g.cursor];
      g = act(
        g,
        id,
        {
          type: "add",
          count: id === "you" ? Math.min(last, secondCap(addition)) : 0,
          round: 1,
          phase: g.phase,
        },
        rng,
      );
    }
    while (g.phase === "final_reveal") g = advance(g, rng);
    return g;
  }, [step, initial, addition, last]);
  const own = state.players[0],
    total = own.hand.reduce((n, c) => n + (c.revealed ? c.card.value : 0), 0);
  return (
    <Modal title="A seat at the practice table." onClose={onClose} wide>
      <div className="tutorial-top">
        <span className="eyebrow">GUIDED PRACTICE · LOCAL EXAMPLE</span>
        <span className="muted">{step + 1} / 8</span>
      </div>
      <div className="tutorial-board">
        <div>
          <span className="eyebrow">THE TARGET</span>
          <strong className="tutorial-target">{state.target}</strong>
        </div>
        <div>
          <span className="eyebrow">PUBLIC BURNS</span>
          <div className="burn-cards">
            {state.burns.map((b) => (
              <PlayingCard key={b.card.id} card={b.card} size="small" silent />
            ))}
          </div>
        </div>
        <div>
          <span className="eyebrow">SHARED DECK</span>
          <strong className="tutorial-count">{state.deck.length}</strong>
        </div>
      </div>
      {own.hand.length > 0 && (
        <>
          <p className="fine-print">
            Your hand · {total} revealed total ·{" "}
            {own.hand.filter((c) => c.revealed).length} cards public
          </p>
          <div className="tutorial-hand">
            {own.hand.map((c, i) => (
              <span key={c.card.id} className={c.revealed && c.revealedIn === state.latestReveal ? "new-reveal" : undefined}>
                <PlayingCard
                  card={c.revealed ? c.card : null}
                  faceUp={c.revealed}
                  isPublic={c.revealed}
                  size="small"
                  delay={i * 0.03}
                  silent
                />
              </span>
            ))}
          </div>
        </>
      )}
      <h3 className="tutorial-title">{tutorialCopy[step][0]}</h3>
      <p className="muted tutorial-description">{tutorialCopy[step][1]}</p>
      {step === 2 && (
        <label className="range-label">
          Your initial hand: {initial} cards
          <input
            type="range"
            min={RULES[2].initial[0]}
            max={RULES[2].initial[1]}
            value={initial}
            onChange={(e) => setInitial(Number(e.target.value))}
          />
        </label>
      )}
      {step === 4 && (
        <div className="choice-row">
          {Array.from({ length: FIRST_ADDITION_MAX + 1 }, (_, n) => n).map((n) => (
            <button
              key={n}
              className={`choice ${addition === n ? "selected" : ""}`}
              onClick={() => setAddition(n)}
            >
              {n === 0 ? "Pass" : `+${n}`}
            </button>
          ))}
        </div>
      )}
      {step === 6 && (
        <div className="choice-row">
          {Array.from({ length: secondCap(addition) + 1 }, (_, n) => n).map((n) => (
              <button
                key={n}
                className={`choice ${last === n ? "selected" : ""}`}
                onClick={() => setLast(n)}
              >
                {n === 0 ? "Pass" : `+${n}`}
              </button>
            ))}
        </div>
      )}
      {step === 7 && (
        <p className="notice">
          Your total: {total}. Distance: {Math.abs(total - state.target)}.{" "}
          {state.results.find((r) => r.playerId === "you")?.winner
            ? "You win this practice round."
            : "The guide wins this practice round."}
        </p>
      )}
      <div className="modal-actions">
        <button
          className="button secondary"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          Back
        </button>
        <button
          className="button primary"
          onClick={() => {
            audio.play("phase");
            if (step === 7) onClose();
            else setStep(step + 1);
          }}
        >
          {step === 7
            ? "Ready to play"
            : step === 2
              ? "Confirm & deal"
              : "Continue"}
          <Icon name="arrow" />
        </button>
      </div>
    </Modal>
  );
}
