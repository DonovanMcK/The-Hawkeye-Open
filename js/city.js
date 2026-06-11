/* city.js — procedural grid city, collision grid, territories, landmarks, props. */
(function () {
  'use strict';
  var G = window.G, U = window.U;

  // ---------- texture factories ----------
  function windowTex(tint, lit) {
    return U.canvasTex(128, 128, function (ctx, w, h) {
      if (lit) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); }
      else { ctx.fillStyle = tint; ctx.fillRect(0, 0, w, h); }
      var cols = 4, rows = 5, pad = 6;
      var cw = (w - pad * (cols + 1)) / cols, ch = (h - pad * (rows + 1)) / rows;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var x = pad + c * (cw + pad), y = pad + r * (ch + pad);
        if (lit) {
          // only some windows lit
          if ((r * cols + c) % 3 === 0 || (r + c) % 4 === 0) {
            ctx.fillStyle = (r + c) % 2 ? '#ffe08a' : '#fff4c4';
            ctx.fillRect(x, y, cw, ch);
          }
        } else {
          ctx.fillStyle = '#1a2230';
          ctx.fillRect(x, y, cw, ch);
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(x, y, cw, ch * 0.4);
        }
      }
    });
  }

  // bake whole ground: grass + road grid + lane dashes + sidewalks
  function groundTex(C) {
    var SZ = 1024;
    return U.canvasTex(SZ, SZ, function (ctx) {
      var span = C.span;
      function px(x) { return (x - C.worldMin) / span * SZ; }
      function sc(u) { return u / span * SZ; }
      // grass
      ctx.fillStyle = '#3f6b3a'; ctx.fillRect(0, 0, SZ, SZ);
      // grass noise
      for (var i = 0; i < 1400; i++) {
        ctx.fillStyle = U.chance(0.5) ? 'rgba(60,100,55,0.5)' : 'rgba(45,80,42,0.5)';
        ctx.fillRect(Math.random() * SZ, Math.random() * SZ, 3, 3);
      }
      var road = C.cfg.ROAD_W, side = C.cfg.SIDEWALK_W;
      // sidewalks (concrete) around each building cell
      ctx.fillStyle = '#9a9a98';
      for (var bi = 0; bi < C.cfg.BLOCKS; bi++) for (var bj = 0; bj < C.cfg.BLOCKS; bj++) {
        var x0 = C.worldMin + bi * C.period + road / 2 - side;
        var z0 = C.worldMin + bj * C.period + road / 2 - side;
        var sw = C.cfg.BLOCK_SIZE + side * 2;
        ctx.fillRect(px(x0), px(z0), sc(sw), sc(sw));
      }
      // roads (asphalt) along gridlines
      ctx.fillStyle = '#3a3d42';
      for (var g = 0; g <= C.cfg.BLOCKS; g++) {
        var gx = C.worldMin + g * C.period;
        ctx.fillRect(px(gx - road / 2), 0, sc(road), SZ);  // vertical
        ctx.fillRect(0, px(gx - road / 2), SZ, sc(road));   // horizontal
      }
      // lane dashes (yellow center) + edge lines
      ctx.strokeStyle = '#c9b24a'; ctx.lineWidth = Math.max(1, sc(0.3));
      ctx.setLineDash([sc(2.5), sc(2.5)]);
      for (var g2 = 0; g2 <= C.cfg.BLOCKS; g2++) {
        var gp = px(C.worldMin + g2 * C.period);
        ctx.beginPath(); ctx.moveTo(gp, 0); ctx.lineTo(gp, SZ); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, gp); ctx.lineTo(SZ, gp); ctx.stroke();
      }
      ctx.setLineDash([]);
    });
  }

  // ---------- manual geometry merge ----------
  function mergeGeoms(geoms) {
    var posCount = 0, idxCount = 0, i;
    for (i = 0; i < geoms.length; i++) { posCount += geoms[i].attributes.position.count; idxCount += geoms[i].index.count; }
    var pos = new Float32Array(posCount * 3), nor = new Float32Array(posCount * 3), uv = new Float32Array(posCount * 2);
    var idx = posCount > 65000 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);
    var po = 0, no = 0, uo = 0, io = 0, vbase = 0;
    for (i = 0; i < geoms.length; i++) {
      var g = geoms[i];
      var p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array, ix = g.index.array;
      pos.set(p, po); po += p.length; nor.set(n, no); no += n.length; uv.set(u, uo); uo += u.length;
      for (var k = 0; k < ix.length; k++) idx[io++] = ix[k] + vbase;
      vbase += g.attributes.position.count;
      g.dispose();
    }
    var bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    bg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    bg.setIndex(new THREE.BufferAttribute(idx, 1));
    return bg;
  }

  function City() {
    var cfg = G.cfg;
    this.cfg = cfg;
    this.period = cfg.BLOCK_SIZE + cfg.ROAD_W; // 48
    this.span = cfg.BLOCKS * this.period;       // 576
    this.worldMin = -this.span / 2;
    this.worldMax = this.span / 2;
    this.buildings = [];
    this.lamps = [];
    this.territories = [];
    this.landmarks = {};
    this._grid = {};        // spatial hash of building indices
    this._cell = this.period;
    this.litMaterials = [];
    this.lampMat = null;
    this.gunSpawns = [];
  }

  City.prototype._gkey = function (cx, cz) { return cx + ',' + cz; };
  City.prototype._addToGrid = function (idx, box) {
    var c = this._cell;
    var x0 = Math.floor((box.minX - this.worldMin) / c), x1 = Math.floor((box.maxX - this.worldMin) / c);
    var z0 = Math.floor((box.minZ - this.worldMin) / c), z1 = Math.floor((box.maxZ - this.worldMin) / c);
    for (var x = x0; x <= x1; x++) for (var z = z0; z <= z1; z++) {
      var k = this._gkey(x, z);
      (this._grid[k] || (this._grid[k] = [])).push(idx);
    }
  };
  // return building boxes near a point
  City.prototype.queryBuildings = function (x, z) {
    var c = this._cell, cx = Math.floor((x - this.worldMin) / c), cz = Math.floor((z - this.worldMin) / c);
    var out = [], seen = {};
    for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
      var arr = this._grid[this._gkey(cx + dx, cz + dz)];
      if (!arr) continue;
      for (var i = 0; i < arr.length; i++) { if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(this.buildings[arr[i]]); } }
    }
    return out;
  };

  // resolve a moving circle against nearby buildings + world walls
  City.prototype.collide = function (x, z, r) {
    var boxes = this.queryBuildings(x, z), hit = false;
    for (var i = 0; i < boxes.length; i++) {
      var res = U.resolveCircleAabb(x, z, r, boxes[i]);
      if (res.hit) { x = res.x; z = res.z; hit = true; }
    }
    // world edge
    var m = this.worldMax - 2, n = this.worldMin + 2;
    if (x > m) { x = m; hit = true; } if (x < n) { x = n; hit = true; }
    if (z > m) { z = m; hit = true; } if (z < n) { z = n; hit = true; }
    return { x: x, z: z, hit: hit };
  };

  City.prototype.cellCenter = function (i, j) {
    return { x: this.worldMin + i * this.period + this.period / 2, z: this.worldMin + j * this.period + this.period / 2 };
  };
  // is a point on a road (for traffic / spawn placement)?
  City.prototype.onRoad = function (x, z) {
    var lx = ((x - this.worldMin) % this.period + this.period) % this.period;
    var lz = ((z - this.worldMin) % this.period + this.period) % this.period;
    var road = this.cfg.ROAD_W;
    return lx < road / 2 || lx > this.period - road / 2 || lz < road / 2 || lz > this.period - road / 2;
  };

  City.prototype.build = function () {
    var scene = G.scene, cfg = this.cfg, self = this;

    // ground
    var gmat = new THREE.MeshLambertMaterial({ map: groundTex(this) });
    var gp = new THREE.Mesh(new THREE.PlaneGeometry(this.span, this.span), gmat);
    gp.rotation.x = -Math.PI / 2; gp.position.y = 0;
    scene.add(gp);

    // ---- territories (4x4) ----
    var owners = [];
    // 16 territories: grove 2 corners, ballas 6, vagos 6, neutral 2
    var layout = [
      'grove', 'ballas', 'ballas', 'vagos',
      'ballas', 'neutral', 'vagos', 'vagos',
      'ballas', 'vagos', 'neutral', 'ballas',
      'vagos', 'ballas', 'vagos', 'grove'
    ];
    for (var ti = 0; ti < 4; ti++) for (var tj = 0; tj < 4; tj++) {
      var cx = this.worldMin + (ti * 3 + 1.5) * this.period;
      var cz = this.worldMin + (tj * 3 + 1.5) * this.period;
      this.territories.push({
        ix: ti, iz: tj, cx: cx, cz: cz, owner: layout[ti * 4 + tj],
        contested: false, contestTimer: 0, contestBy: null,
        minX: this.worldMin + ti * 3 * this.period, maxX: this.worldMin + (ti + 1) * 3 * this.period,
        minZ: this.worldMin + tj * 3 * this.period, maxZ: this.worldMin + (tj + 1) * 3 * this.period,
        flag: null
      });
    }

    // ---- landmarks: pick specific cells ----
    this.landmarks.hospital = { i: 2, j: 2 };
    this.landmarks.police = { i: 9, j: 3 };
    this.landmarks.ammu = { i: 5, j: 8 };
    var lmCells = {};
    lmCells[this.landmarks.hospital.i + ',' + this.landmarks.hospital.j] = 'hospital';
    lmCells[this.landmarks.police.i + ',' + this.landmarks.police.j] = 'police';
    lmCells[this.landmarks.ammu.i + ',' + this.landmarks.ammu.j] = 'ammu';

    // ---- buildings ----
    var tintGeoms = [[], [], [], []]; // per tint
    var lmGroup = new THREE.Group(); scene.add(lmGroup);
    var inset = cfg.SIDEWALK_W + 0.5;
    var half = cfg.BLOCK_SIZE / 2;
    for (var bi = 0; bi < cfg.BLOCKS; bi++) for (var bj = 0; bj < cfg.BLOCKS; bj++) {
      var center = this.cellCenter(bi, bj);
      var cellKey = bi + ',' + bj;
      if (lmCells[cellKey]) { this._buildLandmark(lmCells[cellKey], center, lmGroup); continue; }
      // subdivide cell into 1-2 cols/rows of buildings
      var cols = U.randInt(1, 2), rows = U.randInt(1, 2);
      var avail = cfg.BLOCK_SIZE - inset * 2;
      var cw = avail / cols, ch = avail / rows;
      for (var c = 0; c < cols; c++) for (var r = 0; r < rows; r++) {
        if ((cols > 1 || rows > 1) && U.chance(0.12)) continue; // occasional empty lot
        var bw = cw * U.rand(0.7, 0.92), bd = ch * U.rand(0.7, 0.92);
        var bx = center.x - avail / 2 + c * cw + cw / 2;
        var bz = center.z - avail / 2 + r * ch + ch / 2;
        var bh = U.rand(6, 35);
        var tint = U.randInt(0, 3);
        var geo = new THREE.BoxGeometry(bw, bh, bd);
        geo.translate(bx, bh / 2, bz);
        tintGeoms[tint].push(geo);
        var box = { minX: bx - bw / 2, maxX: bx + bw / 2, minZ: bz - bd / 2, maxZ: bz + bd / 2, top: bh };
        this._addToGrid(this.buildings.length, box);
        this.buildings.push(box);
        // alley gun spawns occasionally
        if (U.chance(0.06)) this.gunSpawns.push({ x: bx + bw / 2 + 2, z: bz, type: U.pick(['uzi', 'shotgun', 'ammo']) });
      }
    }
    // merge per tint -> 4 meshes
    var tints = G.BUILDING_TINTS;
    for (var t = 0; t < 4; t++) {
      if (!tintGeoms[t].length) continue;
      var merged = mergeGeoms(tintGeoms[t]);
      var mat = new THREE.MeshLambertMaterial({
        map: windowTex(tints[t], false),
        emissive: 0x000000, emissiveMap: windowTex(tints[t], true), emissiveIntensity: 0
      });
      this.litMaterials.push(mat);
      var mesh = new THREE.Mesh(merged, mat);
      mesh.frustumCulled = true;
      scene.add(mesh);
    }

    // ---- street lamps (instanced) + collect positions ----
    this._buildLamps(scene);
    // ---- palm trees (instanced) ----
    this._buildTrees(scene);
    // ---- territory flags ----
    this._buildFlags(scene);
    // ---- world fence ----
    this._buildFence(scene);
  };

  City.prototype._buildLandmark = function (type, center, group) {
    var cfg = this.cfg, bw = 22, bd = 22, bh = 12;
    var color, label;
    if (type === 'hospital') { color = 0xe8e8e8; label = 'hospital'; }
    else if (type === 'police') { color = 0x3a5a8a; label = 'police'; }
    else { color = 0xb04a2a; label = 'ammu'; }
    var mat = new THREE.MeshLambertMaterial({ color: color });
    var m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    m.position.set(center.x, bh / 2, center.z);
    group.add(m);
    // sign texture on a billboard
    var sign = U.canvasTex(256, 64, function (ctx, w, h) {
      ctx.fillStyle = type === 'hospital' ? '#cc2222' : (type === 'police' ? '#143a7a' : '#111');
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 38px Arial Narrow, Impact, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(type === 'hospital' ? 'HOSPITAL' : (type === 'police' ? 'POLICE' : 'AMMU-NATION'), w / 2, h / 2);
    });
    var sm = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.9, 4), new THREE.MeshLambertMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.4 }));
    sm.position.set(center.x, bh + 2.5, center.z + bd / 2 + 0.1);
    group.add(sm);
    // red cross for hospital
    if (type === 'hospital') {
      var cm = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0xcc2222, emissiveIntensity: 0.3 });
      var v = new THREE.Mesh(new THREE.BoxGeometry(1.5, 6, 0.4), cm); v.position.set(center.x, bh / 2 + 3, center.z + bd / 2 + 0.2); group.add(v);
      var hbar = new THREE.Mesh(new THREE.BoxGeometry(6, 1.5, 0.4), cm); hbar.position.set(center.x, bh / 2 + 3, center.z + bd / 2 + 0.2); group.add(hbar);
    }
    // collision box for landmark
    var box = { minX: center.x - bw / 2, maxX: center.x + bw / 2, minZ: center.z - bd / 2, maxZ: center.z + bd / 2, top: bh };
    this._addToGrid(this.buildings.length, box); this.buildings.push(box);
    this.landmarks[type].x = center.x; this.landmarks[type].z = center.z;
    // ammu yellow marker (handled by pickups/game); store
    if (type === 'ammu') {
      var ring = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 6, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffe000, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      ring.position.set(center.x, 3, center.z + bd / 2 + 5);
      group.add(ring);
      this.landmarks.ammu.markerX = center.x; this.landmarks.ammu.markerZ = center.z + bd / 2 + 5; this.landmarks.ammu.ring = ring;
    }
  };

  City.prototype._buildLamps = function (scene) {
    var positions = [];
    // place lamps along road gridlines every ~24 units
    var step = 24;
    for (var g = 0; g <= this.cfg.BLOCKS; g++) {
      var gx = this.worldMin + g * this.period;
      for (var p = this.worldMin + 12; p < this.worldMax; p += step) {
        positions.push({ x: gx + this.cfg.ROAD_W / 2 + 0.5, z: p });
        positions.push({ x: p, z: gx + this.cfg.ROAD_W / 2 + 0.5 });
      }
    }
    this.lamps = positions;
    var n = positions.length;
    var poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 6, 5);
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
    var poles = new THREE.InstancedMesh(poleGeo, poleMat, n);
    var headGeo = new THREE.SphereGeometry(0.5, 6, 5);
    var headMat = new THREE.MeshLambertMaterial({ color: 0x222222, emissive: 0xffd27a, emissiveIntensity: 0 });
    this.lampMat = headMat;
    var heads = new THREE.InstancedMesh(headGeo, headMat, n);
    var mtx = new THREE.Matrix4();
    for (var i = 0; i < n; i++) {
      mtx.makeTranslation(positions[i].x, 3, positions[i].z); poles.setMatrixAt(i, mtx);
      mtx.makeTranslation(positions[i].x, 6.1, positions[i].z); heads.setMatrixAt(i, mtx);
    }
    poles.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    scene.add(poles); scene.add(heads);
  };

  City.prototype._buildTrees = function (scene) {
    var pts = [];
    // scatter palms in park-ish spots: pick some empty cells centers, plus roadside
    for (var i = 0; i < 90; i++) {
      var x = U.rand(this.worldMin + 6, this.worldMax - 6);
      var z = U.rand(this.worldMin + 6, this.worldMax - 6);
      if (this.onRoad(x, z)) continue;
      // avoid buildings
      var c = this.collide(x, z, 1.5); if (c.hit) continue;
      pts.push({ x: x, z: z });
    }
    this.treePts = pts;
    var n = pts.length; if (!n) return;
    var trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 6, 5);
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
    var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
    var frondGeo = new THREE.ConeGeometry(2.4, 2.6, 6);
    var frondMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
    var fronds = new THREE.InstancedMesh(frondGeo, frondMat, n);
    var mtx = new THREE.Matrix4();
    for (var i2 = 0; i2 < n; i2++) {
      mtx.makeTranslation(pts[i2].x, 3, pts[i2].z); trunks.setMatrixAt(i2, mtx);
      mtx.makeTranslation(pts[i2].x, 6.6, pts[i2].z); fronds.setMatrixAt(i2, mtx);
      // tree collision (thin)
      var box = { minX: pts[i2].x - 0.4, maxX: pts[i2].x + 0.4, minZ: pts[i2].z - 0.4, maxZ: pts[i2].z + 0.4, top: 6 };
      this._addToGrid(this.buildings.length, box); this.buildings.push(box);
    }
    trunks.instanceMatrix.needsUpdate = true; fronds.instanceMatrix.needsUpdate = true;
    scene.add(trunks); scene.add(fronds);
  };

  City.prototype._buildFlags = function (scene) {
    for (var i = 0; i < this.territories.length; i++) {
      var t = this.territories[i];
      var g = new THREE.Group();
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 5), new THREE.MeshLambertMaterial({ color: 0x888888 }));
      pole.position.y = 4; g.add(pole);
      var flagMat = new THREE.MeshLambertMaterial({ color: U.hexInt(G.GANGS[t.owner].color), side: THREE.DoubleSide, emissive: U.hexInt(G.GANGS[t.owner].color), emissiveIntensity: 0.25 });
      var flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8), flagMat);
      flag.position.set(1.5, 7, 0); g.add(flag);
      g.position.set(t.cx, 0, t.cz);
      // raise flag to ground if inside a building footprint, nudge
      scene.add(g);
      t.flag = g; t.flagMat = flagMat;
    }
  };
  City.prototype.setTerritoryOwner = function (t, owner) {
    t.owner = owner;
    var col = U.hexInt(G.GANGS[owner].color);
    t.flagMat.color.setHex(col); t.flagMat.emissive.setHex(col);
  };

  City.prototype._buildFence = function (scene) {
    var m = new THREE.MeshLambertMaterial({ color: 0x5a5a5a });
    var h = 3, half = this.span / 2;
    var spans = [
      { x: 0, z: -half, w: this.span, d: 0.6 },
      { x: 0, z: half, w: this.span, d: 0.6 },
      { x: -half, z: 0, w: 0.6, d: this.span },
      { x: half, z: 0, w: 0.6, d: this.span },
    ];
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      var f = new THREE.Mesh(new THREE.BoxGeometry(s.w, h, s.d), m);
      f.position.set(s.x, h / 2, s.z); scene.add(f);
    }
  };

  // night lighting toggle (called by game.js day/night)
  City.prototype.setNightLevel = function (level) {
    // level 0 (day) .. 1 (night)
    for (var i = 0; i < this.litMaterials.length; i++) {
      var mat = this.litMaterials[i];
      mat.emissive.setHex(0xffcc66);
      mat.emissiveIntensity = level * 0.9;
    }
    if (this.lampMat) this.lampMat.emissiveIntensity = level;
  };

  // territory owner at a point
  City.prototype.territoryAt = function (x, z) {
    for (var i = 0; i < this.territories.length; i++) {
      var t = this.territories[i];
      if (x >= t.minX && x < t.maxX && z >= t.minZ && z < t.maxZ) return t;
    }
    return null;
  };

  G.City = City;
})();
