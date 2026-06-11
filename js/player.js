/* player.js — input (kb/mouse/touch), movement, camera, shooting, enter/exit. */
(function () {
  'use strict';
  var G = window.G, U = window.U;

  function Player() {
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0; this.onGround = true;
    this.angle = 0;
    this.hp = G.cfg.PLAYER_HP; this.maxHp = G.cfg.PLAYER_HP;
    this.armor = 100; this.maxArmor = 100; // start with a bulletproof vest
    this.alive = true;
    this.inCar = null;
    this.sprint = false; this.fireCd = 0; this.spinT = 0;
    this.lastAttacker = null; this.recruitCd = 0;
    this.scoped = false;
    this.weapons = {
      fists: { owned: true, mag: 0, reserve: 0 },
      pistol: { owned: true, mag: 17, reserve: 60 },
      deagle: { owned: false, mag: 0, reserve: 0 },
      uzi: { owned: true, mag: 30, reserve: 90 },  // starter SMG
      shotgun: { owned: false, mag: 0, reserve: 0 },
      ak: { owned: false, mag: 0, reserve: 0 },
      sniper: { owned: false, mag: 0, reserve: 0 },
      rpg: { owned: false, mag: 0, reserve: 0 },
      minigun: { owned: false, mag: 0, reserve: 0 },
    };
    this.slot = 'pistol';
    this.fireHeatCd = 0;
    this.minigunSpin = 0;
    this.built = false;
  }

  Player.prototype.build = function () {
    var built = G.buildPerson('#5a3a23', '#f0f0f0', '#2a4a7a'); // CJ: dark skin, white tank, blue jeans
    this.mesh = built.group; this.parts = built.parts;
    G.scene.add(this.mesh);
    this.built = true;
  };

  Player.prototype.reset = function (x, z) {
    this.x = x; this.z = z; this.y = 0; this.vy = 0;
    this.hp = this.maxHp; this.alive = true; this.inCar = null;
    this.fireCd = 0; this.lastAttacker = null;
    G.input.yaw = 0; G.input.pitch = 0;
    this.mesh.visible = true;
  };

  Player.prototype.curWeapon = function () { return G.weaponById[this.slot]; };
  Player.prototype.curAmmo = function () { return this.weapons[this.slot]; };

  // arrest condition
  Player.prototype.arrestable = function () {
    if (!this.alive) return false;
    if (this.inCar) {
      if (this.inCar.isHeli && this.inCar.y > 2) return false; // can't be arrested mid-air
      return Math.abs(this.inCar.speed) < 2;
    }
    return this.slot === 'fists';
  };

  Player.prototype.takeDamage = function (amt, attacker) {
    if (!this.alive) return;
    if (this.armor > 0) { var ab = amt * 0.5; this.armor -= ab; if (this.armor < 0) { amt += -this.armor; this.armor = 0; } else amt = amt - ab; }
    this.hp -= amt;
    this.lastAttacker = attacker;
    if (this.hp <= 0) { this.hp = 0; G.onWasted(); }
  };

  Player.prototype.forceExit = function (ragdoll) {
    if (!this.inCar) return;
    var car = this.inCar;
    var idx = car.occupants.indexOf(this); if (idx >= 0) car.occupants.splice(idx, 1);
    car.isPlayer = false; car.driver = null;
    this.x = car.x + Math.cos(car.angle) * 3; this.z = car.z + Math.sin(car.angle) * 3;
    this.inCar = null; this.mesh.visible = true; this.mesh.rotation.z = 0;
    car.stopEngine();
  };

  // ---------- input ----------
  Player.prototype.setupInput = function (dom) {
    var self = this, K = G.input.keys;
    window.addEventListener('keydown', function (e) {
      if (!G.started) return;
      K[e.code] = true;
      if (e.code === 'Escape') G.togglePause();
      if (e.code === 'KeyM') G.toggleMute();
      if (e.code === 'KeyB') G.cycleRadio();
      if (e.code === 'KeyN' || e.code === 'Tab') { e.preventDefault(); G.toggleMap(); return; }
      if (G.paused || G.over) return;
      if (e.code === 'KeyF') self.enterExit();
      if (e.code === 'KeyG') self.recruitAction();
      if (e.code === 'KeyR') self.reload();
      if (e.code === 'KeyT') self.emote('taunt');
      if (e.code === 'KeyY') self.emote('dance');
      if (e.code.indexOf('Digit') === 0) { var n = parseInt(e.code.slice(5), 10); if (n >= 1 && n <= 9) self.selectSlot(n); }
      if (e.code === 'BracketLeft') self.cycleWeapon(-1);
      if (e.code === 'BracketRight') self.cycleWeapon(1);
    });
    window.addEventListener('keyup', function (e) { K[e.code] = false; });
    // mouse
    dom.addEventListener('mousedown', function (e) {
      if (!G.started || G.paused || G.over) return;
      if (e.button === 0) { G.input.mouseDown = true; }
      if (e.button === 2) { G.input.rmbDown = true; }
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) G.input.mouseDown = false;
      if (e.button === 2) G.input.rmbDown = false;
    });
    dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    dom.addEventListener('wheel', function (e) { if (!G.started || G.paused) return; self.cycleWeapon(e.deltaY > 0 ? 1 : -1); });
    // pointer lock mouse look
    window.addEventListener('mousemove', function (e) {
      if (!G.started || G.paused || G.over) return;
      if (document.pointerLockElement === dom) {
        G.input.yaw -= e.movementX * 0.0024;
        G.input.pitch = U.clamp(G.input.pitch - e.movementY * 0.0024, -1.2, 1.0);
      }
    });
  };

  // ---------- weapons ----------
  Player.prototype.ownedSlots = function () {
    var out = [];
    for (var i = 0; i < G.WEAPONS.length; i++) { var w = G.WEAPONS[i]; if (this.weapons[w.id].owned) out.push(w.id); }
    return out;
  };
  Player.prototype.selectSlot = function (n) {
    var w = G.WEAPONS[n - 1]; if (!w) return;
    if (this.weapons[w.id].owned) { this.slot = w.id; this.minigunSpin = 0; if (this.scoped) this.setScope(false); }
  };
  Player.prototype.cycleWeapon = function (dir) {
    var owned = this.ownedSlots();
    var i = owned.indexOf(this.slot); i = (i + dir + owned.length) % owned.length;
    this.slot = owned[i]; this.minigunSpin = 0; if (this.scoped) this.setScope(false);
  };
  Player.prototype.reload = function () {
    var w = this.curWeapon(); if (!w.ammo) return;
    var a = this.curAmmo(); if (a.mag >= w.mag || a.reserve <= 0) return;
    var need = w.mag - a.mag, take = Math.min(need, a.reserve);
    a.mag += take; a.reserve -= take; U.audio.sfx('reload');
  };
  Player.prototype.giveWeapon = function (id, ammo) {
    var w = this.weapons[id]; if (!w) return;
    var def = G.weaponById[id];
    if (!w.owned) { w.owned = true; w.mag = def.mag; w.reserve = ammo || def.mag; }
    else { w.reserve += (ammo || def.mag); }
    G.notify('PICKED UP ' + def.name);
  };
  Player.prototype.addAmmo = function (id, n) { var w = this.weapons[id]; if (w && w.owned) w.reserve += n; };
  Player.prototype.setScope = function (on) {
    this.scoped = on;
    G.camera.fov = on ? 20 : 70; G.camera.updateProjectionMatrix();
    G.hud.setScope(on);
  };

  // ---------- shooting ----------
  Player.prototype.tryFire = function (dt) {
    var w = this.curWeapon(), a = this.curAmmo();
    this.fireCd -= dt; this.fireHeatCd -= dt;
    var wantFire = G.input.mouseDown || G.input.fireHeld;
    if (this.emoteT > 0) return;
    // drive-by: one-handed weapons only — auto-switch so it just works
    if (this.inCar && w.id !== 'pistol' && w.id !== 'uzi') {
      if (!wantFire) return;
      if (this.weapons.uzi.owned) this.slot = 'uzi';
      else if (this.weapons.pistol.owned) this.slot = 'pistol';
      else return;
      w = this.curWeapon(); a = this.curAmmo();
      if (U.audio.throttle('drivebyhint', 5000)) G.notify('DRIVE-BY: SWITCHED TO ' + w.name);
    }
    if (this.slot === 'minigun') {
      this.minigunSpin = wantFire ? Math.min(w.spinup, this.minigunSpin + dt) : Math.max(0, this.minigunSpin - dt * 2);
      if (wantFire && this.minigunSpin < w.spinup) return;
    }
    if (!wantFire) { this._firedThisClick = false; return; }
    if (!w.auto && this._firedThisClick) return;
    if (this.fireCd > 0) return;
    // ammo
    if (w.ammo) {
      if (a.mag <= 0) {
        if (a.reserve > 0) { this.reload(); return; }
        U.audio.sfx('empty'); this.fireCd = 0.3; return;
      }
      a.mag--;
    }
    this.fireCd = 60 / w.rpm;
    this._firedThisClick = true;
    this.spinT = 0.06; // muzzle anim
    // heat for firing a gun in public
    if (w.id !== 'fists' && this.fireHeatCd <= 0) { G.addHeat(G.HEAT.fireGun); this.fireHeatCd = 3; }
    // origin + direction — converge shots on the crosshair: aim at the far point of
    // the camera's center ray, then shoot from the muzzle toward it (kills the
    // parallax between the over-shoulder camera and the player's gun)
    var origin = new THREE.Vector3(this.x, this.inCar ? 1.0 : 1.5, this.z);
    var yaw = this.inCar ? this.angle : G.input.yaw, pitch = this.inCar ? 0 : G.input.pitch;
    var aimDir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    var camTarget = G.camera.position.clone().addScaledVector(aimDir, Math.max(25, w.range));
    var dir = camTarget.sub(origin).normalize();
    if (w.id === 'fists') { G.combat.playerMelee(origin, dir, w); U.audio.sfx('punch'); return; }
    U.audio.sfx(w.sfx);
    if (w.id === 'rpg') { U.audio.sfx('rpgwhoosh'); }
    // drive-by gets a wide auto-target cone; shooting skill tightens spread up to 30%
    var aimAssist = this.inCar ? 60 : (G.input.touch ? 5 : 0);
    var spread = w.spread * (1 - G.skills.shoot * 0.003);
    if (w.projectile) G.combat.spawnRocket(origin, dir, this);
    else if (w.pellets) { for (var p = 0; p < w.pellets; p++) G.combat.fireHitscan(origin, jitter(dir, spread), w, this, aimAssist); }
    else G.combat.fireHitscan(origin, jitter(dir, spread), w, this, aimAssist);
  };

  function jitter(dir, spreadDeg) {
    if (!spreadDeg) return dir.clone();
    var s = U.rad(spreadDeg);
    var d = dir.clone();
    d.x += U.rand(-s, s); d.y += U.rand(-s, s) * 0.6; d.z += U.rand(-s, s);
    return d.normalize();
  }

  // ---------- enter / exit ----------
  Player.prototype.enterExit = function () {
    if (this.inCar) { this.exitCar(); return; }
    var best = null, bd = 4;
    for (var i = 0; i < G.vehicles.length; i++) {
      var v = G.vehicles[i]; if (!v.active || v.wreck) continue;
      var d = U.dist(this.x, this.z, v.x, v.z); if (d < bd) { bd = d; best = v; }
    }
    if (best) this.enterCar(best);
  };
  Player.prototype.enterCar = function (car) {
    // jack if occupied by NPC driver
    if (car.driver && car.driver !== this) {
      var npc = car.driver;
      if (npc.takeDamage) { /* pull out */ }
      G.ejectDriver(car);
      G.addHeat(G.HEAT.jackCar);
    } else if (car.occupants.length && car.occupants[0] !== this && !car.occupants[0].recruit) {
      G.ejectDriver(car); G.addHeat(G.HEAT.jackCar);
    }
    car.boardPlayer(); this.inCar = car; this.mesh.visible = car.isBike;
    // recruits board as passengers
    var seated = 0;
    for (var i = 0; i < G.crew.length && seated < 3; i++) { if (car.boardRecruit(G.crew[i])) seated++; }
    U.audio.setRadio(G.radioStation);
    if (car.arch === 'taxi' && !G.fare && G.startFare) G.startFare();
  };
  Player.prototype.exitCar = function () {
    var car = this.inCar; if (!car) return;
    if (car.isHeli && car.y > 3) { G.notify('LAND FIRST (HOLD SHIFT)'); return; }
    var idx = car.occupants.indexOf(this); if (idx >= 0) car.occupants.splice(idx, 1);
    car.isPlayer = false; car.driver = null; car.stopEngine();
    this.x = car.x + Math.cos(car.angle) * 2.5; this.z = car.z + Math.sin(car.angle) * 2.5;
    this.inCar = null; this.mesh.visible = true;
    this.mesh.rotation.z = 0;
    // boombox: radio keeps playing on foot (B cycles it off)
    // drop recruits out
    for (var i = 0; i < car.occupants.length; i++) { var o = car.occupants[i]; if (o.recruit) { o.inCar = null; o.mesh.visible = true; o.x = car.x - Math.cos(car.angle) * 2; o.z = car.z - Math.sin(car.angle) * 2; } }
    car.occupants = car.occupants.filter(function (o) { return !o.recruit; });
  };

  Player.prototype.recruitAction = function () {
    // look for grove ped or recruit nearby / in front
    var yaw = G.input.yaw, best = null, bestScore = -1, recruitTarget = null;
    for (var i = 0; i < G.peds.length; i++) {
      var p = G.peds[i]; if (!p.active || !p.alive) continue;
      if (p.team !== 'grove' && !p.recruit) continue;
      var d = U.dist(this.x, this.z, p.x, p.z); if (d > 6) continue;
      // dismiss recruit if looking at one
      if (p.recruit) { recruitTarget = p; continue; }
      var ang = Math.atan2(p.x - this.x, p.z - this.z);
      var facing = Math.cos(U.angleDiff(yaw, ang));
      var score = facing - d * 0.1;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (recruitTarget) { this.dismiss(recruitTarget); return; }
    if (best) {
      var cap = 2 + Math.floor(G.respect / 25);
      if (G.crew.length >= cap) { G.notify('CREW FULL (' + cap + ')'); return; }
      best.team = 'recruit'; best.recruit = true; best.state = 'follow';
      best.maxHp = G.cfg.RECRUIT_HP; best.hp = best.maxHp; best.weapon = (G.respect >= 50) ? 'uzi' : 'pistol'; best.armed = true; best.melee = false;
      best.parts.torso.material.emissive = new THREE.Color(0x3da35d); best.parts.torso.material.emissiveIntensity = 0.4;
      G.crew.push(best); U.audio.sfx('recruit'); G.notify('HOMIE RECRUITED (' + G.crew.length + '/' + cap + ')');
      G.notify(U.pick(G.QUIPS.recruit));
    }
  };
  Player.prototype.dismiss = function (p) {
    var i = G.crew.indexOf(p); if (i < 0) return;
    G.crew.splice(i, 1); p.recruit = false; p.team = 'grove'; p.state = 'wander';
    p.parts.torso.material.emissiveIntensity = 0;
    if (p.inCar) { p.inCar = null; p.mesh.visible = true; }
    G.notify('HOMIE DISMISSED');
  };

  // ---------- emotes ----------
  Player.prototype.emote = function (type) {
    if (this.inCar || !this.alive || this.emoteT > 0) return;
    this.emoteType = type; this.emoteT = 2.4;
    if (type === 'taunt') {
      U.audio.sfx('taunt');
      G.notify('"HEY! YEAH, YOU, FOOL!"');
      // taunting aggros nearby rivals — careful where you flex
      for (var i = 0; i < G.peds.length; i++) {
        var p = G.peds[i];
        if (p.active && p.alive && (p.team === 'ballas' || p.team === 'vagos') && U.dist(p.x, p.z, this.x, this.z) < 22) {
          p.aggro = true; p.target = this; p.state = 'chase';
        }
      }
    } else {
      U.audio.sfx('dance');
      G.notify("GETTIN' FUNKY");
    }
  };

  // ---------- update ----------
  Player.prototype.update = function (dt) {
    if (!this.alive) { this.updateCamera(dt); return; }
    this.recruitCd -= dt;
    if (this.inCar) this.updateDriving(dt);
    else this.updateOnFoot(dt);
    // scope toggle (sniper)
    if (this.slot === 'sniper' && !this.inCar) { if (G.input.rmbDown && !this.scoped) this.setScope(true); else if (!G.input.rmbDown && this.scoped) this.setScope(false); }
    else if (this.scoped) this.setScope(false);
    this.tryFire(dt);
    this.updateCamera(dt);
  };

  Player.prototype.updateOnFoot = function (dt) {
    var K = G.input.keys;
    var yaw = G.input.yaw;
    var mx = 0, mz = 0;
    if (G.input.touch) { mx = G.input.joyX; mz = -G.input.joyY; }
    else {
      if (K['KeyW']) mz += 1; if (K['KeyS']) mz -= 1;
      if (K['KeyA']) mx -= 1; if (K['KeyD']) mx += 1;
    }
    var mag = Math.sqrt(mx * mx + mz * mz);
    this.sprint = (K['ShiftLeft'] || K['ShiftRight'] || (G.input.touch && mag > 0.9));
    var speed = this.sprint ? 9 * (1 + G.skills.run * 0.0015) : 5;
    if (this.sprint && mag > 0.01) G.skills.run = Math.min(100, G.skills.run + dt * 0.5);
    if (this.scoped || this.slot === 'minigun') speed *= 0.5;
    if (mag > 0.05 && this.emoteT > 0) this.emoteT = 0; // moving cancels emotes
    if (mag > 0.01) {
      // movement relative to camera yaw; screen-right is world (-cos yaw, sin yaw)
      var fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
      var right = { x: -Math.cos(yaw), z: Math.sin(yaw) };
      var dx = (fwd.x * mz + right.x * mx), dz = (fwd.z * mz + right.z * mx);
      var dl = Math.sqrt(dx * dx + dz * dz) || 1;
      var nx = this.x + dx / dl * speed * dt, nz = this.z + dz / dl * speed * dt;
      var res = G.city.collide(nx, nz, 0.5);
      this.x = res.x; this.z = res.z;
      this.walkPhase = (this.walkPhase || 0) + dt * (8 + speed);
    }
    // jump
    if ((G.input.keys['Space'] || G.input.jumpPressed) && this.onGround) { this.vy = 7; this.onGround = false; G.input.jumpPressed = false; }
    this.vy -= 20 * dt; this.y += this.vy * dt;
    if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; }
    // face aim
    this.angle = yaw;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.angle;
    this._animateLimbs(dt, mag);
  };

  Player.prototype._animateLimbs = function (dt, moving) {
    var p = this.parts;
    if (this.emoteT > 0) {
      this.emoteT -= dt;
      var tt = performance.now() / 1000 * 8;
      if (this.emoteType === 'taunt') {
        // both arms up, waving
        p.larmP.rotation.x = -Math.PI + Math.sin(tt) * 0.35;
        p.rarmP.rotation.x = -Math.PI - Math.sin(tt) * 0.35;
        p.llegP.rotation.x = 0; p.rlegP.rotation.x = 0;
      } else {
        // dance: alternating arms, bounce, hip wiggle
        p.larmP.rotation.x = -Math.PI / 2 + Math.sin(tt) * 0.9;
        p.rarmP.rotation.x = -Math.PI / 2 - Math.sin(tt) * 0.9;
        p.llegP.rotation.x = Math.sin(tt * 0.5) * 0.3;
        p.rlegP.rotation.x = -Math.sin(tt * 0.5) * 0.3;
        this.mesh.position.y = this.y + Math.abs(Math.sin(tt)) * 0.18;
        this.mesh.rotation.y = this.angle + Math.sin(tt * 0.5) * 0.25;
      }
      if (this.emoteT <= 0) this.mesh.position.y = this.y;
      return;
    }
    if (moving > 0.05) {
      var sw = Math.sin(this.walkPhase || 0) * 0.5;
      p.llegP.rotation.x = sw; p.rlegP.rotation.x = -sw;
    } else { p.llegP.rotation.x *= 0.8; p.rlegP.rotation.x *= 0.8; }
    // arms hold gun forward unless fists
    if (this.slot === 'fists') {
      if (this.spinT > 0) { p.rarmP.rotation.x = -Math.PI / 1.5; } else { p.rarmP.rotation.x *= 0.85; p.larmP.rotation.x *= 0.85; }
    } else {
      p.rarmP.rotation.x = -Math.PI / 2 + G.input.pitch * 0.5; p.larmP.rotation.x = -Math.PI / 2.3 + G.input.pitch * 0.5;
    }
    if (this.spinT > 0) this.spinT -= dt;
  };

  Player.prototype.updateDriving = function (dt) {
    var car = this.inCar, K = G.input.keys;
    var fwd = 0, steer = 0;
    if (G.input.touch) { fwd = -G.input.joyY; steer = G.input.joyX; }
    else { if (K['KeyW']) fwd += 1; if (K['KeyS']) fwd -= 1; if (K['KeyA']) steer -= 1; if (K['KeyD']) steer += 1; }
    // negative steer turns toward screen-right in our heading convention;
    // driving skill adds up to +10% acceleration
    car.control.forward = fwd * (1 + G.skills.drive * 0.001); car.control.steer = -steer;
    if (car.isHeli) {
      car.control.handbrake = false;
      car.control.climb = !!(K['Space'] || G.input.brakeHeld);
      // S / joystick-down doubles as descend so mobile can land too
      car.control.descend = !!(K['ShiftLeft'] || K['ShiftRight'] || fwd < -0.3);
      this.y = car.y;
    } else {
      car.control.handbrake = (K['Space'] || G.input.brakeHeld);
      this.y = 0;
    }
    if (Math.abs(car.speed) > 8) G.skills.drive = Math.min(100, G.skills.drive + dt * 0.6);
    // player follows car
    this.x = car.x; this.z = car.z; this.angle = car.angle;
    // bike rider stays visible, seated on the frame
    if (car.isBike) {
      this.mesh.visible = true;
      this.mesh.position.set(car.x, 0.5, car.z);
      this.mesh.rotation.y = car.angle; this.mesh.rotation.z = car.mesh.rotation.z;
    }
  };

  Player.prototype.updateCamera = function (dt) {
    var cam = G.camera;
    var yaw = G.input.yaw, pitch = G.input.pitch;
    var headY = this.inCar ? 2.2 : 1.7;
    var hx = this.x, hz = this.z;
    if (this.inCar) { yaw = this.angle; pitch = -0.15; }
    var head = new THREE.Vector3(hx, headY + this.y, hz);
    var dist = this.inCar ? 9 : (this.scoped ? 0.1 : 6);
    var height = this.inCar ? 3.5 : 3;
    var fwdH = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    var desired = head.clone().addScaledVector(fwdH, -dist).add(new THREE.Vector3(0, height - pitch * 4, 0));
    // collision-aware: pull camera in if building between head and cam
    if (!this.inCar && !this.scoped) {
      var to = desired.clone().sub(head); var len = to.length(); to.normalize();
      var steps = 6;
      for (var s = 1; s <= steps; s++) {
        var t = (s / steps) * len;
        var px = head.x + to.x * t, pz = head.z + to.z * t;
        if (G.city.collide(px, pz, 0.4).hit) { desired = head.clone().addScaledVector(to, t - 0.6); break; }
      }
    }
    // camera shake
    if (G.camShake > 0) { desired.x += U.rand(-1, 1) * G.camShake; desired.y += U.rand(-1, 1) * G.camShake; desired.z += U.rand(-1, 1) * G.camShake; }
    cam.position.lerp(desired, this.inCar ? 0.18 : 0.4);
    var aim = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    cam.lookAt(head.clone().addScaledVector(aim, 10));
    // driving FOV widen
    if (this.inCar) { var tf = 70 + U.clamp(Math.abs(car_speed(this)) / 38, 0, 1) * 12; cam.fov += (tf - cam.fov) * 0.1; cam.updateProjectionMatrix(); }
    else if (!this.scoped && cam.fov !== 70) { cam.fov += (70 - cam.fov) * 0.2; cam.updateProjectionMatrix(); }
  };
  function car_speed(pl) { return pl.inCar ? pl.inCar.speed : 0; }

  G.Player = Player;
})();
