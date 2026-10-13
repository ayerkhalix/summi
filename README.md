# SUMMIN

A browser card game against computer opponents or with 2–5 friends. One shared 52-card deck, a public target, face-down hands, staged reveals, and two chances to add cards. Closest wins, on either side of the target.

This repository contains the playable application, a standalone rules engine, a real local multiplayer server, a Supabase production storage adapter, SQL migrations, synthesized audio, and automated tests. Configure your own server-only environment variables; credentials are never included in this repository.

## Run a local match

Prerequisites: Node.js 22 or newer (developed on Node 24), npm, and a current browser. No credentials, Docker, or accounts are needed for the default local mode.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. Create a room, enter a guest name, and copy its invitation link. Open that link in a separate browser/profile or private window, enter a different guest name, and join. Both players click **I’m ready**, then the host starts. Complete hand selection and additions; burns, deals, reveals, and results happen automatically on the server.

Separate tabs in the same browser profile share the guest cookie and therefore reconnect to the **same seat**. Use isolated profiles to test multiple players.

Local mode is an actual shared server: browser sessions communicate over HTTP and server-sent events. It does not simulate friends or generate fake room codes. Rooms live in the single Next.js server process and disappear on restart. Local mode does not support multiple server processes or serverless replicas.

For friends on the same LAN, the dev server listens on `0.0.0.0`. Use the computer’s LAN address in the invitation URL. Development validates the browser's origin against the incoming `Host`, so localhost, 127.0.0.1, custom ports, and LAN addresses work even when `.env.local` has a localhost `APP_ORIGIN`. Next's asset guard allows this machine's IPv4 addresses and loopback. For a development tunnel, add its hostname to `DEV_ALLOWED_ORIGINS` (comma-separated hostnames, without schemes or ports). Production still requires the exact public `APP_ORIGIN` and rejects foreign origins and cross-site requests. Allow the dev server through your local firewall if needed. The development server is not intended as a public production deployment.

The landing page and explicitly labeled local tutorial work without any backend configuration. In production mode, room creation/joining/actions require configured Supabase credentials. A missing backend produces a clear error; it never creates pretend online rooms.

## Bots and the table scene

Choose **Play with bots** on the landing page and start without entering a name. There is no account signup. Bot matches work with the default local server, without Supabase credentials, a second browser, or other players. Friends and bot matches use the authoritative server and its storage; production bot tables also require the configured Supabase backend. These modes require a running server and are not offline browser simulations.

- **Bot match:** choose 1–4 named computer opponents, giving 2–5 total players. All official multiplayer ranges and rules apply. Bots commit concealed initial counts and take additions automatically, with a short presentation delay. Their policy receives only `projectGame(game)`: revealed cards, burns, and counts. It estimates unseen rank probabilities, including its own face-down cards, and minimizes expected absolute distance; it cannot inspect deck order or any hidden identities. Bots are labeled, never receive host privileges, and never substitute for a disconnected human. The usual pause and 90-second clean termination still apply.
- Practice player seats are reserved for the original human and configured bots. Other guests may spectate, including during play, with the same privacy filtering as multiplayer; they cannot claim a practice seat. Completed history is retained for rematches and lobby returns.

The visual identity uses centralized CSS tokens in `src/app/globals.css`: obsidian and charcoal surfaces, crimson actions, royal plum secondary accents, muted rose emphasis, and ivory text. Small accent text uses lighter rose/plum inks for contrast. Standard red and black suit inks remain independent of the application palette.

The landing page centers its controls among six persistent 3D cards. Each floats on a different CSS timeline and flips between ivory standard card faces and deep plum backs; faces change only while the back covers them. Animation pauses offscreen or in a hidden tab, and system or saved reduced-motion preferences stop continuous motion. Entering a room gathers those same card elements into the shared deck; native history updates preserve the mounted scene and room URLs still restore on refresh.

The compact table puts the target, remaining deck, and burns in one status strip, followed by compact opponent hands. The main hand uses 5:7 cards, 104–112px wide on larger desktops and 88px on phones. A desktop fan preserves readable indices for large hands; mobile hands scroll horizontally. Selecting a card lifts it and describes only its revealed information; inspection never makes a game decision. The current phase, progress, and valid controls stay contextual. Reserved hand/action space keeps phase changes steady without a tall fixed board ratio. Round activity and history are expandable, and results open in a dismissible keyboard-accessible dialog so the board does not grow.

Results put the champion beside their actual final hand on desktop, stacking them on phones. A short crown/suit/card entrance and score count respect both system and device motion settings, and do not replay on reopening or refreshing the same result in a browser session. The hero uses overall match points at match end and round winners between rounds. Shared champions retain equal ranks and each final hand can be selected. The target, total and absolute distance describe the selected champion’s final round separately from their match victory. Compact standings show points, rounds won and current streaks; a round selector reads recorded scores without changing the game. Historical rounds retain scores, not card hands. Missing or inconsistent final hands are omitted. The dialog has one scrolling region, locks background scrolling and keeps its close button visible; its next-round/lobby actions use the existing server commands.

## Stack and commands

Next.js App Router, React, strict TypeScript, Tailwind CSS 4 plus a custom visual system, Motion for React, Zod, Supabase JS, Vitest, and Playwright. npm’s lockfile is committed to the project files. All artwork is local SVG/CSS; all audio is original Web Audio synthesis. Fonts use the operating system; essential rendering has no external asset dependency.

| Command                    | Purpose                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| `npm run dev`              | Local development server, port 3000                                   |
| `npm run build`            | Production build                                                      |
| `npm start`                | Serve the production build; requires production backend configuration |
| `npm run lint`             | ESLint, including React hooks and Next.js rules                       |
| `npm run typecheck`        | Strict TypeScript checks                                              |
| `npm test`                 | Engine, room integration, and optional Supabase tests                 |
| `npm run test:engine`      | Rules and card-privacy tests                                          |
| `npm run test:integration` | Room coordination and optional database authorization tests           |
| `npm run test:e2e`         | Chromium browser tests, automatically serving port 3100               |
| `npm audit --omit=dev`     | Audit shipped dependencies                                            |

For browser tests, install the test browser once:

```sh
npx playwright install chromium
npm run test:e2e
```

On Linux CI, use `npx playwright install --with-deps chromium`. Browser tests use isolated guests, fixed decision sequences, and independent checks of authoritative totals and privacy. They never expose an endpoint for setting production decks, targets, winners, or clocks. Unit tests inject seeded random sources; real room shuffles, target generation, and reveal choices use Node’s cryptographic `randomInt`.

If a dev server is already running in this checkout, reuse it instead of starting a second Next instance. In PowerShell: `$env:PLAYWRIGHT_BASE_URL='http://localhost:3000'; npm run test:e2e`. The running server must use the local backend. Browser tests include complete bot matches, staged reveals, refresh/rematch recovery, persistent scene-card elements, centered decisions, stable board geometry and scroll position, mobile overflow, and real 127.0.0.1 guest entry alongside multiplayer and tutorial coverage.

## Official rules and implemented decisions

| Players | Inclusive target | Inclusive initial hand |
| ------- | ---------------- | ---------------------- |
| 2       | 70–150           | 7–16                   |
| 3       | 45–110           | 5–11                   |
| 4       | 30–85            | 4–8                    |
| 5       | 20–70            | 3–6                    |

Ace = 1; Jack = 11, Queen = 12, King = 13. Targets are independently uniform integers. Every round starts with a freshly shuffled deck and one automatic face-up burn per active player in rotating order.

A crimson rim and soft glow identify the most recent reveal wave in every player's hand. The first reveal marks all newly public cards. The second reveal moves the glow to its new cards, leaving earlier cards face up without a glow. During the final reveal, each flipped card joins the final highlighted group; that group remains marked through results. The glow follows the card face during its flip, with reserved space around the hands so it stays visible. Reveal metadata is stored with the room, so refreshes, reconnects and spectators see the same highlights. A fresh round starts with no highlighted cards.

Players commit their initial counts simultaneously after the burns. Counts remain concealed until all players commit, including in the owner’s server projection; the UI retains the confirmed count only through its decision state. The server deals one card per player repeatedly in rotating order, skipping players who already have their selected number.

All hands start face down. Unrevealed cards are hidden from everyone, including their owner and bots; server responses contain no hidden card identities. The hand display shows the revealed subtotal until every card is face up. The first reveal exposes `floor(initial count / 2)` random cards. The first addition allows 0–4 cards, in turn order; passing is final for this window. The second reveal includes additions and leaves exactly one hidden card where possible. The second addition cap is `floor(actual first additions / 2) + 1`, giving 1, 1, 2, 2, 3. Every addition is capped by the actual shared deck count; an empty deck skips the final addition with an explanation. Final additions remain hidden until the final reveal.

Final scoring uses absolute distance from the target. Equal distances share victory above or below, including multiple exact matches. Overshooting does not automatically lose. Points are based on rank: a player earns `player count − number of players strictly closer to the target`. With five players, unique distances earn 5, 4, 3, 2, 1 points; two players tied for closest both earn 5, and the next player earns 3. Points are added once per completed round. The highest accumulated points wins the match; equal totals share the match victory. Shared round wins count toward consecutive winning streaks; a loss resets the streak. At three or more wins, the player's icon and public hand panel are highlighted.

The room creator chooses 3, 5, 10, 12, 15 or 20 rounds (default 5), and the host can change the limit in the lobby. Changing it resets human readiness. Players choose one of four suits or J/Q/K and a color before entry; names remain optional in bot mode. There are **no decision timers** and no automatic strategic choices for humans. Readiness is required from all connected seated players to start a match. The starting player is cryptographically selected for the first round and rotates thereafter. Each round uses a fresh deck. The server publishes one final card every 1.6 seconds, then allows a 900ms animated flip and a full three-second pause before publishing scores. Results start a 30-second break before the next round automatically begins; the host can advance earlier. Disconnects pause advancement and preserve the roster. The final round stops the timer and shows match champions and standings. Returning to the lobby preserves the prior game and up to 100 round summaries, while resetting human readiness. Starting the next match resets match points and streaks; bots remain ready.

### Connections, departure, and spectators

- Guests receive a cryptographically random, HTTP-only, same-site cookie lasting seven days. Rooms store a SHA-256 digest of that token, never the token itself. A returning browser resumes its seat; its unrevealed cards stay hidden after reconnecting or refreshing.
- Clients heartbeat every 5 seconds. After 20 seconds without a heartbeat, the server marks the connection lost. The **90-second grace period starts at that detection threshold**. During the grace period the entire active match pauses, including automatic phases; no player's choice is made on their behalf.
- A reconnect before the deadline restores the same seat. A return after the deadline cannot revive the ended match. The server cleanly ends it and preserves completed history. In bot games, the original human regains their reserved seat and can return to the lobby for a new round.
- Explicitly leaving during a match ends it immediately if the departing participant is a player. A spectator may leave without ending the match.
- Returning the whole table to the lobby is a host action; guests and spectators cannot reset everyone else's readiness.
- Host privileges transfer to the connected seated player with the earliest `joinedAt`, breaking timestamp ties by lexicographically ascending participant ID. Transfer occurs when the host disconnects or leaves; reconnecting does not reclaim host privileges. If no eligible player exists, there is temporarily no host; the first eligible reconnect or seat claim restores one using the same rule. The host browser never owns authoritative state.
- Spectators can join during play. They receive target, burns, public cards, hand sizes, phase/turn, public events, and completed results. Hidden slots contain `card: null` and opaque slot identifiers independent of physical card identity.
- Up to 5 players and 25 total room participants are allowed. The roster is fixed throughout a match, including results breaks. New players and seat claims are permitted in the lobby between matches on a first-come basis. Spectators may join at any time. When no match is active, disconnected reservations become spectator seats after their 90-second grace expires. Starting a new match also converts any remaining disconnected seats to spectator seats.

Automatic phase advancement and disconnection deadlines are enforced on server requests and event-stream refreshes, and by the maintenance endpoint. With all browsers closed and no maintenance scheduler, an expired match is resolved on its next access. For unattended production rooms, configure the scheduler described below; a scheduler's interval limits how quickly an unattended expiration is physically recorded. The persisted deadline remains authoritative.

Burned cards are enlarged in the table strip. Hover or focus a burned/opponent card for a large preview; click, tap, or press Enter for its full-size inspection dialog. Hidden cards remain blank-backed in every preview, and inspecting a card never submits a game decision.

## Architecture and privacy

`src/game/` contains the engine, official configuration, card inventory, scoring, and projections. It has no React, database, or transport dependency. Transitions clone their input before validation and mutation; rejected actions leave the original state intact. Every accepted transition checks that all 52 unique cards are accounted for exactly once.

`src/server/rooms.ts` coordinates membership, authentication, readiness, phase pacing, host migration, reconnection, room lifetime, and history. `src/server/store.ts` provides the in-memory development store and the Supabase store.

Supabase stores a complete authoritative room record in a server-only RLS-enabled table. The room revision is updated with a compare-and-swap SQL function; competing writes retry against the latest state and revalidate their command. The winning write atomically updates an independent UUID/revision signal row. Private state is never placed in a browser-readable record or Realtime payload. The memory store performs its synchronous transition and commit without an intervening await, providing equivalent serialization within one process.

Only the **server** holds the service-role key. Server-side Realtime waits for PostgreSQL subscription readiness, listens to revision signals and refreshes authorized views. Each browser receives a separately projected snapshot over an authenticated SSE route, with a 1.5-second polling fallback. Streams roll over every 50 seconds for compatibility with 60-second server-function limits. Client code does not connect to Supabase or receive its keys. Failed streams reconnect with increasing delays up to 30 seconds; scheduled rotations do not show a false outage.

Every player command checks membership, role, round, phase, turn, completed-action flags, and bounds. Command IDs prevent duplicate execution; heartbeats cannot evict the command history. Start requests also include their expected round, preventing an old start request from starting a later round. The most recent 1,024 non-heartbeat command IDs are retained. Phase and per-player completion checks continue to reject stale game commands even beyond that window.

Inputs have strict Zod schemas, bounded body sizes, integer checks, normalized names, and a 20-character maximum. Guest names allow Unicode letters/numbers, spaces, periods, apostrophes, underscores, and hyphens; HTML, controls, and decorative symbols are rejected. Names are not globally unique. React renders untrusted names as text. The app does not use a profanity service or collect personal details.

Mutation routes enforce exact-origin requests and same-site cookies. Rate limits cover creation, joining, reads, streams, commands, and a separate heartbeat allowance. A session can create 30 rooms per five minutes, including bot tables. Responses include `Retry-After` when throttled. Heartbeats never overlap, browser-focus events are debounced, and throttled heartbeats wait before retrying. Supabase mode uses atomic database-backed buckets. Vercel automatically uses its sanitized `x-vercel-forwarded-for` header for network limits. On other hosts, configure `TRUST_PROXY=true` and a header that your trusted proxy sanitizes. Missing or invalid addresses use session limits without a shared global network bucket. Do not trust client-supplied forwarding headers at an unprotected origin.

## Supabase setup

Create a Supabase project. You do not need to enable Supabase Auth: guest authentication is handled by the application server.

1. Install the Supabase CLI following the [official CLI guide](https://supabase.com/docs/guides/local-development/cli/getting-started).
2. Link the project and apply the migration:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Alternatively, execute `supabase/migrations/202610120001_summin.sql` in the project’s SQL editor. The migration creates the private room table, revision-signal table, distributed rate-limit table, and restricted transaction functions.

3. Confirm `summin_room_signals` is included in the `supabase_realtime` publication. The migration adds it. **Do not publish `summin_rooms` or `summin_rate_limits`.** All three tables have RLS enabled, no anon/authenticated policies, and revoked public-client privileges. The service role alone can use the RPC functions.
4. Copy `.env.example` to `.env.local` and configure:

```dotenv
SUMMIN_BACKEND=supabase
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
APP_ORIGIN=http://localhost:3000
CRON_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
```

The key variable accepts a server secret key (`sb_secret_...`) or a legacy `service_role` key. Never use a publishable/anon key here or prefix the server key with `NEXT_PUBLIC_`. Never commit `.env.local` or put real credentials in `.env.example`. Run `npm run check:secrets` before pushing. Do not put keys in invitation links, logs, browser storage, or client components.

5. Restart `npm run dev`, create a room, and use separate browser profiles to join. The interface should show **SUPABASE MULTIPLAYER**, rather than the local-development banner.

For a local Supabase instance, install Docker and the CLI, run `supabase start` and `supabase db reset`, then use the local URL and service-role credentials reported by the CLI. This path exercises the production storage adapter locally. Docker/Supabase infrastructure is not required for memory-mode development.

### Database verification

Use an **isolated, migrated test project**, then supply these variables to the test process:

```dotenv
SUPABASE_TEST_URL=https://YOUR_TEST_PROJECT.supabase.co
SUPABASE_TEST_SERVICE_ROLE_KEY=YOUR_TEST_SERVICE_ROLE_KEY
SUPABASE_TEST_ANON_KEY=YOUR_TEST_ANON_KEY
```

`npm run test:integration` then executes the real authorization and concurrent-write tests. Without all three variables, this test is explicitly skipped. It creates a temporary test room and deletes it afterward. Never target a live game project for these tests.

### Deployment

Deploy the repository to a Next.js Node host such as Vercel, or build and run it on a persistent Node service behind HTTPS. Set the production environment variables above, with `APP_ORIGIN` equal to the exact HTTPS site origin. Use `npm ci`, `npm run build`, and `npm start` on a Node service. On Vercel, select the Next.js preset and configure the route/function duration to permit the 50-second SSE stream; the route declares a 60-second maximum.

The frontend and API routes deploy together. **There are no Supabase Edge Functions to deploy:** authoritative game orchestration runs in the Next.js Node API routes; PostgreSQL RPCs provide transaction commits, and Supabase Realtime provides state-change signals. All replicas must use the same Supabase project. Do not select the Edge runtime for these routes.

Use an external scheduler or your host’s cron feature to request:

```http
GET https://YOUR_ORIGIN/api/maintenance
Authorization: Bearer YOUR_CRON_SECRET
```

A 15-second interval is recommended; once per minute works with corresponding delay in unattended expiration recording. This is a room-maintenance schedule, not a player decision timer. Paid host plans or an external scheduler may be needed for sub-minute execution. Keep the endpoint token server-side. Also schedule `select public.summin_cleanup();` daily using Supabase Cron/pg_cron or a trusted maintenance service to delete rooms inactive for 24 hours and old rate-limit buckets. The SQL function is restricted to the service role.

For a local smoke test of the production bundle only, `SUMMIN_BACKEND=local` plus `SUMMIN_ALLOW_LOCAL_PREVIEW=true` permits `npm start`. This deliberately named override must never be used in production; it provides no persistence or multi-instance safety. Production defaults to Supabase and fails closed without credentials.

## Accessibility, animation, and audio

Native modal dialogs trap keyboard focus, close with Escape, and restore focus. Inputs have labels, revealed cards have rank/suit/value descriptions, and active turns have text indicators. Touch controls, wrapped hands, mobile table layouts, readable card faces, visible focus states, and revealed/hidden labels are included. Motion respects system reduced-motion preferences and the explicit device preference. Server state remains authoritative when animation is interrupted or skipped.

Cards move from the shared-deck position to their hand slots and use stable, identity-independent slot keys. Public reveals flip card faces with backface protection. An audio manager owns one lazy AudioContext, a typed sound registry, throttled sound voices, persistent settings, independent effects/music volumes, mute, test playback, and optional synthesized ambient harmony. Browser audio unlocks only after a user gesture. Audio failures do not interrupt play.

The only persistent browser data is the HTTP-only guest session cookie and local display-name/audio/motion preferences. No analytics or third-party tracking are enabled. Audio and artwork require no network asset requests.

## Troubleshooting and limits

- **A second tab restores the same player:** use another browser profile/private context for a separate guest.
- **Production room creation says Supabase is not configured:** set server-only variables, apply the migration, and restart/redeploy. The production build alone does not provision a backend.
- **Room-storage unavailable:** check the URL/key, SQL migration, function permissions, and database connectivity. Provider errors are deliberately not returned to players or logged with private state.
- **Invitation doesn’t work on another device:** `localhost` points to that device. Use the shared LAN address in development. For deployment, set `APP_ORIGIN` to the public HTTPS origin.
- **No sound:** interact with the page, check mute/volume controls and browser device permissions, then use the sound test. Music is off initially.
- **Unexpected pause in a backgrounded browser:** mobile/background tabs can suspend heartbeats. Focus/reconnect within the grace window. No automatic player decisions occur.
- **Realtime unavailable:** authenticated SSE refreshes still retrieve current state every 1.5 seconds. Hosts must allow streaming responses and avoid buffering them. Real private state always comes from the API projection.
- **Room gone after restarting dev:** expected in memory mode. Configure Supabase for durability.
- **Spectator cannot claim a seat:** a match has started or all five seats are occupied. Claim after the host returns the table to the lobby.
- **Browser tests don’t start:** install Chromium; ensure port 3100 is free and no unrelated Next dev server holds this checkout’s `.next/dev/lock`.
- Local mode is single-process and ephemeral. Credentialed tests verify hosted Supabase authorization, concurrency and Realtime; the production build has also been exercised against that backend. Every public deployment still needs its own environment configuration and a cross-device multiplayer smoke test. See `VALIDATION.md` for the exact checks performed.
- The room keeps the last 100 completed summaries, not long-term accounts or cross-session statistics. Aborted rounds keep their current sanitized table view and are not scored or inserted into completed history.
- The MVP has no turn timers, bots in multiplayer, chat, public matchmaking, wagers, account system, moderation dashboard, or third-party analytics.
- The initial dependency audit reports a development-only `braces` advisory through Next’s ESLint plugin/glob dependency. No patched `braces` version is published in this environment. `npm audit --omit=dev` is clean; avoid untrusted filesystem glob patterns and update the lint dependency when an upstream fix is available. Do not downgrade the application framework just to conceal an advisory.

See `tests/engine.test.ts`, `tests/rooms.test.ts`, `tests/modes.test.ts`, `tests/origin.test.ts`, `tests/config.test.ts`, `tests/supabase.test.ts`, and `e2e/` for executable rule, coordination, mode, privacy, backend/origin, database, and browser checks. Browser checks include a real offline interruption, a detected server pause, restoration of the existing seat, complete multiplayer/bot rematches, continuous 3D card elements, centered controls, loopback guest entry, and persistent audio/motion preferences.
