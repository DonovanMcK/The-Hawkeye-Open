# GAME_SPEC.md — "Grove Wars" (GTA San Andreas–style PS2 browser game)

**This document is the complete build prompt.** Build the game exactly as specified here.
Everything needed is in this file — do not ask clarifying questions; where a detail is
missing, choose the option closest to GTA: San Andreas on PS2. The final output must be
CLEAN and PLAYABLE — a fun, stable game, not a tech demo.

---

## 1. Mission & Hard Constraints

Build a 3D open-world action game in the browser that captures the look and feel of
**GTA: San Andreas on PlayStation 2**.

Hard constraints (non-negotiable):

1. **Runs by opening `index.html` directly** (file:// protocol). No build step, no
   bundler, no npm, no dev server required to play.
2. **Three.js r128 UMD** loaded via classic script tag:
   `<script src="https://unpkg.com/three@0.128.0/build/three.min.js"></script>`
   All game code is plain (non-module) `<script>` files — no ES module imports anywhere
   (module-relative imports break on file://).
3. **Zero external assets.** No image files, no audio files, no fonts, no models. All
   geometry procedural, all textures generated on `<canvas>`, all sound synthesized with
   WebAudio, fonts from a CSS system-font stack.
4. **Must work on desktop (keyboard+mouse) AND mobile (touch controls)** — see §11.
5. **60 FPS target on a mid-range laptop**, ≥30 FPS on a phone.
6. No console errors at any point during a 10-minute play session.

See full original spec sections §2–§17 below (preserved verbatim from the build prompt).

---

## 2. PS2 Aesthetic
- Low internal resolution ~854×480, upscale, `image-rendering: pixelated`.
- Fog is the star: `THREE.Fog(skyColor, 40, 170)`, fog color == sky/clear color.
- Materials: `MeshLambertMaterial` only. Fake blob shadows.
- Lighting: one HemisphereLight + one DirectionalLight, day/night driven.
- Day/night cycle: full day = 240s. Noon sky `#7ec8e3`; Dusk `#e8915a`; Night `#0a0e1a`;
  Dawn `#c98ba6`. Nearest ~8 lamps get real PointLights at night.
- Characters: chunky articulated box-people. Player looks like CJ.
- Post: CSS scanlines + vignette overlay.
- HUD: chunky bold condensed text with dark outline.

## 3. The City
- Grid city 12×12 blocks. Block 36u buildings + 12u roads (2 lanes each dir, lane 3).
  Sidewalks 3u with curbs.
- Buildings 2–5 per block, heights 6–35u, canvas window textures, lit at night.
- Props: palm trees, street lamps every ~24u, park blocks, hydrants/dumpsters.
- Landmarks: Hospital (wasted respawn), Police station (busted respawn),
  Ammu-Nation (yellow marker buy menu).
- Collision: AABB grid, world edge wall+fence.
- Territories: 4×4 = 16. Grove (green) 2 corners; Ballas (purple) 6; Vagos (yellow) 6;
  2 neutral. Radar tint + in-world flags.

## 4. Entities & AI
One Ped class + FSM. Full-rate AI within 60u, 1/4 beyond.
- Civilians ~30: wander → on crime 60% flee / 40% fightBack. Fighters punch (8 dmg),
  25% carry Pistol. Give up below 30% HP. 60 HP. Drop $10–40, some ammo.
- Gang members: Grove friendly+recruitable; rivals hostile (aggro 25). 100 HP.
- Cops at wanted ≥1. 100 HP (SWAT AK 150). pursue→engage→arrest (BUSTED).
- Bullets hitscan + tracers + muzzle flash. Headshot ×2. Ragdoll-lite, blood decals.
- Explosions radius 7, 120 dmg falloff, camera shake.

## 5. Weapons (slots 1–9)
Fists, Pistol, Desert Eagle, Micro-Uzi, Shotgun, AK-47, Sniper, RPG, Minigun.
(See config.js WEAPONS table for exact dmg/rpm/range/spread/mag/price.)

## 6. Wanted (1–6 stars)
Thresholds 100/250/500/900/1500/2400. Heat per crime per table. Decay −40/s after 10s
no line-of-sight. Escalating response 1→6. Busted/Wasted with fees, weapons KEPT.

## 7. Gangs / Respect / Recruiting / Wars
Respect 0–100. Crew cap 2+floor(respect/25) max 6. Recruit with G. Territory wars
3 waves (4/6/8). Capture +$1000 +15 respect. Income +$50×territories/30s.
Rival counter-attacks. Win: own all 16.

## 8. Vehicles
Sedan/Sports/Lowrider/Taxi/Police. Arcade physics. Enter/exit/jack (F). Damage→smoke→
fire→explode. Traffic ~10. Chase cam.

## 9. Audio — WebAudio synthesis only.

## 10. HUD — SA layout, DOM + 2D canvas radar.

## 11. Controls — desktop kb/mouse + mobile touch.

## 12. Architecture — plain scripts, load order:
three.min.js, js/util.js, js/config.js, js/city.js, js/peds.js, js/vehicles.js,
js/player.js, js/hud.js, js/game.js. Shared state on global `G`.

## 13. Performance budgets — caps: 30 civ, 16 gang, 14 cops, 22 veh, 64 bullets,
200 particles. <300 draw calls.

## 14. Edge cases must not crash.

## 15. Acceptance checklist — verify all 11 items.

## 16. Deliverables — game + README + this spec.

## 17. Stretch — drive-by, armor pickups, missions, photo-mode, gamepad.
