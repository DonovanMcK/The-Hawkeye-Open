/* Node smoke test: stub THREE + DOM, boot the game, run simulated frames.
   Catches runtime reference/type errors without a real browser/WebGL. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------- minimal THREE stub ----------
function Vec3(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
Vec3.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
Vec3.prototype.copy = function (v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; };
Vec3.prototype.clone = function () { return new Vec3(this.x, this.y, this.z); };
Vec3.prototype.add = function (v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; };
Vec3.prototype.sub = function (v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; };
Vec3.prototype.addScaledVector = function (v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; };
Vec3.prototype.multiplyScalar = function (s) { this.x *= s; this.y *= s; this.z *= s; return this; };
Vec3.prototype.length = function () { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); };
Vec3.prototype.normalize = function () { var l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; };
Vec3.prototype.lerp = function (v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; };

function Euler() { this.x = 0; this.y = 0; this.z = 0; }
Euler.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };

function Color(h) { this.setHex(h || 0xffffff); }
Color.prototype.setHex = function (h) { this.hex = h >>> 0; return this; };
Color.prototype.set = function (h) { this.hex = (typeof h === 'number') ? h >>> 0 : 0; return this; };
Color.prototype.copy = function (c) { this.hex = c.hex; return this; };

function Object3D() {
  this.position = new Vec3(); this.rotation = new Euler(); this.scale = new Vec3(1, 1, 1);
  this.children = []; this.visible = true; this.frustumCulled = true;
  this.add = function (c) { this.children.push(c); return this; };
  this.remove = function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); };
  this.lookAt = function () {};
}

function makeAttr(array, itemSize) { return { array: array, itemSize: itemSize, count: array.length / itemSize, needsUpdate: false }; }
function boxGeom() {
  var g = { attributes: {}, index: null };
  g.attributes.position = makeAttr(new Float32Array(72), 3); // 24 verts
  g.attributes.normal = makeAttr(new Float32Array(72), 3);
  g.attributes.uv = makeAttr(new Float32Array(48), 2);
  g.index = makeAttr(new Uint16Array(36), 1);
  g.translate = function (x, y, z) { var a = this.attributes.position.array; for (var i = 0; i < a.length; i += 3) { a[i] += x; a[i + 1] += y; a[i + 2] += z; } return this; };
  g.dispose = function () {};
  return g;
}
function simpleGeom() { return { attributes: {}, translate: function () { return this; }, dispose: function () {}, setAttribute: function (n, a) { this.attributes[n] = a; }, setIndex: function (a) { this.index = a; } }; }

var THREE = {
  Vector3: Vec3, Color: Color, Matrix4: function () { this.makeTranslation = function () { return this; }; },
  Scene: function () { Object3D.call(this); this.fog = null; },
  Fog: function (c, n, f) { this.color = new Color(c); this.near = n; this.far = f; },
  PerspectiveCamera: function (fov, asp, n, f) { Object3D.call(this); this.fov = fov; this.aspect = asp; this.near = n; this.far = f; this.updateProjectionMatrix = function () {}; },
  HemisphereLight: function (a, b, i) { Object3D.call(this); this.color = new Color(a); this.intensity = i; },
  DirectionalLight: function (c, i) { Object3D.call(this); this.color = new Color(c); this.intensity = i; },
  PointLight: function (c, i, d) { Object3D.call(this); this.color = new Color(c); this.intensity = i; this.distance = d; },
  WebGLRenderer: function () { Object3D.call(this); this.domElement = makeEl('canvas'); this.setClearColor = function () {}; this.setSize = function () {}; this.setPixelRatio = function () {}; this.render = function () {}; },
  Mesh: function (g, m) { Object3D.call(this); this.geometry = g; this.material = m; },
  Line: function (g, m) { Object3D.call(this); this.geometry = g; this.material = m; },
  Group: function () { Object3D.call(this); },
  InstancedMesh: function (g, m, n) { Object3D.call(this); this.geometry = g; this.material = m; this.count = n; this.instanceMatrix = { needsUpdate: false }; this.setMatrixAt = function () {}; },
  BoxGeometry: function () { return boxGeom(); },
  PlaneGeometry: function () { return simpleGeom(); },
  CircleGeometry: function () { return simpleGeom(); },
  CylinderGeometry: function () { return simpleGeom(); },
  ConeGeometry: function () { return simpleGeom(); },
  SphereGeometry: function () { return simpleGeom(); },
  BufferGeometry: function () { return simpleGeom(); },
  BufferAttribute: function (array, itemSize) { return makeAttr(array, itemSize); },
  MeshLambertMaterial: function (o) { o = o || {}; this.color = new Color(o.color); this.emissive = new Color(o.emissive || 0); this.emissiveMap = o.emissiveMap; this.emissiveIntensity = o.emissiveIntensity || 0; this.map = o.map; this.opacity = o.opacity == null ? 1 : o.opacity; this.transparent = o.transparent; this.side = o.side; this.depthWrite = o.depthWrite; },
  MeshBasicMaterial: function (o) { o = o || {}; this.color = new Color(o.color); this.opacity = o.opacity == null ? 1 : o.opacity; this.transparent = o.transparent; this.side = o.side; this.depthWrite = o.depthWrite; },
  LineBasicMaterial: function (o) { o = o || {}; this.color = new Color(o.color); this.opacity = 1; this.transparent = o.transparent; },
  CanvasTexture: function (c) { this.image = c; this.needsUpdate = false; this.wrapS = 0; this.wrapT = 0; },
  Sprite: function (m) { Object3D.call(this); this.material = m; this.renderOrder = 0; },
  SpriteMaterial: function (o) { o = o || {}; this.map = o.map; this.transparent = o.transparent; this.depthTest = o.depthTest; this.fog = o.fog; },
  Clock: function () { this.getDelta = function () { return 0.016; }; },
  DoubleSide: 2, RepeatWrapping: 1000,
};

// ---------- DOM stub ----------
function makeCtx() {
  var noop = function () {};
  return { clearRect: noop, fillRect: noop, fillText: noop, strokeText: noop, strokeRect: noop, beginPath: noop, arc: noop, clip: noop, save: noop, restore: noop, translate: noop, rotate: noop, moveTo: noop, lineTo: noop, stroke: noop, setLineDash: noop, closePath: noop, fill: noop, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '' };
}
function makeEl(tag) {
  var el = {
    tag: tag, width: 100, height: 100, style: {}, _text: '', innerHTML: '', value: '',
    children: [], onclick: null,
    getContext: function () { return makeCtx(); },
    addEventListener: function (t, fn) { (this._ev || (this._ev = {}))[t] = fn; },
    removeEventListener: noop2,
    appendChild: function (c) { this.children.push(c); },
    classList: { add: noop2, remove: noop2, contains: function () { return false; } },
    querySelectorAll: function () { return []; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 100, height: 100 }; },
    requestPointerLock: noop2,
  };
  Object.defineProperty(el, 'textContent', { get: function () { return this._text; }, set: function (v) { this._text = v; } });
  return el;
}
function noop2() {}
var elements = {};
function getEl(id) { return elements[id] || (elements[id] = makeEl('div')); }
var document = {
  createElement: function (t) { return makeEl(t); },
  getElementById: getEl,
  addEventListener: function (t, fn) { domHandlers[t] = fn; },
  body: makeEl('body'),
  pointerLockElement: null,
  exitPointerLock: noop2,
};
var domHandlers = {};

// ---------- window/global stubs ----------
var rafCb = null;
var sandbox = {
  THREE: THREE,
  document: document,
  navigator: { maxTouchPoints: process.env.TOUCH ? 5 : 0 },
  location: { search: '', reload: noop2 },
  performance: { now: function () { return Date.now(); } },
  requestAnimationFrame: function (cb) { rafCb = cb; return 1; },
  cancelAnimationFrame: noop2,
  // run timeouts synchronously so respawn/fade flows complete inside the frame loop
  setTimeout: function (fn) { try { fn(); } catch (e) { console.error('timeout cb error:', e); process.exitCode = 1; } return 0; },
  clearTimeout: noop2,
  console: console,
  Float32Array: Float32Array, Uint16Array: Uint16Array, Uint32Array: Uint32Array,
  Math: Math, Date: Date, JSON: JSON, parseInt: parseInt, parseFloat: parseFloat,
  isNaN: isNaN, Object: Object, Array: Array,
  setInterval: function () { return 0; }, clearInterval: noop2,
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.AudioContext = undefined; sandbox.webkitAudioContext = undefined;
sandbox.addEventListener = function (t, fn) { domHandlers['win_' + t] = fn; };
sandbox.removeEventListener = noop2;
vm.createContext(sandbox);

// ---------- load game files in order ----------
var files = ['js/util.js', 'js/config.js', 'js/city.js', 'js/peds.js', 'js/vehicles.js', 'js/player.js', 'js/hud.js', 'js/game.js'];
var root = path.resolve(__dirname, '..');
files.forEach(function (f) {
  var code = fs.readFileSync(path.join(root, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
});

// ---------- boot ----------
var G = sandbox.G, U = sandbox.U;
function fail(stage, e) { console.error('FAIL at ' + stage + ':\n', e && e.stack ? e.stack : e); process.exit(1); }

try { (domHandlers['win_DOMContentLoaded'] || domHandlers['DOMContentLoaded'])(); } catch (e) { fail('init/DOMContentLoaded', e); }
console.log('init OK. peds=' + G.peds.length + ' vehicles=' + G.vehicles.length + ' territories=' + G.city.territories.length + ' buildings=' + G.city.buildings.length);

// start
try { getEl('start')._ev.click(); } catch (e) { fail('startGame', e); }
console.log('started=' + G.started);

// drive frames, injecting actions
function frame() { if (rafCb) { var cb = rafCb; rafCb = null; cb(); } }

try {
  for (var i = 0; i < 600; i++) {
    // wander a bit
    G.input.keys['KeyW'] = (i % 3 !== 0);
    G.input.keys['ShiftLeft'] = true; // sprint when moving (run skill)
    G.input.yaw += 0.01;
    if (i === 20) { G.input.mouseDown = true; }                 // start firing pistol
    if (i === 40) { G.player.selectSlot(6); }                   // AK
    if (i === 60) { G.player.selectSlot(5); }                   // shotgun
    if (i === 80) { G.player.giveWeapon('rpg', 4); G.player.selectSlot(8); } // RPG (projectile)
    if (i === 100) { G.input.mouseDown = false; }
    if (i === 110) { G.addHeat(2500); }                         // force 6 stars -> spawn cops/cars/swat
    if (i === 150) { G.player.selectSlot(7); G.input.rmbDown = true; } // sniper scope
    if (i === 170) { G.input.rmbDown = false; G.player.selectSlot(9); G.player.weapons.minigun.owned = true; G.player.weapons.minigun.mag = 100; }
    if (i === 200) { G.player.selectSlot(1); G.input.mouseDown = true; } // fists
    if (i === 210) { G.input.mouseDown = false; }
    // spawn a rival near player and kill it 3x to trigger war logic
    if (i === 230 || i === 232 || i === 234) {
      var terr = null; for (var t = 0; t < G.city.territories.length; t++) { if (G.city.territories[t].owner === 'ballas') { terr = G.city.territories[t]; break; } }
      if (terr) { G.player.x = terr.cx; G.player.z = terr.cz; var rv = G.pedPool.acquire('ballas', terr.cx + 2, terr.cz + 2); G.peds.push(rv); rv.die(G.player); }
    }
    if (i === 250) { G.combat.explosion(G.player.x + 3, G.player.z); } // explosion path
    // recruit: spawn grove and recruit
    if (i === 270) { var gp = G.pedPool.acquire('grove', G.player.x + 1, G.player.z + 1); G.peds.push(gp); G.player.recruitAction(); }
    if (i === 290) { var car = G.vehiclePool.acquire('sedan', G.player.x + 2, G.player.z, 0); G.vehicles.push(car); car.driver = { npc: true }; G.player.enterExit(); }
    if (i >= 291 && i < 320) { G.input.keys['KeyW'] = true; } // drive
    if (i === 320) { G.player.enterExit(); } // exit
    // --- feature pack tests ---
    if (i === 325) { G.startBounty(); }
    if (i === 327 && G.mission) { G.mission.target.die(G.player); } // bounty collect
    if (i === 330) { G.startRampage(); }
    if (i === 332) { var rk2 = G.pedPool.acquire('ballas', G.player.x + 1, G.player.z); G.peds.push(rk2); rk2.die(G.player); } // rampage kill count
    if (i === 335) { var tx = G.vehiclePool.acquire('taxi', G.player.x + 2, G.player.z, 0); G.vehicles.push(tx); G.player.enterCar(tx); } // taxi -> fare
    if (i === 336) { G.player.selectSlot(2); G.input.mouseDown = true; } // drive-by (pistol from car)
    if (i === 337 && G.fare) { var tc = G.player.inCar; tc.x = G.fare.x; tc.z = G.fare.z; } // deliver fare
    if (i === 344) { G.input.mouseDown = false; }
    if (i === 345 && G.player.inCar) { G.player.exitCar(); } // cancels chained fare
    if (i === 350) { G.cycleRadio(); G.cycleRadio(); G.cycleRadio(); } // through stations + off
    if (i === 355) { var bk = G.vehiclePool.acquire('bike', G.player.x + 2, G.player.z, 0); G.vehicles.push(bk); G.player.enterCar(bk); }
    if (i >= 356 && i < 395) { G.input.keys['KeyW'] = true; } // ride the bike (drive skill)
    if (i === 395 && G.player.inCar) { G.player.exitCar(); }
    if (i === 470) { G.player.takeDamage(900, null); } // wasted path (after vest+150hp)
    if (i === 400) { G.togglePause(); }
    if (i === 410) { G.togglePause(); }
    if (i === 420) { G.toggleMap(); }
    if (i === 430) { G.toggleMap(); }
    if (i === 450) { G.hud.openAmmu(); G.hud.buy('gun', 'deagle'); G.hud.buy('clip', 'pistol'); G.hud.closeAmmu(); }
    // win path: give all territories to grove and capture-check
    if (i === 500) { for (var w = 0; w < G.city.territories.length; w++) G.city.setTerritoryOwner(G.city.territories[w], 'grove'); G.onWin(); }
    frame();
  }
} catch (e) { fail('frame loop', e); }

console.log('frames OK. money=' + Math.floor(G.money) + ' stars=' + G.stars + ' respect=' + G.respect + ' kills=' + G.kills + ' crew=' + G.crew.length + ' grove=' + G.groveCount() + ' won=' + G._won);
console.log('features: rampageKills=' + G.rampage.kills + ' skills=' + JSON.stringify({ run: Math.floor(G.skills.run), shoot: Math.floor(G.skills.shoot), drive: Math.floor(G.skills.drive) }) + ' mission=' + (G.mission ? 'active' : 'done') + ' fare=' + (G.fare ? 'active' : 'none'));
console.log('peds=' + G.peds.length + ' vehicles=' + G.vehicles.length + ' particles=' + G.particles.length + ' bullets=' + G.bullets.length);
console.log('SMOKE TEST PASSED');
