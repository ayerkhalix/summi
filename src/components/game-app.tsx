"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { audio, DEFAULT_AUDIO } from "@/audio/manager";
import {
  BRAND,
  MOTION,
  PHASE_LABELS,
  PHASES,
  rulesFor,
  TIMING,
} from "@/game/config";
import type { GameView } from "@/game/types";
import type { RoomCommand, RoomView } from "@/server/types";
import { PlayingCard, Suit } from "./card";
import { Icon } from "./icon";
import { Modal, Rules, Settings, Tutorial } from "./dialogs";
import { SceneCards, SceneDeck } from "./scene-cards";
async function request<T>(
  url: string,
  method = "GET",
  payload?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Unable to connect. Please try again.");
  return data as T;
}

export function GameApp({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<RoomView | null>(null),
    [entry, setEntry] = useState<"create" | "join" | "solo" | "bots" | null>(
      initialCode ? "join" : null,
    );
  const [dialog, setDialog] = useState<
    "rules" | "settings" | "tutorial" | "leave" | null
  >(null);
  const [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(true);
  const [booting, setBooting] = useState(Boolean(initialCode));
  const [entryCode, setEntryCode] = useState(initialCode ?? "");
  const prefs = useSyncExternalStore(
    audio.subscribe,
    audio.snapshot,
    () => DEFAULT_AUDIO,
  );
  const systemReduce = useReducedMotion();
  const lastRoom = useRef<RoomView | null>(null),
    roomRef = useRef<RoomView | null>(null);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);
  useEffect(() => {
    const restore = () => {
      const code = /^\/room\/([A-Z2-9]{6})$/.exec(
        window.location.pathname,
      )?.[1];
      if (code === roomRef.current?.code) return;
      if (!code) {
        setRoom(null);
        setEntry(null);
        setError("");
        return;
      }
      setEntryCode(code);
      void request<RoomView>(`/api/rooms/${code}`)
        .then(setRoom)
        .catch(() => {
          setRoom(null);
          setEntry("join");
        });
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    const unlock = () => {
      void audio.unlock();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  useEffect(() => {
    if (!initialCode) return;
    let cancelled = false;
    request<RoomView>(`/api/rooms/${initialCode}`)
      .then((r) => {
        if (!cancelled) {
          setRoom(r);
          setEntry(null);
        }
      })
      .catch(() => {
        /* An invitation needs guest entry; unknown codes are validated on join. */
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialCode]);
  const code = room?.code;
  useEffect(() => {
    if (!code) return;
    let active = true;
    const source = new EventSource(`/api/rooms/${code}/events`);
    let online = true,
      rotating = false;
    source.addEventListener("rotate", () => {
      rotating = true;
    });
    const connection = (value: boolean) => {
      if (!active) return;
      if (online !== value) audio.play(value ? "restored" : "lost");
      online = value;
      setConnected(value);
    };
    source.onopen = () => {
      rotating = false;
      connection(true);
    };
    source.onmessage = (event) => {
      if (!active) return;
      try {
        const data = JSON.parse(event.data);
        if (data.error) connection(false);
        else {
          connection(true);
          setRoom((previous) =>
            previous && data.version >= previous.version ? data : previous,
          );
        }
      } catch {
        connection(false);
      }
    };
    source.onerror = () => {
      if (!rotating) connection(false);
    };
    const beat = () => {
      void request<RoomView>(`/api/rooms/${code}`, "PATCH", {
        requestId: crypto.randomUUID(),
        command: { type: "heartbeat" },
      })
        .then((data) => {
          if (active) {
            connection(true);
            setRoom((previous) =>
              previous && data.version >= previous.version ? data : previous,
            );
          }
        })
        .catch(() => {
          connection(false);
        });
    };
    beat();
    const heartbeat = setInterval(beat, TIMING.heartbeat);
    window.addEventListener("online", beat);
    window.addEventListener("focus", beat);
    return () => {
      active = false;
      source.close();
      clearInterval(heartbeat);
      window.removeEventListener("online", beat);
      window.removeEventListener("focus", beat);
    };
  }, [code]);
  useEffect(() => {
    if (!room) {
      lastRoom.current = null;
      return;
    }
    const previous = lastRoom.current;
    lastRoom.current = room;
    if (!previous || previous.code !== room.code) return;
    if (room.members.length > previous.members.length) audio.play("joined");
    if (room.members.length < previous.members.length) audio.play("left");
    if (
      room.members.some(
        (m) => m.ready !== previous.members.find((p) => p.id === m.id)?.ready,
      )
    )
      audio.play("ready");
    const g = room.game,
      pg = previous.game;
    if (g && g.round !== pg?.round) {
      audio.play("shuffle");
      setTimeout(() => audio.play("target"), 250);
    }
    if (g && pg && g.phase !== pg.phase) {
      audio.play(
        g.phase === "final_reveal"
          ? "final"
          : g.phase.includes("reveal")
            ? "reveal"
            : "phase",
      );
      if (g.phase === "round_results") {
        const winners = g.results.filter((r) => r.winner);
        audio.play(
          winners.some((w) => w.playerId === room.me)
            ? winners.length > 1
              ? "shared"
              : "victory"
            : "defeat",
        );
      }
    }
    if (g?.activePlayerId === room.me && pg?.activePlayerId !== room.me)
      audio.play("turn");
    if (g && pg && g.events.length > pg.events.length) {
      const last = g.events.at(-1);
      if (last?.kind === "pass") audio.play("pass");
      if (last?.kind === "draw") audio.play("add");
    }
  }, [room]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const send = useCallback(
    async (command: RoomCommand) => {
      const current = roomRef.current;
      if (!current || busy) return;
      setBusy(true);
      setError("");
      audio.play("click");
      try {
        const result = await request<RoomView | null>(
          `/api/rooms/${current.code}`,
          "PATCH",
          {
            requestId: crypto.randomUUID(),
            expectedRound: current.roundNumber,
            command,
          },
        );
        if (result)
          setRoom((previous) =>
            previous && result.version >= previous.version ? result : previous,
          );
        else {
          setRoom(null);
          setDialog(null);
          router.push("/");
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Unable to submit your decision.",
        );
        audio.play("error");
        void request<RoomView>(`/api/rooms/${current.code}`)
          .then(setRoom)
          .catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [busy, router],
  );
  async function enter(
    name: string,
    inviteCode: string,
    role: "player" | "spectator",
    botCount = 2,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next =
        entry !== "join"
          ? await request<RoomView>("/api/rooms", "POST", {
              name,
              mode: entry === "create" ? "friends" : entry,
              ...(entry === "bots" ? { botCount } : {}),
            })
          : await request<RoomView>(
              `/api/rooms/${inviteCode.toUpperCase()}`,
              "POST",
              { name, role },
            );
      try {
        localStorage.setItem("summin-name", name);
      } catch {}
      setRoom(next);
      setEntry(null);
      audio.play(entry === "create" ? "created" : "joined");
      // Keep this scene mounted so its physical cards can travel to the deck.
      // A refresh still restores the same server-authorized room route.
      if (window.location.pathname !== `/room/${next.code}`)
        window.history.pushState(null, "", `/room/${next.code}`);
      window.scrollTo({
        top: 0,
        behavior: prefs.reducedMotion || systemReduce ? "instant" : "smooth",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to enter the room.");
      audio.play("error");
    } finally {
      setBusy(false);
    }
  }
  async function copyInvite() {
    if (!room) return;
    const link = `${window.location.origin}/room/${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setToast("Invitation link copied");
      audio.play("copy");
    } catch {
      setToast(`Room code: ${room.code} · Copy the address bar to share`);
    }
  }
  const closeDialog = () => setDialog(null);
  const tutorial = () => setDialog("tutorial");
  return (
    <MotionConfig
      reducedMotion={prefs.reducedMotion || systemReduce ? "always" : "never"}
    >
      <div
        className={`app ${room ? "in-room" : ""} ${prefs.reducedMotion ? "motion-reduced" : ""}`}
      >
        <SceneCards
          scene={
            booting
              ? "loading"
              : room
                ? `${room.code}:${room.status}:${room.roundNumber}:${room.game?.phase ?? ""}`
                : "landing"
          }
          reduced={!!(prefs.reducedMotion || systemReduce)}
        />
        <header className="site-header">
          <Link
            className="wordmark"
            href="/"
            onClick={(e) => {
              if (room) {
                e.preventDefault();
                setDialog("leave");
              }
            }}
            aria-label="SUMMIN home"
          >
            <span className="brand-symbol">
              <i />
              <i />
              <i />
            </span>
            {BRAND.name}
            <span className="brand-period">.</span>
          </Link>
          {room ? (
            <div className="header-room">
              <span
                className={`connection-dot ${connected ? "" : "offline"}`}
              />
              <span>{connected ? "Connected" : "Reconnecting…"}</span>
              <span className="header-divider" />
              <button
                onClick={copyInvite}
                className="room-code"
                aria-label="Copy invitation link"
              >
                {room.code}
                <Icon name="copy" size={14} />
              </button>
            </div>
          ) : (
            <nav>
              <button className="nav-link" onClick={() => setDialog("rules")}>
                The rules
              </button>
              <span className="header-pill">A GAME OF GOOD JUDGMENT</span>
            </nav>
          )}
          <div className="header-tools">
            <button
              className="icon-button"
              aria-label={prefs.muted ? "Unmute sounds" : "Mute sounds"}
              onClick={() => audio.update({ muted: !prefs.muted })}
            >
              <Icon name={prefs.muted ? "mute" : "sound"} size={19} />
            </button>
            <button
              className="icon-button"
              aria-label="Open settings"
              onClick={() => setDialog("settings")}
            >
              <Icon name="settings" size={19} />
            </button>
            {room && (
              <button
                className="icon-button"
                aria-label="Leave room"
                onClick={() => setDialog("leave")}
              >
                <Icon name="leave" size={19} />
              </button>
            )}
          </div>
        </header>
        {booting ? (
          <main className="loading-screen">
            <span className="spinner" />
            <h1>Finding your seat.</h1>
            <p className="muted">Restoring your guest session…</p>
          </main>
        ) : room ? (
          <>
            <div className="backend-banner">
              <span className="connection-dot" />
              {room.backend === "local"
                ? "LOCAL DEVELOPMENT SERVER"
                : "SUPABASE MULTIPLAYER"}
              <span>
                {room.mode === "solo"
                  ? "SOLO CHALLENGE · Beat your closest distance"
                  : room.mode === "bots"
                    ? "BOT TABLE · Computer opponents · Private hands"
                    : room.backend === "local"
                      ? "Real shared rooms · this server only · rooms reset on restart"
                      : "Private hands · server-authoritative play"}
              </span>
            </div>
            {!connected && (
              <div className="connection-banner" role="status">
                Connection interrupted. Reconnecting to your existing seat; your
                actions will resume from the server.
              </div>
            )}
            {error && (
              <div className="error-banner" role="alert">
                {error}
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}
            {room.status === "lobby" ? (
              <Lobby
                room={room}
                busy={busy}
                send={send}
                copyInvite={copyInvite}
                tutorial={tutorial}
              />
            ) : (
              <GameTable
                room={room}
                busy={busy || !connected}
                send={send}
                rules={() => setDialog("rules")}
              />
            )}
          </>
        ) : (
          <Landing
            create={() => {
              setEntry("create");
              setError("");
            }}
            join={() => {
              setEntry("join");
              setError("");
            }}
            tutorial={tutorial}
            solo={() => {
              setEntry("solo");
              setError("");
            }}
            bots={() => {
              setEntry("bots");
              setError("");
            }}
          />
        )}
        <footer className="site-footer">
          <span>
            SUMMIN. <span className="muted">A little knowledge. An edge.</span>
          </span>
          <div>
            <span>SOLO · BOTS · FRIENDS</span>
            <i /> <span>ONE SHARED DECK</span>
            <i />
            <span>ENDLESS POSSIBILITIES</span>
          </div>
          <button className="text-button" onClick={() => setDialog("rules")}>
            How to play <Icon name="arrow" size={14} />
          </button>
        </footer>
        <AnimatePresence>
          {toast && (
            <motion.div
              role="status"
              className="toast"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <Icon name="check" size={16} />
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
        {entry && !booting && !room && (
          <Entry
            mode={entry}
            initialCode={entryCode}
            error={error}
            busy={busy}
            submit={enter}
            onClose={() => {
              setEntry(null);
              setError("");
            }}
          />
        )}
        {dialog === "rules" && (
          <Rules onClose={closeDialog} onTutorial={tutorial} />
        )}
        {dialog === "tutorial" && <Tutorial onClose={closeDialog} />}
        {dialog === "settings" && (
          <Settings onClose={closeDialog} onTutorial={tutorial} />
        )}
        {dialog === "leave" && (
          <Modal title="Leave your seat?" onClose={closeDialog}>
            <p className="muted">
              {room?.status === "playing" &&
              room.members.find((m) => m.id === room.me)?.role === "player"
                ? "Leaving ends the current match for everyone. The room and completed round history remain available. Host privileges transfer to the earliest connected player."
                : "The room remains available for the other players. You can rejoin using the invitation link."}
            </p>
            <div className="modal-actions">
              <button className="button secondary" onClick={closeDialog}>
                Stay here
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() => {
                  void send({ type: "leave" });
                }}
              >
                Leave room
                <Icon name="leave" />
              </button>
            </div>
          </Modal>
        )}
      </div>
    </MotionConfig>
  );
}

function Landing({
  create,
  join,
  tutorial,
  solo,
  bots,
}: {
  create: () => void;
  join: () => void;
  tutorial: () => void;
  solo: () => void;
  bots: () => void;
}) {
  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow hero-eyebrow">
            <span className="tiny-star">✳</span> YOUR NEXT GREAT GAME NIGHT
          </div>
          <h1>
            Read the table.
            <br />
            Trust your gut.
            <br />
            <em>Get closer.</em>
          </h1>
          <p className="hero-description">
            One target. One shared deck. A few secrets.
            <br />A strategy card game where every draw changes the odds.
            <br className="desktop-break" /> Bring your friends. Play your
            numbers.
          </p>
          <div className="hero-buttons">
            <button className="button primary" onClick={create}>
              Create a room
              <Icon name="arrow" />
            </button>
            <button className="button secondary" onClick={join}>
              Join with a code
              <Icon name="join" />
            </button>
          </div>
          <div className="practice-buttons">
            <button className="button secondary" onClick={solo}>
              Solo challenge <Icon name="arrow" />
            </button>
            <button className="button secondary" onClick={bots}>
              Play with bots <Icon name="users" />
            </button>
          </div>
          <div className="hero-meta">
            <span>
              <Icon name="users" size={16} /> Solo, bots, or 2–5 friends
            </span>
            <span className="meta-dot" />
            <span>No accounts. Just play.</span>
          </div>
        </div>
        <div
          className="hero-art"
          aria-label="Illustration of playing cards surrounding a target of 97"
        >
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="art-label label-top">
            THE ODDS ARE ALWAYS CHANGING.
          </span>
          <div className="floating-card hero-card-one" data-scene-anchor="0" />
          <div className="floating-card hero-card-two" data-scene-anchor="1" />
          <div
            className="floating-card hero-card-three"
            data-scene-anchor="2"
          />
          <div className="target-orb">
            <span>THE TARGET</span>
            <strong>
              97<span>↗</span>
            </strong>
            <div>
              <span className="connection-dot" /> HOW CLOSE CAN YOU GET?
            </div>
          </div>
          <div className="floating-chip chip-one">
            <span className="connection-dot" />
            <b>94</b>
            <span>Just 3 away.</span>
          </div>
          <div className="floating-chip chip-two">
            <Icon name="eye" size={17} />
            <span>Keep them guessing.</span>
          </div>
          <div className="coordinate coord-one">
            52 CARDS
            <br />
            01 SHARED DECK
          </div>
          <div className="coordinate coord-two">STRATEGY &gt; LUCK</div>
        </div>
      </section>
      <section className="intro-strip">
        <div className="intro-caption">
          <span className="eyebrow">
            SIMPLE TO LEARN.
            <br />
            HARD TO READ.
          </span>
          <button className="text-button" onClick={tutorial}>
            Take a practice seat
            <Icon name="arrow" size={17} />
          </button>
        </div>
        <div className="principle">
          <span className="principle-number">01</span>
          <div>
            <h2>Pick your possibilities.</h2>
            <p>
              See the target. Read the burns.
              <br />
              Choose how many cards to take.
            </p>
          </div>
        </div>
        <div className="principle">
          <span className="principle-number">02</span>
          <div>
            <h2>Watch the story unfold.</h2>
            <p>
              Cards turn. Information changes.
              <br />
              Know when to draw. Or walk away.
            </p>
          </div>
        </div>
        <div className="principle">
          <span className="principle-number">03</span>
          <div>
            <h2>Make every number count.</h2>
            <p>
              Above or below, closest wins.
              <br />
              The final reveal settles everything.
            </p>
          </div>
        </div>
      </section>
      <section className="landing-note">
        <div>
          <span className="mini-cards">
            <Suit suit="spades" />
            <Suit suit="diamonds" />
            <Suit suit="clubs" />
            <Suit suit="hearts" />
          </span>
          <span>
            Familiar cards.
            <br />
            <strong>A different kind of tension.</strong>
          </span>
        </div>
        <p>
          No bets. No buy-ins. Just good decisions
          <br />
          and the people you like beating.
        </p>
        <button
          className="circle-link"
          aria-label="Open guided tutorial"
          onClick={tutorial}
        >
          <Icon name="arrow" size={24} />
        </button>
      </section>
    </main>
  );
}
function Entry({
  mode,
  initialCode,
  error,
  busy,
  submit,
  onClose,
}: {
  mode: "create" | "join" | "solo" | "bots";
  initialCode?: string;
  error: string;
  busy: boolean;
  submit: (
    name: string,
    code: string,
    role: "player" | "spectator",
    botCount?: number,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(""),
    [code, setCode] = useState(initialCode || ""),
    [role, setRole] = useState<"player" | "spectator">("player"),
    [botCount, setBotCount] = useState(2);
  return (
    <Modal
      title={
        mode === "solo"
          ? "Just you and the numbers."
          : mode === "bots"
            ? "Your table. Their poker faces."
            : mode === "create"
              ? "Good company. Great odds."
              : "There’s a seat for you."
      }
      onClose={onClose}
    >
      <p className="muted">
        {mode === "solo"
          ? "A one-player target challenge. Take your time, learn the deck, and improve your closest distance. Targets 80–150; initial hands 8–15."
          : mode === "bots"
            ? "Play a full match against computer opponents. Bots see their own cards and the public table, just like you."
            : mode === "create"
              ? "Create a private table, then share the invitation with friends."
              : "Enter your invitation code. Join as a spectator if a round is already in play."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(name, code, role, botCount);
        }}
      >
        <label className="field-label" htmlFor="guest-name">
          Your display name
          <input
            id="guest-name"
            autoFocus
            autoComplete="nickname"
            placeholder="What should we call you?"
            minLength={2}
            maxLength={20}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {mode === "bots" && (
          <fieldset className="bot-count">
            <legend>Computer opponents</legend>
            <div className="choice-row">
              {[1, 2, 3, 4].map((n) => (
                <button
                  type="button"
                  key={n}
                  className={`choice ${botCount === n ? "selected" : ""}`}
                  aria-pressed={botCount === n}
                  onClick={() => setBotCount(n)}
                >
                  {n} {n === 1 ? "bot" : "bots"}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {mode === "join" && (
          <>
            <label className="field-label" htmlFor="invite-code">
              Room code
              <input
                id="invite-code"
                className="code-input"
                placeholder="ABC234"
                maxLength={6}
                minLength={6}
                required
                autoCapitalize="characters"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </label>
            <fieldset className="role-select">
              <legend>Join the table as</legend>
              <label>
                <input
                  type="radio"
                  name="role"
                  value="player"
                  checked={role === "player"}
                  onChange={() => setRole("player")}
                />
                <Icon name="users" size={18} />
                Player
              </label>
              <label>
                <input
                  type="radio"
                  name="role"
                  value="spectator"
                  checked={role === "spectator"}
                  onChange={() => setRole("spectator")}
                />
                <Icon name="eye" size={18} />
                Spectator
              </label>
            </fieldset>
          </>
        )}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <button type="submit" className="button primary full" disabled={busy}>
          {busy
            ? "Connecting…"
            : mode === "solo"
              ? "Start solo challenge"
              : mode === "bots"
                ? "Start bot match"
                : mode === "create"
                  ? "Create my room"
                  : "Join the room"}
          <Icon name="arrow" />
        </button>
        <p className="fine-print">
          Guest play · No account needed · Private hands
        </p>
      </form>
    </Modal>
  );
}

type RoomProps = {
  room: RoomView;
  busy: boolean;
  send: (command: RoomCommand) => Promise<void>;
};
function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return (
    <span className={`avatar avatar-${index % 5}`}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
function Lobby({
  room,
  busy,
  send,
  copyInvite,
  tutorial,
}: RoomProps & { copyInvite: () => void; tutorial: () => void }) {
  const players = room.members.filter((m) => m.role === "player"),
    spectators = room.members.filter((m) => m.role === "spectator");
  const me = room.members.find((m) => m.id === room.me)!,
    isHost = room.hostId === room.me;
  const connected = players.filter((m) => m.disconnectedAt === null);
  return (
    <main className="lobby">
      <div className="lobby-heading">
        <span className="eyebrow">THE TABLE IS YOURS</span>
        <SceneDeck />
        <h1>
          {room.mode === "solo"
            ? "Your next closest call."
            : room.mode === "bots"
              ? "Ready for a rematch?"
              : "Better with friends."}
        </h1>
        <p className="muted">
          {room.mode === "friends"
            ? "Get everyone together. The numbers can wait."
            : "Your next round is ready when you are."}
        </p>
      </div>
      <div className="lobby-grid">
        <section className="lobby-panel">
          <div className="panel-heading">
            <h2>Your table</h2>
            <span className="badge">
              {players.length}{" "}
              {room.mode === "friends"
                ? "/ 5 PLAYERS"
                : room.mode === "solo"
                  ? "SOLO PLAYER"
                  : "PLAYERS · BOTS INCLUDED"}
            </span>
          </div>
          <div className="player-list">
            {players.map((m, i) => (
              <div className="lobby-player" key={m.id}>
                <Avatar name={m.name} index={i} />
                <div>
                  <strong>
                    {m.name}
                    {m.id === room.me && <small> YOU</small>}
                  </strong>
                  <span>
                    {room.hostId === m.id ? "Host" : "Player"}
                    {m.disconnectedAt !== null
                      ? " · Disconnected"
                      : " · Connected"}
                  </span>
                </div>
                {m.ready ? (
                  <span className="ready-badge">
                    <Icon name="check" size={15} />
                    Ready
                  </span>
                ) : (
                  <span className="muted">Getting settled</span>
                )}
                {room.hostId === m.id && <Icon name="crown" size={17} />}
              </div>
            ))}
            {Array.from(
              {
                length:
                  room.mode === "friends" ? Math.max(0, 2 - players.length) : 0,
              },
              (_, i) => (
                <div className="empty-seat" key={i}>
                  <span className="avatar">
                    <Icon name="plus" />
                  </span>
                  <span>Waiting for a friend…</span>
                </div>
              ),
            )}
          </div>
          {spectators.length > 0 && (
            <div className="spectator-list">
              <Icon name="eye" size={16} />
              <span>
                {spectators.length} watching:{" "}
                {spectators.map((s) => s.name).join(", ")}
              </span>
            </div>
          )}
          <div className="lobby-actions">
            {me.role === "player" ? (
              <button
                className={`button ${me.ready ? "secondary" : "primary"}`}
                disabled={busy}
                onClick={() => {
                  void send({ type: "ready", ready: !me.ready });
                }}
              >
                {me.ready ? "I’m not ready yet" : "I’m ready"}
                <Icon name="check" />
              </button>
            ) : room.mode === "friends" ? (
              <button
                className="button primary"
                disabled={busy || players.length >= 5}
                onClick={() => {
                  void send({ type: "claim" });
                }}
              >
                Take an open seat
                <Icon name="plus" />
              </button>
            ) : (
              <p className="muted">
                You’re watching a practice table. Player seats are reserved.
              </p>
            )}
            {isHost && (
              <button
                className="button primary"
                disabled={
                  busy ||
                  connected.length < (room.mode === "solo" ? 1 : 2) ||
                  connected.some((m) => !m.ready)
                }
                onClick={() => {
                  void send({ type: "start" });
                }}
              >
                Start the round
                <Icon name="arrow" />
              </button>
            )}
          </div>
          <p className="fine-print">
            {room.mode !== "friends"
              ? "Ready your seat to start another practice round. Bots stay ready automatically."
              : isHost
                ? "Start when 2–5 connected players are ready. Disconnected seats become spectator seats for a new match."
                : "The host will start when everyone is ready."}
          </p>
        </section>
        <aside>
          <div className="invite-panel">
            <span className="eyebrow">GOOD ODDS. BETTER COMPANY.</span>
            <h2>
              {room.mode === "friends" ? (
                <>
                  Make it a<br />
                  full table.
                </>
              ) : (
                <>
                  Share the
                  <br />
                  view.
                </>
              )}
            </h2>
            <p className="muted">
              {room.mode === "friends"
                ? "Send this code or share your private invitation link."
                : "Friends can join as spectators. Practice player seats stay reserved."}
            </p>
            <button
              className="big-code"
              onClick={copyInvite}
              aria-label="Copy invitation link"
            >
              {room.code}
              <Icon name="copy" />
            </button>
            <button className="button secondary full" onClick={copyInvite}>
              Copy invitation link
              <Icon name="arrow" />
            </button>
          </div>
          <button className="tutorial-link" onClick={tutorial}>
            <span>
              <Icon name="help" />
              New to SUMMIN?
              <small>A quick practice round gets you ready.</small>
            </span>
            <Icon name="arrow" />
          </button>
        </aside>
      </div>
      <History room={room} />
    </main>
  );
}

function GameTable({
  room,
  busy,
  send,
  rules,
}: RoomProps & { rules: () => void }) {
  const game = room.game!;
  const me = room.members.find((m) => m.id === room.me)!,
    own = game.players.find((p) => p.id === room.me),
    name = (id: string) =>
      room.members.find((m) => m.id === id)?.name ?? "Former player";
  const opponents = game.players.filter((p) => p.id !== room.me);
  const ended = room.status === "abandoned",
    finished = game.phase === "round_results",
    paused = room.paused.length > 0;
  const activeName = game.activePlayerId ? name(game.activePlayerId) : null;
  const shownTotal =
    own?.hand.reduce((n, c) => n + (c.card?.value ?? 0), 0) ?? 0;
  return (
    <motion.main
      className="game-page"
      initial={{ opacity: 0, rotateX: 8, y: 35 }}
      animate={{ opacity: 1, rotateX: 0, y: 0 }}
      onAnimationComplete={() => window.dispatchEvent(new Event("resize"))}
      transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="game-heading">
        <div>
          <span className="eyebrow">
            ROUND {game.round.toString().padStart(2, "0")}{" "}
            <span className="label-separator">/</span> {game.players.length}{" "}
            {room.mode === "solo"
              ? "PLAYER / SOLO CHALLENGE"
              : room.mode === "bots"
                ? "PLAYERS / BOT MATCH"
                : "PLAYERS"}{" "}
            {me.role === "spectator" && " / SPECTATING"}
          </span>
          <h1>
            {ended
              ? "We’ll call this one here."
              : finished
                ? "Every number told a story."
                : PHASE_LABELS[game.phase]}
          </h1>
        </div>
        <button className="text-button" onClick={rules}>
          <Icon name="help" size={16} /> The rules
        </button>
      </div>
      <div className="phase-track" aria-label="Round progress">
        {PHASES.map((phase, i) => (
          <div
            key={phase}
            className={`${i < PHASES.indexOf(game.phase) ? "complete" : ""} ${game.phase === phase ? "current" : ""}`}
            aria-current={game.phase === phase ? "step" : undefined}
          >
            <span>
              {i < PHASES.indexOf(game.phase)
                ? "✓"
                : String(i + 1).padStart(2, "0")}
            </span>
            <small>{PHASE_LABELS[phase]}</small>
          </div>
        ))}
      </div>
      {paused && (
        <div className="pause-banner" role="status">
          <span className="spinner" />
          <div>
            <strong>
              Match paused. Waiting for{" "}
              {room.paused.map((p) => p.name).join(", ")}.
            </strong>
            <span>
              Their decision stays open for the 90-second reconnection grace
              period. If they cannot return, this match ends.
            </span>
          </div>
        </div>
      )}
      {ended && (
        <div className="pause-banner ended" role="status">
          <Icon name="wifi" />
          <div>
            <strong>Match ended safely.</strong>
            <span>{room.endedReason}</span>
          </div>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              void send({ type: "lobby" });
            }}
          >
            Return to lobby
            <Icon name="arrow" />
          </button>
        </div>
      )}
      <div className={`table-layout seats-${opponents.length}`}>
        <div className="table-main">
          <section className="opponents" aria-label="Other players">
            {opponents.map((p, i) => (
              <PlayerHand
                key={p.id}
                player={p}
                name={name(p.id)}
                index={i + 1}
                active={game.activePlayerId === p.id}
                disconnected={
                  room.members.find((m) => m.id === p.id)?.disconnectedAt !==
                  null
                }
                phase={game.phase}
              />
            ))}
          </section>
          <section className="public-table" aria-label="Public table">
            <div className="public-burns">
              <span className="eyebrow">OUT OF PLAY</span>
              <div className="burn-cards">
                {game.burns.map((b, i) => (
                  <div key={b.card.id}>
                    <PlayingCard card={b.card} size="small" delay={i * 0.12} />
                    <span title={name(b.playerId)}>{name(b.playerId)}</span>
                  </div>
                ))}
              </div>
              <span className="fine-print">Burned. Gone for this round.</span>
            </div>
            <div className="game-target">
              <span className="eyebrow">THE TARGET</span>
              <motion.strong
                key={`${game.round}:${game.target}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                {game.target}
              </motion.strong>
              <span className="target-caption">
                {room.mode === "solo"
                  ? "BEAT YOUR BEST DISTANCE."
                  : "CLOSEST TAKES IT."}
              </span>
            </div>
            <div className="shared-deck">
              <SceneDeck />
              <span>
                <strong>{game.deckCount}</strong> CARDS LEFT
              </span>
              <small className="muted">One shared deck</small>
            </div>
          </section>
          {own && (
            <section
              className={`own-hand ${game.activePlayerId === room.me ? "your-turn" : ""}`}
              aria-label="Your private hand"
            >
              <div className="hand-heading">
                <div>
                  <Avatar name={me.name} />
                  <span>
                    <strong>
                      {me.name} <small>YOU</small>
                    </strong>
                    <span className="muted">
                      {own.hand.length} cards ·{" "}
                      {own.hand.filter((c) => c.public).length} public ·{" "}
                      {own.hand.filter((c) => !c.public).length} private
                    </span>
                  </span>
                </div>
                <div className="own-total">
                  <span>YOUR TOTAL</span>
                  <strong>{shownTotal || "—"}</strong>
                  {own.hand.length > 0 && (
                    <small>
                      {Math.abs(shownTotal - game.target)}{" "}
                      {shownTotal < game.target
                        ? "below"
                        : shownTotal > game.target
                          ? "above"
                          : "exact"}
                    </small>
                  )}
                </div>
              </div>
              <div className="own-cards">
                {own.hand.length ? (
                  own.hand.map((c, i) => (
                    <motion.div
                      key={c.slotId}
                      className="hand-card"
                      style={{ rotateZ: (i - (own.hand.length - 1) / 2) * 1.2 }}
                      whileHover={{ y: -15, rotateX: 8, scale: 1.07 }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 22,
                      }}
                    >
                      <PlayingCard
                        card={c.card}
                        isPublic={c.public}
                        delay={c.dealOrder * MOTION.dealStagger}
                      />
                    </motion.div>
                  ))
                ) : (
                  <div className="hand-placeholder">
                    <Icon name="shuffle" size={28} />
                    <span>Your possibilities arrive here.</span>
                    <small>Choose your initial hand after the burn.</small>
                  </div>
                )}
              </div>
              <div className="hand-legend">
                <span className="legend-public" />
                Public to everyone <span className="legend-private" />
                Only you see private cards
              </div>
            </section>
          )}
          {finished ? (
            <Results room={room} busy={busy} send={send} />
          ) : (
            !ended && (
              <Decision
                key={`${game.round}:${game.phase}:${game.activePlayerId}`}
                room={room}
                busy={busy || paused}
                send={send}
                activeName={activeName}
              />
            )
          )}
        </div>
        <aside className="table-sidebar">
          <div className="info-panel">
            <span className="eyebrow">TABLE TALK, WITHOUT THE TELLS</span>
            <h3>The round so far.</h3>
            <ol className="event-log" aria-label="Public event history">
              {[...game.events].reverse().map((e) => (
                <li key={e.id}>
                  <span className={`event-marker event-${e.kind}`} />
                  <div>
                    {e.playerId && <strong>{name(e.playerId)}</strong>}
                    <p>{e.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="info-panel">
            <span className="eyebrow">A FRIENDLY REMINDER</span>
            <p>
              Going over doesn’t mean you’re out. Closest wins. At equal
              distance, below beats above.
            </p>
            <button className="text-button" onClick={rules}>
              Read the rules
              <Icon name="arrow" size={15} />
            </button>
          </div>
        </aside>
      </div>
      <History room={room} />
    </motion.main>
  );
}
function PlayerHand({
  player,
  name,
  index,
  active,
  disconnected,
  phase,
}: {
  player: GameView["players"][number];
  name: string;
  index: number;
  active: boolean;
  disconnected: boolean;
  phase: GameView["phase"];
}) {
  const publicTotal = player.hand.reduce(
    (n, c) => n + (c.public ? (c.card?.value ?? 0) : 0),
    0,
  );
  return (
    <article
      className={`opponent ${active ? "active-player" : ""}`}
      aria-label={`${name}'s public hand`}
    >
      <div className="opponent-heading">
        <Avatar name={name} index={index} />
        <div>
          <strong>{name}</strong>
          <span>
            {disconnected
              ? "Disconnected"
              : active
                ? "Taking their turn"
                : phase === "initial_selection"
                  ? player.committed
                    ? "Choice committed"
                    : "Choosing a hand"
                  : `${player.hand.length} cards · ${player.hand.filter((c) => !c.public).length} hidden`}
          </span>
        </div>
        {player.committed && phase === "initial_selection" && (
          <Icon name="check" size={17} />
        )}
        <div className="public-total">
          <b>{player.hand.length ? publicTotal : "—"}</b>
          <small>PUBLIC</small>
        </div>
      </div>
      <div className="opponent-cards">
        {player.hand.map((c, i) => (
          <motion.div
            key={c.slotId}
            className="hand-card"
            style={{ rotateZ: (i - (player.hand.length - 1) / 2) * 1.1 }}
          >
            <PlayingCard
              card={c.card}
              isPublic={c.public}
              size="small"
              delay={c.dealOrder * MOTION.dealStagger}
            />
          </motion.div>
        ))}
        {!player.hand.length && (
          <span className="muted empty-hand">
            {player.committed
              ? "Committed. Waiting for the table."
              : "Their hand is still unwritten."}
          </span>
        )}
      </div>
      {phase === "second_additions" && player.cap === 0 && (
        <p className="skip-note">
          Automatically skipped: first addition received {player.firstReceived},
          so final cap is 0.
        </p>
      )}
    </article>
  );
}
function Decision({
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
      ? Math.min(3, game.deckCount)
      : Math.min(own?.cap ?? 0, game.deckCount);
  const message =
    room.members.find((m) => m.id === room.me)?.role === "spectator"
      ? room.mode === "friends"
        ? "You’re watching the public table. Player seats open between rounds."
        : "You’re watching a practice table. Player seats are reserved; hidden cards stay private."
      : selecting && own?.committed
        ? "Your choice is committed. The counts stay concealed until everyone is ready."
        : game.phase === "second_additions" && own?.cap === 0
          ? `Your final addition is skipped: you received ${own.firstReceived} in the first window, giving a cap of 0. ${activeName ? `Waiting for ${activeName}.` : ""}`
          : adding
            ? `Waiting for ${activeName ?? "the table"}. No rush. Good decisions take a moment.`
            : game.phase === "burn"
              ? "One random burn per player. Every face-up card is out of play."
              : game.phase === "initial_deal"
                ? "Dealing one card per player in rotating order, until each chosen hand is complete."
                : game.phase.includes("reveal")
                  ? "The table is revealing new information. Your private cards stay private until their reveal."
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
            ? "How many possibilities?"
            : game.phase === "first_additions"
              ? "Take a little more?"
              : "Your final call."}
        </h2>
        <p>
          {selecting
            ? `Choose ${config.initial[0]}–${config.initial[1]} initial cards. Every card changes the shared deck. Your choice cannot change once committed.`
            : `Add 0–${cap} cards. ${game.phase === "second_additions" ? `Your cap is floor(${own.firstReceived} ÷ 2) = ${own.cap}.` : "Passing is final for this window. No separate lock, no second chance."}`}
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
        {room.mode === "solo"
          ? "YOUR TARGET CHALLENGE"
          : winners.length > 1
            ? "SHARED VICTORY"
            : "THE CLOSEST CALL"}
      </span>
      <h2>
        {room.mode === "solo" ? (
          winners[0].distance === 0 ? (
            "Right on target."
          ) : (
            `${winners[0].distance} from the target.`
          )
        ) : (
          <>
            {winners.map((w) => playerName(w.playerId)).join(" & ")}{" "}
            {winners.length > 1 ? "share the win." : "takes the round."}
          </>
        )}
      </h2>
      <p className="muted">
        {winners[0].distance === 0
          ? "Right on the number. An exact match."
          : `${winners[0].distance} away from ${game.target}.`}
        {game.tiebreakApplied &&
          " Tiebreak: below the target beats above at equal distance."}
        {room.mode === "solo" &&
          ` Best distance at this table: ${Math.min(...room.history.flatMap((round) => round.results.filter((result) => result.playerId === room.me).map((result) => result.distance)), winners[0].distance)}.`}
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
              {room.mode === "solo"
                ? "Recorded"
                : r.winner
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
              ).length < (room.mode === "solo" ? 1 : 2)
            }
            onClick={() => {
              void send({ type: "start" });
            }}
          >
            Play the next round
            <Icon name="arrow" />
          </button>
        )}
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            void send({ type: "lobby" });
          }}
        >
          Return to lobby
        </button>
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
function History({ room }: { room: RoomView }) {
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
