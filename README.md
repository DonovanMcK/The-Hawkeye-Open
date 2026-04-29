# The Hawkeye Open

Iowa City pub golf scorecard with a live shared leaderboard. Vintage country
club aesthetic. Single-page web app — plain HTML/CSS/JS, Supabase for the
backend, Railway for hosting.

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

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → paste the contents of `schema.sql` → run.
3. Open **Settings → API** and copy:
   - `Project URL`
   - `anon` public key

### 2. Drop keys into `config.js`

```js
const SUPABASE_URL      = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

The keys live in client-side JS — RLS policies are open and scoped to anon
access. Don't put a service-role key here.

### 3. Run locally

Any static server works. With Node:

```
npx serve -s . -l 3000
```

Open <http://localhost:3000>.

### 4. Deploy to Railway

```
railway login
railway init     # interactive — pick "Empty project"
railway up
```

Railway picks up `package.json` + `railway.toml` and serves with `serve`. After
the first deploy, link a domain in the Railway dashboard.

Push to git and Railway auto-deploys subsequent commits.

## Files

| File          | Purpose                                          |
|---------------|--------------------------------------------------|
| `index.html`  | App shell + templates                            |
| `styles.css`  | Vintage country club theme                       |
| `app.js`      | State, Supabase calls, realtime, views           |
| `config.js`   | Supabase URL + anon key (placeholders)           |
| `schema.sql`  | Tables, RLS policies, realtime publication       |
| `package.json`| `serve` for Railway                              |
| `railway.toml`| Build/deploy hint                                |

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

The leaderboard subscribes to `players` and `scores` via Supabase Realtime and
re-renders on any insert/update/delete. Sort is `holes_played DESC, total ASC`.
The current player's row is highlighted gold; ranks 1/2/3 are gold / silver /
bronze.
