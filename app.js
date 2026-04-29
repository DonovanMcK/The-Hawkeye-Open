/* ===== The Hawkeye Open — app logic (internal backend) ===== */

// ---------- Course ----------------------------------------------------

const HOLES = [
  { num:  1, bar: "Joe's Place",            drink: "Well Drink",         type: "golf",  par: 3,  addr: "115 Iowa Ave" },
  { num:  2, bar: "Dublin Underground",     drink: "Irish Car Bomb",     type: "timed", par: 10, addr: "5 S Dubuque" },
  { num:  3, bar: "Summit",                 drink: "El Cristo",          type: "golf",  par: 3,  addr: "10 S Clinton" },
  { num:  4, bar: "The Airliner",           drink: "Hammer",             type: "golf",  par: 3,  addr: "22 S Clinton" },
  { num:  5, bar: "Bo-James",               drink: "Pitcher Split",      type: "sips",  par: 15, addr: "118 E Washington" },
  { num:  6, bar: "Sports Column",          drink: "Bartender's Choice", type: "golf",  par: 3,  addr: "12 S Dubuque" },
  { num:  7, bar: "Roxxy's",                drink: "Tequila Sunrise",    type: "golf",  par: 3,  addr: "127 E College" },
  { num:  8, bar: "The Union Bar",          drink: "Bartender's Choice", type: "golf",  par: 3,  addr: "121 E College" },
  { num:  9, bar: "Brothers Bar & Grill",   drink: "Bartender's Choice", type: "golf",  par: 3,  addr: "125 S Dubuque" },
  { num: 10, bar: "DC's Sports Bar",        drink: "Stein",              type: "sips",  par: 20, addr: "124 S Dubuque" },
  { num: 11, bar: "Fieldhouse Bar & Grill", drink: "Tallboy Beer",       type: "sips",  par: 10, addr: "138 S Clinton" },
  { num: 12, bar: "Closer (TBD)",           drink: "Last Call Shot",     type: "timed", par: 5,  addr: "" }
];

const TYPE_LABEL = { golf: "GOLF", sips: "SIPS", timed: "CHUG" };

// ---------- State -----------------------------------------------------

const state = {
  name: "",
  code: "",
  playerId: null,
  player: null,
  scores: {},          // { [hole_num]: scoreRow }
  players: [],
  scoresByPlayer: {},
  tab: "course",
  evt: null            // EventSource
};

// ---------- DOM helpers ----------------------------------------------

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const tpl = (id) => document.getElementById(id).content.cloneNode(true);

// ---------- API client -----------------------------------------------

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ---------- Init ------------------------------------------------------

window.addEventListener("DOMContentLoaded", () => {
  renderLobby();
});

// ---------- Lobby -----------------------------------------------------

function genCode() {
  const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPH[Math.floor(Math.random() * ALPH.length)];
  return s;
}

function renderLobby() {
  const app = $("#app");
  app.innerHTML = "";
  app.appendChild(tpl("tpl-lobby"));

  $("#nameInput").value = localStorage.getItem("ho.name") || "";
  $("#codeInput").value = localStorage.getItem("ho.code") || "";

  $("#newRoomBtn").addEventListener("click", () => {
    $("#codeInput").value = genCode();
  });

  $("#lobbyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#lobbyMsg");
    msg.textContent = "";

    const name = $("#nameInput").value.trim();
    const code = $("#codeInput").value.trim().toUpperCase();
    if (!name || !/^[A-HJ-NP-Z2-9]{4}$/.test(code)) {
      msg.textContent = "Need a name and a 4-letter code (A-Z, 2-9, no I/O/0/1).";
      return;
    }

    try {
      await joinRoom(name, code);
      localStorage.setItem("ho.name", name);
      localStorage.setItem("ho.code", code);
      renderShell();
    } catch (err) {
      console.error(err);
      msg.textContent = err.message || "Couldn't join room.";
    }
  });
}

async function joinRoom(name, code) {
  await api("POST", "/api/rooms", { code });
  const { player, state: s } = await api("POST", `/api/rooms/${code}/join`, { name });

  state.name = name;
  state.code = code;
  state.playerId = player.id;
  state.player = player;

  applyState(s);
  subscribeRealtime();
}

// ---------- Data ------------------------------------------------------

function applyState(s) {
  state.players = s.players || [];
  state.player = state.players.find(p => p.id === state.playerId) || state.player;

  state.scoresByPlayer = {};
  (s.scores || []).forEach(row => {
    (state.scoresByPlayer[row.player_id] ||= []).push(row);
  });

  state.scores = {};
  (state.scoresByPlayer[state.playerId] || []).forEach(r => {
    state.scores[r.hole_num] = r;
  });
}

async function refreshAll() {
  const s = await api("GET", `/api/rooms/${state.code}`);
  applyState(s);
}

function subscribeRealtime() {
  if (state.evt) state.evt.close();
  const evt = new EventSource(`/api/rooms/${state.code}/stream`);
  state.evt = evt;
  const onUpdate = (e) => {
    try {
      const s = JSON.parse(e.data);
      applyState(s);
      rerenderActive();
    } catch {}
  };
  evt.addEventListener("players", onUpdate);
  evt.addEventListener("scores",  onUpdate);
  evt.onerror = () => { /* browser auto-reconnects */ };
}

function rerenderActive() {
  if (state.tab === "course")   renderCourse();
  if (state.tab === "board")    renderBoard();
  if (state.tab === "settings") renderSettings();
}

// ---------- Shell -----------------------------------------------------

function renderShell() {
  const app = $("#app");
  app.innerHTML = "";
  app.appendChild(tpl("tpl-shell"));
  $("#roomBadge").textContent = state.code;

  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  switchTab("course");
}

function switchTab(tab) {
  state.tab = tab;
  $$(".tab").forEach(b => b.classList.toggle("is-active", b.dataset.tab === tab));
  if (tab === "course")   renderCourse();
  if (tab === "board")    renderBoard();
  if (tab === "settings") renderSettings();
}

// ---------- Course tab ------------------------------------------------

function renderCourse() {
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl("tpl-course"));
  const list = $("#holeList");

  HOLES.forEach(h => {
    const li = document.createElement("li");
    const score = state.scores[h.num];
    li.className = "hole" + (score ? " is-played" : "");
    li.innerHTML = `
      <span class="hole__num">${h.num}</span>
      <div>
        <h3 class="hole__bar">${escapeHtml(h.bar)}</h3>
        <p class="hole__drink">${escapeHtml(h.drink)}</p>
        ${h.addr ? `<p class="hole__addr">${escapeHtml(h.addr)}</p>` : ""}
      </div>
      <div class="hole__right">
        <span class="badge badge--${badgeClass(h.type)}">${TYPE_LABEL[h.type]}</span>
        <span class="hole__score">${score ? formatScore(score) : "—"}</span>
      </div>
    `;
    li.addEventListener("click", () => renderPlay(h));
    list.appendChild(li);
  });
}

function badgeClass(type) {
  if (type === "timed") return "chug";
  return type;
}
function formatScore(s) {
  if (s.hole_type === "timed") return `${(+s.value).toFixed(1)}s`;
  return String(+s.value);
}

// ---------- Play screen ----------------------------------------------

function renderPlay(hole) {
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl("tpl-play"));

  $("#playHoleNum").textContent = hole.num;
  $("#playBar").textContent     = hole.bar;
  $("#playAddr").textContent    = hole.addr || "";
  $("#playDrink").textContent   = hole.drink;
  $("#playPar").textContent     = hole.par;

  const typeEl = $("#playType");
  typeEl.textContent = TYPE_LABEL[hole.type];
  typeEl.classList.add(`badge--${badgeClass(hole.type)}`);

  $("#backBtn").addEventListener("click", () => switchTab("course"));

  const body = $("#playBody");
  const existing = state.scores[hole.num];

  let getValue = () => 0;
  if (hole.type === "golf")  getValue = mountGolf(body, hole, existing);
  if (hole.type === "sips")  getValue = mountSips(body, hole, existing);
  if (hole.type === "timed") getValue = mountTimed(body, hole, existing);

  $("#saveBtn").addEventListener("click", async () => {
    const value = getValue();
    if (value == null) return;
    try {
      await saveScore(hole, value);
      switchTab("course");
    } catch (err) {
      alert("Save failed: " + err.message);
    }
  });
}

function mountGolf(root, hole, existing) {
  let val = existing ? +existing.value : hole.par;
  root.innerHTML = `
    <div class="stepper">
      <button class="stepper__btn" data-d="-1">−</button>
      <span class="stepper__val" id="golfVal">${val}</span>
      <button class="stepper__btn" data-d="1">+</button>
    </div>
    <p class="section-sub">strokes</p>
  `;
  const set = (n) => { val = Math.max(1, Math.min(20, n)); $("#golfVal").textContent = val; };
  $$('.stepper__btn', root).forEach(b => {
    b.addEventListener("click", () => set(val + (+b.dataset.d)));
  });
  return () => val;
}

function mountSips(root, hole, existing) {
  let count = existing ? +existing.value : 0;
  const stack = [];
  root.innerHTML = `
    <div class="sips-wrap">
      <div class="sip-count" id="sipCount">${count}</div>
      <button type="button" class="sip-btn" id="sipBtn">SIP</button>
      <button type="button" class="sip-undo" id="sipUndo">↺ Undo</button>
    </div>
  `;
  const update = () => $("#sipCount").textContent = count;
  $("#sipBtn").addEventListener("click", () => { stack.push(1); count++; update(); });
  $("#sipUndo").addEventListener("click", () => {
    if (stack.length) { stack.pop(); count = Math.max(0, count - 1); update(); }
  });
  return () => count;
}

function mountTimed(root, hole, existing) {
  let elapsed = existing ? +existing.value : 0;
  let startedAt = null;
  let raf = null;
  let mediaCleanup = null;

  root.innerHTML = `
    <div class="timer-wrap">
      <div class="timer" id="timerDisp">${elapsed.toFixed(1)}</div>
      <div class="timer-row">
        <button type="button" class="btn btn--ghost" id="tStart">Start</button>
        <button type="button" class="btn btn--danger" id="tDone">Done</button>
      </div>
      <button type="button" class="cam-btn" id="tCam">⦿ Record Chug</button>
      <p class="section-sub">seconds — lower wins</p>
    </div>
  `;

  const disp = $("#timerDisp");
  const tick = () => {
    elapsed = (performance.now() - startedAt) / 1000;
    disp.textContent = elapsed.toFixed(1);
    raf = requestAnimationFrame(tick);
  };
  const start = () => {
    if (startedAt) return;
    startedAt = performance.now() - elapsed * 1000;
    disp.classList.add("is-running");
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (!startedAt) return;
    cancelAnimationFrame(raf);
    elapsed = (performance.now() - startedAt) / 1000;
    startedAt = null;
    disp.classList.remove("is-running");
    disp.textContent = elapsed.toFixed(1);
  };

  $("#tStart").addEventListener("click", start);
  $("#tDone").addEventListener("click", () => { stop(); if (mediaCleanup) mediaCleanup(); });
  $("#tCam").addEventListener("click", async () => {
    mediaCleanup = await openCamera({
      onCountdownDone: start,
      onStop: stop
    });
  });

  return () => {
    if (startedAt) stop();
    return Math.round(elapsed * 10) / 10;
  };
}

// ---------- Save score ------------------------------------------------

async function saveScore(hole, value) {
  await api("PUT", `/api/rooms/${state.code}/scores`, {
    player_id: state.playerId,
    hole_num:  hole.num,
    value:     value,
    total:     value,
    hole_type: hole.type,
    par:       hole.par
  });
  await refreshAll();
}

// ---------- Leaderboard ----------------------------------------------

function playerTotal(p) {
  const rows = state.scoresByPlayer[p.id] || [];
  let sum = rows.reduce((a, r) => a + Number(r.total || 0), 0);
  sum += (p.pee_total || 0) * 2;
  sum += (p.puke_total || 0) * 5;
  return Math.round(sum * 10) / 10;
}
function playerHoles(p) {
  return (state.scoresByPlayer[p.id] || []).length;
}

function renderBoard() {
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl("tpl-board"));
  const list = $("#boardList");

  const ranked = [...state.players]
    .map(p => ({ p, holes: playerHoles(p), total: playerTotal(p) }))
    .sort((a, b) => (b.holes - a.holes) || (a.total - b.total) || a.p.name.localeCompare(b.p.name));

  if (!ranked.length) {
    list.innerHTML = `<p class="section-sub">No players yet.</p>`;
    return;
  }

  ranked.forEach((r, i) => {
    const rank = i + 1;
    const li = document.createElement("li");
    li.className = `row row--${rank}` + (r.p.id === state.playerId ? " is-me" : "");
    li.innerHTML = `
      <span class="row__rank">${rank}</span>
      <div>
        <div class="row__name">${escapeHtml(r.p.name)}</div>
        <div class="row__holes">${r.holes}/12 played</div>
      </div>
      <span class="row__total">${r.total}</span>
    `;
    list.appendChild(li);
  });
}

// ---------- Settings --------------------------------------------------

function renderSettings() {
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl("tpl-settings"));

  const p = state.player || { pee_total: 0, puke_total: 0 };
  $("#peeCount").textContent  = p.pee_total || 0;
  $("#pukeCount").textContent = p.puke_total || 0;
  $("#setPlayer").textContent = state.name;
  $("#setRoom").textContent   = state.code;

  $$('[data-pee]').forEach(b => {
    b.addEventListener("click", () => bumpPenalty("pee_total", +b.dataset.pee));
  });
  $$('[data-puke="-1"]').forEach(b => {
    b.addEventListener("click", () => bumpPenalty("puke_total", -1));
  });
  $("#pukeAdd").addEventListener("click", () => confirmPuke());

  $("#leaveBtn").addEventListener("click", leaveRoom);
}

async function bumpPenalty(field, delta) {
  const cur = (state.player && state.player[field]) || 0;
  const next = Math.max(0, cur + delta);
  state.player[field] = next;
  if (field === "pee_total")  $("#peeCount") && ($("#peeCount").textContent  = next);
  if (field === "puke_total") $("#pukeCount") && ($("#pukeCount").textContent = next);

  try {
    await api("PUT", `/api/rooms/${state.code}/players/${state.playerId}`, { [field]: next });
  } catch (e) { console.warn(e); }
}

function confirmPuke() {
  const node = tpl("tpl-puke-confirm");
  document.body.appendChild(node);
  const backdrop = $(".modal-backdrop");
  const close = () => backdrop.remove();
  $("#pukeCancel").addEventListener("click", close);
  $("#pukeConfirm").addEventListener("click", () => { close(); bumpPenalty("puke_total", 1); });
}

function leaveRoom() {
  if (state.evt) state.evt.close();
  state.evt = null;
  state.playerId = null;
  state.player = null;
  state.scores = {};
  state.players = [];
  state.scoresByPlayer = {};
  renderLobby();
}

// ---------- Camera ---------------------------------------------------

async function openCamera({ onCountdownDone, onStop }) {
  const node = tpl("tpl-camera");
  document.body.appendChild(node);
  const root = $(".camera");
  const preview  = $("#camPreview");
  const replay   = $("#camReplay");
  const countEl  = $("#camCountdown");
  const timerEl  = $("#camTimer");
  const stopBtn  = $("#camStop");
  const closeBtn = $("#camClose");

  let stream = null;
  let recorder = null;
  let chunks = [];
  let blobUrl = null;
  let timerStart = null;
  let raf = null;
  let countdownTimer = null;

  const cleanup = () => {
    cancelAnimationFrame(raf);
    if (countdownTimer) clearTimeout(countdownTimer);
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch {}
    }
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    root.remove();
  };

  closeBtn.addEventListener("click", () => { cleanup(); });

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true
    });
    preview.srcObject = stream;
  } catch (e) {
    alert("Camera unavailable: " + e.message);
    cleanup();
    return () => {};
  }

  let n = 3;
  countEl.textContent = n;
  const tickCount = () => {
    n--;
    if (n > 0) {
      countEl.textContent = n;
      countdownTimer = setTimeout(tickCount, 800);
    } else {
      countEl.textContent = "GO";
      countdownTimer = setTimeout(() => {
        countEl.style.display = "none";
        beginRecord();
      }, 500);
    }
  };
  countdownTimer = setTimeout(tickCount, 800);

  const beginRecord = () => {
    chunks = [];
    try {
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: chunks[0]?.type || "video/webm" });
        blobUrl = URL.createObjectURL(blob);
        preview.style.display = "none";
        replay.src = blobUrl;
        replay.style.display = "block";
      };
      recorder.start();
    } catch (e) {
      console.warn("MediaRecorder not supported:", e);
    }

    stopBtn.style.display = "inline-block";
    timerStart = performance.now();
    const tick = () => {
      const t = (performance.now() - timerStart) / 1000;
      timerEl.textContent = t.toFixed(1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    if (typeof onCountdownDone === "function") onCountdownDone();
  };

  stopBtn.addEventListener("click", () => {
    cancelAnimationFrame(raf);
    if (recorder && recorder.state === "recording") recorder.stop();
    stopBtn.style.display = "none";
    if (typeof onStop === "function") onStop();
  });

  return cleanup;
}

// ---------- utils -----------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}
