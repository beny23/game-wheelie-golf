# Wheelie Golf Cart — Game Specification

## Core Fantasy
Ride a souped-up golf cart doing perpetual wheelies through bomb-laden fairways. Balance throttle to stay up, avoid flipping, and keep the nose off the ground or everything explodes.

## Platform and Target
- Platform: Web (desktop + mobile browsers)
- Engine: Phaser 3
- View: 2D side scroller, parallax background
- Session length: 1–5 minutes
- Input: Touch (press/hold) and keyboard (arrows/A+D), optional device tilt for mobile browsers

## Visual Style
- Procedural, minimal/flat shapes with generated terrain silhouettes, sky gradients, and simple VFX.
- Use palette-driven tints per run for variety; avoid heavy textures to keep loads light.

## Core Loop
1) Start run on a procedurally stitched course segment set. 2) Modulate acceleration to keep wheelie. 3) Navigate slopes/obstacles, collect pickups. 4) Reach checkpoint/flag for score; failures cause instant explosions or flips. 5) Upgrade cart and retry.

## Controls
- Single input: Press/hold to apply throttle and rear-wheel torque.
- Desktop: Spacebar or hold mouse/touchpad click anywhere on the playfield.
- Mobile: Touch and hold anywhere.
- Skill expression: Continuous modulation of hold duration/pressure to balance wheelie vs stall/flip; no separate brake.

## Physics and Failure States
- Cart pivots on rear axle; center of mass slightly rearward to encourage wheelie.
- Over-accel: Exceed pitch threshold → backflip → fail.
- Under-accel: Engine stalls meter; if stall timer fills, cart explodes.
- Nose contact: Front wheels touching ground triggers explosives (instant fail) except on safe pads.
- Impact damage: Colliding with obstacles at high speed triggers explosion.

## Course Design
- Segments: Alternating ascents, descents, rolling hills, and flats with spacing tuned for timing windows; procedurally stitched per run.
- Obstacles: Low ceilings, hanging signs, sand traps (slows accel), wind zones (affect pitch), bumpers that can ricochet.
- Explosive strips: Ground sections that trigger on front-wheel contact.
- Safe pads/bridges: Temporary zones where front wheels may touch down without penalty.
- Dynamic elements: Moving platforms, seesaws that alter angle, falling crates.

## Progression and Difficulty
- Procedural run-first approach: stitched segments with tagged difficulty.
- Early: Gentle slopes, sparse explosives, forgiving stall timers.
- Mid: Tighter hills, longer explosive strips, wind bursts, moving obstacles.
- Late: Compound obstacles, chained hills requiring rhythm, minimal safe pads.
- Endless: Escalating hazard density and slope variance over time.

## Scoring and Rewards
- Distance to flag or endless distance survived.
- Style: Airtime, close-calls near explosives, backflip saves (if backflip → recover).
- Pickups: Coins/energy along higher-risk lines; fuel cans to reset stall meter.
- Completion bonus: Time-based and no-fail multiplier.

## Monetization
- None (free prototype; no ads/IAP).

## Upgrades and Economy
- Engine: Torque curve, reduces stall meter fill rate.
- Suspension: Stability on landings and bump absorption.
- Tires: Grip and acceleration efficiency.
- Chassis: Durability vs obstacle impacts.
- Cosmetic: Skins, trails, horn sounds (non-power).

## UI/UX
- HUD: Speed, pitch angle indicator, stall meter, explosive proximity warning.
- Onboarding: 30s tutorial with ghost overlay showing throttle modulation.
- Failure replay: Quick auto-replay of last 5 seconds for share.

## Audio/FX
- Engine pitch tied to torque; stall sputter sound cues.
- Explosion variations; whoosh for wind zones; warning beep near explosives.
- VFX: Sparks on over-accel, smoke trail when stall meter high, shockwave on explosion.

## Technical Notes
- Engine: Phaser 3 using Matter Physics (preferred) for torque + wheel joints; Arcade Physics acceptable with custom torque simulation.
- Physics tone: Arcade; tuned forgiving stability, capped angular velocity, gentle recovery forces.
- Terrain: Spline-based or tiled heightmap rendered as bitmap layers; collision mesh generated per segment.
- Hazards: Front-wheel collision layer to detect explosive triggers; safe pads flagged separately.
- Performance: Target 60 FPS on modest devices; low object count, pooled obstacles/VFX; compressed textures; fit-to-screen scaling with letterbox on desktop and responsive HUD on mobile.

## Build Goals (Prototype)
- Deliver a playable Phaser web build with procedural course stitching, single-button throttle, and core fail states (flip, stall, nose-contact explosives).
- Implement basic HUD (speed, pitch indicator, stall meter) and minimal procedural art style.
- Keep code structured for later expansion (upgrades, more hazards) but ship a lean prototype quickly.

## Analytics and A/B
- Track fail reasons (over-accel, under-accel, nose touch, obstacle hit) and course segment IDs.
- Funnel: tutorial completion, first clear time, first upgrade purchase.

## Accessibility
- One-hand mode (swap controls), haptics toggle, colorblind-friendly hazard tint, adjustable VFX intensity.

## Tuning Dials
- Torque per input curve; stall meter decay/fill rates; explosive strip density; safe pad frequency; wind force; slope variance.

## Out-of-Scope (for MVP)
- Multiplayer, level editor, narrative campaign.
