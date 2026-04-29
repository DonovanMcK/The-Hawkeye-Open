# The Hawkeye Open

Iowa City pub golf scorecard with a live shared leaderboard. Vintage country
club aesthetic. Single-page web app — plain HTML/CSS/JS frontend, tiny Node
HTTP server for the backend, JSON file for storage, Server-Sent Events for
realtime. No external services. Deploy to Railway from git.

## Course (12 holes)

Walking south from the Old Capitol:

1. Joe's Place — Well Drink — *115 Iowa Ave*
2. Dublin Underground — Irish Car Bomb — *5 S Dubuque*
3. Summit — El Cristo — *10 S Clinton*
4. The Airliner — Hammer — *22 S Clinton*
5. Bo-James — Pitcher Split — *118 E Washington*
6. Sports Column — Bartender's Choice — *12 S Dubuque*
7. Roxxy's — Tequila Sunrise — *127 E College*
8. The Union Bar — Bartender's Choice — *121 E College*
9. Brothers Bar & Grill — Bartender's Choice — *125 S Dubuque*
10. DC's Sports Bar — Stein — *124 S Dubuque*
11. Fieldhouse Bar & Grill — Tallboy Beer — *138 S Clinton*
12. Closer (TBD) — Last Call Shot

## Run locally

Requires Node 18+. No `npm install` needed — server uses only Node built-ins.

```
node server.js
```

Open <http://localhost:3000>. Open it in two windows to watch realtime sync.

## Deploy to Railway

```
railway login
railway init      # interactive — pick "Empty project"
railway up
```

Railway detects Nixpacks → installs Node → runs `node server.js` (per
`railway.toml`). Subsequent `git push` triggers a redeploy.

### Persistence across redeploys (optional but recommended)

State is stored in `./data/state.json`. Railway's filesystem is ephemeral — a
redeploy wipes it. To keep the leaderboard between redeploys, attach a
Railway Volume:

1. In the Railway dashboard, add a Volume to the service. Mount it at `/data`.
2. Set `DATA_DIR=/data` in the service's variables (or uncomment the block in
   `railway.toml`).

For a single pub golf night you can skip this — the in-memory state lasts as
long as the process.

## Files

| File          | Purpose                                                    |
|---------------|------------------------------------------------------------|
| `index.html`  | App shell + templates                                      |
| `styles.css`  | Vintage country club theme                                 |
| `app.js`      | State, fetch + SSE client, views                           |
| `server.js`   | Node http server: static files + JSON API + SSE realtime   |
| `package.json`| Node engine + start script (no runtime deps)               |
| `railway.toml`| Build/deploy hint                                          |

## API (internal)

| Method | Path                                  | Notes                              |
|--------|---------------------------------------|------------------------------------|
| POST   | `/api/rooms`                          | upsert room by `code`              |
| POST   | `/api/rooms/:code/join`               | upsert player; returns full state  |
| GET    | `/api/rooms/:code`                    | full state for a room              |
| GET    | `/api/rooms/:code/stream`             | SSE: `players` / `scores` events   |
| PUT    | `/api/rooms/:code/players/:id`        | update `pee_total` / `puke_total`  |
| PUT    | `/api/rooms/:code/scores`             | upsert score for a hole            |

## Scoring

Lower wins. Per-hole input depends on type:

- **GOLF** — `+/−` stepper for strokes
- **SIPS** — tap-to-count with undo
- **CHUG** — stopwatch with start / done; optional in-app camera that runs a
  3-2-1 countdown and records via `MediaRecorder` while the chug timer runs.
  Video stays on-device — never uploaded.

Penalties are global per player: **pee = +2**, **puke = +5** (puke needs
confirmation).

## Lobby

- Enter your name + 4-letter room code → **Tee Off**
- Or **Create New Room** for a random code (no `I/O/0/1` so it stays legible)
- Last name + code are saved in `localStorage` for refresh

## Realtime

The leaderboard subscribes to a per-room SSE stream. Whenever a player joins,
updates penalties, or saves a score, the server pushes the full room state and
all connected clients re-render. Sort is `holes_played DESC, total ASC`. The
current player's row is highlighted gold; ranks 1/2/3 are gold / silver /
bronze.
