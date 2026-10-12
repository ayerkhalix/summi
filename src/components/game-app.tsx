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
import { BRAND, DEFAULT_ROUND_LIMIT, ROUND_LIMITS, type RoundLimit } from "@/game/config";
import { DEFAULT_PROFILE, type PlayerProfile } from "@/game/profile";
import { request } from "@/lib/api";
import { connectRoom } from "@/lib/room-connection";
import type { RoomCommand, RoomView } from "@/server/types";
import { Icon } from "./icon";
import { Modal, Rules, Settings, Tutorial } from "./dialogs";
import { SceneCards, SceneDeck } from "./scene-cards";
import { Landing } from "./landing";
import { GameTable } from "./game-table";
import { Avatar, History, type RoomProps } from "./table-shared";
import { ProfilePicker } from "./player-profile";
export function GameApp({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<RoomView | null>(null),
    [entry, setEntry] = useState<"create" | "join" | "bots" | null>(
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
    return connectRoom(code, {
      room: (data) => setRoom((previous) =>
        previous?.code === code && data.version >= previous.version ? data : previous,
      ),
      connection: (value) => {
        audio.play(value ? "restored" : "lost");
        setConnected(value);
      },
      error: setError,
    });
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
          .then((data) => setRoom((previous) =>
            previous?.code === current.code && data.version >= previous.version ? data : previous,
          ))
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
    roundLimit: RoundLimit = DEFAULT_ROUND_LIMIT,
    profile: PlayerProfile = DEFAULT_PROFILE,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next =
        entry !== "join"
          ? await request<RoomView>("/api/rooms", "POST", {
              ...(entry === "bots" ? {} : { name }),
              mode: entry === "create" ? "friends" : entry,
              ...(entry === "bots" ? { botCount } : {}),
              roundLimit,
              profile,
            })
          : await request<RoomView>(
              `/api/rooms/${inviteCode.toUpperCase()}`,
              "POST",
              { name, role, profile },
            );
      try {
        if (entry !== "bots") localStorage.setItem("summin-name", name);
        localStorage.setItem("summin-profile", JSON.stringify(profile));
      } catch {}
      setRoom(next);
      setConnected(true);
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
        className={`app ${room ? "in-room" : ""} ${room && room.status !== "lobby" ? "is-playing" : ""} ${prefs.reducedMotion ? "motion-reduced" : ""}`}
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
            <span>BOTS · FRIENDS</span>
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

function Entry({
  mode,
  initialCode,
  error,
  busy,
  submit,
  onClose,
}: {
  mode: "create" | "join" | "bots";
  initialCode?: string;
  error: string;
  busy: boolean;
  submit: (
    name: string,
    code: string,
    role: "player" | "spectator",
    botCount?: number,
    roundLimit?: RoundLimit,
    profile?: PlayerProfile,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(""),
    [code, setCode] = useState(initialCode || ""),
    [role, setRole] = useState<"player" | "spectator">("player"),
    [botCount, setBotCount] = useState(2),
    [roundLimit, setRoundLimit] = useState<RoundLimit>(DEFAULT_ROUND_LIMIT),
    [profile, setProfile] = useState<PlayerProfile>(DEFAULT_PROFILE);
  return (
    <Modal
      title={
        mode === "bots"
          ? "Your table. Their poker faces."
          : mode === "create"
            ? "Good company. Great odds."
            : "There’s a seat for you."
      }
      onClose={onClose}
    >
      <p className="muted">
        {mode === "bots"
          ? "Play a full match against computer opponents. Everyone sees only revealed cards and plays the odds on what stays hidden."
          : mode === "create"
            ? "Create a private table, then share the invitation with friends."
            : "Enter your invitation code. Join as a spectator if a round is already in play."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(name, code, role, botCount, roundLimit, profile);
        }}
      >
        {mode !== "bots" && (
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
        )}
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
        <ProfilePicker value={profile} onChange={setProfile} />
        {mode !== "join" && <label className="field-label" htmlFor="match-rounds">Match length
          <select id="match-rounds" value={roundLimit} onChange={(event) => setRoundLimit(Number(event.target.value) as RoundLimit)}>
            {ROUND_LIMITS.map((n) => <option key={n} value={n}>{n} rounds</option>)}
          </select>
        </label>}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <button type="submit" className="button primary full" disabled={busy}>
          {busy
            ? "Connecting…"
            : mode === "bots"
              ? "Start bot match"
              : mode === "create"
                ? "Create my room"
                : "Join the room"}
          <Icon name="arrow" />
        </button>
        <p className="fine-print">
          Guest play · No account needed · Hidden cards
        </p>
      </form>
    </Modal>
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
          {room.mode === "bots"
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
                : "PLAYERS · BOTS INCLUDED"}
            </span>
          </div>
          <div className="player-list">
            {players.map((m) => (
              <div className="lobby-player" key={m.id}>
                <Avatar name={m.name} profile={m.profile} />
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
                  connected.length < 2 ||
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
          <label className="field-label">Match length
            <select aria-label="Match length" value={room.roundLimit} disabled={busy || !isHost}
              onChange={(event) => void send({ type: "settings", roundLimit: Number(event.target.value) as RoundLimit })}>
              {ROUND_LIMITS.map((n) => <option key={n} value={n}>{n} rounds</option>)}
            </select>
          </label>
          <p className="fine-print">Rank-based points each round. Equal distance shares the win and points. The highest total after {room.roundLimit} rounds wins the match.</p>
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
