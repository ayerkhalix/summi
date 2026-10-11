# Validation — October 12, 2026

Executed on Windows with Node.js 24.11.1 and npm 11.6.2.

| Command                | Actual result                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | Passed, no errors or warnings                                                                                          |
| `npm run typecheck`    | Passed                                                                                                                 |
| `npm test`             | 75 passed; 1 credentialed Supabase test skipped                                                                        |
| `npm run test:e2e`     | 6 Chromium browser tests passed; reused the existing local dev server with `PLAYWRIGHT_BASE_URL=http://localhost:3000` |
| `npm run build`        | Passed                                                                                                                 |
| `npm audit --omit=dev` | 0 vulnerabilities                                                                                                      |

The room integration tests complete matches with 2, 3, 4, and 5 players. They check maximum draws, card conservation, concurrent joins and selections, readiness, host migration, unlimited decisions, reconnection within 90 seconds, clean grace-period expiration, expired-seat reclamation, replay protection, and spectator permissions. Engine tests check the official target/hand ranges, exact deal ordering, reveal counts, hidden-card projections, integer scoring, overshooting, tiebreaks, and shared wins.

The browser tests create and join actual local-server rooms in isolated sessions; complete a two-player match and rematch; independently calculate totals from the final hands; verify private-card and spectator responses; interrupt a player's network until the server pauses; reconnect the same seat without making a decision for them; test a narrow mobile viewport; replay the tutorial; exercise keyboard dialog dismissal; and check persistent music, effects, and reduced-motion settings. Desktop/mobile screenshots and traces are written to ignored `test-results/` and `playwright-report/` directories.

Additional mode tests complete server-authoritative solo and 1–4-bot rounds, preserve the 52-card inventory, enforce practice spectator restrictions, return to the lobby and rematch, keep bots ready between rounds, exclude bots from host migration, and stop bot actions during a human's reconnection grace period. The bot-policy test changes unseen opponent cards and deck order and verifies that neither the bot's projection nor decision changes. Origin regression tests cover localhost, 127.0.0.1, LAN hosts, different ports, cross-site requests, and strict production configuration.

The added browser tests complete solo, one-bot, and four-bot matches through the actual controls, restore their seats on refresh, and start another round. They verify that the landing card DOM nodes survive entry, their destination aligns with the shared deck, decision buttons are centered, and the five-player bot table has no horizontal mobile overflow. A real browser creates a room using 127.0.0.1 while the configured app origin uses localhost. The 3D table's decorative perspective outline is disabled on narrow screens to prevent it from extending beyond the viewport.

The full dependency audit has five high-severity package entries from an upstream development-tool `braces` advisory in Next's ESLint dependency tree. No fixed version is published in this environment. Shipped dependencies audit clean; the remaining advisory and mitigation are documented in the README.

No Supabase URL, service-role key, or isolated database test credentials were available. The actual Supabase SQL migration, hosted Realtime subscription, database RLS/RPC enforcement, and deployment have **not** been executed against a live project. The skipped integration test is implemented and runs when the three `SUPABASE_TEST_*` variables are provided. The production configuration tests verify that missing credentials cannot silently fall back to memory mode.

The local server is real multiplayer within one server process. Its room records are intentionally ephemeral and are lost when that process restarts. No production website or backend has been provisioned or deployed. See `README.md` for full production setup and the exact local-match steps.
