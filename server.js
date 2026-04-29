/* The Hawkeye Open — internal backend.
 * Plain Node http: serves the static frontend, exposes a tiny JSON API,
 * pushes realtime updates over Server-Sent Events. State persisted to a
 * single JSON file (override via DATA_DIR for a Railway volume mount).
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT     = parseInt(process.env.PORT, 10) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "state.json");

// ---------- Storage --------------------------------------------------

let store = { rooms: {}, players: [], scores: [] };
let saveTimer = null;

function loadStore() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw);
      store = {
        rooms:   parsed.rooms   || {},
        players: parsed.players || [],
        scores:  parsed.scores  || []
      };
    }
  } catch (e) {
    console.warn("Could not load state, starting fresh:", e.message);
  }
}
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DATA_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(store));
      fs.renameSync(tmp, DATA_FILE);
    } catch (e) { console.error("Save failed:", e.message); }
  }, 80);
}

// ---------- Realtime subscribers (SSE) -------------------------------

const channels = new Map(); // room_code -> Set<res>

function subscribe(code, res) {
  if (!channels.has(code)) channels.set(code, new Set());
  channels.get(code).add(res);
  res.on("close", () => {
    const set = channels.get(code);
    if (set) { set.delete(res); if (!set.size) channels.delete(code); }
  });
}
function broadcast(code, eventName, payload) {
  const set = channels.get(code);
  if (!set) return;
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(data); } catch {}
  }
}

// ---------- Helpers --------------------------------------------------

function uuid() { return crypto.randomUUID(); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function send(res, status, body, headers = {}) {
  const isJson = body !== null && typeof body === "object";
  res.writeHead(status, {
    "Content-Type": isJson ? "application/json" : "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(isJson ? JSON.stringify(body) : (body || ""));
}

function roomState(code) {
  const players = store.players.filter(p => p.room_code === code);
  const ids = new Set(players.map(p => p.id));
  const scores = store.scores.filter(s => ids.has(s.player_id));
  return { code, players, scores };
}

// ---------- API routes -----------------------------------------------

// Match patterns like /api/rooms/:code/scores
function matchPath(method, url, pattern) {
  if (method !== pattern.method) return null;
  const a = url.split("?")[0].split("/").filter(Boolean);
  const b = pattern.path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < b.length; i++) {
    if (b[i].startsWith(":")) params[b[i].slice(1)] = decodeURIComponent(a[i]);
    else if (b[i] !== a[i]) return null;
  }
  return params;
}

const ROUTES = [
  { method: "POST", path: "/api/rooms" },                                 // 0
  { method: "POST", path: "/api/rooms/:code/join" },                      // 1
  { method: "GET",  path: "/api/rooms/:code" },                           // 2
  { method: "GET",  path: "/api/rooms/:code/stream" },                    // 3
  { method: "PUT",  path: "/api/rooms/:code/players/:id" },               // 4
  { method: "PUT",  path: "/api/rooms/:code/scores" },                    // 5
];

async function handleApi(req, res) {
  for (let i = 0; i < ROUTES.length; i++) {
    const params = matchPath(req.method, req.url, ROUTES[i]);
    if (!params) continue;

    if (i === 0) { // create room
      const body = await readBody(req).catch(() => ({}));
      const code = String(body.code || "").toUpperCase().trim();
      if (!/^[A-HJ-NP-Z2-9]{4}$/.test(code)) return send(res, 400, { error: "bad code" });
      if (!store.rooms[code]) {
        store.rooms[code] = { code, created_at: new Date().toISOString() };
        saveStore();
      }
      return send(res, 200, store.rooms[code]);
    }

    if (i === 1) { // join room (upsert player)
      const body = await readBody(req).catch(() => ({}));
      const code = params.code.toUpperCase();
      const name = String(body.name || "").trim();
      if (!store.rooms[code]) {
        store.rooms[code] = { code, created_at: new Date().toISOString() };
      }
      if (!name) return send(res, 400, { error: "name required" });

      let player = store.players.find(p => p.room_code === code && p.name.toLowerCase() === name.toLowerCase());
      if (!player) {
        player = {
          id: uuid(),
          room_code: code,
          name,
          pee_total: 0,
          puke_total: 0,
          updated_at: new Date().toISOString()
        };
        store.players.push(player);
        saveStore();
        broadcast(code, "players", roomState(code));
      } else {
        player.updated_at = new Date().toISOString();
        saveStore();
      }
      return send(res, 200, { player, state: roomState(code) });
    }

    if (i === 2) { // full state
      const code = params.code.toUpperCase();
      return send(res, 200, roomState(code));
    }

    if (i === 3) { // SSE stream
      const code = params.code.toUpperCase();
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      });
      res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      subscribe(code, res);
      const ping = setInterval(() => {
        try { res.write(": ping\n\n"); } catch { clearInterval(ping); }
      }, 25000);
      req.on("close", () => clearInterval(ping));
      return;
    }

    if (i === 4) { // update player penalties
      const body = await readBody(req).catch(() => ({}));
      const code = params.code.toUpperCase();
      const id   = params.id;
      const player = store.players.find(p => p.id === id && p.room_code === code);
      if (!player) return send(res, 404, { error: "player not found" });
      if (Number.isFinite(body.pee_total))  player.pee_total  = Math.max(0, body.pee_total | 0);
      if (Number.isFinite(body.puke_total)) player.puke_total = Math.max(0, body.puke_total | 0);
      player.updated_at = new Date().toISOString();
      saveStore();
      broadcast(code, "players", roomState(code));
      return send(res, 200, player);
    }

    if (i === 5) { // upsert score
      const body = await readBody(req).catch(() => ({}));
      const code = params.code.toUpperCase();
      const { player_id, hole_num, value, total, hole_type, par } = body;
      if (!player_id || !Number.isFinite(hole_num)) {
        return send(res, 400, { error: "player_id + hole_num required" });
      }
      const player = store.players.find(p => p.id === player_id && p.room_code === code);
      if (!player) return send(res, 404, { error: "player not found" });

      let score = store.scores.find(s => s.player_id === player_id && s.hole_num === hole_num);
      if (!score) {
        score = { id: uuid(), player_id, hole_num, value, total, hole_type, par };
        store.scores.push(score);
      } else {
        score.value = value;
        score.total = total;
        score.hole_type = hole_type;
        score.par = par;
      }
      saveStore();
      broadcast(code, "scores", roomState(code));
      return send(res, 200, score);
    }
  }
  return send(res, 404, { error: "not found" });
}

// ---------- Static files ---------------------------------------------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
  ".woff2": "font/woff2"
};

const PUBLIC_DIR = __dirname;
const ALLOWED = new Set(["index.html", "styles.css", "app.js", "favicon.ico"]);

function serveStatic(req, res) {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let name = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  if (name.includes("..") || name.includes("\0")) return send(res, 400, "bad path");
  if (!ALLOWED.has(name)) return send(res, 404, "not found");

  const filePath = path.join(PUBLIC_DIR, name);
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "not found");
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
}

// ---------- Server ---------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) return await handleApi(req, res);
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
    return send(res, 405, "method not allowed");
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: e.message || "server error" });
  }
});

loadStore();
server.listen(PORT, () => {
  console.log(`The Hawkeye Open listening on :${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
