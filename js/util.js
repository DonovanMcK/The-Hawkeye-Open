/* util.js — math helpers, seeded RNG, AABB, WebAudio synth engine.
   No external deps except THREE (loaded before this). Attaches helpers to window.U. */
(function () {
  'use strict';

  var U = {};

  // ---- math ----
  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.invlerp = function (a, b, v) { return (v - a) / (b - a); };
  U.smoothstep = function (t) { return t * t * (3 - 2 * t); };
  U.rad = function (d) { return d * Math.PI / 180; };
  U.deg = function (r) { return r * 180 / Math.PI; };
  U.TAU = Math.PI * 2;
  // shortest signed angle from a to b
  U.angleDiff = function (a, b) {
    var d = (b - a) % U.TAU;
    if (d < -Math.PI) d += U.TAU;
    if (d > Math.PI) d -= U.TAU;
    return d;
  };
  U.approachAngle = function (cur, target, maxStep) {
    var d = U.angleDiff(cur, target);
    if (d > maxStep) d = maxStep;
    if (d < -maxStep) d = -maxStep;
    return cur + d;
  };
  U.dist2 = function (ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
  U.dist = function (ax, az, bx, bz) { return Math.sqrt(U.dist2(ax, az, bx, bz)); };

  // ---- color lerp (hex strings) ----
  U.hexToRgb = function (h) {
    h = h.replace('#', '');
    return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
  };
  U.lerpColor = function (h1, h2, t) {
    var a = U.hexToRgb(h1), b = U.hexToRgb(h2);
    var r = Math.round(U.lerp(a.r, b.r, t)), g = Math.round(U.lerp(a.g, b.g, t)), bl = Math.round(U.lerp(a.b, b.b, t));
    return (r << 16) | (g << 8) | bl;
  };
  U.hexInt = function (h) { var c = U.hexToRgb(h); return (c.r << 16) | (c.g << 8) | c.b; };

  // ---- seeded RNG (mulberry32) ----
  U.makeRng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // global game rng (reseeded in game init)
  U.rng = Math.random;
  U.rand = function (a, b) { return a + (b - a) * U.rng(); };
  U.randInt = function (a, b) { return Math.floor(U.rand(a, b + 1)); };
  U.pick = function (arr) { return arr[Math.floor(U.rng() * arr.length)]; };
  U.chance = function (p) { return U.rng() < p; };

  // ---- AABB ----
  // box: {minX,maxX,minZ,maxZ}
  U.aabbOverlap = function (a, b) {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
  };
  U.pointInAabb = function (x, z, b) {
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  };
  // push a circle (cx,cz,r) out of an AABB; returns {x,z,hit}
  U.resolveCircleAabb = function (cx, cz, r, b) {
    var nx = U.clamp(cx, b.minX, b.maxX);
    var nz = U.clamp(cz, b.minZ, b.maxZ);
    var dx = cx - nx, dz = cz - nz;
    var d2 = dx * dx + dz * dz;
    if (d2 > r * r) return { x: cx, z: cz, hit: false };
    if (d2 > 1e-6) {
      var d = Math.sqrt(d2);
      var push = (r - d);
      return { x: cx + (dx / d) * push, z: cz + (dz / d) * push, hit: true };
    }
    // center inside box: push out nearest face
    var left = cx - b.minX, right = b.maxX - cx, top = cz - b.minZ, bot = b.maxZ - cz;
    var m = Math.min(left, right, top, bot);
    if (m === left) return { x: b.minX - r, z: cz, hit: true };
    if (m === right) return { x: b.maxX + r, z: cz, hit: true };
    if (m === top) return { x: cx, z: b.minZ - r, hit: true };
    return { x: cx, z: b.maxZ + r, hit: true };
  };

  // ---- canvas texture helpers ----
  U.canvasTex = function (w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    draw(ctx, w, h);
    var t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };

  // ===================================================================
  // Audio synth engine
  // ===================================================================
  function AudioEngine() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ready = false;
    this._noiseBuf = null;
  }
  AudioEngine.prototype.unlock = function () {
    if (this.ready) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // pre-bake noise buffer (1s)
      var sr = this.ctx.sampleRate;
      var buf = this.ctx.createBuffer(1, sr, sr);
      var d = buf.getChannelData(0);
      for (var i = 0; i < sr; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
      this.ready = true;
    } catch (e) { /* audio not available */ }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };
  AudioEngine.prototype.setMuted = function (m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  };
  AudioEngine.prototype.now = function () { return this.ctx ? this.ctx.currentTime : 0; };
  // simple tone
  AudioEngine.prototype.blip = function (freq, dur, type, vol, slideTo) {
    if (!this.ready || this.muted) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  };
  // filtered noise burst (for gunshots, explosions)
  AudioEngine.prototype.noise = function (dur, vol, filterType, freq, q) {
    if (!this.ready || this.muted) return;
    var t = this.ctx.currentTime;
    var src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    var f = this.ctx.createBiquadFilter();
    f.type = filterType || 'lowpass';
    f.frequency.value = freq || 1000;
    f.Q.value = q || 1;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  };
  AudioEngine.prototype.sub = function (freq, dur, vol) {
    if (!this.ready || this.muted) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
    g.gain.setValueAtTime(vol || 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  };

  // named sfx with light variation / throttling
  AudioEngine.prototype._last = {};
  AudioEngine.prototype.throttle = function (key, ms) {
    var n = performance.now();
    if (this._last[key] && n - this._last[key] < ms) return false;
    this._last[key] = n; return true;
  };
  AudioEngine.prototype.sfx = function (name) {
    if (!this.ready || this.muted) return;
    var v = 1 + (Math.random() * 0.12 - 0.06); // pitch variation factor
    switch (name) {
      case 'pistol': this.noise(0.08, 0.35, 'highpass', 900); this.blip(420 * v, 0.06, 'square', 0.18, 120); break;
      case 'deagle': this.noise(0.14, 0.5, 'lowpass', 1400); this.sub(160, 0.18, 0.5); break;
      case 'uzi': this.noise(0.05, 0.22, 'highpass', 1100 * v); this.blip(360 * v, 0.03, 'square', 0.12, 160); break;
      case 'ak': this.noise(0.07, 0.32, 'bandpass', 800 * v, 2); this.blip(220 * v, 0.05, 'sawtooth', 0.14, 90); break;
      case 'minigun': this.noise(0.04, 0.2, 'highpass', 1300 * v); break;
      case 'shotgun': this.noise(0.18, 0.5, 'lowpass', 900); this.sub(120, 0.12, 0.4); break;
      case 'sniper': this.noise(0.2, 0.55, 'bandpass', 700, 3); this.sub(150, 0.2, 0.5); break;
      case 'rpgwhoosh': this.noise(0.5, 0.3, 'bandpass', 600, 1); break;
      case 'explosion': this.noise(0.6, 0.7, 'lowpass', 700); this.sub(80, 0.6, 0.7); this.noise(0.4, 0.4, 'highpass', 400); break;
      case 'reload': this.blip(800, 0.04, 'square', 0.12); setTimeout(this.blip.bind(this, 600, 0.05, 'square', 0.12), 90); break;
      case 'punch': this.noise(0.08, 0.3, 'lowpass', 400); this.blip(120, 0.06, 'sine', 0.2, 60); break;
      case 'scream': this.blip(700 * v, 0.3, 'sawtooth', 0.18, 400); break;
      case 'radio': this.blip(1200, 0.05, 'square', 0.15); setTimeout(this.blip.bind(this, 900, 0.05, 'square', 0.12), 70); break;
      case 'horn': this.blip(330, 0.4, 'sawtooth', 0.2); this.blip(440, 0.4, 'sawtooth', 0.15); break;
      case 'crash': this.noise(0.18, 0.45, 'lowpass', 500); this.blip(90, 0.12, 'square', 0.25, 50); break;
      case 'cash': this.blip(900, 0.06, 'square', 0.18); setTimeout(this.blip.bind(this, 1300, 0.1, 'square', 0.16), 70); break;
      case 'recruit': this.blip(500, 0.1, 'square', 0.18); setTimeout(this.blip.bind(this, 760, 0.12, 'square', 0.18), 90); break;
      case 'alarm': this.blip(880, 0.25, 'sawtooth', 0.2); setTimeout(this.blip.bind(this, 620, 0.25, 'sawtooth', 0.2), 250); break;
      case 'wasted': this.blip(440, 0.4, 'sine', 0.25, 220); setTimeout(this.blip.bind(this, 330, 0.6, 'sine', 0.25, 165), 350); break;
      case 'busted': this.blip(400, 0.4, 'triangle', 0.25, 200); setTimeout(this.blip.bind(this, 300, 0.6, 'triangle', 0.25, 150), 350); break;
      case 'victory': this.blip(523, 0.18, 'square', 0.22); setTimeout(this.blip.bind(this, 659, 0.18, 'square', 0.22), 180); setTimeout(this.blip.bind(this, 784, 0.18, 'square', 0.22), 360); setTimeout(this.blip.bind(this, 1046, 0.4, 'square', 0.24), 540); break;
      case 'pickup': this.blip(660, 0.06, 'square', 0.16); setTimeout(this.blip.bind(this, 990, 0.08, 'square', 0.16), 60); break;
      case 'empty': this.blip(200, 0.04, 'square', 0.1); break;
    }
  };
  // engine loop: a continuous saw whose pitch follows speed. Managed externally.
  AudioEngine.prototype.makeEngine = function () {
    if (!this.ready) return null;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 60;
    g.gain.value = 0;
    o.connect(g); g.connect(this.master);
    o.start();
    return { osc: o, gain: g, stop: function () { try { o.stop(); } catch (e) {} } };
  };

  U.audio = new AudioEngine();
  window.U = U;
})();
