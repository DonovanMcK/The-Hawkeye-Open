/* game.js — init, main loop, combat, director, wanted, wars, day/night, win/lose. */
(function () {
  'use strict';
  var G = window.G, U = window.U;
  var V3 = THREE.Vector3;

  // =====================================================================
  // INIT
  // =====================================================================
  function init() {
    G.input.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || location.search.indexOf('touch=1') >= 0;
    U.rng = U.makeRng(12345);
    var renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x7ec8e3);
    document.getElementById('game').appendChild(renderer.domElement);
    G.renderer = renderer;
    var scene = new THREE.Scene(); G.scene = scene;
    var cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 320); G.camera = cam;
    scene.fog = new THREE.Fog(0x7ec8e3, G.cfg.FOG_NEAR, G.cfg.FOG_FAR);

    // lights
    G.hemi = new THREE.HemisphereLight(0xbfe0ef, 0x404040, 0.9); scene.add(G.hemi);
    G.sun = new THREE.DirectionalLight(0xfff5d6, 1.0); G.sun.position.set(40, 80, 20); scene.add(G.sun);
    // lamp point-light pool (8)
    G.lampLights = [];
    for (var i = 0; i < 8; i++) { var pl = new THREE.PointLight(0xffd27a, 0, 22); pl.position.set(0, 6, 0); scene.add(pl); G.lampLights.push(pl); }

    // city
    var city = new G.City(); city.build(); G.city = city;

    // player at a grove territory corner
    var groveT = null;
    for (var t = 0; t < city.territories.length; t++) if (city.territories[t].owner === 'grove') { groveT = city.territories[t]; break; }
    G.player = new G.Player(); G.player.build();
    G.player.x = groveT ? groveT.cx : 0; G.player.z = groveT ? groveT.cz + 10 : 0;
    var safe = city.collide(G.player.x, G.player.z, 0.5); G.player.x = safe.x; G.player.z = safe.z;
    G.player.setupInput(renderer.domElement);

    // Grove HQ marker (green ring near home flag) — walk in for bounty missions
    if (groveT) {
      var hqRing = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 6, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x3da35d, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      var hqSafe = city.collide(groveT.cx + 6, groveT.cz, 0.6);
      hqRing.position.set(hqSafe.x, 3, hqSafe.z); scene.add(hqRing);
      G.hqMarker = { x: hqSafe.x, z: hqSafe.z, ring: hqRing };
    }

    // helicopter parked at Grove HQ pad
    if (G.hqMarker) {
      var hp = city.collide(G.hqMarker.x + 10, G.hqMarker.z + 10, 2.4);
      var heli = G.vehiclePool.acquire('heli', hp.x, hp.z, 0); G.vehicles.push(heli);
    }

    // objective sky beacons (tall translucent columns visible over buildings)
    function makeBeacon(color) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 70, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
      m.position.y = 35; m.visible = false; scene.add(m); return m;
    }
    G.beaconMission = makeBeacon(0xff2020);
    G.beaconFare = makeBeacon(0xffe000);

    // stunt ramps along roads
    var rampMat = new THREE.MeshLambertMaterial({ color: 0xb5b0a6 });
    var rampGeo = new THREE.BoxGeometry(4.4, 2.4, 7);
    for (var ri = 0; ri < 10; ri++) {
      var rx = G.city.worldMin + U.rand(0.15, 0.85) * city.span;
      var rz = G.city.worldMin + (U.randInt(1, G.cfg.BLOCKS - 1)) * city.period + (U.chance(0.5) ? 3 : -3);
      if (!city.onRoad(rx, rz)) { rz = G.city.worldMin + U.randInt(1, G.cfg.BLOCKS - 1) * city.period; }
      var rm = new THREE.Mesh(rampGeo, rampMat);
      var rdir = U.chance(0.5) ? 0 : Math.PI / 2;
      rm.position.set(rx, -0.7, rz);
      rm.rotation.y = rdir; rm.rotation.x = -0.32;
      scene.add(rm);
      G.ramps.push({ x: rx, z: rz });
    }

    initPools();
    G.hud.init();

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });

    // start screen
    document.getElementById('start').addEventListener('click', startGame);
    document.getElementById('start').addEventListener('touchend', function (e) { e.preventDefault(); startGame(); }, { passive: false });

    // prime a few frames render so it's not black behind start screen
    director.populate(true);
    renderer.render(scene, cam);

    G.clock = new THREE.Clock();
    requestAnimationFrame(loop);
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    var ih = Math.min(G.cfg.INTERNAL_H, h);
    var iw = Math.round(ih * (w / h));
    G.renderer.setSize(iw, ih, false);
    var c = G.renderer.domElement;
    c.style.width = '100%'; c.style.height = '100%';
    G.camera.aspect = iw / ih; G.camera.updateProjectionMatrix();
  }

  function startGame() {
    if (G.started) return;
    G.started = true; G.stats.startTime = performance.now();
    U.audio.unlock();
    document.getElementById('start').style.display = 'none';
    var dom = G.renderer.domElement;
    if (!G.input.touch && dom.requestPointerLock) { try { dom.requestPointerLock(); } catch (e) {} }
    G.notify('GROVE STREET — TAKE THE CITY');
  }

  // =====================================================================
  // POOLS: particles, tracers, pickups
  // =====================================================================
  var particlePool = [], tracerPool = [], pickupPool = [], rocketPool = [];
  function initPools() {
    for (var i = 0; i < G.cfg.CAP_PARTICLE; i++) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      m.visible = false; G.scene.add(m); particlePool.push({ mesh: m, active: false });
    }
    for (var j = 0; j < G.cfg.CAP_BULLET; j++) {
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffcc, transparent: true }));
      line.visible = false; line.frustumCulled = false; G.scene.add(line); tracerPool.push({ line: line, active: false, t: 0 });
    }
    for (var k = 0; k < 40; k++) {
      var pg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222200, emissiveIntensity: 0.5 }));
      pg.visible = false; G.scene.add(pg); pickupPool.push({ mesh: pg, active: false });
    }
    for (var r = 0; r < 6; r++) {
      var rk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
      rk.rotation.x = Math.PI / 2; rk.visible = false; G.scene.add(rk); rocketPool.push({ mesh: rk, active: false });
    }
  }

  G.spawnParticle = function (type, x, y, z) {
    var p = null; for (var i = 0; i < particlePool.length; i++) if (!particlePool[i].active) { p = particlePool[i]; break; }
    if (!p) return;
    p.active = true; var m = p.mesh; m.visible = true;
    var col = 0x999999, life = 0.8, size = 1, vy = 1, grav = 0;
    if (type === 'smoke') { col = 0x888888; life = 1.2; vy = 2; size = 1.2; }
    else if (type === 'fire') { col = 0xff7722; life = 0.5; vy = 2.5; size = 1; }
    else if (type === 'explosion') { col = 0xffaa33; life = 0.6; vy = 3; size = 3; }
    else if (type === 'muzzle') { col = 0xffee88; life = 0.05; vy = 0; size = 0.8; }
    else if (type === 'blood') { col = 0x661111; life = 6; vy = 0; size = 0.8; grav = 0; }
    else if (type === 'spark') { col = 0xffcc44; life = 0.3; vy = 1; size = 0.3; }
    else if (type === 'firework') { col = U.pick([0x3da35d, 0xffffff, 0xffe000]); life = 1.2; vy = 6; size = 0.5; }
    m.material.color.setHex(col); m.material.opacity = 1;
    m.scale.set(size, size, size);
    if (type === 'blood') { m.rotation.set(-Math.PI / 2, 0, 0); m.position.set(x, 0.05, z); }
    else { m.rotation.set(0, 0, 0); m.position.set(x, y, z); }
    p.type = type; p.life = life; p.maxLife = life;
    p.vx = (type === 'blood' || type === 'muzzle') ? 0 : U.rand(-1.5, 1.5);
    p.vz = (type === 'blood' || type === 'muzzle') ? 0 : U.rand(-1.5, 1.5);
    p.vy = vy * U.rand(0.6, 1.2); p.grav = grav;
    G.particles.push(p);
  };

  function updateParticles(dt) {
    for (var i = G.particles.length - 1; i >= 0; i--) {
      var p = G.particles[i]; p.life -= dt;
      if (p.life <= 0) { p.active = false; p.mesh.visible = false; G.particles.splice(i, 1); continue; }
      var m = p.mesh;
      if (p.type !== 'blood') {
        m.position.x += p.vx * dt; m.position.y += p.vy * dt; m.position.z += p.vz * dt;
        p.vy -= (p.type === 'firework' ? 8 : 2) * dt;
        m.lookAt(G.camera.position);
        if (p.type === 'smoke' || p.type === 'explosion') m.scale.multiplyScalar(1 + dt * 1.5);
      }
      m.material.opacity = U.clamp(p.life / p.maxLife, 0, 1) * (p.type === 'blood' ? 0.8 : 1);
    }
  }

  function spawnTracer(ox, oy, oz, ex, ey, ez) {
    var tr = null; for (var i = 0; i < tracerPool.length; i++) if (!tracerPool[i].active) { tr = tracerPool[i]; break; }
    if (!tr) return;
    tr.active = true; tr.t = 0.06; tr.line.visible = true;
    var arr = tr.line.geometry.attributes.position.array;
    arr[0] = ox; arr[1] = oy; arr[2] = oz; arr[3] = ex; arr[4] = ey; arr[5] = ez;
    tr.line.geometry.attributes.position.needsUpdate = true;
    tr.line.material.opacity = 1;
    G.bullets.push(tr);
  }
  function updateTracers(dt) {
    for (var i = G.bullets.length - 1; i >= 0; i--) {
      var tr = G.bullets[i]; tr.t -= dt; tr.line.material.opacity = U.clamp(tr.t / 0.06, 0, 1);
      if (tr.t <= 0) { tr.active = false; tr.line.visible = false; G.bullets.splice(i, 1); }
    }
  }

  // =====================================================================
  // PICKUPS
  // =====================================================================
  G.spawnPickup = function (type, x, z, value, weaponId) {
    var pk = null; for (var i = 0; i < pickupPool.length; i++) if (!pickupPool[i].active) { pk = pickupPool[i]; break; }
    if (!pk) return;
    pk.active = true; pk.type = type; pk.value = value || 0; pk.weaponId = weaponId || null; pk.bob = 0;
    var col = 0x33cc33;
    if (type === 'ammo') col = 0xcccc33; else if (type === 'gun') col = 0x884422; else if (type === 'armor') col = 0xbbbbbb;
    else if (type === 'rampage') col = 0xff2222; else if (type === 'beast') col = 0x9b30ff;
    var safe = G.city.collide(x, z, 0.4);
    pk.mesh.material.color.setHex(col); pk.mesh.visible = true; pk.mesh.position.set(safe.x, 1, safe.z);
    pk.respawn = (type === 'gun' || type === 'ammo') && weaponId === undefined ? 0 : 0;
    G.pickups.push(pk);
  };
  function updatePickups(dt) {
    var p = G.player;
    for (var i = G.pickups.length - 1; i >= 0; i--) {
      var pk = G.pickups[i]; pk.bob += dt; pk.mesh.rotation.y += dt * 2;
      pk.mesh.position.y = 1 + Math.sin(pk.bob * 3) * 0.2;
      if (!p.inCar && U.dist(p.x, p.z, pk.mesh.position.x, pk.mesh.position.z) < 1.6) {
        collect(pk); pk.active = false; pk.mesh.visible = false; G.pickups.splice(i, 1);
      }
    }
  }
  function collect(pk) {
    if (pk.type === 'cash') { G.money += pk.value; U.audio.sfx('pickup'); }
    else if (pk.type === 'ammo') { var w = G.player.curWeapon(); if (w.ammo) G.player.addAmmo(G.player.slot, w.mag); else G.player.addAmmo('pistol', 17); U.audio.sfx('pickup'); }
    else if (pk.type === 'gun') { G.player.giveWeapon(pk.weaponId, G.weaponById[pk.weaponId].mag * 2); U.audio.sfx('pickup'); }
    else if (pk.type === 'armor') { G.player.armor = G.player.maxArmor; U.audio.sfx('pickup'); G.notify('ARMOR +100'); }
    else if (pk.type === 'rampage') { G.startRampage(); }
    else if (pk.type === 'beast') { G.startBeast(); }
  }

  // =====================================================================
  // BEAST MODE — 30s of one-punch kills
  // =====================================================================
  G.startBeast = function () {
    if (G.beast.active) return;
    G.beast = { active: true, t: 30 };
    G.notify('BEAST MODE! ONE-PUNCH KILLS — 30s'); U.audio.sfx('alarm');
  };
  function updateBeast(dt) {
    if (!G.beast.active) return;
    G.beast.t -= dt;
    if (G.beast.t <= 0) { G.beast.active = false; G.notify('BEAST MODE OVER'); }
  }

  // =====================================================================
  // HELI MAGNET — hook a car, fly it, drop it
  // =====================================================================
  G.heliMagnet = function () {
    var h = G.player.inCar; if (!h || !h.isHeli) return;
    if (G.magnetCar) {
      var c = G.magnetCar; c.carriedBy = null; c.airborne = true; c.vy = 0; c.airT = 0;
      G.magnetCar = null; G.notify('BOMBS AWAY!');
      return;
    }
    if (h.y < 4) { G.notify('GET HIGHER TO HOOK A CAR'); return; }
    var best = null, bd = 8;
    for (var i = 0; i < G.vehicles.length; i++) {
      var v = G.vehicles[i];
      if (!v.active || v.wreck || v.isHeli || v === h || v.airborne || v.occupants.length) continue;
      var d = U.dist(v.x, v.z, h.x, h.z);
      if (d < bd) { bd = d; best = v; }
    }
    if (best) { best.carriedBy = h; G.magnetCar = best; G.notify('CAR HOOKED — E/G TO DROP'); U.audio.sfx('pickup'); }
    else G.notify('NO CAR BELOW');
  };

  // =====================================================================
  // RIVAL CONVOY EVENT
  // =====================================================================
  G.startConvoy = function () {
    if (G.convoy) return;
    var gang = U.pick(['ballas', 'vagos']);
    var pt = director.randEdgePoint(50, 70);
    var snapped = snapToRoad(pt.x, pt.z);
    if (!snapped) return;
    var cars = [];
    var dx = Math.sin(snapped.angle), dz = Math.cos(snapped.angle);
    for (var k = 0; k < 3; k++) {
      if (G.vehicles.length >= G.cfg.CAP_VEH + 3) break;
      var v = G.vehiclePool.acquire('lowrider', snapped.x - dx * k * 7, snapped.z - dz * k * 7, snapped.angle);
      G.vehicles.push(v);
      v.driver = { npc: true }; v.convoy = gang; v.hp = 160;
      v.bodyMat.color.setHex(U.hexInt(G.GANGS[gang].color));
      cars.push(v);
    }
    if (!cars.length) return;
    G.convoy = { cars: cars, t: 90, gang: gang };
    G.notify(G.GANGS[gang].name + ' CONVOY ROLLING — DESTROY IT!'); U.audio.sfx('alarm');
  };
  function updateConvoy(dt) {
    if (!G.convoy) return;
    G.convoy.t -= dt;
    var alive = 0;
    for (var i = 0; i < G.convoy.cars.length; i++) { var c = G.convoy.cars[i]; if (c.active && !c.wreck && c.convoy) alive++; }
    if (alive === 0) {
      G.money += 600; G.addRespect(10);
      G.notify('CONVOY DESTROYED! +$600'); U.audio.sfx('cash');
      G.convoy = null;
      return;
    }
    if (G.convoy.t <= 0) {
      for (var k = 0; k < G.convoy.cars.length; k++) { var ck = G.convoy.cars[k]; if (ck.active && !ck.wreck && ck.convoy) { ck.convoy = null; ck.despawn(); } }
      G.convoy = null; G.notify('CONVOY ESCAPED');
    }
  }

  // =====================================================================
  // DEATHWISH CHALLENGE — survive 5 stars for 90s, $5000 pot
  // =====================================================================
  function checkChallenge(dt) {
    G._chalCd = Math.max(0, (G._chalCd || 0) - dt);
    if (G.challenge) {
      G.challenge.t -= dt;
      if (G.heat < G.STAR_THRESHOLDS[4]) G.heat = G.STAR_THRESHOLDS[4]; // pin 5 stars
      if (G.stars < 5) G.stars = 5;
      if (G.challenge.t <= 0) {
        G.challenge = null; G._chalCd = 60;
        G.money += 5000; G.heat = 0; G.stars = 0;
        G.notify('DEATHWISH COMPLETE! +$5000'); U.audio.sfx('victory');
      }
      return;
    }
    var lm = G.city.landmarks.police;
    if (!lm || lm.markerX === undefined || G.player.inCar || G._chalCd > 0) return;
    if (U.dist(G.player.x, G.player.z, lm.markerX, lm.markerZ) < 2.5) {
      G.challenge = { t: 90 };
      G.addHeat(G.STAR_THRESHOLDS[4]);
      G.notify('DEATHWISH: SURVIVE 5 STARS FOR 90s — $5000'); U.audio.sfx('alarm');
    }
  }

  // =====================================================================
  // CHEAT CODES (type the word during play)
  // =====================================================================
  var CHEATS = {
    BIGBANG: function () { for (var i = 0; i < G.vehicles.length; i++) { var v = G.vehicles[i]; if (v.active && !v.wreck && v !== G.player.inCar) v.explode(); } },
    MOON: function () { G.lowGravity = !G.lowGravity; },
    CASHGOD: function () { G.money += 10000; },
    HESOYAM: function () { G.player.hp = G.player.maxHp; G.player.armor = G.player.maxArmor; G.money += 10000; },
    GUNS: function () { for (var i = 0; i < G.WEAPONS.length; i++) { var w = G.WEAPONS[i]; if (!w.ammo) continue; var pw = G.player.weapons[w.id]; pw.owned = true; pw.mag = w.mag; pw.reserve = w.mag * 4; } },
    CLEAN: function () { G.heat = 0; G.stars = 0; },
    WANTED: function () { G.addHeat(1500); },
  };
  G.checkCheat = function (buf) {
    for (var code in CHEATS) {
      if (buf.slice(-code.length) === code) {
        CHEATS[code]();
        G._cheatBuf = '';
        G.notify('CHEAT ACTIVATED: ' + code); U.audio.sfx('cash');
        return;
      }
    }
  };

  // =====================================================================
  // RAMPAGE — timed minigun + infinite ammo, 20 kills for a bonus
  // =====================================================================
  G.startRampage = function () {
    if (G.rampage.active) return;
    var w = G.player.weapons.minigun;
    G.rampage = { active: true, t: 60, kills: 0, prev: { owned: w.owned, mag: w.mag, reserve: w.reserve }, prevSlot: G.player.slot };
    w.owned = true; w.mag = 100; w.reserve = 9999;
    G.player.slot = 'minigun';
    G.notify('RAMPAGE! 20 KILLS IN 60s FOR $1000'); U.audio.sfx('alarm');
  };
  function updateRampage(dt) {
    var r = G.rampage; if (!r.active) return;
    r.t -= dt;
    var w = G.player.weapons.minigun;
    if (w.mag < 100) w.mag = 100; w.reserve = 9999;
    if (r.t <= 0) {
      r.active = false;
      w.owned = r.prev.owned; w.mag = r.prev.mag; w.reserve = r.prev.reserve;
      if (G.player.slot === 'minigun' && !w.owned) G.player.slot = (r.prevSlot !== 'minigun') ? r.prevSlot : 'pistol';
      if (r.kills >= 20) { G.money += 1000; G.notify('RAMPAGE COMPLETE! +$1000'); U.audio.sfx('cash'); }
      else G.notify('RAMPAGE OVER — ' + r.kills + '/20 KILLS');
    }
  }

  // =====================================================================
  // BOUNTY MISSIONS — Grove HQ marker hands out lieutenant hits
  // =====================================================================
  G.startBounty = function () {
    if (G.mission) return;
    var rivals = [];
    for (var i = 0; i < G.city.territories.length; i++) { var t = G.city.territories[i]; if (t.owner === 'ballas' || t.owner === 'vagos') rivals.push(t); }
    if (!rivals.length) return;
    // nearest rival turf so the target is reachable, not across the map
    rivals.sort(function (a, b) { return U.dist2(a.cx, a.cz, G.player.x, G.player.z) - U.dist2(b.cx, b.cz, G.player.x, G.player.z); });
    var pick = rivals[0];
    var safe = G.city.collide(pick.cx + U.rand(-25, 25), pick.cz + U.rand(-25, 25), 0.6);
    var p = G.pedPool.acquire(pick.owner, safe.x, safe.z); G.peds.push(p);
    p.hp = p.maxHp = 250; p.weapon = 'deagle'; p.armed = true; p.melee = false;
    p.bounty = true; p.mesh.scale.set(1.18, 1.18, 1.18);
    G.mission = { target: p };
    G.notify('BOUNTY: ELIMINATE THE ' + G.GANGS[pick.owner].name + ' LIEUTENANT');
    G.notify('FOLLOW THE RED LIGHT BEAM'); U.audio.sfx('radio');
  };
  G.onBountyKilled = function (p) {
    if (!G.mission || G.mission.target !== p) return;
    G.mission = null; G._bountyCd = 20;
    G.money += 500; G.addRespect(10); G.slowmoT = 0.8;
    G.notify('BOUNTY COLLECTED! +$500'); U.audio.sfx('cash');
  };
  function checkHQ(dt) {
    G._bountyCd = Math.max(0, (G._bountyCd || 0) - dt);
    var hq = G.hqMarker; if (!hq || G.mission || G._bountyCd > 0 || G.player.inCar) return;
    if (U.dist(G.player.x, G.player.z, hq.x, hq.z) < 2.5) G.startBounty();
  }

  // =====================================================================
  // TAXI FARES
  // =====================================================================
  G.startFare = function () {
    var t = U.pick(G.city.territories);
    var safe = G.city.collide(t.cx + U.rand(-15, 15), t.cz + U.rand(-15, 15), 0.6);
    G.fare = { x: safe.x, z: safe.z, t: 75 };
    G.notify('FARE: DROP OFF AT THE YELLOW $ BLIP'); U.audio.sfx('horn');
  };
  function updateFare(dt) {
    if (!G.fare) return;
    var inTaxi = G.player.inCar && G.player.inCar.arch === 'taxi' && !G.player.inCar.wreck;
    if (!inTaxi) { G.fare = null; G.notify('FARE CANCELLED'); return; }
    G.fare.t -= dt;
    if (G.fare.t <= 0) { G.fare = null; G.notify('FARE MISSED'); return; }
    if (U.dist(G.player.x, G.player.z, G.fare.x, G.fare.z) < 7) {
      G.money += 150; U.audio.sfx('cash'); G.notify('FARE DELIVERED +$150');
      G.startFare();
    }
  }

  // =====================================================================
  // RADIO (boombox: plays anywhere once on; B cycles 1 -> 2 -> off)
  // =====================================================================
  G.cycleRadio = function () {
    G.radioStation = (G.radioStation + 1) % 3;
    U.audio.setRadio(G.radioStation);
    G.notify(G.radioStation ? 'RADIO: BOUNCE FM ' + G.radioStation : 'RADIO OFF');
  };

  // =====================================================================
  // HOSPITAL — walk into the red ring to heal ($50)
  // =====================================================================
  function checkHospital(dt) {
    G._healCd = Math.max(0, (G._healCd || 0) - dt);
    var lm = G.city.landmarks.hospital;
    if (!lm || lm.markerX === undefined || G.player.inCar || G._healCd > 0) return;
    if (G.player.hp >= G.player.maxHp) return;
    if (U.dist(G.player.x, G.player.z, lm.markerX, lm.markerZ) < 2.5) {
      var cost = Math.min(50, Math.floor(G.money));
      G.money -= cost;
      G.player.hp = G.player.maxHp;
      G._healCd = 5;
      U.audio.sfx('heal');
      G.notify('PATCHED UP' + (cost ? ' — $' + cost : ' (ON THE HOUSE)'));
    }
  }

  // beacons follow the active bounty target / fare dropoff
  function updateBeacons() {
    var m = G.mission && G.mission.target && G.mission.target.alive ? G.mission.target : null;
    G.beaconMission.visible = !!m;
    if (m) { G.beaconMission.position.x = m.x; G.beaconMission.position.z = m.z; }
    G.beaconFare.visible = !!G.fare;
    if (G.fare) { G.beaconFare.position.x = G.fare.x; G.beaconFare.position.z = G.fare.z; }
  }

  // =====================================================================
  // COMBAT
  // =====================================================================
  function isHostile(shooter, target) {
    // target is ped or G.player
    var st = shooter === G.player ? 'player' : shooter.team;
    var tt = target === G.player ? 'player' : target.team;
    if (tt === 'player') {
      return st === 'civilian' || st === 'ballas' || st === 'vagos' || st === 'cop' || st === 'swat';
    }
    switch (st) {
      case 'player': return tt === 'civilian' || tt === 'ballas' || tt === 'vagos' || tt === 'cop' || tt === 'swat';
      case 'grove':
      case 'recruit': return tt === 'ballas' || tt === 'vagos' || tt === 'cop' || tt === 'swat';
      case 'cop': case 'swat': return tt === 'recruit' || tt === 'ballas' || tt === 'vagos';
      case 'ballas': case 'vagos': return tt === 'recruit' || tt === 'grove' || tt === 'cop' || tt === 'swat';
      case 'civilian': return false;
    }
    return false;
  }

  function raySphereT(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
    var mx = cx - ox, my = cy - oy, mz = cz - oz;
    var tca = mx * dx + my * dy + mz * dz;
    if (tca < 0 || tca > maxT) return -1;
    var d2 = (mx * mx + my * my + mz * mz) - tca * tca;
    if (d2 > r * r) return -1;
    return tca - Math.sqrt(r * r - d2);
  }

  function buildingBlockT(ox, oy, oz, dx, dy, dz, maxT) {
    var step = 1.0;
    for (var t = 0.5; t < maxT; t += step) {
      var x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      if (y < 0.05) return t; // ground
      if (x < G.city.worldMin || x > G.city.worldMax || z < G.city.worldMin || z > G.city.worldMax) return t;
      var boxes = G.city.queryBuildings(x, z);
      for (var b = 0; b < boxes.length; b++) {
        var bx = boxes[b];
        if (x >= bx.minX && x <= bx.maxX && z >= bx.minZ && z <= bx.maxZ && y < bx.top) return t;
      }
    }
    return maxT;
  }

  var combat = {};
  combat.blood = function (x, z) { G.spawnParticle('blood', x, 0.05, z); };

  combat.fireHitscan = function (origin, dir, w, shooter, aimAssist) {
    dir = dir.clone().normalize();
    // muzzle flash
    G.spawnParticle('muzzle', origin.x + dir.x, origin.y + dir.y, origin.z + dir.z);
    // aim assist (touch player)
    if (aimAssist && shooter === G.player) dir = snapAim(origin, dir, aimAssist, w.range);
    var maxT = w.range;
    var blockT = buildingBlockT(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxT);
    // find nearest hostile entity
    var bestT = blockT, hitEnt = null, headshot = false;
    for (var i = 0; i < G.peds.length; i++) {
      var pd = G.peds[i]; if (!pd.active || !pd.alive || pd === shooter) continue;
      if (!isHostile(shooter, pd)) continue;
      var tt = raySphereT(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, pd.x, 1.0, pd.z, 0.85, maxT);
      if (tt > 0 && tt < bestT) { bestT = tt; hitEnt = pd; headshot = (origin.y + dir.y * tt) > 1.5; }
    }
    // player as target
    if (shooter !== G.player && isHostile(shooter, G.player) && !G.player.inCar && G.player.alive) {
      var tp = raySphereT(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, G.player.x, 1.0, G.player.z, 0.85, maxT);
      if (tp > 0 && tp < bestT) { bestT = tp; hitEnt = G.player; headshot = false; }
    }
    // vehicles
    for (var v = 0; v < G.vehicles.length; v++) {
      var veh = G.vehicles[v]; if (!veh.active || veh.wreck) continue;
      var tv = raySphereT(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, veh.x, 1.0, veh.z, 2.0, maxT);
      if (tv > 0 && tv < bestT) { bestT = tv; hitEnt = veh; headshot = false; }
    }
    var ex = origin.x + dir.x * bestT, ey = origin.y + dir.y * bestT, ez = origin.z + dir.z * bestT;
    spawnTracer(origin.x, origin.y, origin.z, ex, ey, ez);
    if (hitEnt) {
      G.spawnParticle('spark', ex, ey, ez);
      var killed = false;
      if (hitEnt === G.player) G.player.takeDamage(w.dmg, shooter);
      else if (hitEnt.takeDamage && hitEnt.spawn) killed = hitEnt.takeDamage(w.dmg, headshot, shooter); // ped
      else if (hitEnt.takeDamage) hitEnt.takeDamage(w.dmg); // vehicle
      // hit feedback + shooting skill for the player
      if (shooter === G.player && hitEnt !== G.player) {
        G.skills.shoot = Math.min(100, G.skills.shoot + 0.3);
        G.hud.hitMarker(killed, headshot);
        if (U.audio.throttle('hitsfx', 70)) U.audio.sfx(killed ? 'kill' : 'hit');
      }
    }
  };

  function snapAim(origin, dir, deg, range) {
    var best = null, bestDot = Math.cos(U.rad(deg));
    for (var i = 0; i < G.peds.length; i++) {
      var pd = G.peds[i]; if (!pd.active || !pd.alive) continue;
      if (!isHostile(G.player, pd)) continue;
      var dx = pd.x - origin.x, dy = 1.0 - origin.y, dz = pd.z - origin.z;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d > range) continue;
      var dot = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
      if (dot > bestDot) { bestDot = dot; best = { x: dx / d, y: dy / d, z: dz / d }; }
    }
    return best ? new V3(best.x, best.y, best.z) : dir;
  }

  combat.pedFire = function (ped, w, target, accuracy) {
    var ty = target === G.player ? 1.0 : 1.0;
    var dx = target.x - ped.x, dy = ty - 1.5, dz = target.z - ped.z;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var dir = new V3(dx / d, dy / d, dz / d);
    // inaccuracy
    var miss = (1 - accuracy) * 0.12;
    dir.x += U.rand(-miss, miss); dir.y += U.rand(-miss, miss) * 0.4; dir.z += U.rand(-miss, miss);
    var origin = new V3(ped.x, 1.5, ped.z);
    U.audio.throttle('ped' + w.id, 60) && U.audio.sfx(w.sfx);
    if (w.pellets) { for (var p = 0; p < w.pellets; p++) combat.fireHitscan(origin, jitterDir(dir, w.spread), w, ped, 0); }
    else combat.fireHitscan(origin, jitterDir(dir, w.spread), w, ped, 0);
  };
  function jitterDir(dir, spread) {
    if (!spread) return dir;
    var s = U.rad(spread); var d = dir.clone();
    d.x += U.rand(-s, s); d.z += U.rand(-s, s); return d.normalize();
  }

  combat.playerMelee = function (origin, dir, w) {
    // hit nearest hostile within range in front
    var dmg = G.beast.active ? 999 : w.dmg;
    for (var i = 0; i < G.peds.length; i++) {
      var pd = G.peds[i]; if (!pd.active || !pd.alive) continue;
      if (pd.recruit || pd.team === 'grove') continue;
      var dx = pd.x - origin.x, dz = pd.z - origin.z; var d = Math.sqrt(dx * dx + dz * dz);
      if (d > w.range + 0.6) continue;
      var dot = (dx * dir.x + dz * dir.z) / (d || 1);
      if (dot > 0.4) {
        var killed = pd.takeDamage(dmg, false, G.player);
        if (G.beast.active) { G.camShake = Math.max(G.camShake, 0.5); if (killed) G.hud.pow(); }
        G.addHeat(G.HEAT.punch);
        return;
      }
    }
    G.addHeat(G.HEAT.punch * 0.3);
  };

  combat.spawnRocket = function (origin, dir, shooter, ignoreVeh) {
    var rk = null; for (var i = 0; i < rocketPool.length; i++) if (!rocketPool[i].active) { rk = rocketPool[i]; break; }
    if (!rk) return;
    rk.active = true; rk.mesh.visible = true;
    rk.x = origin.x + dir.x * 1.5; rk.y = origin.y + dir.y * 1.5; rk.z = origin.z + dir.z * 1.5;
    rk.dir = dir.clone().normalize(); rk.life = 4; rk.shooter = shooter; rk.smokeCd = 0;
    rk.ignoreVeh = ignoreVeh || null;
    G.rockets = G.rockets || []; G.rockets.push(rk);
  };
  function updateRockets(dt) {
    if (!G.rockets) return;
    for (var i = G.rockets.length - 1; i >= 0; i--) {
      var rk = G.rockets[i]; var spd = 40;
      rk.x += rk.dir.x * spd * dt; rk.y += rk.dir.y * spd * dt; rk.z += rk.dir.z * spd * dt;
      rk.life -= dt; rk.smokeCd -= dt;
      if (rk.smokeCd <= 0) { rk.smokeCd = 0.04; G.spawnParticle('smoke', rk.x, rk.y, rk.z); }
      rk.mesh.position.set(rk.x, rk.y, rk.z); rk.mesh.lookAt(rk.x + rk.dir.x, rk.y + rk.dir.y, rk.z + rk.dir.z);
      var hit = false;
      if (rk.y < 0.2) hit = true;
      var boxes = G.city.queryBuildings(rk.x, rk.z);
      for (var b = 0; b < boxes.length; b++) { var bx = boxes[b]; if (rk.x >= bx.minX && rk.x <= bx.maxX && rk.z >= bx.minZ && rk.z <= bx.maxZ && rk.y < bx.top) { hit = true; break; } }
      for (var v = 0; v < G.vehicles.length && !hit; v++) { var ve = G.vehicles[v]; if (ve === rk.ignoreVeh) continue; if (ve.active && !ve.wreck && U.dist(rk.x, rk.z, ve.x, ve.z) < 2.5) hit = true; }
      for (var p = 0; p < G.peds.length && !hit; p++) { var pd = G.peds[p]; if (pd.active && pd.alive && pd !== rk.shooter && U.dist(rk.x, rk.z, pd.x, pd.z) < 1.2) hit = true; }
      if (rk.life <= 0) hit = true;
      if (hit) { combat.explosion(rk.x, rk.z); rk.active = false; rk.mesh.visible = false; G.rockets.splice(i, 1); }
    }
  }

  combat.explosion = function (x, z) {
    U.audio.sfx('explosion');
    for (var i = 0; i < 8; i++) G.spawnParticle(i % 2 ? 'explosion' : 'smoke', x, 1 + U.rand(0, 1.5), z);
    G.camShake = Math.max(G.camShake, U.clamp(2 - U.dist(x, z, G.player.x, G.player.z) / 12, 0, 1.5));
    var R = 7;
    // damage peds
    for (var p = G.peds.length - 1; p >= 0; p--) {
      var pd = G.peds[p]; if (!pd.active || !pd.alive) continue;
      var d = U.dist(x, z, pd.x, pd.z); if (d < R) pd.takeDamage(120 * (1 - d / R), false, G.player);
    }
    // player
    if (G.player.alive && !G.player.inCar) { var dp = U.dist(x, z, G.player.x, G.player.z); if (dp < R) G.player.takeDamage(120 * (1 - dp / R), null); }
    // vehicles (chain)
    for (var v = 0; v < G.vehicles.length; v++) { var ve = G.vehicles[v]; if (ve.active && !ve.wreck) { var dv = U.dist(x, z, ve.x, ve.z); if (dv < R) ve.takeDamage(120 * (1 - dv / R)); } }
  };

  G.combat = combat;

  // =====================================================================
  // HEAT / RESPECT
  // =====================================================================
  G.addHeat = function (amt) {
    G.heat += amt;
    var s = 0; for (var i = 0; i < G.STAR_THRESHOLDS.length; i++) if (G.heat >= G.STAR_THRESHOLDS[i]) s = i + 1;
    if (s > G.stars) { G.stars = s; U.audio.sfx('radio'); G.notify('WANTED LEVEL ' + s); }
    else G.stars = s;
  };
  G.addRespect = function (amt) { G.respect = U.clamp(G.respect + amt, 0, 100); };

  // =====================================================================
  // GANG helpers (used by peds.js)
  // =====================================================================
  G.gang = {
    callBackup: function (ped) {
      for (var i = 0; i < G.peds.length; i++) {
        var p = G.peds[i]; if (!p.active || !p.alive || p === ped) continue;
        if (p.team === ped.team && U.dist(p.x, p.z, ped.x, ped.z) < 30 && p.state === 'wander') { p.aggro = true; p.target = G.player; p.state = 'chase'; }
      }
    },
    nearestHostile: function (x, z, r) {
      var best = null, bd = r * r;
      for (var i = 0; i < G.peds.length; i++) {
        var p = G.peds[i]; if (!p.active || !p.alive) continue;
        if (!(p.team === 'ballas' || p.team === 'vagos' || ((p.team === 'cop' || p.team === 'swat') && G.stars > 0))) continue;
        var d = U.dist2(x, z, p.x, p.z); if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
    onRivalKilled: function (ped, attacker) { war.onRivalKilled(ped); },
  };

  // =====================================================================
  // EJECT DRIVER (jacking)
  // =====================================================================
  G.ejectDriver = function (car) {
    var d = car.driver;
    car.driver = null; car.speed = 0;
    var px = car.x + Math.cos(car.angle + 1.6) * 2, pz = car.z + Math.sin(car.angle + 1.6) * 2;
    if (d && d.spawn) { // real ped driver
      d.inCar = null; d.mesh.visible = true; d.x = px; d.z = pz;
      d.scared = true; d.state = U.chance(0.6) ? 'flee' : 'fight';
    } else {
      // spawn a civilian who flees/fights
      if (G.peds.length < 80) {
        var civ = G.pedPool.acquire('civilian', px, pz); G.peds.push(civ);
        civ.scared = true; civ.state = U.chance(0.6) ? 'flee' : 'fight'; if (civ.state === 'fight') civ.melee = true;
      }
    }
    U.audio.sfx('scream');
  };

  // =====================================================================
  // DIRECTOR — spawn/despawn population around player
  // =====================================================================
  var director = {
    civTimer: 0, gangTimer: 0, vehTimer: 0, gunRespawn: {},
    populate: function (initial) {
      // seed traffic + parked cars + a few peds so first frame isn't empty
      for (var i = 0; i < 8; i++) this.spawnTraffic();
      for (var j = 0; j < 8; j++) this.spawnParked();
      for (var k = 0; k < 18; k++) this.spawnCivilian(true);
      // initial gun pickups in alleys
      for (var g = 0; g < G.city.gunSpawns.length; g++) {
        var s = G.city.gunSpawns[g];
        if (s.type === 'ammo') G.spawnPickup('ammo', s.x, s.z, 0);
        else G.spawnPickup('gun', s.x, s.z, 0, s.type);
      }
    },
    randEdgePoint: function (minD, maxD) {
      var ang = U.rand(0, U.TAU), d = U.rand(minD, maxD);
      var x = G.player.x + Math.cos(ang) * d, z = G.player.z + Math.sin(ang) * d;
      x = U.clamp(x, G.city.worldMin + 4, G.city.worldMax - 4); z = U.clamp(z, G.city.worldMin + 4, G.city.worldMax - 4);
      var safe = G.city.collide(x, z, 0.6); return { x: safe.x, z: safe.z };
    },
    spawnCivilian: function (initial) {
      if (countTeam('civilian') >= G.cfg.CAP_CIV) return;
      var pt = initial ? this.randEdgePoint(8, 50) : this.randEdgePoint(45, 75);
      var p = G.pedPool.acquire('civilian', pt.x, pt.z); G.peds.push(p);
    },
    spawnGang: function () {
      if (countGang() >= G.cfg.CAP_GANG) return;
      // find a territory near player to populate
      var terr = G.city.territoryAt(G.player.x, G.player.z);
      var nearby = [];
      for (var i = 0; i < G.city.territories.length; i++) { var t = G.city.territories[i]; if (U.dist(t.cx, t.cz, G.player.x, G.player.z) < 100 && t.owner !== 'neutral') nearby.push(t); }
      if (!nearby.length) return;
      var pick = U.pick(nearby);
      var n = U.randInt(2, 4);
      for (var k = 0; k < n; k++) {
        if (countGang() >= G.cfg.CAP_GANG) break;
        var pt = this.randEdgePoint(40, 70);
        // bias to inside picked territory
        var x = U.clamp(pick.cx + U.rand(-40, 40), pick.minX + 4, pick.maxX - 4);
        var z = U.clamp(pick.cz + U.rand(-40, 40), pick.minZ + 4, pick.maxZ - 4);
        if (U.dist(x, z, G.player.x, G.player.z) < 25 || U.dist(x, z, G.player.x, G.player.z) > 90) continue;
        var safe = G.city.collide(x, z, 0.6);
        var p = G.pedPool.acquire(pick.owner, safe.x, safe.z); G.peds.push(p);
      }
    },
    spawnTraffic: function () {
      if (countTraffic() >= 12) return;
      var pt = this.randEdgePoint(30, 70);
      // snap onto nearest road gridline
      var snapped = snapToRoad(pt.x, pt.z); if (!snapped) return;
      var arch = U.pick(['sedan', 'sedan', 'sports', 'taxi', 'lowrider', 'bike']);
      var v = G.vehiclePool.acquire(arch, snapped.x, snapped.z, snapped.angle); G.vehicles.push(v);
      v.driver = { npc: true };
    },
    spawnParked: function () {
      if (G.vehicles.length >= G.cfg.CAP_VEH) return;
      var pt = this.randEdgePoint(15, 60);
      var arch = U.pick(['sedan', 'sports', 'taxi', 'lowrider', 'bike']);
      var v = G.vehiclePool.acquire(arch, pt.x, pt.z, U.rand(0, U.TAU)); G.vehicles.push(v);
      v.driver = null;
    },
    update: function (dt) {
      this.civTimer -= dt; this.gangTimer -= dt; this.vehTimer -= dt;
      this.rampTimer = (this.rampTimer === undefined ? 45 : this.rampTimer) - dt;
      if (this.civTimer <= 0) { this.civTimer = 1.5; this.spawnCivilian(false); }
      if (this.gangTimer <= 0) { this.gangTimer = 5; this.spawnGang(); }
      if (this.vehTimer <= 0) { this.vehTimer = 4; this.spawnTraffic(); }
      if (this.rampTimer <= 0) {
        this.rampTimer = 90;
        if (!G.rampage.active && !G.beast.active) {
          var rp = this.randEdgePoint(25, 55);
          if (U.chance(0.5)) { G.spawnPickup('rampage', rp.x, rp.z, 0); G.notify('RAMPAGE PICKUP NEARBY (RED)'); }
          else { G.spawnPickup('beast', rp.x, rp.z, 0); G.notify('BEAST PICKUP NEARBY (PURPLE)'); }
        }
      }
      // rival convoy event
      this.convoyTimer = (this.convoyTimer === undefined ? 100 : this.convoyTimer) - dt;
      if (this.convoyTimer <= 0) {
        this.convoyTimer = U.rand(150, 240);
        if (!G.convoy && !(G.war && G.war.active)) G.startConvoy();
      }
      // keep one helicopter in the world: respawn at the HQ pad if destroyed
      this.heliTimer = (this.heliTimer === undefined ? 10 : this.heliTimer) - dt;
      if (this.heliTimer <= 0) {
        this.heliTimer = 20;
        var hasHeli = false;
        for (var h = 0; h < G.vehicles.length; h++) if (G.vehicles[h].active && G.vehicles[h].isHeli && !G.vehicles[h].wreck) { hasHeli = true; break; }
        if (!hasHeli && G.hqMarker) {
          var hp2 = G.city.collide(G.hqMarker.x + 10, G.hqMarker.z + 10, 2.4);
          var nh = G.vehiclePool.acquire('heli', hp2.x, hp2.z, 0); G.vehicles.push(nh);
        }
      }
      // despawn far entities (not crew/cops/war/bounty)
      var fog = G.cfg.FOG_FAR + 30;
      for (var i = G.peds.length - 1; i >= 0; i--) {
        var p = G.peds[i];
        if (p.active && p.alive && !p.recruit && !p.bounty && p.team !== 'cop' && p.team !== 'swat' && !p.warAttacker) {
          if (U.dist(p.x, p.z, G.player.x, G.player.z) > fog) p.despawn();
        }
      }
      for (var v = G.vehicles.length - 1; v >= 0; v--) {
        var ve = G.vehicles[v];
        if (ve.active && !ve.wreck && !ve.isPlayer && !ve.copCar && !ve.isHeli && U.dist(ve.x, ve.z, G.player.x, G.player.z) > fog) ve.despawn();
      }
    },
  };
  function snapToRoad(x, z) {
    var per = G.city.period, wm = G.city.worldMin;
    var gi = Math.round((x - wm) / per), gz = Math.round((z - wm) / per);
    var lineX = wm + gi * per, lineZ = wm + gz * per;
    if (Math.abs(x - lineX) < Math.abs(z - lineZ)) return { x: lineX + G.city.cfg.ROAD_W / 4, z: z, angle: U.chance(0.5) ? 0 : Math.PI };
    return { x: x, z: lineZ + G.city.cfg.ROAD_W / 4, angle: U.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 };
  }
  function countTeam(team) { var n = 0; for (var i = 0; i < G.peds.length; i++) if (G.peds[i].active && G.peds[i].team === team) n++; return n; }
  function countGang() { var n = 0; for (var i = 0; i < G.peds.length; i++) { var t = G.peds[i].team; if (G.peds[i].active && (t === 'grove' || t === 'ballas' || t === 'vagos')) n++; } return n; }
  function countTraffic() { var n = 0; for (var i = 0; i < G.vehicles.length; i++) if (G.vehicles[i].active && !G.vehicles[i].copCar && G.vehicles[i].driver) n++; return n; }

  // =====================================================================
  // WANTED SYSTEM
  // =====================================================================
  var wanted = {
    carTimer: 0,
    update: function (dt) {
      var resp = G.WANTED_RESPONSE[U.clamp(G.stars, 0, 6)];
      // count alive cops
      var nCops = G.cops.length;
      // spawn foot cops up to cap
      if (G.stars >= 1 && nCops < resp.cops) {
        if (!this._copSpawnCd || this._copSpawnCd <= 0) {
          this._copSpawnCd = 1.2 / (1 + (G.stars >= 6 ? 1 : 0));
          this.spawnCop();
        }
      }
      this._copSpawnCd = (this._copSpawnCd || 0) - dt;
      // police cars
      this.carTimer -= dt;
      if (G.stars >= 3 && this.carTimer <= 0) {
        var carsActive = 0; for (var i = 0; i < G.vehicles.length; i++) if (G.vehicles[i].active && G.vehicles[i].copCar) carsActive++;
        if (carsActive < resp.cars) { this.spawnCopCar(); }
        this.carTimer = 3;
      }
      // army Rhino at 5+ stars (steal it if you dare)
      if (G.stars >= 5) {
        this.tankTimer = (this.tankTimer === undefined ? 8 : this.tankTimer) - dt;
        if (this.tankTimer <= 0) {
          this.tankTimer = 15;
          var hasTank = false;
          for (var t2 = 0; t2 < G.vehicles.length; t2++) if (G.vehicles[t2].active && G.vehicles[t2].isTank && !G.vehicles[t2].wreck && G.vehicles[t2].armyUnit) { hasTank = true; break; }
          if (!hasTank) {
            var ts = snapToRoad(U.clamp(G.player.x + U.rand(-80, 80), G.city.worldMin + 6, G.city.worldMax - 6), U.clamp(G.player.z + U.rand(-80, 80), G.city.worldMin + 6, G.city.worldMax - 6));
            if (ts) {
              var tank = G.vehiclePool.acquire('tank', ts.x, ts.z, ts.angle); G.vehicles.push(tank);
              tank.driver = { npc: true }; tank.armyUnit = true;
              G.notify('ARMY DEPLOYED — RHINO INBOUND'); U.audio.sfx('radio');
            }
          }
        }
      }
      // line of sight -> heat decay
      var seen = false;
      for (var c = 0; c < G.cops.length; c++) {
        var cop = G.cops[c]; if (!cop.active || !cop.alive) continue;
        if (U.dist(cop.x, cop.z, G.player.x, G.player.z) < 55) { seen = true; break; }
      }
      if (seen) G.lastCopLOS = G.time.elapsed;
      if (G.stars > 0 && G.time.elapsed - G.lastCopLOS > 10) {
        G.heat = Math.max(0, G.heat - 40 * dt);
        var s = 0; for (var k = 0; k < G.STAR_THRESHOLDS.length; k++) if (G.heat >= G.STAR_THRESHOLDS[k]) s = k + 1;
        if (s < G.stars) G.stars = s;
        if (G.stars === 0) G.notify('WANTED LEVEL CLEARED');
      }
      // prune dead cops
      for (var d = G.cops.length - 1; d >= 0; d--) if (!G.cops[d].active || !G.cops[d].alive) G.cops.splice(d, 1);
    },
    spawnCop: function () {
      if (G.cops.length >= G.cfg.CAP_COP) return;
      var ang = U.rand(0, U.TAU), dd = U.rand(40, 70);
      var x = G.player.x + Math.cos(ang) * dd, z = G.player.z + Math.sin(ang) * dd;
      x = U.clamp(x, G.city.worldMin + 4, G.city.worldMax - 4); z = U.clamp(z, G.city.worldMin + 4, G.city.worldMax - 4);
      var safe = G.city.collide(x, z, 0.6);
      var team = (G.stars >= 5 && U.chance(0.4)) ? 'swat' : ((G.stars >= 4 && U.chance(0.3)) ? 'cop' : 'cop');
      var cop = G.pedPool.acquire(team, safe.x, safe.z); G.peds.push(cop); G.cops.push(cop);
    },
    spawnCopCar: function () {
      var ang = U.rand(0, U.TAU), dd = U.rand(60, 90);
      var x = G.player.x + Math.cos(ang) * dd, z = G.player.z + Math.sin(ang) * dd;
      var snapped = snapToRoad(U.clamp(x, G.city.worldMin + 6, G.city.worldMax - 6), U.clamp(z, G.city.worldMin + 6, G.city.worldMax - 6));
      if (!snapped) return;
      var v = G.vehiclePool.acquire('police', snapped.x, snapped.z, snapped.angle); G.vehicles.push(v);
      v.driver = { npc: true }; v.unloaded = false;
    },
  };

  // =====================================================================
  // TERRITORY WARS + counter-attacks + income
  // =====================================================================
  var war = {
    active: null,         // current war territory
    wave: 0, waveAlive: 0, leaveTimer: 0,
    killLog: [],          // {time, terr}
    counterTimer: 120, incomeTimer: 30,
    onRivalKilled: function (ped) {
      var t = G.city.territoryAt(ped.x, ped.z);
      if (!t || t.owner !== ped.team || this.active) return;
      this.killLog.push({ time: G.time.elapsed, terr: t });
      // count kills in this terr within 60s
      var n = 0; for (var i = this.killLog.length - 1; i >= 0; i--) { if (G.time.elapsed - this.killLog[i].time > 60) break; if (this.killLog[i].terr === t) n++; }
      if (n >= 3) this.start(t);
    },
    start: function (t) {
      this.active = t; this.wave = 0; this.leaveTimer = 0; t._warGang = t.owner;
      G.notify('GANG WAR!'); G.notify(U.pick(G.QUIPS.war)); U.audio.sfx('alarm');
      this.nextWave();
    },
    nextWave: function () {
      this.wave++;
      var counts = [4, 6, 8], n = counts[this.wave - 1];
      this.waveAlive = 0;
      for (var i = 0; i < n; i++) {
        if (countGang() >= G.cfg.CAP_GANG + 6) break;
        var t = this.active;
        var x = U.clamp(G.player.x + U.rand(-30, 30), t.minX + 4, t.maxX - 4);
        var z = U.clamp(G.player.z + U.rand(-30, 30), t.minZ + 4, t.maxZ - 4);
        if (U.dist(x, z, G.player.x, G.player.z) < 12) x += 12;
        var safe = G.city.collide(x, z, 0.6);
        var p = G.pedPool.acquire(t._warGang, safe.x, safe.z); G.peds.push(p);
        p.warAttacker = true; p.aggro = true; p.target = G.player; p.state = 'chase';
        if (this.wave === 3 && i % 2 === 0) p.weapon = U.chance(0.5) ? 'uzi' : 'shotgun';
        this.waveAlive++;
      }
      G.notify('WAVE ' + this.wave + '/3');
    },
    update: function (dt) {
      this.incomeTimer -= dt; this.counterTimer -= dt;
      if (this.incomeTimer <= 0) { this.incomeTimer = 30; var gc = G.groveCount(); if (gc > 0) { G.money += 50 * gc; U.audio.sfx('cash'); G.notify('+$' + (50 * gc) + ' TERRITORY INCOME'); } }
      // counter-attacks
      if (this.counterTimer <= 0) {
        this.counterTimer = U.rand(90, 180);
        if (G.groveCount() > 2 && U.chance(0.25)) this.startCounter();
      }
      this.updateCounters(dt);
      if (!this.active) return;
      var t = this.active;
      // count alive war attackers
      var alive = 0; for (var i = 0; i < G.peds.length; i++) { var p = G.peds[i]; if (p.active && p.alive && p.warAttacker) alive++; }
      // leaving check
      var inside = U.pointInAabb(G.player.x, G.player.z, t);
      if (!inside) { this.leaveTimer += dt; if (this.leaveTimer > 15) { this.cancel('YOU LEFT THE TURF — WAR OVER'); return; } }
      else this.leaveTimer = 0;
      if (alive === 0) {
        if (this.wave >= 3) this.capture(t);
        else this.nextWave();
      }
    },
    capture: function (t) {
      G.city.setTerritoryOwner(t, 'grove'); this.active = null;
      G.money += 1000; G.addRespect(G.RESPECT.captureTerr);
      G.slowmoT = 1.2; // kill-cam moment
      // surviving homies earn stripes
      for (var h = 0; h < G.crew.length; h++) {
        var c = G.crew[h]; if (!c.active || !c.alive) continue;
        c.warsSurvived = (c.warsSurvived || 0) + 1;
        if (c.warsSurvived === 1 && !c.homieName) {
          c.homieName = G.HOMIE_NAMES[(G._nameIdx = (G._nameIdx || 0) + 1) % G.HOMIE_NAMES.length];
          var lbl = G.makeLabel(c.homieName, '#7fff7f', 5);
          lbl.sprite.position.y = 2.7; lbl.sprite.scale.set(4.5, 1.1, 1);
          c.mesh.add(lbl.sprite); c.nameSprite = lbl.sprite;
          G.notify(c.homieName + ' EARNED HIS STRIPES');
        } else if (c.warsSurvived >= 3 && !c.og) {
          c.og = true; c.maxHp = 200; c.hp = 200; c.weapon = 'ak'; c.armed = true; c.melee = false;
          G.notify((c.homieName || 'HOMIE') + ' IS NOW OG — AK-47 + 200 HP');
        }
      }
      for (var i = 0; i < 20; i++) G.spawnParticle('firework', t.cx + U.rand(-3, 3), 2, t.cz + U.rand(-3, 3));
      U.audio.sfx('victory'); G.notify('TERRITORY CAPTURED! +$1000'); G.notify(U.pick(G.QUIPS.capture));
      this.clearWarFlags();
      if (G.groveCount() >= 16) G.onWin();
    },
    cancel: function (msg) {
      this.active = null; this.clearWarFlags(); G.notify(msg);
    },
    clearWarFlags: function () { for (var i = 0; i < G.peds.length; i++) G.peds[i].warAttacker = false; },
    // ---- counter-attacks on owned territories ----
    counters: [],
    startCounter: function () {
      var owned = []; for (var i = 0; i < G.city.territories.length; i++) { var t = G.city.territories[i]; if (t.owner === 'grove' && !t.contested && !U.pointInAabb(G.player.x, G.player.z, t)) owned.push(t); }
      if (!owned.length) return;
      var t2 = U.pick(owned); t2.contested = true; t2.contestTimer = 60; t2.contestBy = U.pick(['ballas', 'vagos']);
      G.notify('TERRITORY UNDER ATTACK!'); U.audio.sfx('alarm');
      // spawn 4 attackers there (only become active when player nears via director, but place markers)
      t2._attackers = 4;
    },
    updateCounters: function (dt) {
      for (var i = 0; i < G.city.territories.length; i++) {
        var t = G.city.territories[i]; if (!t.contested) continue;
        t.contestTimer -= dt;
        // if player inside, spawn defenders fight
        if (U.pointInAabb(G.player.x, G.player.z, t)) {
          if (!t._spawned) {
            t._spawned = true;
            for (var k = 0; k < 4; k++) {
              var x = U.clamp(G.player.x + U.rand(-25, 25), t.minX + 4, t.maxX - 4);
              var z = U.clamp(G.player.z + U.rand(-25, 25), t.minZ + 4, t.maxZ - 4);
              var safe = G.city.collide(x, z, 0.6);
              var p = G.pedPool.acquire(t.contestBy, safe.x, safe.z); G.peds.push(p);
              p.contestAttacker = t; p.aggro = true; p.target = G.player; p.state = 'chase';
            }
          }
          // cleared?
          var alive = 0; for (var a = 0; a < G.peds.length; a++) { var pp = G.peds[a]; if (pp.active && pp.alive && pp.contestAttacker === t) alive++; }
          if (t._spawned && alive === 0) {
            t.contested = false; t._spawned = false; G.money += 200; G.addRespect(5); G.notify('TERRITORY DEFENDED! +$200');
          }
        }
        if (t.contestTimer <= 0 && t.contested) {
          // flip to attacker
          G.city.setTerritoryOwner(t, t.contestBy); t.contested = false; t._spawned = false;
          G.addRespect(G.RESPECT.loseTerr); G.notify('TERRITORY LOST TO ' + G.GANGS[t.contestBy].name);
        }
      }
    },
  };

  G.war = war; // exposed for HUD objective line

  G.groveCount = function () { var n = 0; for (var i = 0; i < G.city.territories.length; i++) if (G.city.territories[i].owner === 'grove') n++; return n; };

  // =====================================================================
  // DAY / NIGHT
  // =====================================================================
  function updateDayNight(dt) {
    G.time.dayT = (G.time.dayT + dt / G.cfg.DAY_LENGTH) % 1;
    G.time.game = G.time.dayT * 86400;
    var pal = G.palette, dayT = G.time.dayT;
    var a = pal[0], b = pal[pal.length - 1];
    for (var i = 0; i < pal.length - 1; i++) { if (dayT >= pal[i].t && dayT <= pal[i + 1].t) { a = pal[i]; b = pal[i + 1]; break; } }
    var tt = U.invlerp(a.t, b.t, dayT); tt = U.clamp(tt, 0, 1);
    var sky = U.lerpColor(a.sky, b.sky, tt);
    var sun = U.lerpColor(a.sun, b.sun, tt);
    var hemiC = U.lerpColor(a.hemi, b.hemi, tt);
    var sunI = U.lerp(a.sunI, b.sunI, tt), hemiI = U.lerp(a.hemiI, b.hemiI, tt);
    G.renderer.setClearColor(sky); G.scene.fog.color.setHex(sky);
    G.sun.color.setHex(sun); G.sun.intensity = sunI;
    G.hemi.color.setHex(hemiC); G.hemi.intensity = hemiI;
    // night level for lit windows / lamps
    var night = 1 - U.clamp(sunI, 0, 1);
    G.city.setNightLevel(night);
    // nearest lamps get real point lights
    if (night > 0.3) updateLampLights(night); else for (var l = 0; l < G.lampLights.length; l++) G.lampLights[l].intensity = 0;
  }
  function updateLampLights(night) {
    var lamps = G.city.lamps, px = G.player.x, pz = G.player.z;
    // find nearest 8 (coarse: sample)
    var near = [];
    for (var i = 0; i < lamps.length; i++) { var d = U.dist2(lamps[i].x, lamps[i].z, px, pz); if (d < 60 * 60) near.push({ d: d, x: lamps[i].x, z: lamps[i].z }); }
    near.sort(function (a, b) { return a.d - b.d; });
    for (var k = 0; k < G.lampLights.length; k++) {
      if (k < near.length) { G.lampLights[k].position.set(near[k].x, 6, near[k].z); G.lampLights[k].intensity = night * 0.8; }
      else G.lampLights[k].intensity = 0;
    }
  }

  // =====================================================================
  // WIN / LOSE
  // =====================================================================
  G.onBusted = function () {
    if (G.over) return; G.over = true;
    U.audio.sfx('busted');
    G.hud.bigMessage('BUSTED', '#5a8fdf');
    var fine = Math.max(500, Math.floor(G.money * 0.1)); G.money = Math.max(0, G.money - fine);
    setTimeout(function () { respawn(G.city.landmarks.police); G.hud.hideBig(); }, 2200);
  };
  G.onWasted = function () {
    if (G.over) return; G.over = true; G.player.alive = false;
    U.audio.sfx('wasted');
    G.hud.bigMessage('WASTED', '#d83a3a');
    var fine = Math.floor(G.money * 0.1); G.money = Math.max(0, G.money - fine);
    setTimeout(function () { respawn(G.city.landmarks.hospital); G.hud.hideBig(); }, 2200);
  };
  function respawn(lm) {
    G.heat = 0; G.stars = 0;
    if (G.challenge) { G.challenge = null; G._chalCd = 30; G.notify('DEATHWISH FAILED'); }
    // clear cops & wanted vehicles
    for (var i = 0; i < G.cops.length; i++) G.cops[i].despawn(); G.cops.length = 0;
    for (var v = 0; v < G.vehicles.length; v++) if (G.vehicles[v].copCar) G.vehicles[v].despawn();
    if (G.player.inCar) G.player.forceExit(false);
    var x = lm.x, z = lm.z + 16; var safe = G.city.collide(x, z, 0.6);
    G.player.reset(safe.x, safe.z); G.player.armor = 0;
    G.over = false;
  }
  G.onWin = function () {
    if (G._won) return; G._won = true; G.over = true;
    U.audio.sfx('victory');
    G.hud.showVictory();
  };

  // =====================================================================
  // PAUSE / MUTE
  // =====================================================================
  G.togglePause = function () {
    if (G.hud._ammuOpen) { G.hud.closeAmmu(); return; }
    if (G.mapOpen) { G.toggleMap(); return; }
    G.paused = !G.paused; G.hud.showPause(G.paused);
    if (G.paused && document.exitPointerLock) document.exitPointerLock();
  };
  G.mapOpen = false;
  G.toggleMap = function () {
    if (G.paused || G.over) return;
    G.mapOpen = !G.mapOpen;
    document.getElementById('bigmap-wrap').style.display = G.mapOpen ? 'flex' : 'none';
    if (G.mapOpen) G.hud.drawBigMap();
  };
  G.toggleMute = function () { G.muted = !G.muted; U.audio.setMuted(G.muted); G.notify(G.muted ? 'MUTED' : 'UNMUTED'); };

  // pause menu buttons (wired after DOM ready)
  function wirePauseButtons() {
    document.getElementById('pause-resume').onclick = function () { G.togglePause(); };
    document.getElementById('pause-mute').onclick = function () { G.toggleMute(); };
    document.getElementById('pause-restart').onclick = function () { location.reload(); };
  }

  // =====================================================================
  // AMMU trigger
  // =====================================================================
  function checkAmmu() {
    var m = G.city.landmarks.ammu;
    if (!m || G.player.inCar) return;
    if (U.dist(G.player.x, G.player.z, m.markerX, m.markerZ) < 2.5 && !G.hud._ammuOpen && !G.paused) G.hud.openAmmu();
  }

  // =====================================================================
  // MAIN LOOP
  // =====================================================================
  function loop() {
    requestAnimationFrame(loop);
    var rawDt = Math.min(G.clock.getDelta(), 0.05);
    if (!G.started) { return; }
    if (G.paused || G.over || G.mapOpen) { G.renderer.render(G.scene, G.camera); return; }
    // kill-cam slow motion
    if (G.slowmoT > 0) { G.slowmoT -= rawDt; G.timeScale = 0.25; } else G.timeScale = 1;
    var dt = rawDt * G.timeScale;
    G.time.elapsed += dt;

    // input -> player
    G.player.update(dt);
    checkAmmu();
    checkHQ(dt);
    checkHospital(dt);
    checkChallenge(dt);
    updateRampage(dt);
    updateBeast(dt);
    updateConvoy(dt);
    updateFare(dt);
    updateBeacons();

    // peds AI (throttle far)
    var px = G.player.x, pz = G.player.z;
    for (var i = 0; i < G.peds.length; i++) {
      var p = G.peds[i]; if (!p.active) continue;
      var d = U.dist2(p.x, p.z, px, pz);
      var far = d > G.cfg.AI_FULL_DIST * G.cfg.AI_FULL_DIST;
      if (far) { p.aiTick = (p.aiTick + 1) % 4; if (p.aiTick !== 0) { continue; } p.update(dt * 4, true); }
      else p.update(dt, false);
    }
    // vehicles
    for (var v = 0; v < G.vehicles.length; v++) if (G.vehicles[v].active) G.vehicles[v].update(dt);

    // bullets / particles / rockets
    updateTracers(dt); updateParticles(dt); updateRockets(dt); updatePickups(dt);

    // systems
    director.update(dt);
    wanted.update(dt);
    war.update(dt);
    updateDayNight(dt);

    // camera shake decay
    G.camShake *= (1 - dt * 4); if (G.camShake < 0.01) G.camShake = 0;

    // prune inactive peds/vehicles occasionally
    G._pruneCd = (G._pruneCd || 0) - dt;
    if (G._pruneCd <= 0) {
      G._pruneCd = 1;
      G.peds = G.peds.filter(function (p) { return p.active; });
      G.vehicles = G.vehicles.filter(function (v) { return v.active; });
    }

    // HUD
    G.hud.update(dt);

    G.renderer.render(G.scene, G.camera);
  }

  // boot
  window.addEventListener('DOMContentLoaded', function () { init(); wirePauseButtons(); });
})();
