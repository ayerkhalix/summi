# Validation — October 12, 2026

Executed on Windows with Node.js 24.11.1 and npm 11.6.2.

| Command | Actual result |
| --- | --- |
| `npm run lint` | Passed, no errors or warnings |
| `npm run typecheck` | Passed |
| `npm test` | 57 passed; 1 credentialed Supabase test skipped |
| `npm run test:e2e` | 2 Chromium browser tests passed |
| `npm run build` | Passed |
| `npm audit --omit=dev` | 0 vulnerabilities |

The room integration tests complete matches with 2, 3, 4, and 5 players. They check maximum draws, card conservation, concurrent joins and selections, readiness, host migration, unlimited decisions, reconnection within 90 seconds, clean grace-period expiration, expired-seat reclamation, replay protection, and spectator permissions. Engine tests check the official target/hand ranges, exact deal ordering, reveal counts, hidden-card projections, integer scoring, overshooting, tiebreaks, and shared wins.

The browser tests create and join actual local-server rooms in isolated sessions; complete a two-player match and rematch; independently calculate totals from the final hands; verify private-card and spectator responses; interrupt a player's network until the server pauses; reconnect the same seat without making a decision for them; test a narrow mobile viewport; replay the tutorial; exercise keyboard dialog dismissal; and check persistent music, effects, and reduced-motion settings. Desktop/mobile screenshots and traces are written to ignored `test-results/` and `playwright-report/` directories.

The full dependency audit has five high-severity package entries from an upstream development-tool `braces` advisory in Next's ESLint dependency tree. No fixed version is published in this environment. Shipped dependencies audit clean; the remaining advisory and mitigation are documented in the README.

No Supabase URL, service-role key, or isolated database test credentials were available. The actual Supabase SQL migration, hosted Realtime subscription, database RLS/RPC enforcement, and deployment have **not** been executed against a live project. The skipped integration test is implemented and runs when the three `SUPABASE_TEST_*` variables are provided. The production configuration tests verify that missing credentials cannot silently fall back to memory mode.

The local server is real multiplayer within one server process. Its room records are intentionally ephemeral and are lost when that process restarts. No production website or backend has been provisioned or deployed. See `README.md` for full production setup and the exact local-match steps.
