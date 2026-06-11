/* vehicles.js — Vehicle class, arcade physics, traffic AI, police cars. */
(function () {
  'use strict';
  var G = window.G, U = window.U;

  function buildCar(arch) {
    var def = G.VEHICLES[arch];
    var grp = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: def.color });
    if (arch === 'bike') return buildBike(grp, bodyMat);
    if (arch === 'heli') return buildHeli(grp, bodyMat);
    // low-poly silhouette: low full-length body + hood/trunk steps + cabin
    // with ANGLED windshields (the key PS2 car shape cue)
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 4.6), bodyMat);
    body.position.y = 0.72; grp.add(body);
    var hood = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.28, 1.25), bodyMat);
    hood.position.set(0, 1.05, 1.55); grp.add(hood);
    var trunk = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.26, 0.95), bodyMat);
    trunk.position.set(0, 1.04, -1.75); grp.add(trunk);
    var cabinMat = new THREE.MeshLambertMaterial({ color: (def.color === 0xf1c40f) ? 0x2a2a2a : 0x232b35 });
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 1.8), cabinMat);
    cabin.position.set(0, 1.46, -0.25); grp.add(cabin);
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x8fc8dd });
    var ws = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.78), glassMat);
    ws.position.set(0, 1.42, 0.92); ws.rotation.x = -0.55; grp.add(ws);   // raked windshield
    var rw = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.7), glassMat);
    rw.position.set(0, 1.42, -1.42); rw.rotation.x = Math.PI + 0.5; grp.add(rw); // sloped rear glass
    var sideMat = new THREE.MeshLambertMaterial({ color: 0x8fc8dd });
    var sgL = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.45), sideMat);
    sgL.position.set(-0.91, 1.5, -0.25); sgL.rotation.y = -Math.PI / 2; grp.add(sgL);
    var sgR = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.45), sideMat);
    sgR.position.set(0.91, 1.5, -0.25); sgR.rotation.y = Math.PI / 2; grp.add(sgR);
    // bumpers
    var bumpMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    var bf = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.22, 0.25), bumpMat);
    bf.position.set(0, 0.5, 2.35); grp.add(bf);
    var bb = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.22, 0.25), bumpMat);
    bb.position.set(0, 0.5, -2.35); grp.add(bb);
    // taxi roof sign
    if (arch === 'taxi') {
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffe9a0, emissiveIntensity: 0.4 }));
      sign.position.set(0, 1.85, -0.25); grp.add(sign);
    }
    // wheels (faceted for the chunky look)
    var wMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    var wheels = [];
    var wp = [[-1.05, 1.5], [1.05, 1.5], [-1.05, -1.5], [1.05, -1.5]];
    var wheelGeo = G.facet(new THREE.CylinderGeometry(0.48, 0.48, 0.32, 8));
    for (var i = 0; i < 4; i++) {
      var wg = new THREE.Group();
      var w = new THREE.Mesh(wheelGeo, wMat);
      w.rotation.z = Math.PI / 2; wg.add(w);
      wg.position.set(wp[i][0], 0.48, wp[i][1]); grp.add(wg); wheels.push(wg);
    }
    // blob shadow
    var shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.8), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.04; grp.add(shadow);
    // police lightbar
    var lights = null;
    if (arch === 'police') {
      lights = new THREE.Group();
      var lr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), new THREE.MeshLambertMaterial({ color: 0x990000, emissive: 0xff0000, emissiveIntensity: 1 }));
      lr.position.set(-0.4, 1.85, 0); lights.add(lr);
      var lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), new THREE.MeshLambertMaterial({ color: 0x000099, emissive: 0x0000ff, emissiveIntensity: 1 }));
      lb.position.set(0.4, 1.85, 0); lights.add(lb);
      grp.add(lights);
    }
    return { group: grp, chassis: body, wheels: wheels, lights: lights, bodyMat: bodyMat };
  }

  function buildBike(grp, bodyMat) {
    var frame = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 2.0), bodyMat);
    frame.position.y = 0.85; grp.add(frame);
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.7), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    seat.position.set(0, 1.1, -0.45); grp.add(seat);
    var bars = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    bars.position.set(0, 1.28, 0.75); grp.add(bars);
    var wMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    var wheels = [];
    var wp = [1.0, -1.0];
    var bwGeo = G.facet(new THREE.CylinderGeometry(0.45, 0.45, 0.22, 8));
    for (var i = 0; i < 2; i++) {
      var wg = new THREE.Group();
      var w = new THREE.Mesh(bwGeo, wMat);
      w.rotation.z = Math.PI / 2; wg.add(w);
      wg.position.set(0, 0.45, wp[i]); grp.add(wg); wheels.push(wg);
    }
    var shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.6), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.04; grp.add(shadow);
    return { group: grp, chassis: frame, wheels: wheels, lights: null, bodyMat: bodyMat };
  }

  function buildHeli(grp, bodyMat) {
    var body = new THREE.Mesh(G.facet(new THREE.SphereGeometry(1.3, 7, 6)), bodyMat);
    body.scale.set(1, 0.78, 1.5); body.position.y = 1.5; grp.add(body);
    var glass = new THREE.Mesh(G.facet(new THREE.SphereGeometry(0.72, 6, 5)), new THREE.MeshLambertMaterial({ color: 0x8fc8dd }));
    glass.position.set(0, 1.62, 1.05); grp.add(glass);
    var tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 3.4), bodyMat);
    tail.position.set(0, 1.7, -2.6); grp.add(tail);
    var fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.5), bodyMat);
    fin.position.set(0, 2.1, -4.1); grp.add(fin);
    var rotorMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    var rotor = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.07, 0.3), rotorMat);
    rotor.position.y = 2.65; grp.add(rotor);
    var tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.18), rotorMat);
    tailRotor.position.set(0.2, 2.1, -4.1); grp.add(tailRotor);
    var skidMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    var skL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 2.6), skidMat); skL.position.set(-0.8, 0.3, 0); grp.add(skL);
    var skR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 2.6), skidMat); skR.position.set(0.8, 0.3, 0); grp.add(skR);
    var shadow = new THREE.Mesh(new THREE.PlaneGeometry(3, 5), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.04; grp.add(shadow);
    return { group: grp, chassis: body, wheels: [], lights: null, bodyMat: bodyMat, rotor: rotor, tailRotor: tailRotor };
  }

  function Vehicle() {
    this.active = false; this.mesh = null;
    this.arch = 'sedan'; this.x = 0; this.z = 0; this.angle = 0;
    this.speed = 0; this.maxSpeed = 28; this.accel = 16;
    this.hp = 100; this.flames = 0; this.wreck = false; this.wreckT = 0;
    this.driver = null; this.occupants = []; this.isPlayer = false;
    this.control = { forward: 0, steer: 0, handbrake: false };
    this.smokeCd = 0; this.aiTimer = 0; this.aiDir = 0;
    this.engine = null; this.lightT = 0;
    this.copCar = false; this.unloaded = false;
  }

  Vehicle.prototype.spawn = function (arch, x, z, angle) {
    this.active = true; this.arch = arch; this.x = x; this.z = z; this.angle = angle || 0;
    var def = G.VEHICLES[arch];
    this.maxSpeed = def.maxSpeed; this.accel = def.accel;
    this.speed = 0; this.hp = 100; this.flames = 0; this.wreck = false; this.wreckT = 0;
    this.driver = null; this.occupants = []; this.isPlayer = false;
    this.copCar = (arch === 'police'); this.unloaded = false;
    this.isBike = (arch === 'bike'); this.radius = this.isBike ? 0.9 : 1.6;
    this.isHeli = (arch === 'heli'); this.y = 0;
    if (this.isHeli) { this.radius = 2.2; this.control.climb = false; this.control.descend = false; }
    this.control.forward = 0; this.control.steer = 0; this.control.handbrake = false;
    this.aiDir = Math.round(this.angle / (Math.PI / 2)) * (Math.PI / 2);
    if (!this.mesh || this._arch !== arch) {
      if (this.mesh) G.scene.remove(this.mesh);
      var built = buildCar(arch);
      this.mesh = built.group; this.wheels = built.wheels; this.lights = built.lights; this.bodyMat = built.bodyMat;
      this.rotor = built.rotor || null; this.tailRotor = built.tailRotor || null;
      this._origColor = G.VEHICLES[arch].color; this._arch = arch;
      G.scene.add(this.mesh);
    } else { this.mesh.visible = true; this.bodyMat.color.setHex(this._origColor); }
    this.mesh.position.set(x, 0, z); this.mesh.rotation.set(0, this.angle, 0);
    return this;
  };

  Vehicle.prototype.despawn = function () {
    this.active = false; if (this.mesh) this.mesh.visible = false;
    this.stopEngine();
    var i = G.vehicles.indexOf(this); // keep in pool list
  };

  Vehicle.prototype.startEngine = function () {
    if (this.engine || !U.audio.ready) return;
    this.engine = U.audio.makeEngine();
  };
  Vehicle.prototype.stopEngine = function () {
    if (this.engine) { this.engine.stop(); this.engine = null; }
  };

  Vehicle.prototype.takeDamage = function (amt) {
    if (this.wreck) return;
    this.hp -= amt;
    if (this.hp <= 0) { this.hp = 0; this.explode(); }
  };

  Vehicle.prototype.explode = function () {
    if (this.wreck) return;
    this.wreck = true; this.wreckT = 20; this.flames = 0;
    this.bodyMat.color.setHex(0x1a1a1a);
    G.combat.explosion(this.x, this.z);
    // occupants take lethal damage
    for (var i = this.occupants.length - 1; i >= 0; i--) {
      var o = this.occupants[i];
      if (o === G.player) G.player.takeDamage(200, null);
      else if (o.takeDamage) o.takeDamage(200, false, null);
    }
    if (this.isPlayer) G.player.forceExit(true);
    this.occupants.length = 0; this.driver = null; this.isPlayer = false;
    this.speed = 0; this.y = 0; this.stopEngine();
  };

  Vehicle.prototype.update = function (dt) {
    if (!this.active) return;
    if (this.wreck) { this.wreckT -= dt; this._smoke(dt, true); if (this.wreckT <= 0) this.despawn(); this.mesh.position.set(this.x, 0, this.z); return; }

    if (!this.isPlayer) {
      if (this.copCar) this._copAI(dt); else this._trafficAI(dt);
    }
    this._physics(dt);
    this._damageFx(dt);
    if (this.lights) this._flashLights(dt);
    if (this.engine) {
      var f = U.clamp(Math.abs(this.speed) / this.maxSpeed, 0, 1);
      if (this.isHeli) f = Math.max(f, U.clamp(this.y / 30, 0, 1) * 0.6);
      this.engine.osc.frequency.value = (this.isHeli ? 40 : 55) + f * 140;
      // duck the engine under the radio so the music is audible
      this.engine.gain.gain.value = (0.04 + f * 0.05) * (U.audio._radioOn ? 0.4 : 1);
    }
  };

  Vehicle.prototype._physics = function (dt) {
    if (this.isHeli) { this._heliPhysics(dt); return; }
    var c = this.control;
    var max = this.maxSpeed;
    this.speed += c.forward * this.accel * dt;
    this.speed = U.clamp(this.speed, -max * 0.4, max);
    if (Math.abs(c.forward) < 0.01 && !c.handbrake) this.speed *= (1 - 0.9 * dt);
    if (c.handbrake) this.speed *= (1 - 3.5 * dt);
    if (Math.abs(this.speed) < 0.05) this.speed = 0;
    var turn = c.steer * 1.9 * U.clamp(this.speed / max, -1, 1);
    if (c.handbrake) turn *= 1.7;
    this.angle += turn * dt;
    var hx = Math.sin(this.angle), hz = Math.cos(this.angle);
    var nx = this.x + hx * this.speed * dt, nz = this.z + hz * this.speed * dt;
    // building collision
    var res = G.city.collide(nx, nz, this.radius);
    if (res.hit) {
      var impact = Math.abs(this.speed);
      this.takeDamage(impact * 0.6);
      this.speed *= -0.3; // bounce back
      if (impact > 6) U.audio.sfx('crash');
      nx = res.x; nz = res.z;
    }
    // ped run-over
    if (Math.abs(this.speed) > 5) this._runOverPeds(nx, nz);
    // car-car
    this._carCar(nx, nz);
    this.x = nx; this.z = nz;
    // apply transforms
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.angle;
    // wheels
    var spin = this.speed * dt * 2;
    for (var i = 0; i < this.wheels.length; i++) {
      this.wheels[i].children[0].rotation.x += spin;
      if (i < (this.isBike ? 1 : 2)) this.wheels[i].rotation.y = this.control.steer * 0.4;
    }
    // bike leans into turns
    if (this.isBike) this.mesh.rotation.z = -this.control.steer * U.clamp(Math.abs(this.speed) / this.maxSpeed, 0, 1) * 0.35;
  };

  // helicopter: yaw turning, vertical climb/sink, free flight above the skyline
  Vehicle.prototype._heliPhysics = function (dt) {
    var c = this.control, max = this.maxSpeed;
    this.speed += c.forward * this.accel * dt;
    this.speed = U.clamp(this.speed, -max * 0.3, max);
    if (Math.abs(c.forward) < 0.01) this.speed *= (1 - 1.2 * dt);
    if (Math.abs(this.speed) < 0.05) this.speed = 0;
    this.angle += c.steer * 1.6 * dt;
    // vertical: climb, dive, or settle slowly
    if (c.climb) this.y += 9 * dt;
    else if (c.descend) this.y -= 12 * dt;
    else if (this.isPlayer) this.y -= 2.2 * dt;
    else this.y -= 5 * dt; // abandoned helis settle
    this.y = U.clamp(this.y, 0, 70);
    var nx = this.x + Math.sin(this.angle) * this.speed * dt;
    var nz = this.z + Math.cos(this.angle) * this.speed * dt;
    // below the skyline, buildings still block; above it, free flight (world edge always)
    if (this.y < 36) {
      var res = G.city.collide(nx, nz, this.radius);
      if (res.hit) {
        var impact = Math.abs(this.speed);
        this.takeDamage(impact * 0.5);
        this.speed *= -0.2;
        if (impact > 6) U.audio.sfx('crash');
        nx = res.x; nz = res.z;
      }
    } else {
      nx = U.clamp(nx, G.city.worldMin + 2, G.city.worldMax - 2);
      nz = U.clamp(nz, G.city.worldMin + 2, G.city.worldMax - 2);
    }
    if (this.y < 2 && Math.abs(this.speed) > 5) this._runOverPeds(nx, nz);
    if (this.y < 3) this._carCar(nx, nz);
    this.x = nx; this.z = nz;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.angle;
    this.mesh.rotation.x = U.clamp(this.speed / max, -1, 1) * 0.18; // nose-down at speed
    var rpm = (this.isPlayer || this.y > 0.5) ? 18 : 2;
    if (this.rotor) this.rotor.rotation.y += rpm * dt;
    if (this.tailRotor) this.tailRotor.rotation.x += rpm * 1.5 * dt;
  };

  Vehicle.prototype._runOverPeds = function (nx, nz) {
    for (var i = 0; i < G.peds.length; i++) {
      var p = G.peds[i]; if (!p.active || !p.alive) continue;
      if (U.dist(nx, nz, p.x, p.z) < 1.8) {
        p.takeDamage(60 + Math.abs(this.speed) * 2, false, this.isPlayer ? G.player : null);
        if (this.isPlayer && p.alive === false) G.addHeat(G.HEAT.runOverPed);
        else if (this.isPlayer) G.addHeat(5);
      }
    }
  };

  Vehicle.prototype._carCar = function (nx, nz) {
    for (var i = 0; i < G.vehicles.length; i++) {
      var v = G.vehicles[i]; if (v === this || !v.active || v.wreck) continue;
      var d = U.dist(nx, nz, v.x, v.z);
      if (d < this.radius + (v.radius || 1.6)) {
        var dx = (nx - v.x) / (d || 1), dz = (nz - v.z) / (d || 1);
        v.x -= dx * 0.5; v.z -= dz * 0.5;
        var imp = Math.abs(this.speed) * 0.4;
        v.takeDamage(imp); this.takeDamage(imp * 0.5);
        this.speed *= 0.6;
        if (imp > 4) U.audio.sfx('crash');
      }
    }
  };

  Vehicle.prototype._damageFx = function (dt) {
    if (this.hp < 15) {
      this.flames += dt;
      this._smoke(dt, true);
      if (this.flames > 3) this.explode();
    } else if (this.hp < 40) {
      this._smoke(dt, false);
    }
  };
  Vehicle.prototype._smoke = function (dt, black) {
    this.smokeCd -= dt;
    if (this.smokeCd <= 0) {
      this.smokeCd = black ? 0.08 : 0.18;
      G.spawnParticle(black ? 'fire' : 'smoke', this.x, 1.2, this.z);
    }
  };

  Vehicle.prototype._flashLights = function (dt) {
    this.lightT += dt;
    var on = (this.lightT % 0.5) < 0.25;
    this.lights.children[0].material.emissiveIntensity = on ? 1.2 : 0.1;
    this.lights.children[1].material.emissiveIntensity = on ? 0.1 : 1.2;
  };

  // ---- traffic AI: drive along lanes, stop at intersections ----
  Vehicle.prototype._trafficAI = function (dt) {
    if (this.driver === null && this.occupants.length === 0) {
      // parked or driverless: idle
      this.control.forward = 0; this.control.steer = 0;
      return;
    }
    this.aiTimer -= dt;
    // raycast ahead for obstacle
    var ahead = 6 + Math.abs(this.speed) * 0.4;
    var fx = this.x + Math.sin(this.angle) * ahead, fz = this.z + Math.cos(this.angle) * ahead;
    var blocked = G.city.collide(fx, fz, 1.4).hit;
    // obstacle: car/ped ahead
    for (var i = 0; i < G.peds.length && !blocked; i++) { var p = G.peds[i]; if (p.active && p.alive && U.dist(fx, fz, p.x, p.z) < 2.5) blocked = true; }
    if (blocked) { this.control.forward = -0.2; this.control.steer = 0; this.speed *= 0.85; }
    else {
      this.control.forward = 0.5;
      // steer toward aiDir (axis-aligned heading)
      var diff = U.angleDiff(this.angle, this.aiDir);
      this.control.steer = U.clamp(diff * 2, -1, 1);
    }
    // at intersection occasionally turn
    if (this.aiTimer <= 0) {
      this.aiTimer = U.rand(2, 5);
      if (U.chance(0.4)) this.aiDir += (U.chance(0.5) ? 1 : -1) * Math.PI / 2;
    }
  };

  // ---- police car AI: chase player, unload cops ----
  Vehicle.prototype._copAI = function (dt) {
    var px = G.player.x, pz = G.player.z, d = U.dist(this.x, this.z, px, pz);
    if (d > 14) {
      this.control.forward = 0.8;
      var desired = Math.atan2(px - this.x, pz - this.z);
      var diff = U.angleDiff(this.angle, desired);
      this.control.steer = U.clamp(diff * 2.5, -1, 1);
      if (G.stars >= 5 && d < 25 && G.player.inCar) { this.control.forward = 1; } // ram
    } else {
      this.control.forward = 0; this.speed *= 0.8;
      if (!this.unloaded) { this._unload(); }
    }
  };
  Vehicle.prototype._unload = function () {
    this.unloaded = true;
    var n = 2;
    for (var i = 0; i < n; i++) {
      if (G.cops.length >= G.cfg.CAP_COP) break;
      var ang = U.rand(0, U.TAU);
      var cop = G.pedPool.acquire(G.stars >= 5 && U.chance(0.3) ? 'swat' : 'cop', this.x + Math.cos(ang) * 2, this.z + Math.sin(ang) * 2);
      G.peds.push(cop); G.cops.push(cop);
    }
    U.audio.sfx('radio');
  };

  // enter/exit helpers
  Vehicle.prototype.boardPlayer = function () {
    this.isPlayer = true; this.driver = G.player;
    if (this.occupants.indexOf(G.player) < 0) this.occupants.push(G.player);
    this.startEngine();
  };
  Vehicle.prototype.boardRecruit = function (ped) {
    if (this.isBike || this.occupants.length >= 4) return false;
    this.occupants.push(ped); ped.mesh.visible = false; ped.inCar = this; return true;
  };

  // ---- pool ----
  var pool = [];
  G.vehiclePool = {
    acquire: function (arch, x, z, angle) {
      var v = null;
      for (var i = 0; i < pool.length; i++) if (!pool[i].active) { v = pool[i]; break; }
      if (!v) { v = new Vehicle(); pool.push(v); }
      v.spawn(arch, x, z, angle);
      return v;
    },
    all: pool,
  };

  G.Vehicle = Vehicle;
})();
