# GROVE WARS — San Andreas Streets

A self-contained, GTA: San Andreas–style open-world action game that runs in the browser
with **no build step and no external assets**. Open `index.html` and play.

It captures the PS2 "feel": low internal resolution upscaled with pixelation, heavy
fog matched to the sky color, gouraud-shaded box-people, an orange-haze dusk, a 4-minute
day/night cycle, synthesized audio, and an SA-style HUD + radar.

---

## How to play

**Just open `index.html`** in a modern browser (Chrome desktop, or iOS/Android Safari/Chrome).
It works straight off the filesystem (`file://`) — no server, bundler, or npm required.
Three.js r128 is loaded from a CDN via a classic `<script>` tag; everything else is local
plain scripts. (If you're offline, serve the folder over any static HTTP server instead so
the CDN script can be replaced/cached — but normally the CDN load is all that's needed.)

On the start screen, **click / tap to start** (this gesture unlocks audio and pointer lock).

### Goal
Take over San Andreas. The city is split into **16 territories** owned by your gang
(**Grove**, green) and the rivals (**Ballas** purple, **Vagos** yellow). Provoke and win
**gang wars** to flip territories to Grove. **Own all 16 to win.**

---

## Controls

### Desktop (keyboard + mouse)
| Input | Action |
|-------|--------|
| WASD | Move |
| Mouse | Aim / look (pointer lock) |
| LMB | Fire / punch (hold for full-auto weapons) |
| RMB | Scope (Sniper Rifle only) |
| Shift | Sprint |
| Space | Jump (on foot) / Handbrake (in car) |
| F | Enter / exit / jack nearest vehicle |
| G | Recruit a nearby Grove homie / dismiss (when looking at a recruit) |
| R | Reload |
| 1–9, mouse wheel, `[` / `]` | Switch weapons |
| M | Mute |
| Esc | Pause |

### Mobile (auto-detected; force with `?touch=1`)
- **Left virtual joystick** = move (full deflection auto-sprints).
- **Right half of the screen** = drag to aim / turn the camera.
- On-screen buttons: **FIRE**, **JMP/BRK**, **ENTER**, **CREW** (recruit), **◀ / ▶**
  (cycle weapons), **⏸** (pause).
- Fire has slight **aim assist** (snaps within ±5° to the nearest target) since touch
  aiming is hard.

---

## Systems overview

- **Weapons (slots 1–9):** Fists, Pistol, Desert Eagle, Micro-Uzi, Shotgun, AK-47,
  Sniper Rifle (scoped), RPG (projectile, blows up cars), Minigun (spin-up). Each has its
  own damage, fire rate, spread, magazine, and price. Get guns from **street pickups**
  (floating icons in alleys), **rival drops**, or the **Ammu-Nation** store.
- **Ammu-Nation:** walk into the **yellow marker** outside the gun shop to open a buy menu
  (guns, clips, and body armor). Costs deduct from your cash.
- **NPCs that fight back:** punch a civilian and ~40% turn and fight (a quarter of those
  pull a pistol); the rest flee screaming. Rival gangs aggro on sight in their turf.
- **Wanted system (★1–6):** crimes build heat and escalate the police response from a
  couple of foot cops → police cars that unload more cops → SWAT swarms with AKs. Break
  line of sight for 10 seconds and your stars decay.
- **Busted / Wasted:** get arrested (switch to fists or stop your car near a cop) or die,
  pay a fine, and respawn at the **Police Station** / **Hospital**.
- **Gangs, Respect & crew:** earn Respect by killing rivals and capturing turf. Recruit up
  to **2 + floor(Respect/25)** homies (max 6). They follow you, fight your enemies, and
  pile into your car.
- **Territory wars:** kill 3 rivals inside their turf within 60s to trigger a **GANG WAR** —
  survive 3 waves (4 / 6 / 8 attackers) to capture it (+$1000, +Respect, fireworks).
  Owned turf pays **income** every 30s, and rivals occasionally **counter-attack** turf you
  hold — defend it before the 60s timer runs out or you lose it.
- **Vehicles:** sedans, sports cars, lowriders, taxis, and (at ★3+) police cruisers, with
  arcade driving, jacking, traffic, and a damage → smoke → fire → explosion chain.
- **Day/night cycle:** a full day runs in 240 seconds; dusk turns the city orange and
  foggy, and street lamps + lit windows glow at night.

---

## Design choices (per spec)

- **Weapons are KEPT on Busted and Wasted** (a deliberate playability choice) — you only
  pay a cash fine and lose your wanted level.
- **PS2 look is intentional:** render resolution is capped near 480p and upscaled with
  `image-rendering: pixelated`; fog color always equals the sky color so distant geometry
  melts into the sky like a PS2 draw distance.
- **No shadow maps** — every character and car gets a fake dark "blob" shadow instead.
- **Materials are `MeshLambertMaterial` only** (gouraud-style), no PBR.
- **Zero asset files:** all geometry is procedural, all textures are drawn on `<canvas>`,
  all sound is synthesized with WebAudio, and fonts come from a CSS system-font stack.

---

## Architecture

Plain (non-module) scripts loaded in this exact order from `index.html`:

```
three.min.js (CDN, r128 UMD)
js/util.js        math helpers, seeded RNG, AABB, WebAudio synth engine
js/config.js      global G object + all tuning tables (weapons, heat, gangs, palettes)
js/city.js        city/territory generation, baked ground, collision grid, landmarks
js/peds.js        Ped class + FSM (civilian/gang/cop/recruit), box-person builder, pool
js/vehicles.js    Vehicle class, arcade physics, traffic AI, police cars
js/player.js      input (kb/mouse/touch), movement, camera, shooting, enter/exit
js/hud.js         HUD DOM, radar canvas, notifications, Ammu menu, touch controls
js/game.js        init, main loop, combat, director/spawner, wanted, wars, day/night, win/lose
```

All shared state lives on the single global `window.G`. The **director** in `game.js`
owns spawning/despawning around the player and enforces entity caps. Everything is pooled
(peds, vehicles, particles, tracers, pickups) to avoid per-frame allocations. Static city
geometry is merged into a few meshes and `InstancedMesh` is used for lamps and trees to
keep draw calls low.

---

## Testing

`test/smoke.js` is a headless Node harness that stubs `THREE`/DOM/canvas, boots the game,
and runs ~600 simulated frames while exercising every weapon, the full wanted escalation,
gang wars, explosions, recruiting, driving, respawns, the Ammu store, and the win path —
asserting nothing throws. Run it with:

```
node test/smoke.js          # desktop path
TOUCH=1 node test/smoke.js  # mobile/touch path
```

This validates that the code runs error-free; the visual look and game feel still need a
real browser to evaluate.

---

## Known limitations

- The smoke test verifies runtime correctness, not rendering — confirm the visuals and
  performance in an actual browser.
- Collision is AABB-only and ragdolls are simplified ("tip over and spin").
- Lit windows brighten globally at night rather than per-building.
- Traffic AI is a simple grid-follower with obstacle braking, not full pathfinding.
- If pointer lock is denied (e.g. inside an iframe), aiming falls back to drag-to-look.
- Audio requires the initial click/tap gesture to unlock WebAudio (browser policy).
