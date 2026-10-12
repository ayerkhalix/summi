# Validation — October 13, 2026

Executed on Windows with Node.js 24.11.1 and npm 11.6.2.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 106 passed; 2 credentialed Supabase tests skipped in the default run |
| Hosted Supabase integration | Both credentialed tests passed |
| Chromium browser coverage | 26 distinct scenarios passed across the local run and production checks |
| Production browser checks | 13 scenarios passed against `next start` using hosted Supabase |
| `npm run build` | Passed, including TypeScript and static generation |
| `npm run check:secrets` | Passed; 79 publishable files checked |

Match tests complete every selectable match length (3, 5, 10, 12, 15, 20), check accumulated rank points after every round, reject starts past the final round, and verify a new match resets points and streaks while retaining room history. They cover host-only settings, readiness resets, fixed rosters, spectator permissions, reconnects during the results break, abandoned-match recovery, and recovery of the lobby when all player seats disappear. Existing room records are upgraded without SQL changes, including points and the old below-versus-above tie results.

Scoring regressions explicitly tie totals 99 and 101 against a target of 100. Five-player tied distances independently verify ranks 1, 1, 3, 3, 5 and points 5, 5, 3, 3, 1. Shared wins extend streaks and losses reset them. Wider draw bounds are checked at every player count; maximum draws safely exhaust the shared deck without duplicating cards. The seeded engine coverage still exercises 128 complete rounds and verifies hidden identities, inventory and totals.

Final-reveal checks verify one newly public card per transition, no result totals before scoring, and the complete 900ms flip plus three-second hold before results. A real three-round browser match completes both 30-second automatic breaks, accumulates points, stops after round three, and restores its final standings after a refresh. Separate browser fixtures verify that overall match points determine the champion even when someone else wins the final round, including shared match victory.

The initial local browser run passed 19 scenarios. The production checks then passed all five remaining scenarios and rechecked the new full-match flow and all four bot counts with the widened limits. The remaining local failures were resolved by updating old hand-count and dialog test steps, waiting for room navigation before using its code, and replacing the entrance animation's synthetic resize event so it no longer dismisses hover previews. The tablet geometry check passed without development stylesheet reloads. The final build also passed the two championship fixtures and repeated twelve-room creation against the confirmed Supabase backend.

Production coverage includes custom icons/colors and host settings across independent browsers, tablet board stability, desktop/phone card inspection, multiplayer privacy and spectators, an intentional disconnect and seat recovery, rematches, and complete rounds against one through four bots. Screenshots were visually reviewed for the final reveal, match standings and mobile lobby. Artifacts are ignored in `test-results/` and `.local/match-review/`. Test-owned database records from credentialed integration tests are removed afterward; normal browser rooms follow the existing 24-hour expiry policy.

No database migration is required for this release. The checks above exercise the production build locally against hosted Supabase; they do not claim verification of the user's public Vercel deployment.

## Previous validation — October 12, 2026

Executed on Windows with Node.js 24.11.1 and npm 11.6.2.

| Command                | Actual result                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | Passed, no errors or warnings                                                                                          |
| `npm run typecheck`    | Passed                                                                                                                 |
| `npm test`             | 90 passed; 2 credentialed Supabase tests skipped in the default run                                                      |
| Supabase integration  | Both credentialed database tests passed against the migrated hosted project                                            |
| `npm run test:e2e`     | All 21 Chromium scenarios passed across a full local run and focused rerun on port 3100                                 |
| Production browser checks | All 4 selected scenarios passed against `next start` on port 3000 using live Supabase storage                      |
| `npm run build`        | Passed                                                                                                                 |
| `npm audit --omit=dev` | 0 vulnerabilities                                                                                                      |
| `npm run check:secrets` | Passed; no private credentials in publishable files                                                                    |

The room integration tests complete matches with 2, 3, 4, and 5 players. They check maximum draws, card conservation, concurrent joins and selections, readiness, host migration, unlimited decisions, reconnection within 90 seconds, clean grace-period expiration, expired-seat reclamation, replay protection, and spectator permissions. Engine tests check the official target/hand ranges, exact deal ordering, reveal counts, hidden-card projections, integer scoring, overshooting, tiebreaks, and shared wins.

The browser tests create and join actual local-server rooms in isolated sessions; complete a two-player match and rematch; independently calculate totals from the final hands; verify private-card and spectator responses; interrupt a player's network until the server pauses; reconnect the same seat without making a decision for them; test a narrow mobile viewport; replay the tutorial; exercise keyboard dialog dismissal; and check persistent music, effects, and reduced-motion settings. Desktop/mobile screenshots and traces are written to ignored `test-results/` and `playwright-report/` directories.

Additional mode tests complete server-authoritative 1–4-bot rounds, preserve the 52-card inventory, enforce practice spectator restrictions, return to the lobby and rematch, keep bots ready between rounds, exclude bots from host migration, and stop bot actions during a human's reconnection grace period. They reject the removed solo mode and rounds without an opponent. The bot-policy test changes its own hidden cards, unseen opponent cards, and deck order and verifies that neither the bot's projection nor decision changes. Origin regression tests cover localhost, 127.0.0.1, LAN hosts, different ports, cross-site requests, and strict production configuration.

The practice browser tests complete matches against one, two, three, and four bots through the actual controls, choose the maximum initial hand for each player count, check the minimum and maximum decision bounds, restore seats on refresh, and start another round. They verify that all six landing card DOM nodes survive entry, their destination aligns with the shared deck, decision buttons are centered, and the five-player bot table has no horizontal mobile overflow. A real browser creates a room using 127.0.0.1 while the configured app origin uses localhost.

Bot regression checks cover 1280px, 834px, 390px, and 320px widths. They start without a name against one opponent, deal the maximum initial hand of 15, add 3 and then 1, and check hidden identities, revealed subtotals, reveal counts, and refresh recovery. They measure board, hand, and deck geometry, page height, horizontal overflow, and scroll position through the round and results. Cards retain a 5:7 aspect ratio and at least 85px width. Mouse and keyboard inspection change the selected card without committing a game decision or exposing its hidden face. Another check supplies an older payload containing unrevealed faces and confirms that both human and bot hands still render card backs and only count revealed values. HTTP checks require names for friends, allow unnamed bot matches, and reject solo mode. The practice browser test waits for each addition to be acknowledged before attempting the next decision.

Landing checks cover 1440px, 834px, 390px, and 320px widths. They verify six independently timed cards, changing valid faces, unobstructed headline and actions, stable layout, no page overflow, and no browser errors. A separate saved reduced-motion check confirms that continuous floating and flipping stop. Manual browser review at 1440 × 900 confirmed the target, opponents, 104px-wide hand cards, and action controls fit within the viewport with a 900px document height. Results open in a dismissible dialog and activity remains collapsed by default, preserving table geometry.

The obsidian/crimson/plum theme was reviewed in the landing page, full-size and phone gameplay, rules, settings, create/join forms, bot setup, and desktop/mobile lobby. A browser color audit found no green text remnants in these entry screens, no horizontal overflow, and at least 4.89:1 contrast across the shared text/surface and card-ink combinations. Primary button text measures 5.02:1 on crimson and 6.84:1 on its deep-crimson hover. Both application stylesheets use centralized tokens for every palette color; standard suit inks remain separate from the theme accents. Native dialog centering was corrected and verified at 1440px, 390px, and 320px widths. Review screenshots are retained in ignored `.local/ui-review/` and `.local/theme-review/` folders.

The current full browser run passed the 18 existing scenarios. The two new inspection scenarios initially caught a stylesheet specificity issue that kept dialog cards at normal size. After correcting it, both inspection checks and the new twelve-room generation check passed. The production build then passed both inspection checks, twelve-room generation with a confirmed Supabase backend, and the complete multiplayer/spectator/disconnect/reconnect/rematch scenario. The production multiplayer check took about one minute. The intentional disconnection and two rounds retain their 240-second overall test budget.

The enlarged-card checks cover mouse hover, keyboard focus/Enter/Escape, click/tap dialogs, 180px-wide dialog cards, hidden-card masking, unchanged player decisions, preserved scroll position, and no horizontal overflow at desktop and phone widths. Production screenshots were inspected visually.

New rate-limit tests cover repeated creation, independent heartbeat/command quotas, retry headers, bucket expiry, and isolation between visitors and trusted proxy addresses. Transport tests cover overlapping/focus-triggered heartbeats, throttling backoff, stream retry delays, scheduled rotation, permanent room errors, and cleanup. Additional engine checks complete 128 rounds across all supported player counts with different selections/additions and verify inventory, visibility and totals. Room tests cover host-only lobby resets and restoration of the original practice seat after the grace deadline.

The full dependency audit has five high-severity package entries from an upstream development-tool `braces` advisory in Next's ESLint dependency tree. No fixed version is published in this environment. Shipped dependencies audit clean; the remaining advisory and mitigation are documented in the README.

The owner applied the SQL migration to their Supabase project. Credentialed checks then verified anonymous table/RPC denial, concurrent five-seat enforcement, server-only revision delivery, and shared authoritative state across independent server clients. The first revision-delivery check exposed a subscription-readiness race; waiting for PostgreSQL confirmation resolved it, and both database tests passed. These tests remove their own database room records afterward. Credentials stayed in ignored local configuration and were not added to source control. The same project was used for the production browser checks above. For repeatable integration testing, use an isolated migrated project and the three `SUPABASE_TEST_*` variables described in the README.

The local-memory server is real multiplayer within one server process; its room records are ephemeral and lost on restart. The production-mode application was tested locally against hosted Supabase. A public Vercel application deployment and a post-deployment cross-device smoke test remain separate deployment steps. See `README.md` for production environment configuration. The exposed legacy service key still needs replacement in the Supabase dashboard before public deployment.
