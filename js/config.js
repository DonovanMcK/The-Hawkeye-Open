/* config.js — creates global G and all tuning tables from the spec. */
(function () {
  'use strict';

  var G = {};

  // ---- world constants ----
  G.cfg = {
    BLOCKS: 16,           // 16x16 grid of blocks (expanded map)
    BLOCK_SIZE: 36,       // building footprint span
    ROAD_W: 12,           // road width between blocks
    LANE_W: 3,
    SIDEWALK_W: 3,
    FOG_NEAR: 40,
    FOG_FAR: 170,
    DAY_LENGTH: 240,      // seconds for full day
    INTERNAL_H: 480,      // target internal vertical resolution (480p)

    // entity caps (§13)
    CAP_CIV: 30,
    CAP_GANG: 16,
    CAP_COP: 14,
    CAP_VEH: 22,
    CAP_BULLET: 64,
    CAP_PARTICLE: 200,

    AI_FULL_DIST: 60,     // full-rate AI radius
    PLAYER_HP: 150,
    PED_HP: 60,
    GANG_HP: 100,
    COP_HP: 100,
    SWAT_HP: 150,
    RECRUIT_HP: 120,
  };

  // day/night palette stops, in cycle order (t 0..1)
  G.palette = [
    { t: 0.00, name: 'night', sky: '#0a0e1a', sun: '#10182a', hemi: '#1a2740', sunI: 0.0, hemiI: 0.35 },
    { t: 0.18, name: 'dawn',  sky: '#c98ba6', sun: '#ffb27a', hemi: '#b89cc0', sunI: 0.5, hemiI: 0.7 },
    { t: 0.30, name: 'noon',  sky: '#7ec8e3', sun: '#fff5d6', hemi: '#bfe0ef', sunI: 1.0, hemiI: 0.9 },
    { t: 0.62, name: 'noon',  sky: '#7ec8e3', sun: '#fff5d6', hemi: '#bfe0ef', sunI: 1.0, hemiI: 0.9 },
    { t: 0.75, name: 'dusk',  sky: '#e8915a', sun: '#ff9d4d', hemi: '#e0a878', sunI: 0.7, hemiI: 0.75 },
    { t: 0.85, name: 'night', sky: '#0a0e1a', sun: '#10182a', hemi: '#1a2740', sunI: 0.0, hemiI: 0.35 },
    { t: 1.00, name: 'night', sky: '#0a0e1a', sun: '#10182a', hemi: '#1a2740', sunI: 0.0, hemiI: 0.35 },
  ];

  // ---- weapons (§5) ----
  // dmg, rpm, range, spread(deg), mag, ammoType, auto, pellets, projectile, price, clipPrice
  G.WEAPONS = [
    { slot: 1, id: 'fists',    name: 'FISTS',        dmg: 10,  rpm: 120,  range: 1.8, spread: 0, mag: 0,   ammo: null,     auto: true,  price: 0,    clipPrice: 0,   sfx: 'punch' },
    { slot: 2, id: 'pistol',   name: 'PISTOL',       dmg: 25,  rpm: 240,  range: 60,  spread: 1.5, mag: 17, ammo: '9mm',    auto: false, price: 100,  clipPrice: 20,  sfx: 'pistol' },
    { slot: 3, id: 'deagle',   name: 'DESERT EAGLE', dmg: 70,  rpm: 90,   range: 70,  spread: 2,   mag: 7,  ammo: '.50',    auto: false, price: 1000, clipPrice: 60,  sfx: 'deagle' },
    { slot: 4, id: 'uzi',      name: 'MICRO-UZI',    dmg: 14,  rpm: 900,  range: 45,  spread: 5,   mag: 30, ammo: '9mm',    auto: true,  price: 600,  clipPrice: 20,  sfx: 'uzi' },
    { slot: 5, id: 'shotgun',  name: 'SHOTGUN',      dmg: 12,  rpm: 60,   range: 25,  spread: 8,   mag: 6,  ammo: 'shells', auto: false, pellets: 8, price: 700,  clipPrice: 40,  sfx: 'shotgun' },
    { slot: 6, id: 'ak',       name: 'AK-47',        dmg: 30,  rpm: 480,  range: 80,  spread: 3,   mag: 30, ammo: 'rifle',  auto: true,  price: 1300, clipPrice: 50,  sfx: 'ak' },
    { slot: 7, id: 'sniper',   name: 'SNIPER RIFLE', dmg: 120, rpm: 40,   range: 200, spread: 0,   mag: 5,  ammo: 'rifle',  auto: false, scope: true, price: 2300, clipPrice: 80,  sfx: 'sniper' },
    { slot: 8, id: 'rpg',      name: 'RPG',          dmg: 120, rpm: 30,   range: 100, spread: 0,   mag: 1,  ammo: 'rockets',auto: false, projectile: true, price: 3800, clipPrice: 500, sfx: 'rpgwhoosh' },
    { slot: 9, id: 'minigun',  name: 'MINIGUN',      dmg: 20,  rpm: 1800, range: 60,  spread: 4,   mag: 100,ammo: '5.56',   auto: true,  spinup: 0.7, price: 7800, clipPrice: 300, sfx: 'minigun' },
  ];
  G.weaponById = {};
  G.WEAPONS.forEach(function (w) { G.weaponById[w.id] = w; });

  // ---- wanted system (§6) ----
  G.STAR_THRESHOLDS = [100, 250, 500, 900, 1500, 2400];
  G.HEAT = {
    punch: 15, fireGun: 10, killCivilian: 60, jackCar: 40, runOverPed: 50,
    killRival: 25, killCop: 250, destroyVehicle: 80,
  };
  // alive-cop caps and car counts per star
  G.WANTED_RESPONSE = [
    { cops: 0,  cars: 0, swat: 0, accuracy: 0.4 },   // 0 stars
    { cops: 2,  cars: 0, swat: 0, accuracy: 0.4 },   // 1
    { cops: 4,  cars: 0, swat: 0, accuracy: 0.45 },  // 2
    { cops: 6,  cars: 2, swat: 0, accuracy: 0.5 },   // 3
    { cops: 8,  cars: 3, swat: 0, accuracy: 0.62 },  // 4
    { cops: 10, cars: 3, swat: 3, accuracy: 0.7 },   // 5
    { cops: 12, cars: 4, swat: 6, accuracy: 0.78 },  // 6
  ];

  // ---- gangs (§7) ----
  G.GANGS = {
    grove:  { id: 'grove',  name: 'GROVE',  color: '#3da35d', rival: false },
    ballas: { id: 'ballas', name: 'BALLAS', color: '#7b3fa0', rival: true },
    vagos:  { id: 'vagos',  name: 'VAGOS',  color: '#d4a017', rival: true },
    neutral:{ id: 'neutral',name: 'NEUTRAL',color: '#555555', rival: false },
  };
  G.RESPECT = { rivalKill: 5, captureTerr: 15, recruitDeath: -10, loseTerr: -5 };

  // ---- vehicles (§8) ----
  G.VEHICLES = {
    sedan:   { name: 'Sedan',   maxSpeed: 28, accel: 16, color: 0x9fb0c0, gang: null },
    sports:  { name: 'Sports',  maxSpeed: 38, accel: 24, color: 0xc0392b, gang: null },
    lowrider:{ name: 'Lowrider',maxSpeed: 26, accel: 14, color: 0x2e7d32, gang: 'grove' },
    taxi:    { name: 'Taxi',    maxSpeed: 27, accel: 16, color: 0xf1c40f, gang: null },
    police:  { name: 'Police',  maxSpeed: 34, accel: 20, color: 0x1c3f6e, gang: null },
    bike:    { name: 'Dirt Bike', maxSpeed: 36, accel: 28, color: 0xd35400, gang: null },
    heli:    { name: 'Helicopter', maxSpeed: 46, accel: 18, color: 0x37474f, gang: null },
    tank:    { name: 'Rhino',   maxSpeed: 14, accel: 9,  color: 0x4b5320, gang: null },
  };

  // building tints
  G.BUILDING_TINTS = ['#d8c9a3', '#9e4b3c', '#8a8f96', '#5f8a86'];

  // flavor quips shown as notifications
  G.QUIPS = {
    recruit: ['"GROVE STREET — HOME."', '"FOR LIFE, HOMIE!"', '"LET\'S ROLL OUT!"', '"YOU GOT MY BACK, I GOT YOURS."'],
    war: ['"IT\'S GROVE STREET, FOOL!"', '"YOU PICKED THE WRONG HOOD!"', '"HOLD THE BLOCK!"'],
    capture: ['"THE HOOD IS OURS."', '"GREEN ON THE MAP, BABY."', '"ANOTHER ONE FOR THE FAMILIES."'],
  };

  // ---- runtime state (filled by game.js) ----
  G.scene = null; G.camera = null; G.renderer = null; G.clock = null;
  G.player = null;
  G.peds = [];        // active Ped objects
  G.vehicles = [];    // active Vehicle objects
  G.bullets = [];     // tracer/projectile pool entries (active)
  G.particles = [];   // active particle entries
  G.pickups = [];     // ground pickups (cash, ammo, guns, armor)
  G.city = null;      // city data (collision boxes, territories, landmarks)
  G.crew = [];        // recruited peds (subset of G.peds)
  G.cops = [];        // active cop peds (subset of G.peds)

  G.input = { keys: {}, mouseDown: false, rmbDown: false, yaw: 0, pitch: 0, touch: false, joyX: 0, joyY: 0, fireHeld: false, jumpPressed: false, brakeHeld: false };
  G.time = { game: 8 * 3600, dt: 0, dayT: 0.30, elapsed: 0 };  // game seconds clock, starts ~8am
  G.money = 0;
  G.heat = 0;
  G.stars = 0;
  G.respect = 0;
  G.kills = 0;
  G.muted = false;
  G.paused = false;
  G.started = false;
  G.over = false;        // win/lose freeze
  G.lastCopLOS = 0;      // last time a cop had line of sight
  G.camShake = 0;

  G.stats = { kills: 0, startTime: 0 };

  G.notify = function () {};   // assigned by hud
  G.income = { timer: 0 };

  // skills (0-100): improve with use — sprint speed, weapon spread, car accel
  G.skills = { run: 0, shoot: 0, drive: 0 };
  G.rampage = { active: false, t: 0, kills: 0, prev: null, prevSlot: 'pistol' };
  G.mission = null;     // active bounty {target}
  G.fare = null;        // active taxi fare {x,z,t}
  G.radioStation = 1;   // 0 off, 1-2 stations; remembered between cars
  G.beast = { active: false, t: 0 };  // beast-mode (one-punch kills)
  G.convoy = null;      // rival convoy event {cars,t,gang}
  G.challenge = null;   // deathwish wanted challenge {t}
  G.timeScale = 1; G.slowmoT = 0;     // kill-cam slow motion
  G.lowGravity = false; // MOON cheat
  G.magnetCar = null;   // car carried by the heli magnet
  G.ramps = [];         // stunt ramp zones
  G.HOMIE_NAMES = ['SWEET', 'RYDER', 'BIG BEAR', 'OG LOC', 'CESAR', 'WOOZIE', 'MAD DOGG', 'JIZZY'];

  G.U = window.U;
  window.G = G;
})();
