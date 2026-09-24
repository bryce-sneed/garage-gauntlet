# Garage Gauntlet — test report

Tested September 24, 2026.

## Result

Production build: **PASS**. Automated tests: **13 passed, 0 failed**. Production dependency audit: **0 reported vulnerabilities**.

## Real browser playthrough before deployment

Played a complete ten-round match using the production build and normal **20-second rounds**, with two independent browser sessions: `localhost:3000` (Turbo Toast) and `127.0.0.1:3000` (Socket Rocket). These were separate tabs on different origins, with separate browser storage and separate anonymous identities, connected to the same server. They were not two physical devices.

- **Create room — PASS:** five-character room code and join link appeared. Start was disabled until a second player joined.
- **Second session / lobby updates — PASS:** the guest joined, both player names appeared, and the host could start.
- **Invalid room code — PASS:** `ZZZZZ` produced the expected room-not-found message.
- **Duplicate name — PASS:** attempting to join as the host's name was rejected; another nickname joined successfully.
- **Start / countdown / automatic reveal — PASS:** both sessions received the same question and progressed through all ten rounds. Each round ended automatically at the normal deadline. Exact shared deadlines are additionally asserted in real-socket tests; sequential browser readings are not a latency benchmark.
- **Independent answers — PASS:** players selected different answers; their selected states stayed independent. Correct and incorrect results were displayed separately.
- **Change answer — PASS:** changed the guest's selected answer within a round; only the latest selection remained selected and scored.
- **Refresh mid-round — PASS:** refreshed Socket Rocket after selecting an answer in round two. The same identity, room, active round, countdown, and selection returned.
- **Scoring / reveal / leaderboard — PASS:** first-round correct answer earned 673 points; the wrong answer earned zero. The final scores agreed in both browsers: Turbo Toast 3,362; Socket Rocket 926. Exact 1,000 / 750 / 500 scoring boundaries and final-selection timing were verified in unit tests.
- **No answer — PASS:** deliberately left the host unanswered in round ten; the reveal showed “No answer” and zero round points.
- **Final results — PASS:** the host opened the final podium, and both sessions displayed matching ranked scores. With two players, the podium showed first and second place.
- **Final room admission — PASS:** a third fresh browser tab tried to join the finished room and was rejected.
- **Replay — PASS:** Play Again returned both sessions to round one, retained the room code, shuffled content, and reset both scores to zero.
- **Keyboard / sharing — PASS:** key 1 selected the first answer on replay. Share the game reported that the link was copied.
- **Mobile layout — PASS:** tested the question and answer UI with a 390 × 844 viewport override (375 CSS pixels of content width after the browser scrollbar). Document content width equaled viewport content width: no horizontal overflow. Answer buttons were 61 CSS pixels tall. Inspected the narrow screenshot and desktop landing/final screens.
- **Browser errors — PASS:** both player sessions had no captured console errors during the main match.

## Automated coverage

Nine game-rule tests cover the 20-card schema and seven categories; room/name validation; minimum and 12-player maximum; score boundaries; hidden answer keys; final-selection timing; invalid/stale/late answers; idempotent scoring; host-only actions; ten unique rounds; rankings and ties; final-room admission; replay; refresh tokens; host transfer; and explicit lobby leave.

Four real Socket.IO integration tests cover two independent socket clients through ten rounds and replay; identical deadlines and round IDs; refresh/reconnection; untrusted score/player fields; automatic server timeout reveals; isolation between rooms; invalid codes; forged tokens; the 12-player limit; non-host rejection; disconnect host handoff; and cross-origin connection rejection. Integration tests inject shorter timers for speed; the browser playthrough uses the normal 20 seconds.

## Fixes and retesting

- Corrected a TypeScript test payload mismatch, then rebuilt successfully.
- Self-hosted fonts so production's same-origin content policy can load them without external requests.
- Fixed explicit lobby leave to free the slot and transfer host control immediately. Added a regression test; rebuilt and reran all 13 tests successfully.
- The browser automation hit two timing-related locator waits while a normal round was transitioning. The game itself advanced correctly; subsequent state inspection and continued play verified the results. These were test-driver timeouts, not application crashes.

## Limits

- Not load-tested beyond 12 players per room; no claim of large-scale capacity.
- Browser checks used a desktop browser and a narrow viewport, not physical iOS/Android devices or a full screen-reader audit.
- In-memory rooms survive individual refreshes/disconnections, but not a server restart, redeploy, or hosting sleep. This is the agreed single-instance design.
- Render's free service can sleep when idle and take time to wake. A paid always-on instance is optional; no purchase is required to play.
- Round transitions are server-authoritative; display updates remain subject to ordinary network delay and browser background throttling.

Public deployment verification is recorded in `DEPLOYMENT.md` after publication.
