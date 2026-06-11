/* peds.js — Ped class, FSM (civilian/gang/cop/recruit), box-person builder, pool. */
(function () {
  'use strict';
  var G = window.G, U = window.U;

  // ---------- shared low-poly person builder (PS2-style faceted humans) ----------
  // returns { group, parts:{head,torso,larm,rarm,lleg,rleg,+pivots}, shadow }
  G.buildPerson = function (skin, shirt, pants) {
    var grp = new THREE.Group();
    var skinMat = new THREE.MeshLambertMaterial({ color: skin });
    var shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    var pantsMat = new THREE.MeshLambertMaterial({ color: pants });
    var shoeMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
    function limbPivot(y, x) { var p = new THREE.Group(); p.position.set(x, y, 0); grp.add(p); return p; }
    // legs: tapered low-poly cylinders (thigh wider than ankle), pivot at hip
    var llegP = limbPivot(0.95, -0.17), rlegP = limbPivot(0.95, 0.17);
    var legGeo = new THREE.CylinderGeometry(0.10, 0.145, 0.95, 6);
    var lleg = new THREE.Mesh(legGeo, pantsMat); lleg.position.y = -0.475; llegP.add(lleg);
    var rleg = new THREE.Mesh(legGeo, pantsMat); rleg.position.y = -0.475; rlegP.add(rleg);
    var shoeGeo = new THREE.BoxGeometry(0.17, 0.1, 0.32);
    var lshoe = new THREE.Mesh(shoeGeo, shoeMat); lshoe.position.set(0, -0.92, 0.06); llegP.add(lshoe);
    var rshoe = new THREE.Mesh(shoeGeo, shoeMat); rshoe.position.set(0, -0.92, 0.06); rlegP.add(rshoe);
    // hips
    var hips = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.25, 7), pantsMat);
    hips.scale.z = 0.7; hips.position.y = 1.0; grp.add(hips);
    // torso: shoulders wider than waist, faceted
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.23, 0.78, 7), shirtMat);
    torso.scale.z = 0.62; torso.position.y = 1.5; grp.add(torso);
    // neck + head (low-seg sphere = PS2 faceted look)
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.14, 6), skinMat);
    neck.position.y = 1.93; grp.add(neck);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 7, 6), skinMat);
    head.scale.set(0.9, 1.1, 0.95); head.position.y = 2.16; grp.add(head);
    // arms: tapered, pivot at shoulder
    var larmP = limbPivot(1.8, -0.42), rarmP = limbPivot(1.8, 0.42);
    var armGeo = new THREE.CylinderGeometry(0.075, 0.1, 0.72, 6);
    var larm = new THREE.Mesh(armGeo, skinMat); larm.position.y = -0.38; larmP.add(larm);
    var rarm = new THREE.Mesh(armGeo, skinMat); rarm.position.y = -0.38; rarmP.add(rarm);
    // blob shadow
    var shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; grp.add(shadow);
    return { group: grp, parts: { head: head, torso: torso, larm: larm, rarm: rarm, lleg: lleg, rleg: rleg, larmP: larmP, rarmP: rarmP, llegP: llegP, rlegP: rlegP } };
  };

  // appearance presets per team
  var LOOKS = {
    civilian: function () { var sk = U.pick(['#8a5a3a', '#c98d5a', '#5a3a23', '#e0b088']); var sh = U.pick(['#cccccc', '#3a6ea5', '#a53a3a', '#e0e0e0', '#6a8a3a']); var pa = U.pick(['#333333', '#5a4a3a', '#2a3a5a']); return [sk, sh, pa]; },
    grove: function () { return ['#5a3a23', '#3da35d', '#2a2a2a']; },
    ballas: function () { return ['#5a3a23', '#7b3fa0', '#2a2a3a']; },
    vagos: function () { return ['#8a5a3a', '#d4a017', '#3a3a2a']; },
    cop: function () { return ['#c98d5a', '#1c3f6e', '#10233f']; },
    swat: function () { return ['#c98d5a', '#22282e', '#181c22']; },
    recruit: function () { return ['#5a3a23', '#3da35d', '#2a2a2a']; },
  };

  // ---------- Ped ----------
  function Ped() {
    this.active = false;
    this.mesh = null; this.parts = null;
    this.team = 'civilian'; this.armed = false; this.weapon = null;
    this.x = 0; this.z = 0; this.angle = 0;
    this.vx = 0; this.vz = 0; this.speed = 0; this.moveSpeed = 4;
    this.hp = 60; this.maxHp = 60;
    this.state = 'wander'; this.stateT = 0;
    this.targetX = 0; this.targetZ = 0;
    this.fireCd = 0; this.walkPhase = 0;
    this.alive = true; this.ragdoll = null; this.deadT = 0;
    this.aggro = false; this.target = null; this.recruit = false;
    this.aiTick = 0; this.scared = false; this.barkCd = 0;
    this.arrestT = 0;
  }

  Ped.prototype.spawn = function (team, x, z) {
    this.active = true; this.alive = true; this.team = team;
    this.x = x; this.z = z; this.angle = U.rand(0, U.TAU);
    this.hp = this.maxHp = pedMaxHp(team);
    this.vx = this.vz = 0; this.speed = 0; this.ragdoll = null; this.deadT = 0;
    this.aggro = false; this.target = null; this.recruit = (team === 'recruit');
    this.fireCd = 0; this.stateT = 0; this.scared = false; this.arrestT = 0;
    this.moveSpeed = (team === 'cop' || team === 'swat') ? 5.2 : (team === 'recruit' ? 5.5 : U.rand(3.2, 4.4));
    // weapon
    this.armed = false; this.weapon = null;
    pickWeaponForTeam(this);
    // state
    if (team === 'cop' || team === 'swat') this.state = 'pursue';
    else if (team === 'recruit') this.state = 'follow';
    else if (team === 'ballas' || team === 'vagos') this.state = 'wander';
    else this.state = 'wander';
    // mesh
    if (!this.mesh) {
      var lk = LOOKS[team] ? LOOKS[team]() : LOOKS.civilian();
      var built = G.buildPerson(lk[0], lk[1], lk[2]);
      this.mesh = built.group; this.parts = built.parts;
      G.scene.add(this.mesh);
    } else {
      var lk2 = LOOKS[team] ? LOOKS[team]() : LOOKS.civilian();
      recolor(this.parts, lk2);
      this.mesh.visible = true;
    }
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = this.angle;
    if (this.recruit) markRecruit(this, true);
    return this;
  };

  function pedMaxHp(team) {
    if (team === 'cop') return G.cfg.COP_HP;
    if (team === 'swat') return G.cfg.SWAT_HP;
    if (team === 'recruit') return G.cfg.RECRUIT_HP;
    if (team === 'grove' || team === 'ballas' || team === 'vagos') return G.cfg.GANG_HP;
    return G.cfg.PED_HP;
  }

  function pickWeaponForTeam(ped) {
    var t = ped.team;
    if (t === 'civilian') {
      if (U.chance(0.0)) {} // base unarmed; armed assigned when fighting
      ped.weapon = null; ped.armed = false; return;
    }
    if (t === 'cop') { ped.weapon = 'pistol'; ped.armed = true; }
    else if (t === 'swat') { ped.weapon = 'ak'; ped.armed = true; }
    else if (t === 'grove' || t === 'recruit') { ped.weapon = (G.respect >= 50) ? 'uzi' : 'pistol'; ped.armed = true; }
    else if (t === 'ballas' || t === 'vagos') {
      var r = U.rng();
      if (r < 0.6) ped.weapon = 'pistol';
      else if (r < 0.9) ped.weapon = 'uzi';
      else { ped.weapon = null; ped.armed = false; ped.melee = true; return; }
      ped.armed = true;
    }
    ped.melee = false;
    // ammo effectively infinite for NPCs (they reload offscreen)
  }

  function recolor(parts, lk) {
    parts.head.material.color.set(lk[0]); parts.larm.material.color.set(lk[0]); parts.rarm.material.color.set(lk[0]);
    parts.torso.material.color.set(lk[1]); parts.lleg.material.color.set(lk[2]); parts.rleg.material.color.set(lk[2]);
  }

  function markRecruit(ped, on) {
    var e = on ? 0.4 : 0;
    ped.parts.torso.material.emissive = new THREE.Color(0x3da35d);
    ped.parts.torso.material.emissiveIntensity = e;
  }

  Ped.prototype.despawn = function () {
    this.active = false;
    if (this.mesh) this.mesh.visible = false;
    if (this.recruit) { var i = G.crew.indexOf(this); if (i >= 0) G.crew.splice(i, 1); }
    var ci = G.cops.indexOf(this); if (ci >= 0) G.cops.splice(ci, 1);
  };

  // damage entry point; attacker may be player or ped
  Ped.prototype.takeDamage = function (amt, headshot, attacker) {
    if (!this.alive) return false;
    if (headshot) amt *= 2;
    this.hp -= amt;
    G.combat.blood(this.x, this.z);
    // become aggressive
    var byPlayer = (attacker === G.player);
    if (this.team === 'civilian' && !this.scared) {
      this.scared = true;
      // 80% flee / 20% fight back (tuned down from spec's 40% for playability)
      if (U.chance(0.8)) { this.state = 'flee'; U.audio.sfx('scream'); }
      else { this.state = 'fight'; if (U.chance(0.25)) { this.weapon = 'pistol'; this.armed = true; this.melee = false; } else { this.melee = true; } }
    } else if (this.team === 'grove') {
      // grove fights whoever hurt it (unless it's the player)
      if (!byPlayer) { this.aggro = true; this.target = attacker; this.state = 'fight'; }
    } else if (this.team === 'ballas' || this.team === 'vagos') {
      this.aggro = true; this.target = byPlayer ? G.player : attacker; this.state = 'chase';
      G.gang.callBackup(this);
    } else if (this.team === 'cop' || this.team === 'swat') {
      this.state = 'engage';
    } else if (this.team === 'recruit') {
      if (!byPlayer && attacker) { this.target = attacker; }
    }
    if (this.hp <= 0) { this.die(attacker); return true; }
    return false;
  };

  Ped.prototype.die = function (attacker) {
    if (!this.alive) return;
    this.alive = false; this.state = 'dead'; this.deadT = 8;
    this.ragdoll = { spin: U.rand(-3, 3), tip: 0, vy: U.rand(1.5, 3) };
    var byPlayer = (attacker === G.player) || (attacker && attacker.recruit);
    // scoring / heat / respect / pickups
    if (this.team === 'civilian') {
      if (byPlayer) { G.addHeat(G.HEAT.killCivilian); }
      G.kills++; G.stats.kills++;
      G.spawnPickup('cash', this.x, this.z, U.randInt(10, 40));
      if (U.chance(0.25)) G.spawnPickup('ammo', this.x + 1, this.z, 0);
    } else if (this.team === 'ballas' || this.team === 'vagos') {
      if (byPlayer) { G.addHeat(G.HEAT.killRival); G.addRespect(G.RESPECT.rivalKill); G.gang.onRivalKilled(this, attacker); }
      G.kills++; G.stats.kills++;
      if (this.armed && this.weapon && U.chance(0.3)) G.spawnPickup('gun', this.x, this.z, 0, this.weapon);
      else if (U.chance(0.4)) G.spawnPickup('cash', this.x, this.z, U.randInt(20, 60));
    } else if (this.team === 'cop' || this.team === 'swat') {
      if (byPlayer) G.addHeat(G.HEAT.killCop);
      G.kills++; G.stats.kills++;
    } else if (this.team === 'grove') {
      G.kills++;
    } else if (this.team === 'recruit') {
      G.addRespect(G.RESPECT.recruitDeath);
      var i = G.crew.indexOf(this); if (i >= 0) G.crew.splice(i, 1);
      G.notify('CREW MEMBER DOWN');
    }
    var ci = G.cops.indexOf(this); if (ci >= 0) G.cops.splice(ci, 1);
  };

  // ---------- update ----------
  Ped.prototype.update = function (dt, throttled) {
    if (!this.active) return;
    if (this.inCar) { this.x = this.inCar.x; this.z = this.inCar.z; return; }
    if (!this.alive) { this._updateDead(dt); return; }
    this.fireCd -= dt; this.barkCd -= dt; this.stateT += dt;
    var px = G.player.x, pz = G.player.z;
    var dpl = U.dist(this.x, this.z, px, pz);

    switch (this.state) {
      case 'wander': this._wander(dt); break;
      case 'flee': this._flee(dt, px, pz); break;
      case 'fight': this._fight(dt); break;
      case 'chase': this._chase(dt); break;
      case 'follow': this._follow(dt, px, pz, dpl); break;
      case 'pursue': this._copPursue(dt, px, pz, dpl); break;
      case 'engage': this._copEngage(dt, px, pz, dpl); break;
      case 'arrest': this._copArrest(dt, px, pz, dpl); break;
    }

    // rival gang aggro-on-sight inside turf
    if ((this.team === 'ballas' || this.team === 'vagos') && this.state === 'wander') {
      var terr = G.city.territoryAt(this.x, this.z);
      if (dpl < 25 && terr && terr.owner === this.team) { this.aggro = true; this.target = G.player; this.state = 'chase'; }
    }
    // grove defends player
    if (this.team === 'grove' && this.state === 'wander' && G.player.lastAttacker && U.dist(this.x, this.z, G.player.lastAttacker.x, G.player.lastAttacker.z) < 30) {
      // grove stays chill unless attacked; skip auto-aggro to keep streets calm
    }

    this._move(dt);
    if (!throttled) this._animate(dt);
    this.mesh.position.set(this.x, this.ragdoll ? this.mesh.position.y : 0, this.z);
    this.mesh.rotation.y = this.angle;
  };

  Ped.prototype._updateDead = function (dt) {
    this.deadT -= dt;
    if (this.ragdoll) {
      this.ragdoll.tip = Math.min(Math.PI / 2, this.ragdoll.tip + dt * 3);
      this.mesh.rotation.z = this.ragdoll.tip;
      this.mesh.rotation.y += this.ragdoll.spin * dt;
    }
    if (this.deadT <= 0) { this.mesh.rotation.z = 0; this.despawn(); }
  };

  Ped.prototype._move = function (dt) {
    var nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    var res = G.city.collide(nx, nz, 0.5);
    this.x = res.x; this.z = res.z;
    this.speed = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    if (this.speed > 0.1) this.angle = U.approachAngle(this.angle, Math.atan2(this.vx, this.vz), dt * 8);
    // damping
    this.vx *= 0.0001; this.vz *= 0.0001; // velocity is set each frame by behaviors
  };

  Ped.prototype._setVelToward = function (tx, tz, spd) {
    var dx = tx - this.x, dz = tz - this.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    this.vx = dx / d * spd; this.vz = dz / d * spd;
  };
  Ped.prototype._setVelAway = function (tx, tz, spd) {
    var dx = this.x - tx, dz = this.z - tz, d = Math.sqrt(dx * dx + dz * dz) || 1;
    this.vx = dx / d * spd; this.vz = dz / d * spd;
  };

  Ped.prototype._wander = function (dt) {
    if (this.stateT > 4 || (this.targetX === 0 && this.targetZ === 0)) {
      this.stateT = 0;
      if (U.chance(0.3)) { this.vx = this.vz = 0; this.targetX = this.x; this.targetZ = this.z; return; }
      this.targetX = this.x + U.rand(-15, 15); this.targetZ = this.z + U.rand(-15, 15);
    }
    if (U.dist(this.x, this.z, this.targetX, this.targetZ) < 1.5) { this.vx = this.vz = 0; }
    else this._setVelToward(this.targetX, this.targetZ, this.moveSpeed * 0.6);
  };

  Ped.prototype._flee = function (dt, px, pz) {
    this._setVelAway(px, pz, this.moveSpeed * 1.3);
    if (this.barkCd <= 0) { U.audio.sfx('scream'); this.barkCd = 2.5; }
    if (this.stateT > 8) { this.state = 'wander'; this.scared = false; }
  };

  Ped.prototype._fight = function (dt) {
    var tgt = this.target || G.player;
    if (!tgt) { this.state = 'wander'; return; }
    var tx = tgt.x, tz = tgt.z, d = U.dist(this.x, this.z, tx, tz);
    // give up below 30%
    if (this.hp < this.maxHp * 0.3) { this.state = 'flee'; return; }
    if (this.armed && !this.melee) {
      if (d < 50) { this._setVelToward(tx, tz, this.moveSpeed * 0.5); this._faceAndShoot(tgt, d); }
      else this._setVelToward(tx, tz, this.moveSpeed);
    } else {
      if (d > 1.6) this._setVelToward(tx, tz, this.moveSpeed * 1.1);
      else { this.vx = this.vz = 0; this._meleeAttack(tgt, d, 8); }
    }
    if (d > 40) { this.state = 'wander'; this.scared = false; }
  };

  Ped.prototype._chase = function (dt) {
    var tgt = this.target || G.player;
    if (!tgt || (tgt.alive === false)) { this.target = G.player; tgt = G.player; }
    var tx = tgt.x, tz = tgt.z, d = U.dist(this.x, this.z, tx, tz);
    if (this.melee) {
      if (d > 1.8) this._setVelToward(tx, tz, this.moveSpeed * 1.15);
      else { this.vx = this.vz = 0; this._meleeAttack(tgt, d, 12); }
    } else {
      var ideal = 14;
      if (d > ideal + 4) this._setVelToward(tx, tz, this.moveSpeed);
      else if (d < ideal - 4) this._setVelAway(tx, tz, this.moveSpeed * 0.6);
      else { // strafe a bit
        var ang = Math.atan2(tx - this.x, tz - this.z) + Math.PI / 2;
        this.vx = Math.sin(ang) * this.moveSpeed * 0.5 * (this.stateT % 2 < 1 ? 1 : -1);
        this.vz = Math.cos(ang) * this.moveSpeed * 0.5 * (this.stateT % 2 < 1 ? 1 : -1);
      }
      this._faceAndShoot(tgt, d);
    }
  };

  Ped.prototype._follow = function (dt, px, pz, dpl) {
    // formation slot
    var slot = G.crew.indexOf(this);
    var ang = G.player.angle + Math.PI + (slot - (G.crew.length - 1) / 2) * 0.5;
    var fx = px + Math.sin(ang) * 4, fz = pz + Math.cos(ang) * 4;
    var d = U.dist(this.x, this.z, fx, fz);
    // teleport if far behind
    if (dpl > 80) { this.x = px - Math.sin(G.player.angle) * 4; this.z = pz - Math.cos(G.player.angle) * 4; this.vx = this.vz = 0; }
    // attack nearby hostiles or shared target
    var hostile = this.target && this.target.alive !== false ? this.target : G.gang.nearestHostile(this.x, this.z, 20);
    if (hostile) {
      var hd = U.dist(this.x, this.z, hostile.x, hostile.z);
      if (hd < 45) { this._setVelToward(hostile.x, hostile.z, this.moveSpeed * 0.7); this._faceAndShoot(hostile, hd); return; }
    }
    this.target = null;
    if (d > 2) this._setVelToward(fx, fz, d > 12 ? this.moveSpeed * 1.4 : this.moveSpeed * 0.9);
    else { this.vx = this.vz = 0; this.angle = G.player.angle; }
  };

  Ped.prototype._copPursue = function (dt, px, pz, dpl) {
    if (dpl < 18) { this.state = 'engage'; return; }
    this._setVelToward(px, pz, this.moveSpeed);
  };
  Ped.prototype._copEngage = function (dt, px, pz, dpl) {
    // arrest condition: player on foot & holstered/unarmed OR in stopped car
    var canArrest = G.player.arrestable();
    if (canArrest && dpl < 8) { this.state = 'arrest'; this.arrestT = 0; return; }
    if (dpl > 22) { this.state = 'pursue'; return; }
    if (dpl < 12) this._setVelAway(px, pz, this.moveSpeed * 0.5);
    else if (dpl > 18) this._setVelToward(px, pz, this.moveSpeed * 0.6);
    else { this.vx = this.vz = 0; }
    if (!canArrest) this._faceAndShoot(G.player, dpl);
    else { this.angle = Math.atan2(px - this.x, pz - this.z); }
  };
  Ped.prototype._copArrest = function (dt, px, pz, dpl) {
    if (!G.player.arrestable() || dpl > 4) { this.state = 'engage'; return; }
    this._setVelToward(px, pz, this.moveSpeed * 0.5);
    if (dpl < 2.2) { this.vx = this.vz = 0; this.arrestT += dt; if (this.arrestT > 1.5) G.onBusted(); }
  };

  Ped.prototype._faceAndShoot = function (tgt, d) {
    this.angle = U.approachAngle(this.angle, Math.atan2(tgt.x - this.x, tgt.z - this.z), 0.3);
    var w = G.weaponById[this.weapon]; if (!w) return;
    if (d > w.range) return;
    if (this.fireCd > 0) return;
    // accuracy: cops use wanted accuracy, others moderate
    var acc = 0.5;
    if (this.team === 'cop' || this.team === 'swat') acc = G.WANTED_RESPONSE[U.clamp(G.stars, 0, 6)].accuracy;
    G.combat.pedFire(this, w, tgt, acc);
    this.fireCd = 60 / w.rpm * (w.auto ? 1 : 1) + (w.auto ? 0 : U.rand(0.2, 0.6));
    // raise arm pose
    this._aimPose = 0.25;
  };

  Ped.prototype._meleeAttack = function (tgt, d, dmg) {
    this.angle = Math.atan2(tgt.x - this.x, tgt.z - this.z);
    if (this.fireCd > 0) return;
    this.fireCd = 0.7;
    this._punchT = 0.2;
    U.audio.sfx('punch');
    if (tgt === G.player) G.player.takeDamage(dmg, this);
    else if (tgt.takeDamage) tgt.takeDamage(dmg, false, this);
  };

  Ped.prototype._animate = function (dt) {
    var p = this.parts;
    var moving = this.speed > 0.3;
    if (moving) {
      this.walkPhase += dt * (6 + this.speed);
      var sw = Math.sin(this.walkPhase) * 0.5;
      p.llegP.rotation.x = sw; p.rlegP.rotation.x = -sw;
      if (!this._aimPose) { p.larmP.rotation.x = -sw; p.rarmP.rotation.x = sw; }
    } else {
      p.llegP.rotation.x *= 0.8; p.rlegP.rotation.x *= 0.8;
      if (!this._aimPose) { p.larmP.rotation.x *= 0.8; p.rarmP.rotation.x *= 0.8; }
    }
    // aim pose: raise right arm forward
    if (this._aimPose > 0) {
      this._aimPose -= dt;
      p.rarmP.rotation.x = -Math.PI / 2; p.larmP.rotation.x = -Math.PI / 2.4;
    }
    if (this._punchT > 0) { this._punchT -= dt; p.rarmP.rotation.x = -Math.PI / 1.5; }
  };

  // ---------- pool ----------
  var pool = [];
  G.pedPool = {
    acquire: function (team, x, z) {
      var p = null;
      for (var i = 0; i < pool.length; i++) if (!pool[i].active) { p = pool[i]; break; }
      if (!p) { p = new Ped(); pool.push(p); }
      p.spawn(team, x, z);
      return p;
    },
    all: pool,
  };

  G.Ped = Ped;
})();
