/* hud.js — DOM HUD, radar canvas, notifications, Ammu menu, pause, touch controls. */
(function () {
  'use strict';
  var G = window.G, U = window.U;

  function $(id) { return document.getElementById(id); }

  var HUD = {
    last: {},
    notifQueue: [],
    radarCd: 0,
  };

  HUD.init = function () {
    this.elTime = $('hud-time'); this.elMoney = $('hud-money'); this.elStars = $('hud-stars');
    this.elHealth = $('bar-health'); this.elArmor = $('bar-armor'); this.elRespect = $('bar-respect');
    this.elWeapon = $('hud-weapon'); this.elAmmo = $('hud-ammo'); this.elCrew = $('hud-crew');
    this.elCarWrap = $('hud-carhp-wrap'); this.elCarHp = $('bar-carhp');
    this.elNotify = $('hud-notify'); this.elArmorWrap = $('bar-armor-wrap');
    this.radar = $('radar'); this.rctx = this.radar.getContext('2d');
    this.scope = $('scope'); this.elObj = $('hud-objective');
    G.notify = function (msg) { HUD.pushNotify(msg); };
    if (G.input.touch) this.buildTouch();
  };

  HUD.pushNotify = function (msg) {
    this.notifQueue.push({ msg: msg, t: 3 });
    if (this.notifQueue.length > 3) this.notifQueue.shift();
    this.renderNotify();
  };
  HUD.renderNotify = function () {
    this.elNotify.innerHTML = this.notifQueue.map(function (n) { return '<div>' + n.msg + '</div>'; }).join('');
  };

  HUD.setScope = function (on) { this.scope.style.display = on ? 'block' : 'none'; };

  // comic "POW!" flash for beast-mode kills
  HUD.pow = function () {
    var el = $('pow');
    el.style.display = 'block';
    el.style.transform = 'translate(-50%,-50%) rotate(' + U.rand(-20, 20) + 'deg) scale(' + U.rand(0.9, 1.3) + ')';
    clearTimeout(this._powT);
    this._powT = setTimeout(function () { el.style.display = 'none'; }, 380);
  };

  // crosshair hit feedback: white X on hit, red on kill, HEADSHOT tag
  HUD.hitMarker = function (killed, headshot) {
    var el = $('hitmarker');
    el.style.display = 'block';
    el.className = killed ? 'kill' : '';
    clearTimeout(this._hmT);
    this._hmT = setTimeout(function () { el.style.display = 'none'; }, killed ? 170 : 90);
    if (headshot) {
      var h = $('headshot'); h.style.display = 'block';
      clearTimeout(this._hsT);
      this._hsT = setTimeout(function () { h.style.display = 'none'; }, 550);
    }
  };

  HUD.update = function (dt) {
    var p = G.player;
    // notifications
    for (var i = this.notifQueue.length - 1; i >= 0; i--) { this.notifQueue[i].t -= dt; if (this.notifQueue[i].t <= 0) this.notifQueue.splice(i, 1); }
    if (this._notifN !== this.notifQueue.length) { this._notifN = this.notifQueue.length; this.renderNotify(); }
    // time
    var hh = Math.floor(G.time.game / 3600) % 24, mm = Math.floor((G.time.game % 3600) / 60);
    var ts = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    if (this.last.time !== ts) { this.elTime.textContent = ts; this.last.time = ts; }
    // money
    var ms = '$' + ('00000000' + Math.max(0, Math.floor(G.money))).slice(-8);
    if (this.last.money !== ms) { this.elMoney.textContent = ms; this.last.money = ms; }
    // stars
    if (this.last.stars !== G.stars) {
      var s = '';
      for (var k = 0; k < 6; k++) s += '<span class="' + (k < G.stars ? 'on' : 'off') + '">&#9733;</span>';
      this.elStars.innerHTML = s; this.last.stars = G.stars;
    }
    // bars
    this.setBar('health', this.elHealth, p.hp / p.maxHp);
    this.elArmorWrap.style.display = p.armor > 0 ? 'block' : 'none';
    this.setBar('armor', this.elArmor, p.armor / p.maxArmor);
    this.setBar('respect', this.elRespect, G.respect / 100);
    // weapon
    var w = p.curWeapon(), a = p.curAmmo();
    if (this.last.weapon !== w.id) { this.elWeapon.textContent = w.name; this.last.weapon = w.id; }
    var astr = w.ammo ? (a.mag + ' / ' + a.reserve) : '∞';
    if (this.last.ammo !== astr) { this.elAmmo.textContent = astr; this.last.ammo = astr; }
    // crew
    var cs = '● ' + G.crew.length;
    if (this.last.crew !== cs) { this.elCrew.textContent = cs; this.last.crew = cs; }
    // car hp
    if (p.inCar) { this.elCarWrap.style.display = 'block'; this.setBar('carhp', this.elCarHp, p.inCar.hp / 100); }
    else if (this.elCarWrap.style.display !== 'none') this.elCarWrap.style.display = 'none';
    // objective line (priority: rampage > war > defense > fare > bounty > default)
    var obj, contested = null;
    for (var ci = 0; ci < G.city.territories.length; ci++) if (G.city.territories[ci].contested) { contested = G.city.territories[ci]; break; }
    if (G.rampage.active) obj = 'RAMPAGE! ' + G.rampage.kills + '/20 KILLS — ' + Math.ceil(G.rampage.t) + 's';
    else if (G.beast.active) obj = 'BEAST MODE! ' + Math.ceil(G.beast.t) + 's';
    else if (G.challenge) obj = 'DEATHWISH: SURVIVE ' + Math.max(0, Math.ceil(G.challenge.t)) + 's';
    else if (G.war && G.war.active) obj = 'GANG WAR — SURVIVE WAVE ' + G.war.wave + '/3';
    else if (contested) obj = 'TURF UNDER ATTACK — GET THERE! ' + Math.max(0, Math.ceil(contested.contestTimer)) + 's';
    else if (G.convoy) obj = 'DESTROY THE CONVOY! ' + Math.max(0, Math.ceil(G.convoy.t)) + 's';
    else if (G.fare) obj = 'FARE: YELLOW $ BLIP — ' + Math.ceil(G.fare.t) + 's';
    else if (G.mission) obj = 'BOUNTY: KILL THE LIEUTENANT (RED ! BLIP)';
    else obj = 'TERRITORIES ' + G.groveCount() + '/16 — KILL 3 RIVALS IN THEIR TURF';
    if (this.last.obj !== obj) { this.elObj.textContent = obj; this.last.obj = obj; }
    // radar
    this.radarCd -= dt;
    if (this.radarCd <= 0) { this.radarCd = 1 / 30; this.drawRadar(); }
  };

  HUD.setBar = function (key, el, frac) {
    frac = U.clamp(frac, 0, 1);
    var pct = Math.round(frac * 100);
    if (this.last['bar_' + key] !== pct) { el.style.width = pct + '%'; this.last['bar_' + key] = pct; }
  };

  HUD.drawRadar = function () {
    var ctx = this.rctx, R = 80, p = G.player, px = p.x, pz = p.z, yaw = G.input.yaw;
    var scale = R / 95;
    ctx.clearRect(0, 0, 160, 160);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, U.TAU); ctx.clip();
    ctx.fillStyle = '#10180f'; ctx.fillRect(0, 0, 160, 160);
    ctx.save();
    // screen-right is world -x, so plot (-dx,-dz) and rotate by +yaw to keep facing up
    ctx.translate(R, R); ctx.rotate(yaw);
    // territory tints
    var terr = G.city.territories;
    for (var i = 0; i < terr.length; i++) {
      var t = terr[i];
      var tsz = (t.maxX - t.minX) * scale;
      var rx = (px - t.cx) * scale, rz = (t.cz - pz) * scale;
      var col = U.hexToRgb(G.GANGS[t.owner].color);
      ctx.fillStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + (t.contested ? (Math.sin(performance.now() / 150) * 0.2 + 0.4) : 0.3) + ')';
      ctx.fillRect(rx - tsz / 2, -rz - tsz / 2, tsz, tsz);
      if (t.contested) { ctx.strokeStyle = '#ff2020'; ctx.lineWidth = 2; ctx.strokeRect(rx - tsz / 2, -rz - tsz / 2, tsz, tsz); }
    }
    // blips
    function blip(wx, wz, color, size) {
      var rx = (px - wx) * scale, rz = (wz - pz) * scale;
      if (rx * rx + rz * rz > (R - 4) * (R - 4)) return;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(rx, -rz, size || 2.5, 0, U.TAU); ctx.fill();
    }
    for (var k = 0; k < G.peds.length; k++) {
      var pd = G.peds[k]; if (!pd.active || !pd.alive) continue;
      var c;
      if (pd.recruit) c = '#7fff7f'; else if (pd.team === 'grove') c = '#3da35d';
      else if (pd.team === 'ballas') c = '#7b3fa0'; else if (pd.team === 'vagos') c = '#d4a017';
      else if (pd.team === 'cop' || pd.team === 'swat') c = '#4a8fff'; else continue;
      blip(pd.x, pd.z, c, 2.5);
    }
    // landmarks
    var lm = G.city.landmarks;
    this.radarIcon(ctx, lm.hospital, px, pz, scale, R, '#ff5555', 'H');
    this.radarIcon(ctx, lm.police, px, pz, scale, R, '#5588ff', 'P');
    this.radarIcon(ctx, { x: lm.ammu.x, z: lm.ammu.z }, px, pz, scale, R, '#ffe000', '$');
    // active objectives
    if (G.convoy) {
      for (var cv = 0; cv < G.convoy.cars.length; cv++) {
        var cc = G.convoy.cars[cv];
        if (cc.active && !cc.wreck && cc.convoy) blip(cc.x, cc.z, G.GANGS[G.convoy.gang].color, 4);
      }
    }
    if (G.mission && G.mission.target && G.mission.target.alive) this.radarIcon(ctx, G.mission.target, px, pz, scale, R, '#ff2020', '!');
    if (G.fare) this.radarIcon(ctx, G.fare, px, pz, scale, R, '#ffe000', '$');
    if (G.hqMarker && !G.mission) this.radarIcon(ctx, G.hqMarker, px, pz, scale, R, '#3da35d', 'B');
    ctx.restore();
    // player arrow (fixed, points up)
    ctx.fillStyle = '#ffffff'; ctx.beginPath();
    ctx.moveTo(R, R - 6); ctx.lineTo(R - 4, R + 5); ctx.lineTo(R + 4, R + 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    // frame
    ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 156, 156);
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.strokeRect(2, 2, 156, 156);
  };
  HUD.radarIcon = function (ctx, lm, px, pz, scale, R, color, ch) {
    if (!lm) return;
    var rx = (px - lm.x) * scale, rz = (lm.z - pz) * scale;
    var d = Math.sqrt(rx * rx + rz * rz);
    if (d > R - 6) { rx = rx / d * (R - 6); rz = rz / d * (R - 6); }
    ctx.fillStyle = color; ctx.fillRect(rx - 4, -rz - 4, 8, 8);
    ctx.fillStyle = '#000'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, rx, -rz);
  };

  // ---------- full-screen map (Tab / MAP button) ----------
  HUD.drawBigMap = function () {
    var cv = $('bigmap'), ctx = cv.getContext('2d');
    var S = 640; cv.width = S; cv.height = S;
    var span = G.city.span, sc = (S - 24) / span, C = S / 2;
    // same convention as the radar: screen-right = world -x, screen-up = world +z
    function mx(wx) { return C - wx * sc; } function mz(wz) { return C - wz * sc; }
    ctx.fillStyle = '#0b110b'; ctx.fillRect(0, 0, S, S);
    // territories with owner names
    for (var i = 0; i < G.city.territories.length; i++) {
      var t = G.city.territories[i], col = U.hexToRgb(G.GANGS[t.owner].color);
      var x0 = mx(t.maxX), z0 = mz(t.maxZ), w = (t.maxX - t.minX) * sc, h = (t.maxZ - t.minZ) * sc;
      ctx.fillStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',0.42)';
      ctx.fillRect(x0, z0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(x0, z0, w, h);
      if (t.contested) { ctx.strokeStyle = '#ff2020'; ctx.lineWidth = 3; ctx.strokeRect(x0 + 2, z0 + 2, w - 4, h - 4); ctx.lineWidth = 1; }
      ctx.fillStyle = '#fff'; ctx.font = '900 14px Arial Narrow, Impact, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(G.GANGS[t.owner].name, x0 + w / 2, z0 + h / 2);
    }
    // road grid
    ctx.strokeStyle = 'rgba(210,210,210,0.16)';
    for (var g = 0; g <= G.cfg.BLOCKS; g++) {
      var gp = G.city.worldMin + g * G.city.period;
      ctx.beginPath(); ctx.moveTo(mx(gp), mz(G.city.worldMin)); ctx.lineTo(mx(gp), mz(G.city.worldMax)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx(G.city.worldMin), mz(gp)); ctx.lineTo(mx(G.city.worldMax), mz(gp)); ctx.stroke();
    }
    // labeled landmarks
    var lm = G.city.landmarks;
    this.mapIcon(ctx, mx(lm.hospital.x), mz(lm.hospital.z), '#ff5555', 'H', 'HOSPITAL');
    this.mapIcon(ctx, mx(lm.police.x), mz(lm.police.z), '#5588ff', 'P', 'POLICE');
    this.mapIcon(ctx, mx(lm.ammu.x), mz(lm.ammu.z), '#ffe000', '$', 'AMMU-NATION');
    if (G.hqMarker) this.mapIcon(ctx, mx(G.hqMarker.x), mz(G.hqMarker.z), '#3da35d', 'B', 'BOUNTY HQ');
    if (G.mission && G.mission.target && G.mission.target.alive) this.mapIcon(ctx, mx(G.mission.target.x), mz(G.mission.target.z), '#ff2020', '!', 'TARGET');
    if (G.fare) this.mapIcon(ctx, mx(G.fare.x), mz(G.fare.z), '#ffe000', '$', 'FARE');
    // crew blips
    for (var c = 0; c < G.crew.length; c++) {
      ctx.fillStyle = '#7fff7f'; ctx.beginPath(); ctx.arc(mx(G.crew[c].x), mz(G.crew[c].z), 3.5, 0, U.TAU); ctx.fill();
    }
    // player arrow (rotated to facing)
    ctx.save(); ctx.translate(mx(G.player.x), mz(G.player.z)); ctx.rotate(-G.input.yaw);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(-5.5, 6.5); ctx.lineTo(5.5, 6.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  };
  HUD.mapIcon = function (ctx, x, z, color, ch, label) {
    ctx.fillStyle = color; ctx.fillRect(x - 7, z - 7, 14, 14);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x - 7, z - 7, 14, 14);
    ctx.fillStyle = '#000'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, z);
    ctx.fillStyle = '#fff'; ctx.font = '900 12px Arial Narrow, Impact, sans-serif';
    ctx.fillText(label, x, z + 16);
  };

  // ---------- Ammu-Nation menu ----------
  HUD.openAmmu = function () {
    if (this._ammuOpen) return;
    this._ammuOpen = true; G.paused = true;
    var menu = $('ammu'); menu.style.display = 'flex';
    this.renderAmmu();
  };
  HUD.closeAmmu = function () { this._ammuOpen = false; G.paused = false; $('ammu').style.display = 'none'; };
  HUD.renderAmmu = function () {
    var body = $('ammu-body'), p = G.player;
    var html = '<div class="ammu-money">CASH: $' + Math.floor(G.money) + '</div>';
    for (var i = 1; i < G.WEAPONS.length; i++) {
      var w = G.WEAPONS[i], own = p.weapons[w.id].owned;
      html += '<div class="ammu-row"><span class="an">' + w.name + '</span>' +
        '<span class="ad">DMG ' + w.dmg + '</span>' +
        (own ? '<button data-buy="clip" data-w="' + w.id + '">CLIP $' + w.clipPrice + '</button>'
          : '<button data-buy="gun" data-w="' + w.id + '">BUY $' + w.price + '</button>' +
            '<button data-buy="clip" data-w="' + w.id + '" disabled>CLIP $' + w.clipPrice + '</button>') +
        '</div>';
    }
    html += '<div class="ammu-row"><span class="an">BODY ARMOR</span><span class="ad">+100</span><button data-buy="armor" data-w="armor">BUY $250</button></div>';
    body.innerHTML = html;
    var btns = body.querySelectorAll('button');
    for (var b = 0; b < btns.length; b++) btns[b].onclick = function () { HUD.buy(this.getAttribute('data-buy'), this.getAttribute('data-w')); };
  };
  HUD.buy = function (kind, id) {
    var p = G.player;
    if (kind === 'armor') { if (G.money >= 250) { G.money -= 250; p.armor = p.maxArmor; U.audio.sfx('cash'); } }
    else {
      var w = G.weaponById[id];
      if (kind === 'gun') { if (!p.weapons[id].owned && G.money >= w.price) { G.money -= w.price; p.giveWeapon(id, w.mag * 2); U.audio.sfx('cash'); } }
      else { if (p.weapons[id].owned && G.money >= w.clipPrice) { G.money -= w.clipPrice; p.addAmmo(id, w.mag); U.audio.sfx('cash'); } }
    }
    this.renderAmmu();
  };

  // ---------- pause ----------
  HUD.showPause = function (on) {
    var el = $('pause');
    if (on) {
      el.style.display = 'flex';
      $('pause-progress').textContent = 'TERRITORIES: ' + G.groveCount() + ' / 16';
      $('pause-stats').textContent = 'SKILLS — RUNNING ' + Math.floor(G.skills.run) + '% · SHOOTING ' + Math.floor(G.skills.shoot) + '% · DRIVING ' + Math.floor(G.skills.drive) + '%';
    }
    else el.style.display = 'none';
  };

  // ---------- big center messages (busted/wasted/win) ----------
  HUD.bigMessage = function (text, color, sub) {
    var el = $('bigmsg');
    el.innerHTML = '<div class="big" style="color:' + color + '">' + text + '</div>' + (sub ? '<div class="bigsub">' + sub + '</div>' : '');
    el.style.display = 'flex'; el.style.opacity = '1';
  };
  HUD.hideBig = function () { var el = $('bigmsg'); el.style.opacity = '0'; setTimeout(function () { el.style.display = 'none'; }, 600); };

  HUD.showVictory = function () {
    var el = $('victory');
    var mins = Math.floor((performance.now() - G.stats.startTime) / 60000);
    $('victory-stats').innerHTML = 'KILLS: ' + G.kills + ' &nbsp;|&nbsp; TIME: ' + mins + ' MIN &nbsp;|&nbsp; CASH: $' + Math.floor(G.money);
    el.style.display = 'flex';
    $('victory-continue').onclick = function () { el.style.display = 'none'; G.over = false; };
  };

  // ---------- touch controls ----------
  HUD.buildTouch = function () {
    document.body.classList.add('touch');
    var tc = $('touch'); tc.style.display = 'block';
    var self = this;
    // joystick
    var joy = $('joystick'), knob = $('joy-knob');
    var jid = null, jcx = 0, jcy = 0, jr = 55;
    function jStart(e) { var t = changed(e); jid = t.identifier; var r = joy.getBoundingClientRect(); jcx = r.left + r.width / 2; jcy = r.top + r.height / 2; jMove(e); }
    function jMove(e) {
      var t = findTouch(e, jid); if (!t) return;
      var dx = t.clientX - jcx, dy = t.clientY - jcy; var d = Math.sqrt(dx * dx + dy * dy);
      if (d > jr) { dx = dx / d * jr; dy = dy / d * jr; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      G.input.joyX = dx / jr; G.input.joyY = dy / jr;
    }
    function jEnd(e) { if (!findTouch(e, jid, true)) return; jid = null; G.input.joyX = 0; G.input.joyY = 0; knob.style.transform = 'translate(0,0)'; }
    joy.addEventListener('touchstart', function (e) { e.preventDefault(); jStart(e); }, { passive: false });
    window.addEventListener('touchmove', function (e) { if (jid !== null) jMove(e); }, { passive: false });
    window.addEventListener('touchend', jEnd); window.addEventListener('touchcancel', jEnd);

    // aim drag (right half)
    var aid = null, alx = 0, aly = 0;
    var aimZone = $('aim-zone');
    aimZone.addEventListener('touchstart', function (e) { e.preventDefault(); var t = changed(e); aid = t.identifier; alx = t.clientX; aly = t.clientY; }, { passive: false });
    window.addEventListener('touchmove', function (e) {
      if (aid === null) return; var t = findTouch(e, aid); if (!t) return;
      G.input.yaw -= (t.clientX - alx) * 0.006; G.input.pitch = U.clamp(G.input.pitch - (t.clientY - aly) * 0.006, -1.2, 1.0);
      alx = t.clientX; aly = t.clientY;
    }, { passive: false });
    window.addEventListener('touchend', function (e) { if (findTouch(e, aid, true)) aid = null; });

    // buttons
    this.btn('btn-fire', function (d) { G.input.fireHeld = d; });
    this.btn('btn-jump', function (d) { if (d) { G.input.jumpPressed = true; G.input.brakeHeld = true; } else G.input.brakeHeld = false; });
    this.btn('btn-enter', function (d) { if (d) G.player.enterExit(); });
    this.btn('btn-recruit', function (d) { if (d) G.player.recruitAction(); });
    this.btn('btn-prev', function (d) { if (d) G.player.cycleWeapon(-1); });
    this.btn('btn-next', function (d) { if (d) G.player.cycleWeapon(1); });
    this.btn('btn-pause', function (d) { if (d) G.togglePause(); });
    this.btn('btn-map', function (d) { if (d) G.toggleMap(); });
    this.btn('btn-radio', function (d) { if (d) G.cycleRadio(); });
    var emoteAlt = false;
    this.btn('btn-emote', function (d) { if (d) { G.player.emote(emoteAlt ? 'dance' : 'taunt'); emoteAlt = !emoteAlt; } });

    function changed(e) { return e.changedTouches[0]; }
    function findTouch(e, id, inChanged) {
      var list = inChanged ? e.changedTouches : e.touches;
      for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    }
  };
  HUD.btn = function (id, cb) {
    var el = $(id); if (!el) return;
    el.addEventListener('touchstart', function (e) { e.preventDefault(); el.classList.add('pressed'); cb(true); }, { passive: false });
    el.addEventListener('touchend', function (e) { e.preventDefault(); el.classList.remove('pressed'); cb(false); }, { passive: false });
    el.addEventListener('touchcancel', function () { el.classList.remove('pressed'); cb(false); });
  };

  G.hud = HUD;
})();
