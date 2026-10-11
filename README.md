# SUMMIN

A browser card game for 2–5 friends. One shared 52-card deck, a public target, private hands, staged reveals, and two chances to add cards. Closest wins, on either side of the target.

This repository contains the playable application, a standalone rules engine, a real local multiplayer server, a Supabase production storage adapter, SQL migrations, synthesized audio, and automated tests. **No Supabase project or hosted deployment is configured in this checkout.**

## Run a local match

Prerequisites: Node.js 22 or newer (developed on Node 24), npm, and a current browser. No credentials, Docker, or accounts are needed for the default local mode.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. Create a room, enter a guest name, and copy its invitation link. Open that link in a separate browser/profile or private window, enter a different guest name, and join. Both players click **I’m ready**, then the host starts. Complete hand selection and additions; burns, deals, reveals, and results happen automatically on the server.

Separate tabs in the same browser profile share the guest cookie and therefore reconnect to the **same seat**. Use isolated profiles to test multiple players.

Local mode is an actual shared server: browser sessions communicate over HTTP and server-sent events. It does not simulate friends or generate fake room codes. Rooms live in the single Next.js server process and disappear on restart. Local mode does not support multiple server processes or serverless replicas.

For friends on the same LAN, the dev server listens on `0.0.0.0`. Use the computer’s LAN address in the invitation URL. If `APP_ORIGIN` is set, it must match that address and port; otherwise local development accepts the request URL’s origin. Allow the dev server through your local firewall if needed. The development server is not intended as a public production deployment.

The landing page and explicitly labeled local tutorial work without any backend configuration. In production mode, room creation/joining/actions require configured Supabase credentials. A missing backend produces a clear error; it never creates pretend online rooms.

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

## Official rules and implemented decisions

| Players | Inclusive target | Inclusive initial hand |
| ------- | ---------------- | ---------------------- |
| 2       | 80–150           | 8–15                   |
| 3       | 55–110           | 6–10                   |
| 4       | 40–85            | 5–7                    |
| 5       | 30–70            | 4–5                    |

Ace = 1; Jack = 11, Queen = 12, King = 13. Targets are independently uniform integers. Every round starts with a freshly shuffled deck and one automatic face-up burn per active player in rotating order.

Players commit their initial counts simultaneously after the burns. Counts remain concealed until all players commit, including in the owner’s server projection; the UI retains the confirmed count only through its decision state. The server deals one card per player repeatedly in rotating order, skipping players who already have their selected number.

The first reveal exposes `floor(initial count / 2)` random cards. The first addition allows 0–3 cards, in turn order; passing is final for this window. The second reveal includes additions and leaves exactly one hidden card where possible. The second addition cap is `floor(actual first additions / 2)`, giving 0, 0, 1, 1. Zero caps skip automatically with an explanation. Final additions remain hidden until the final reveal.

Final scoring uses absolute distance from the target. At equal distance, below beats above. Remaining same-side ties share victory, including multiple exact matches. Overshooting does not automatically lose. The results show complete hands, totals, distance, side, winners, the applicable tiebreak, and remaining deck count.

There are **no decision timers** and no automatic strategic choices. Readiness is required from all connected seated players to start. The starting player is cryptographically selected for the first round and rotates to the next seated player thereafter. If the prior starter has left the roster, the earliest remaining seat starts. A round is explicitly started by the host; results, cards, and up to 50 completed round summaries remain until the next round starts. Returning to the lobby preserves the prior game and completed history, while resetting ready indicators.

### Connections, departure, and spectators

- Guests receive a cryptographically random, HTTP-only, same-site cookie lasting seven days. Rooms store a SHA-256 digest of that token, never the token itself. A returning browser resumes its seat and receives only its own private cards.
- Clients heartbeat every 5 seconds. After 20 seconds without a heartbeat, the server marks the connection lost. The **90-second grace period starts at that detection threshold**. During the grace period the entire active match pauses, including automatic phases; no player's choice is made on their behalf.
- A reconnect before the deadline restores the same seat. A return after the deadline cannot revive the ended match. The server cleanly ends it, preserves completed history, and offers a return to the lobby.
- Explicitly leaving during a match ends it immediately if the departing participant is a player. A spectator may leave without ending the match.
- Host privileges transfer to the connected seated player with the earliest `joinedAt`, breaking timestamp ties by lexicographically ascending participant ID. Transfer occurs when the host disconnects or leaves; reconnecting does not reclaim host privileges. If no eligible player exists, there is temporarily no host; the first eligible reconnect or seat claim restores one using the same rule. The host browser never owns authoritative state.
- Spectators can join during play. They receive target, burns, public cards, hand sizes, phase/turn, public events, and completed results. Hidden slots contain `card: null` and opaque slot identifiers independent of physical card identity.
- Up to 5 players and 25 total room participants are allowed. Seat claims are permitted between rounds on a first-come basis, including from the results screen. Seats cannot be claimed during an active match. When no match is active, disconnected reservations become spectator seats after their 90-second grace expires, freeing room for new players. Starting a new match also converts any remaining disconnected seats to spectator seats, so they cannot unexpectedly rejoin its active roster.

Automatic phase advancement and disconnection deadlines are enforced on server requests and event-stream refreshes, and by the maintenance endpoint. With all browsers closed and no maintenance scheduler, an expired match is resolved on its next access. For unattended production rooms, configure the scheduler described below; a scheduler's interval limits how quickly an unattended expiration is physically recorded. The persisted deadline remains authoritative.

## Architecture and privacy

`src/game/` contains the engine, official configuration, card inventory, scoring, and projections. It has no React, database, or transport dependency. Transitions clone their input before validation and mutation; rejected actions leave the original state intact. Every accepted transition checks that all 52 unique cards are accounted for exactly once.

`src/server/rooms.ts` coordinates membership, authentication, readiness, phase pacing, host migration, reconnection, room lifetime, and history. `src/server/store.ts` provides the in-memory development store and the Supabase store.

Supabase stores a complete authoritative room record in a server-only RLS-enabled table. The room revision is updated with a compare-and-swap SQL function; competing writes retry against the latest state and revalidate their command. The winning write atomically updates an independent UUID/revision signal row. Private state is never placed in a browser-readable record or Realtime payload. The memory store performs its synchronous transition and commit without an intervening await, providing equivalent serialization within one process.

Only the **server** holds the service-role key. Server-side Realtime listens to revision signals and refreshes authorized views. Each browser receives a separately projected snapshot over an authenticated SSE route, with a 1.5-second polling fallback. Streams roll over every 50 seconds for compatibility with 60-second server-function limits. Client code does not connect to Supabase or receive its keys.

Every player command checks membership, role, round, phase, turn, completed-action flags, and bounds. Command IDs prevent duplicate execution; heartbeats cannot evict the command history. Start requests also include their expected round, preventing an old start request from starting a later round. The most recent 1,024 non-heartbeat command IDs are retained. Phase and per-player completion checks continue to reject stale game commands even beyond that window.

Inputs have strict Zod schemas, bounded body sizes, integer checks, normalized names, and a 20-character maximum. Guest names allow Unicode letters/numbers, spaces, periods, apostrophes, underscores, and hyphens; HTML, controls, and decorative symbols are rejected. Names are not globally unique. React renders untrusted names as text. The app does not use a profanity service or collect personal details.

Mutation routes enforce exact-origin requests and same-site cookies. Rate limits cover creation, joining, reads, streams, and commands. Supabase mode uses atomic database-backed limit buckets. Configure `TRUST_PROXY=true` and a header that your actual trusted proxy sanitizes to enable per-IP network limits; otherwise network creation/joining limits are shared, while each session has its own quota. Do not trust client-supplied forwarding headers at an unprotected origin.

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

Never prefix the service-role key with `NEXT_PUBLIC_`. Never commit `.env.local`. Do not put keys in invitation links, logs, browser storage, or client components.

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

Native modal dialogs trap keyboard focus, close with Escape, and restore focus. Inputs have labels, cards have rank/suit/value descriptions, and active turns have text indicators. Touch controls, wrapped hands, mobile table layouts, readable card faces, visible focus states, and public/private labels are included. Motion respects system reduced-motion preferences and the explicit device preference. Server state remains authoritative when animation is interrupted or skipped.

Cards move from the shared-deck position to their hand slots and use stable, identity-independent slot keys. Public reveals flip card faces with backface protection. An audio manager owns one lazy AudioContext, a typed sound registry, throttled sound voices, persistent settings, independent effects/music volumes, mute, test playback, and optional synthesized ambient harmony. Browser audio unlocks only after a user gesture. Audio failures do not interrupt play.

The only persistent browser data is the HTTP-only guest session cookie and local display-name/audio/motion preferences. No analytics or third-party tracking are enabled. Audio and artwork require no network asset requests.

## Troubleshooting and limits

- **A second tab restores the same player:** use another browser profile/private context for a separate guest.
- **Production room creation says Supabase is not configured:** set server-only variables, apply the migration, and restart/redeploy. The production build alone does not provision a backend.
- **Room-storage unavailable:** check the URL/key, SQL migration, function permissions, and database connectivity. Provider errors are deliberately not returned to players or logged with private state.
- **Invitation doesn’t work on another device:** `localhost` points to that device. Use the shared LAN or deployed HTTPS origin and set `APP_ORIGIN` accordingly.
- **No sound:** interact with the page, check mute/volume controls and browser device permissions, then use the sound test. Music is off initially.
- **Unexpected pause in a backgrounded browser:** mobile/background tabs can suspend heartbeats. Focus/reconnect within the grace window. No automatic player decisions occur.
- **Realtime unavailable:** authenticated SSE refreshes still retrieve current state every 1.5 seconds. Hosts must allow streaming responses and avoid buffering them. Real private state always comes from the API projection.
- **Room gone after restarting dev:** expected in memory mode. Configure Supabase for durability.
- **Spectator cannot claim a seat:** a round is active or all five seats are occupied. Claim between rounds or after returning to the lobby.
- **Browser tests don’t start:** install Chromium; ensure port 3100 is free and no unrelated Next dev server holds this checkout’s `.next/dev/lock`.
- Local mode is single-process and ephemeral. Supabase deployment, RLS behavior against an actual project, and hosted Realtime need the credentialed integration check and a post-deployment multiplayer smoke test; they are not claimed as verified without that infrastructure.
- The room keeps the last 50 completed summaries, not long-term accounts or cross-session statistics. Aborted rounds keep their current sanitized table view and are not scored or inserted into completed history.
- The MVP has no turn timers, bots in multiplayer, chat, public matchmaking, wagers, account system, moderation dashboard, or third-party analytics.
- The initial dependency audit reports a development-only `braces` advisory through Next’s ESLint plugin/glob dependency. No patched `braces` version is published in this environment. `npm audit --omit=dev` is clean; avoid untrusted filesystem glob patterns and update the lint dependency when an upstream fix is available. Do not downgrade the application framework just to conceal an advisory.

See `tests/engine.test.ts`, `tests/rooms.test.ts`, `tests/config.test.ts`, `tests/supabase.test.ts`, and `e2e/multiplayer.spec.ts` for executable rule, coordination, privacy, backend/origin, database, and browser checks. Browser checks include a real offline interruption, a detected server pause, restoration of the existing seat, a complete rematch, and persistent audio/motion preferences.
