# Garage Gauntlet

**Diagnose it or lose it.** A browser party game for 2–12 players: 10 rounds, 20 seconds per round, 20 original automotive scenarios, and no player accounts.

## Run locally

Requirements: Node.js 22 or newer (24 recommended), npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Create a room, then open a separate browser tab or device and join with its code. Each tab has its own anonymous session. A phone on the same network can use the computer's LAN address on port 3000 if the firewall allows it.

Production:

```sh
npm run build
NODE_ENV=production npm start
```

On PowerShell, set the environment first: `$env:NODE_ENV='production'`, then `npm start`. `PORT` defaults to 3000; Render supplies it automatically. No API keys, database, or application secrets are needed. `.env.example` documents the environment settings; the app reads process environment variables, not an automatically loaded `.env` file.

## Play

1. The host creates a room with a nickname and shares the five-character code or join link.
2. Players join the lobby. Two connected players are required to start.
3. All players, including the host, read the same complaint and 2–4 clues. Choose with the large answer buttons or keys 1–4.
4. A player has one active answer. It can be changed until the server deadline. Only the final selection counts; changing it resets its scoring time. Re-sending the same selection does not reset the time.
5. Correct answers earn `500 + round(500 × remaining_time / 20000)` points, based on server receipt time. Incorrect or absent answers earn zero. A submission at or after the deadline is rejected.
6. The server automatically reveals the explanation, each player's points, and the leaderboard. The host advances rounds and opens the final podium after round ten.
7. Play Again shuffles ten cards and resets scores in the same room. New players can join only in the initial lobby. Returning authenticated sessions can reconnect during a game or at its results.

Sound is optional and starts muted. The icon in the header toggles it. Names may contain 1–18 characters. Use nicknames rather than personal information.

## Multiplayer synchronization

- A single Node.js/Express process serves the React app and Socket.IO over the same origin.
- The `Game` class is the authority for rooms, player identities, membership, cards, active answers, scores, host actions, deadlines, and phase transitions.
- The server chooses a cryptographically random room code, shuffles the 20-card pool without replacement, and creates a new round ID and absolute deadline for every question.
- One server timeout ends each round. Every mutation also checks the authoritative deadline, so even a delayed event-loop callback cannot allow late answers or double scoring.
- Each event publishes a personalized, revisioned room snapshot. It contains the recipient's own selection, never another player's selection or session token. The correct answer and explanation appear only in reveal/final snapshots. Scenario source is outside the client module graph.
- Clients sample server time every five seconds and account for round-trip latency. They render a countdown against the shared deadline; reaching zero does not authorize a client to reveal or change scores.
- Answer and next-round requests include the round ID, preventing stale/repeated requests from affecting a subsequent round. Server-side socket identity determines the acting player; supplied player IDs or scores have no effect.
- Each anonymous player receives a random bearer token stored in sessionStorage. Refreshing the tab restores the player, score, selection, and current state. Separate tabs normally get separate sessions. Duplicating a tab may copy sessionStorage; the latest connection then replaces the old one explicitly.
- A disconnected player stays in the match. After 15 seconds without the host, control passes to a connected player. Reconnecting after a handoff does not reclaim host control. If nobody was present for the handoff, the next returning connected player can take over.
- Small payload limits, same-origin browser connections, per-socket request limits, a room count cap, and expiration of abandoned rooms keep the small public service bounded.

Room state is intentionally **in memory**, with one server instance. Browser refreshes and individual disconnections are supported, but a server restart, deploy, or hosting sleep loses existing rooms. Do not add horizontal scaling without moving authoritative state and scheduling into shared infrastructure. Empty disconnected rooms expire after two hours.

## Project structure

- `src/` — responsive React interface, room connection/recovery, synchronized display timer, styles.
- `server/game.ts` — state machine and scoring rules.
- `server/app.ts` — validated Socket.IO actions, room broadcasts, timers, host recovery, HTTP security and static serving.
- `server/scenarios.ts` — 20 original, fictional diagnosis cards; server-only.
- `shared/types.ts` — public protocol and content types.
- `tests/` — deterministic game-rule tests and independent real-socket integration tests.
- `render.yaml` — single-instance Render service configuration.

## Add or edit cards

Edit `server/scenarios.ts`. Each card needs a unique `id`, `category`, `title`, `vehicle`, 2–4 `clues`, exactly four distinct `choices`, one zero-based `correct` choice index, an `explanation`, and `difficulty` (`easy`, `medium`, or `hard`). Keep clues sufficient for non-experts and wording original. Correct answers must never be imported into browser code. The current content test asserts exactly 20 cards; update that assertion intentionally when extending the pool.

## Tests

```sh
npm test
npm run build
```

The tests cover content, minimum and maximum membership, duplicate names, bad codes, scoring boundaries, changed answers, repeat messages, late answers, secret-answer filtering, host authorization, ten unique rounds, ranking and ties, final-room admission, replay, refresh recovery, room isolation, real socket broadcasts, automated round ends, host handoff, and cross-origin rejection.

Integration tests inject shorter server timers to finish quickly; the normal application always uses 20-second rounds. See `TEST_REPORT.md` for the separate manual browser playthrough and its results.

## Deploy on Render

Deploy this repository as a **Web Service** (not a static site). `render.yaml` is provided for a Blueprint, or configure manually:

- Runtime: Node
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Environment: `NODE_ENV=production`, `NODE_VERSION=24.14.1`
- Health check: `/health`
- Instances: **1**

Render routes HTTP and secure WebSocket connections through the same public service URL. The free service is sufficient to try the game but may spin down when idle; waking it takes time and resets rooms. An always-on instance avoids idle sleep but can incur charges. No paid service is required by this project configuration.

A deployment interrupts active games because room storage is in memory. Deploy between matches. Players need only a web browser and the room code.

## Content and assets

Scenario wording and interface are original. Lucide icons are used under ISC; Barlow fonts are self-hosted from Fontsource under the SIL Open Font License. No manufacturer logos, car brands, stock photographs, trackers, or external font requests are used. The game provides fictional entertainment, not vehicle repair instructions.
