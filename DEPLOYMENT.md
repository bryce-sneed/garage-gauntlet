# Public deployment

- **Live game:** https://garage-gauntlet.onrender.com
- **Source:** https://github.com/bryce-sneed/garage-gauntlet
- **Provider:** Render, free Node web service, one instance, Oregon region.
- **Dashboard:** https://dashboard.render.com/web/srv-daqnncmgekts739bigh0
- **Initial deployment:** `dep-daqnncugekts739biif0`, reported “Deploy succeeded | Live” on September 24, 2026 at approximately 3:37 PM Eastern.
- **Application source commit:** `3389c9e27f16f3114539087877f1fad0ff26f3db`. Subsequent documentation-only commits record the live URL and test results.
- **Build:** `npm ci --include=dev && npm run build`
- **Start:** `npm start`
- **Environment:** `NODE_ENV=production`, `NODE_VERSION=24.14.1`; Render supplies `PORT`.
- **Health check:** `/health` returned `{"status":"ok"}` over public HTTPS.

## Public verification

After the complete predeployment ten-round browser playthrough, tested the real public service with two new browser sessions, Launch Check and Road Test:

- Created public room `GFDHY`, joined the second session, and started a normal 20-second round.
- Submitted different answers, then changed the host's selection before the deadline.
- Refreshed the guest; its identity, room, and submitted selection recovered.
- Both sessions received the same automatic reveal and score ordering: Launch Check 646 points, Road Test 0.
- Leaving as host transferred Next Round control to the remaining player.
- An independent client connected successfully using **secure WebSocket transport only**, confirming the public proxy supports the realtime transport.
- Both browser consoles contained no captured errors during the main public round.
- The test sessions were exited afterward. The game opens on its clean landing screen.

## What the owner needs to do

**Nothing to begin playing.** Open the public URL, create a room, and share its join link or code. Players do not need a Render or GitHub account.

The service uses free hosting. Render warns that waking an idle free instance can delay a request by 50 seconds or more. Let it finish waking, then create a new room. No paid upgrade was selected. An optional always-on plan can reduce startup delays, but changes or charges should be chosen by the owner.

Rooms exist only in server memory. Idle shutdown, redeployment, or process restart ends existing rooms. Browser refresh and individual player disconnection are supported. Deploy changes between matches, and keep the service at one instance unless the architecture is extended to shared state.

For future code updates, push the source and use Render's manual deployment controls if the public-repository connection does not auto-deploy. The README includes local setup, content editing, and deployment instructions.
