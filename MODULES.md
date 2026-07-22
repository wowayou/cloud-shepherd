# MODULES.md — handoff spec for GPT / Sonnet / Opus

## Where things stand

**2026-07-23 — Core verdict: B.** Campaign v1 (drag-cloud logistics) is
*teachable but not fun* (user: can figure it out, does not want another run).
Direction **1+4 weather toy + valley guardian** is prototyped under `src/v2/`.
**Fun bar:** see `FUN.md` — solo, "do I want one more run after ~3 min?".
Entry: level-select → **✨ 试玩新核心**. v1 campaign is frozen for fun-evaluation.


The v1 grey-box milestone turned into a **fully working game**, not just
stubs: all 21 campaign levels (tutorial + 20, × easy/hard) are playable start to
finish — drag the cloud, fight the wind, absorb over seas (single left
strip, centre lake, or dual coast), rain on fields with continuous
intensity, bloom (with eco butterflies), get scored, see a fact card,
progress to the next level. It has been manually verified end-to-end in a
real Chromium browser (not just `npm test`/typecheck — see "the
pointer-events bug" below for why that distinction matters).

Rounds 1–16 are **done** (16.1 retracts energy + soak chrome) — the table below is complete; there is no
outstanding `dispatched`/`in review` work. The game deploys to GitHub
Pages via `.github/workflows/deploy.yml` on every push to main. Wind is a
real mechanic again (round 7). Rain is continuous (round 9). Layouts can
break the left-sea template (round 10). Cloud form + mountain runoff landed in round 11. Remaining ceiling-raise
backlog: deeper hydrology (snow/rivers CA), cloud split, seasons, music
layers, eco-dex / meta-game — see Round 9 for why those stay parked.

So the job for each module now is **refinement, not bootstrapping**: tune
feel, deepen the art/audio, harden edge cases — without breaking the other
five modules, which you should not need to touch or even read closely.

## Refinement status

Only Claude tiers (Opus/Sonnet/Haiku) are dispatchable as agents in this
workflow — "GPT" in the doc title reflects the original brief's intent
(mix vendors) but isn't wired up yet; the owner column below reflects who
actually did the work.

| Round | Module | Owner | Status | Notes |
|-------|--------|-------|--------|-------|
| 1 | Sim | Opus (agent, worktree) | done (`812fafc`) | cloud-follow spring-damper retuned (PULL_ACCEL 22→90, VEL_DAMPING_PER_SEC 2.4→16; ζ≈0.26→0.84, kills ~42% overshoot) + mountain leak now has a safety margin instead of a razor-edge cliff at the exact peak |
| 1 | Render | Sonnet (agent, worktree) | done (`a31f4cf`, merged `07bf097`) | redesigned cloud (9-bump blob, radial shading, animated face, drip-hem), fields (cracks/sprouts/3-flower bloom pop/overwater ripples), mountains (jagged deterministic multi-peak ridge + treeline) — reviewed against my own Playwright screenshots before merging, not just the agent's word |
| 2 | Levels | Opus (agent, worktree) | done (`25b4acc`, merged `ea3ca43`) | round 1's Sim retune made every hard level auto-earn 3★ against the old flat 22s/34s gate; replaced with per-level `starThresholds` calibrated against a measured "ideal run" (deterministic `createSim()`) + real Playwright playthroughs — 3★≈2× ideal, 2★≈3× ideal, 1★ beyond (still a win) |
| 2 | Audio | Sonnet (agent, worktree) | done (`ab56732`) | new ADSR tone engine (attack/decay/sustain/release + pitch glide + vibrato + bell "partial" layer) replaces flat beeps for every event; `mountainLeak` switched from a tone to filtered noise for timbral distinction from `evaporate`. Empirically verified via OfflineAudioContext waveform analysis (peak amplitude, silence checks, Goertzel frequency-content checks) — caught and fixed a real bug where a pitch glide finished after the gain envelope had already faded to near-silence |
| 3 | Input | Opus (agent, worktree) | done (`8ed1e50`) | the auto-rain heuristic's reach (`NEAR_FIELD_REACH_FRAC` 0.09) was already a touch looser than Sim's *wet* reach (`RAIN_REACH_FRAC` 0.055); under round-1's near-instant-settle physics that ordering matters (auto-rain arms just outside the wet band so it engages the instant a slow drag enters wet range, never firing where the nearest-field lookup returns nothing → no wasted-rain dump). Constant unchanged — this round was a doc pass naming that tradeoff explicitly so a future tuner reads it, since the buggy alternative (auto-rain fires but no field is wet) is the class of thing `npm test` can't see and only manual dragging exposes |
| 3 | UI | Sonnet (agent, worktree) | done (`9d4cf7a`) | closed both known gaps: the fact card is now a prompt-then-flip reveal (shows "你知道吗？ 点一下看看" → tap flips to the full fact), wiring the two previously-dead STRINGS (`result.tapToFlip`, `result.knowThis`) that the card's `cursor:pointer` had promised but never delivered. Two new headless smoke tests guard the flip (21 green, was 19). The mute-icon local-state gap (icon toggles via local `hudMuted`, not by reading `AudioModule.isMuted()`) was re-checked and left as-is — the HUD button remains the only mute entry point, so local state still tracks truth correctly |
| 4 | UI (chrome) | salvaged from an interrupted round-3 Sonnet worktree | done | HUD/menu visual-coherence pass: gradient + soft-shadow chrome echoing the Canvas palette (buttons, pills, water gauge, glossy rain button, pause/result cards), per-star pop animation, glow on the unrevealed fact card. Provenance: the round-3 UI agent died mid-run to a session limit; its uncommitted CSS was adjudicated, adapted to the *landed* tap-to-flip DOM (its competing two-way flip implementation was discarded — the landed one-way flip has tests), and re-verified in a real browser (drag + all screens + flip). The same interrupted round also left an Input hysteresis fix whose premise ("parked cloud holds a steady near-45 speed → rainHeld flicker") was disproven by a deterministic Sim probe (steady speeds are constant plateaus, 0 flips across a parked-height sweep with simulated tremor) and discarded |
| 5 | cross-module (playtest fixes) | main session (Fable) | done | Fixes driven by the user's first real playtest. **Bugs**: rain loop never stopped (sim early-returns once `complete`, so the completing step must emit `rainStop` — now enforced by a regression assertion in `tests/sim.test.ts`; pause/quit/retry/next/tab-hidden also force-stop it in `scenes.ts`); level-select showed cleared levels as locked (`goToLevelSelect` used a stale profile snapshot — now re-reads from the store); mid-level window resize left dead letterbox bars (world is now re-fit from the level's normalized defs on resize, preserving moisture/bloom/water). **Feel**: rain sound rebuilt as lowpassed pink noise at ~half volume (old 2200Hz white-noise bandpass was "难受"); note there is deliberately no separate background music — the only loop is rain. **Teaching** (playtest: "操作没有体现水循环"): sun now visibly drives the cycle (drawn over the sea, pulsing), evaporation is visible (ambient wisps off the sea + a dense vapor stream climbing into a drinking cloud), the HUD gained a ☀️→☁️→🌧️→🔁 stage strip that lights the stage the player is causing right now, HUD shows the current level name (fixes "am I still on the tutorial?" confusion), and tutorial copy now names 水蒸气/蒸发 explicitly. **Deliberately deferred**: "操作太简单机械" — adding mechanics is a design decision (options: rain-accuracy skill, day/night pacing, revisiting wind-as-drag), parked for the user to pick, not bolted on unilaterally |

| 6 | Audio (bugfix) | main session (Opus) | done | **Round 5's rain-sound rebuild made the rain inaudible.** It set gain `0.18→0.09` reasoning "half the old volume", but `pinkNoiseBuffer` already bakes in a `*0.11` scale that the old white-noise buffer never had, and the 850Hz lowpass put the remainder under the rolloff of the laptop/phone speakers this actually gets played on. Measured through an OfflineAudioContext in headless Chromium: **-45.4 dBFS overall, only 58% surviving a >500Hz speaker ⇒ ~-50 dBFS effective** — silent in any real room. Fixed to pink noise → lowpass 1600Hz → highpass 160Hz (drops sub-bass rumble small speakers can't reproduce anyway, which was only eating headroom) → gain 0.28: now **-38.2 dBFS with 93% surviving >500Hz**, ~11 dB louder where it counts while staying below the old harsh version overall, so the "不难受" character round 5 was chasing is preserved. Verified additionally by a real Playwright playthrough (skim sea → 100% water → hold over field): rain loop starts and stops cleanly, no console errors |

| 8 | cross-module (natural-law causality, wind/bird/thermal quality, escalating difficulty) | main session (Opus) | done | Driven by a third playtest asking for causality over captions — see the dedicated section below. Cold-front thaw, mass-scaled wind, a simulated sun driving evaporation/thermals visibly, bird flocks instead of a lone silhouette, wind-swept grass, gusts slowed to read as weather, obstacles now start at level 3 and escalate. Tests 32 → 36 |
| 9 | cross-module (rain pressure + juice — ceiling-raise Phase 1 slice) | main session (Opus) | done | Driven by the user's ceiling-raise design doc. **Not a wholesale build of the 12-week roadmap** — see the dedicated section below for what was cut and why. Shipped: continuous rain intensity via hold-duration (device-universal; force-touch / second-finger deliberately rejected as 6yo-simplest-path breakers), `rainPressure` on InputIntent/Cloud, rate mul 0.3..1.5 anchored so missing pressure = rate×1.0 (autopilot + star gates unchanged — `calibrate.ts` still all-ok in the 1.35×–3.2× band), particles 40→220 with pressure-scaled density/spray/fall, cloud face moods (idle/drinking/full/raining/chilled), storm-dark underside + drip-hem depth on heavy rain, rainbow on full-bloom + sun + residual rain (optical causality, no caption), rain-loop gain/cutoff track pressure around the round-6 measured anchor. Tests 36 → 39. **Out of scope this round** (still design-doc only): hydrology module, cloud split/morphology, eco-dex, music layers, seasons, sandbox, 32-level chapter plan |
| 10 | cross-module (eco bloom juice + multi-sea layouts) | main session (Opus) | done | Next ceiling-raise slice after rain pressure. **Eco**: pure-render butterflies/bees on bloomed fields once `bloom01 > 0.55` — no Sim entities, no meta-collection, deterministic via `hash1(field.id)`. **Multi-sea**: `GameState.seas: SeaRegion[]` + optional `LevelDef.seas`; legacy `seaWidthN` still expands to a single left-edge sea so L0–15 need zero edits. Absorb / vapor / face / land-fill / autopilot all use any-of / nearest-of. **Two new levels**: L16 中间的湖 (centre lake, radial fields), L17 两边都是海 (dual coast). Completability autopilot + calibrate all green; tests 39 → 40. **Still out**: hydrology runoff/snow, cloud split, eco-dex, music, seasons |
| 11 | cross-module (cloud form + mountain runoff) | main session (Opus) | done | **Cloud form (no split)**: high+empty → flatter silhouette + snappier pointer spring; full → puffier + heavier spring (only multiplies PULL_ACCEL, wind settle axis untouched). **Light hydrology**: rain on a mountain slope queues `RunoffPacket`s (55% captured, 1.8s delay) to nearest downhill field; rest still wasted. Visual trickle + soft runoff SFX. No CA/height-field/snow. Tests 40 → 42; calibrate still all-ok. Honest deviations documented. |
| 12 | cross-module (snow line + melt) | main session (Opus) | done | Rain above `snowLineN` freezes into per-mountain SnowPack; sun intensity ≥0.45 melts into the runoff queue. L18 山顶的雪. Flakes + cap render, snowFall/snowMelt SFX. Simplest path still direct field rain. Tests 42→43. |
| 13 | cross-module (eco-dex + ambient pad) | main session (Opus) | done | Profile ecoDex unlocks flower/butterfly/bee on fieldBloom (matches render eco). New ecodex scene from level-select. Soft sun-keyed ambient pad (optional setAmbient) under rain. Storage v2 with v1 migrate. Tests 43→44. |
| 14 | cross-module (seasons + L19–20) | main session (Opus) | done | Optional LevelDef.season tints sky/land; tiny evap bias (summer ×1.12, winter ×0.88). L19 夏天的太阳, L20 秋天的雨. Never a hard gate. Calibrate ok. |
| 15 | cross-module (daily challenge) | main session (Opus) | done | Date-seeded LevelDef id=900 via mulberry32(YYYYMMDD). Level-select 今日天气 button. Same day = same layout; no server. Completability tests for several seeds. Daily next → level list. Ceiling-raise Phase 1–meta slice closed. Tests 44→49. |
| 16 | cross-module (play feel + art + softer facts) | main session (Opus) | done | **Wider rain reach** 0.055→0.12 (no soak discs — those looked wrong). **Facts** demoted to footnote under Next. **Energy system removed** (did not match level count; wrong for this game). Wind ribbons + bird flock art kept. Honest design note: ceiling-raise meta (daily/eco/seasons) stacked features; core verb still needs playtest, not more systems. |
| 7 | cross-module (wind, obstacles, levels, stars) | main session (Opus) | done | Driven by a second playtest ("怎么才能三星呀，你也没明确说明；加风阻；通关之后的滚动条有时候会莫名卡住；再多设计一些关卡，加点动态障碍"). **Wind is a real mechanic again** — see the rewritten section below; the round-2 "wind is cosmetic" decision is now reversed with the user's explicit go-ahead. **Three dynamic obstacles** (热气流 / 飞鸟群 / 冷空气团) with sim, render, audio and per-obstacle events. **Five new levels (11–15)**, one per obstacle then two combining them. **Star criteria are finally stated**: the 3★ gate on the level-select card, a live `⏱ x/ys 💧 a/b` pill in the HUD, and a result-screen breakdown naming which gate you missed. **Two bugs found and fixed en route** — the level-select grid was unscrollable (`ec2fffc`) and clamping left phantom velocity (below). Tests 21 → 32; `tools/` gained the calibration rig round 2 used but never committed |

### The clamped-spring bug: holding low over a field silently did nothing

Found in round 7 while scripting a Playwright playthrough that kept failing to
water anything. The cloud's position was clamped to the playfield but its
**velocity was not**. Hold the finger low — which is exactly how you water a
field — and the spring keeps accelerating toward a target below the floor the
cloud can never reach, so it sits visually still while carrying ~137 world-units/sec
of phantom speed (`(target−floor)·PULL_ACCEL/VEL_DAMPING`).

Input arms auto-rain only under `NEAR_STILL_SPEED = 45`. So "hold still over the
field", the game's primary rain gesture and the one the tutorial teaches, did
nothing at all whenever the player held low — and holding low is the natural way
to do it. `npm test` was fully green throughout; the bug needed either a real
playthrough or the deterministic probe now in `tests/sim.test.ts`.

Fix: zero the velocity component that got clamped, which is also just what
hitting a wall should do. Guarded by two regression tests (floor and side walls).

### Wind, resolved: a displacement axis independent of the pointer spring

**This supersedes the round-2 decision that wind stays cosmetic.** That decision
was explicitly conditioned on not re-opening it without the user, and on
2026-07-20 the user re-opened it ("加风阻") and picked the model below from three
options.

Wind used to be an acceleration added alongside the pointer pull, which made its
strength a hostage of pointer stiffness: steady-state offset was
`windX / PULL_ACCEL`, so round 1's `PULL_ACCEL 22→90` silently shrank wind from
0.64 to 0.16 world-units on a ~1150-wide world.

Wind now offsets the **settle point**: while dragging, the cloud homes to
`pointer + windX` instead of `pointer`, so `windX` *is* the displacement in world
units and is completely independent of `PULL_ACCEL`/`VEL_DAMPING`. ζ≈0.84 and ω
are untouched, so round 1's verified drag feel survives any future wind retune —
which was the actual reason wind was left cosmetic the first time. Verified by
deterministic probe: a held cloud parks within 1 unit of the declared offset at
0/20/45/60/−40.

Released clouds get a separate, gentler push (`WIND_FREE_DRIFT_PER_UNIT = 20`,
terminal drift ≈1.25·windX u/s). Reusing the settle-point term as a raw
acceleration would give ≈5.6·windX ≈ 250 u/s, which reads as slapstick rather
than weather.

L7/L8 now deliver what their names promise: L7 parks the cloud 34u downwind
(~⅓ of a field's ~86u rain-catch radius, so you must aim upwind to water
accurately), L8 swings between ~2u and ~54u on a 3.2s gust cycle.

### Round 16.1: retract energy + soak chrome; keep the real fixes

User feedback after 16: energy is unnecessary (level count already paces a
session); soak discs look wrong; residual dissatisfaction may mean the *core*
loop, not the missing features, is the problem.

**Kept from 16:** wider rain reach (0.12), soft fact footnote, wind/bird art,
no glowing 你知道吗 billboard.
**Removed:** daily energy module, rest-hint gate, GroundSoak sim/render/tests.
**Design honesty:** stacking seasons/daily/eco-dex without fixing "is dragging
a cloud to water fields actually fun for 6 minutes?" was the wrong altitude.
Next work should be playtest-led on the core verb, not more meta systems.

### Round 16: rain lands on the ground + softer session design

Playtest: "only works when the cloud is glued to the field" and "你知道吗 is
too intrusive"; also asked to learn from 《赵云与阿斗》-style pacing without
IAA, and to beautify wind/birds.

**Ground soak.** Missed rain (not on field/mountain/snow) creates a
`GroundSoak` disc; nearby fields draw moisture with inverse-distance weight
over ~2.2s. Direct over-field rain is still best (simplest path). 30% of
off-field rain still wastes so aim still matters for stars.

**Facts demoted.** Result screen: stars → star-why → **Next/Back** → optional
rest hint → tiny fact footnote. No glow animation. Copy: "小知识 · 想看就点".

**Energy (non-IAA).** 5 starts/day, 1 per level, +1 / 20min, full refill at
midnight. No ads, no purchase. Empty → soft message on level-select, not a
paywall. Session rest hint after 12 minutes of active play (never hard-locks).

**Wind/bird art.** Wind = layered undulating ribbons with soft tips (no HUD
arrowheads). Birds = body+belly+beak+tail flock with real flap arc; hitbox
unchanged (lead only).

### Round 15: daily weather challenge

`buildDailyLevel()` seeds a LevelDef from local `YYYYMMDD` (mulberry32). Fixed
id 900 so progress clears don't collide with campaign 0–20. Always unlocked
from level-select (今日天气). Same calendar day → identical layout; no network.
Constraints enforced in the generator: left sea, fields on land, generous star
gates, optional mountain/thermal/wind/snow. `onNext` from daily returns to the
list rather than seeking id 901.

This closes the ceiling-raise roadmap's shippable slice (verb depth → layouts →
light hydrology → snow → meta/eco → seasons → daily). Still parked by design:
cloud split, full CA hydrology, leaderboards, cosmetics shop, sandbox editor.

### Round 14: seasons (presentation + tiny bias)

`LevelDef.season` colours sky and land and multiplies evaporation by a few
percent (summer faster, winter slower). Never changes win conditions or
star gates. L19/L20 are the teaching beats; L18 already carries winter via
snowLineN. Same map / different season content is backlog — this round only
adds the *axis*.

### Round 13: eco-dex + ambient pad

Meta without pressure: blooming a field unlocks flower + butterfly (and bee
on odd field ids) into `Profile.ecoDex`. Level-select gains an 生态图鉴 button;
locked slots show "？？？". Never gates stars or unlocks.

Audio: optional `setAmbient(sunIntensity)` keeps a very quiet two-sine pad
under the rain loop, root drifting with dawn/noon/dusk. Rain stays primary;
pad fades on pause/quit/complete. Round 5's "no background music" decision
is softened, not reversed — measured quiet, no external files.

### Round 12: snow line + melt (solid precipitation)

Rain above an optional `LevelDef.snowLineN` freezes into a `SnowPack` on the
mountain under the cloud. Sun intensity above 0.45 melts packs into the same
`RunoffPacket` queue as round-11 slope runoff — so "stock the peak, wait for
noon" is a real alternate strategy, while the simplest path (rain straight
onto fields) still always works (never-fail / 6yo). L18 山顶的雪 teaches it.
Honest: no per-pixel height field, no avalanche, no permanent winter map —
just freeze/melt on the existing mountain + sun axis.

### Round 11: cloud form + mountain runoff (light hydrology)

Two small lessons that deepen the water cycle without a new module or a
dual-control gesture.

**Cloud form (derived, no enum).** High altitude + low water stretches the
rendered cloud flatter (cirrus-ish) and multiplies the pointer spring by up
to ×1.12; near-full water puffs it and multiplies the spring down to ×0.78.
Wind/thermal settle-point math is untouched — only the drag spring changes —
so calibrated wind displacements stay honest. No cloud-split: dual-finger
control was rejected in round 9 as a 6yo/simplest-path breaker.

**Mountain runoff (not a CA).** Rain that lands on a mountain (no field under
the cloud) used to become `waterWasted` instantly. Now 55% is queued as a
`RunoffPacket` and delivered ~1.8s later to the nearest downhill non-bloom
field within 0.45·worldW; the other 45% still wastes (soaks/evaporates). A
blue trickle is drawn while the packet is in flight; Audio plays a soft
descending "plink" (throttled). Seas remain infinite sources; runoff never
creates water, only re-routes waste. Deliberate simplifications named here:
no height field, no branching streams, no snow line.

### Round 10: life after bloom + water can live anywhere

The round-9 cut list said the next reopen order was (1) eco-response after
bloom, (2) a second-sea / pond level template. Both landed here, scoped so
neither needs a new module.

**Eco (pure render).** Once a field locks `bloom` and `bloom01` eases past
~0.55, 1–2 butterflies (and a bee on odd-id fields) orbit it on deterministic
sin paths seeded by `field.id`. No `EcoEntity` type, no Sim events, no
图鉴 — the design-doc's "水到了，生命自己来" at the lowest cost that still
reads as causality. Collection / species unlock is still backlog; if we
want a图鉴 later, *that* is when butterflies become real entities.

**Multi-sea (compat, not a rewrite).** `GameState.seas: SeaRegion[]` replaces
the singular `sea`. Level authoring:
- **Legacy** (L0–15): keep writing `seaWidthN` only → resolves to
  `[{x0:0, x1:seaWidthN·w, y:groundY}]`. Zero data migration.
- **New templates**: optional `seas: [{normX0, normX1}, …]`. `seaWidthN`
  stays as a "total water cover" sanity number for the level validator.

Absorb is any-of (same rate, same chill gate, seas never deplete → no
soft-lock). Render fills full land then punches every sea on top (so a
centre lake doesn't need a special "land is everything to the right of X"
code path). Autopilot drinks from the **nearest** sea to the current target
field, otherwise multi-sea levels would force a cross-map detour every
refill and look "uncompletable" in the calibration rig.

**Two levels that use it:**
- L16 中间的湖 — one centre lake, four radial fields. Teaches "water is
  where you see it" without a new gesture.
- L17 两边都是海 — dual coast + three midland fields + a gentle optional
  thermal. Skill is "pick the nearer shore".

Both complete on easy/hard under the autopilot and sit inside the 1.35×–
3.2× star band with no gate retune of older levels.

### Round 9: rain as continuous expression (ceiling-raise Phase 1, optimized)

The user dropped a 12-week "上限提升规格书" covering rain pressure, cloud
morphology/split, terrain hydrology, eco-emergence, music layers, seasons,
eco-dex, cosmetics, daily challenges, sandbox, and a 32-level chapter plan.
Diagnosis of the current ceiling was **mostly right** — the core verb really
is "drag + binary rain", the particle budget is almost unused, and the
meta-game is thin — but several of the proposed fixes fight the project's own
redlines, and shipping the whole roadmap in one pass would break the game
while "improving" it. What follows is the critique that shaped this round,
then what actually landed.

**Diagnosis, checked against the code (not the brochure):**

| Claim | Verdict |
|-------|---------|
| Core verb is drag + binary rain | **True.** `InputIntent.rainHeld: boolean`, one rate, one face. |
| 16 levels, sea-left / field-right template | **Mostly true.** L0–15, obstacles escalate, but every level is still one sea on the left. |
| Strategy = route + timing, no resource/risk | **Half.** Water budget, wind aim-off, cold-front timing, bird dodge already exist; what's missing is *expressiveness of the rain verb itself*. |
| Particles cap 40, ~100× headroom | **True** (round-8 bench: 1000 particles ≈ 1% of frame). |
| Meta-game = stars + fact cards only | **True.** |
| Water cycle teaches only 1/4 (no snow/runoff/seasons) | **True of the curriculum**, but "teach the full cycle" is a multi-month content project, not a Phase-1 mechanic. |
| No music | **True and deliberate** (round 5). Adding a 4-layer generative score is real work; not a free juice win. |

**Redline conflicts in the raw design doc (things we will not ship as written):**

1. **Force-touch / second-finger as the only way to rain hard** — breaks the
   "6yo simplest path" and "works on every device" rules. Many phones have no
   force-touch; many kids play one-handed. Continuous intensity must come from
   something every pointer can do.
2. **Cloud split (dual-finger control of two clouds)** — turns a one-verb
   game into a multi-entity RTS on a touchscreen. Violates never-complicate-
   the-simplest-path; the "ignore advanced mechanics and still clear every
   level" redline would need a whole dual-path design to survive it.
3. **Hydrology CA / river network / snowline as a new Sim module in Phase 1**
   — multiplies the tuning surface and the failure modes before the rain
   *verb* itself has any depth. Wrong order.
4. **Eco-dex / cosmetics / daily challenge / sandbox** — pure meta content.
   Fine later; zero effect on the "drag feels thin" complaint that started this.
5. **Music layers L1–4** — real craft, not a checkbox. Round 5 deliberately
   left music out after playtest preferred rain-only. Re-opening needs a
   dedicated audio pass, not a free ride on a pressure change.
6. **32-level chapter plan / Boss levels / 2× camera** — content production.
   Don't design 16 more levels until the verb they would exercise is deeper.

**What we optimized into the Phase-1 slice that *did* ship:**

- **Intensity via hold-duration, not force/second-finger.** 900ms ease-in
  ramp from 0.25 → 1.0; floor so a brand-new hold is still a real drizzle.
  Auto-rain and the ☔ button both feed the same ramp. A 6-year-old who just
  holds still keeps getting rain; a player who holds longer gets a downpour
  *for free*, with no new gesture to discover.
- **Default pressure = exact rate×1.0.** `rainPressure` is optional on
  `InputIntent`. Missing → `(1.0 - 0.3) / 1.2`. Autopilot, every existing
  test, and every star gate keep their calibrated meaning. Verified:
  `npx vite-node tools/calibrate.ts` still reports all gates in band.
- **Rate mul 0.3 + p·1.2** (doc's range) so light is precise-but-slow and
  heavy is fast-but-easy-to-overwater — the risk/reward the doc wanted,
  without a new resource system.
- **Juice that makes the continuous axis legible without captions:**
  particle density/spray/fall, drip-hem depth, storm-dark underside, O-mouth
  size, rain-loop gain + lowpass cutoff (anchored on the round-6 measured
  0.28/1600Hz default so we don't re-introduce "下雨声音没有了"), and a
  rainbow that only appears when sun + residual rain + all fields bloomed
  (real optical causality, no "you win" badge).
- **Cloud moods from state, not a new animation system:** idle / drinking
  (over sea) / full (wetness > 0.92) / raining / chilled. Pure function of
  `GameState`, so Render stays pure and tests stay deterministic.

**Deliberately not in this round** (still valid design-doc backlog, in the
order we'd reopen them): (1) eco-response after bloom (butterflies on a timer
— pure render, low risk), (2) a second sea / pond level template (breaks the
left-sea monotony without a new module), (3) hydrology once the verb feels
deep enough to need terrain as a puzzle, (4) music as its own audio pass,
(5) meta-game only after the campaign itself is worth replaying.

### Round 8: causality over captions — the water cycle should need no text

Third playtest feedback, quoted in full because it's the clearest design brief
this project has gotten: "冷气团冻住之后应该有个僵直时间；然后现在的风和飞鸟太
简陋了；第三关就可以开始加更多的障碍了，难度要依次升级；最关键还是要贴合自然
规律，把水循环讲明白（最好是通过游戏和画面，不需要文字也能看懂）；热空气也对
应优化一下；根据云朵的重量不同，受风的影响也不一样；太阳也要有强弱变化，完全
模拟，但是这个进度可能会加快，这一点也诚实说明；如果当前架构已经不能实现这些
效果，即使评估架构，看是不是要部署到自己的服务器上；有时候这个风，快得不想真
的；可以借鉴其他益智类游戏的设计；过程中随时记录，以便于为之后其他游戏的开发
积累经验."

**Architecture, evaluated first because it gates everything else.** Measured,
not guessed, in headless Chromium at 1280×720: the live game (busiest level)
holds a 16.70ms median frame — locked 60fps — while 1000 soft Canvas2D
particles/frame cost 0.19ms (1% of budget) and 8000 cost 1.63ms (10%). Current
particle cap is 40. **Verdict: stay on TS + Canvas2D + Web Audio, no server, no
engine change.** Nothing asked for is server-shaped (no multiplayer, no shared
state, no heavy compute). Full writeup, including the caveat that these are
desktop numbers, in `LEARNINGS.md`.

**Causality, not captions.** The standing failure mode this round set out to
fix: round 5 responded to "操作没有体现水循环" by adding UI text describing the
cycle. That's a caption on top of a simulation that didn't itself encode the
causality. This round instead made the simulation causally real:

- **The sun drives evaporation and thermal lift**, not a flat rate — `sun.intensity`
  (a dawn→noon→dusk sine arc, floored at 0.28 so a level is never softlocked at
  dusk) multiplies both `evapRate` and thermal `lift` in `sim/index.ts`. The
  *picture* changes with it, not just the number: the sun disc grows, whitens
  and throws more/longer rays at noon (`drawSun`); the whole sky tints warmer
  at dawn/dusk (`drawSky`); ambient vapor wisps off the sea get busier and
  brighter as intensity climbs (`drawVapor`); a thermal's glow, wobble
  amplitude, and chevron count/speed all scale with the same intensity value
  (`drawThermal`). Verified with a direct render-diff harness (bypassing
  Playwright drag choreography, which is unreliable for pixel-precision
  checks): isolating the thermal's own pixel contribution from the sky-tint
  confound, a noon thermal contributes ~3× the pixels a dawn one does.
- **Honest disclosure on the sped-up day**: real dawn-to-dusk is ~12+ hours;
  `DAY_LENGTH_MS_DEFAULT = 150_000` (150 real seconds) compresses that by
  roughly 300×. That's a deliberate deviation, not hidden — it's named here
  per the user's "这一点也诚实说明" rather than as in-game text, because the
  user's own stated principle for this feature is that the cycle should be
  legible through play and picture, not captions; a meta note about production
  time-compression isn't part of the water-cycle lesson itself, so it lives in
  documentation, in keeping with [[user-collab-preferences]]'s "document
  shortcuts honestly & dated". At 150s/day, dayPhase moves enough within a
  typical 5–40s level for the sun to visibly brighten over one run (e.g.
  starting at intensity ≈0.84, a 30s hard run ends near ≈1.0) — verified by
  test, not just claimed.
- **Cloud mass changes wind response**: `massFactor = CLOUD_BASE_MASS/(CLOUD_BASE_MASS
  + water)` scales both wind displacement and thermal lift, so a full cloud
  visibly holds its line while an empty one gets shoved around. Real, legible,
  and creates an actual decision (cross a windy stretch loaded, not empty).
  Verified: an empty cloud in 45u wind deflects noticeably more than a full one
  in the same wind (test asserts >30% reduction).
- **Cold-front thaw**: leaving the front no longer thaws the cloud instantly —
  `CHILL_THAW_MS = 1300` keeps it frozen briefly after exit, so escaping is a
  timed decision rather than a doorway you can dip in and out of for free.
- **Wind and birds "太简陋" (too simplistic), fixed on three fronts**: (1) wind
  now visibly moves the *scenery*, not just the cloud and an arrow overlay —
  field grass leans and flutters with wind strength (`drawField`'s new `wind`
  param), verified by a direct pixel-diff test showing the render measurably
  differs by wind direction; (2) gust periods lengthened (3.0–3.6s → 7.2–8.6s)
  and sky-streak speed cut roughly 3× (was 90–350 u/s, now 34–126 u/s) because
  the player reported the wind "快得不想真的" — air visibly outrunning the
  cloud it's supposed to be pushing read as fake, not as weather; (3) birds
  upgraded from one lone V-silhouette to a loose three-bird flock
  (`drawOneBirdMark` composed by `drawBird`) — only the lead mark is the real
  hitbox, the two companions are decorative trailers, so collision fairness is
  unchanged while the animal reads as a flock instead of a UI prop.
- **Obstacles now start at level 3, not level 11**, escalating in order: a
  gentle thermal at L3 (off to the side, doesn't block progress), a bird flock
  at L6, a cold front at L9 — each layered onto an existing level's own
  identity (fact card, name, core lesson unchanged) rather than replacing it.
  L11–15 remain the deeper dedicated/combined tier. Recalibrated after every
  change; all 32 level/tier star gates still land in the 1.35×–3.2× house band.
- **Two more bugs found while verifying this round**, both silent under
  `npm test` until probed: (1) the calibration autopilot's mode-switch logic
  flip-flopped between "drink" and "water" the instant rain started (water and
  need fall together), making every multi-trip level read as 30–180s —
  fixed with explicit hysteresis in `tools/autopilot.ts`; (2) a field could
  finish a downpour ~0.05 units short of its bloom target — invisible on
  screen, but the field would refuse to bloom, reading as a bug to a child who
  just emptied a whole cloud on it. Fixed with a 0.5-unit epsilon on the bloom
  check in `sim/index.ts` (documented inline as deliberate, not slop).

**On "借鉴其他益智类游戏的设计" (draw on other puzzle-game design):** the
guiding reference this round was the school of puzzle/exploration games that
teach entirely through environmental cues rather than UI text — wind and
thermals as terrain-integrated forces you read from the scene itself (in the
vein of games built around gliding/soaring on real-feeling air currents),
causality you infer from what's on screen rather than a tutorial popup. That's
the standard the "no text needed" work above was held to.

### Known shortcut (round 7): obstacles are per-level, not per-tier

Easy and hard face the same thermals, birds and cold fronts. Easy stays gentle
through its existing levers instead — a 150-unit cloud (vs 90) makes a 9-unit
bird strike ~6% rather than 10% of the budget, faster evap/rain rates shorten
every exposure window, and easy never grades stars at all.

Be honest about the cost: a 6-year-old on easy still meets a cold front that
stops their rain with no way to tune it down, and the only mitigations are the
ice-blue cloud tint, the chill sound, and the one-line intro hint. Accepted
because per-tier obstacle tables would double the tuning surface for a tier
that has no failure pressure — but if the younger kid bounces off levels 11–15,
this is the first thing to revisit.

### Superseded: wind was cosmetic (round 2 → round 7)

Found by the round 2 Levels agent while rebalancing. A held cloud's
steady-state wind displacement is `windX / PULL_ACCEL`. Before round 1's
Sim retune that was `14/22 ≈ 0.64` world-units; after (`PULL_ACCEL: 22→90`)
it's `14/90 ≈ 0.16` — negligible on a ~1150-unit-wide world. L7/L8 (which
exist specifically to introduce wind/gusts) now play indistinguishably
from a calm level.

**Decision (2026-07-19): accept this, don't fix it.** — *reversed 2026-07-20,
see "Wind, resolved" above. Kept here because the reasoning still explains why
the fix had to be an independent axis rather than a bigger `windBaseX`.* Three options were on
the table — scale wind relative to `PULL_ACCEL`, make wind act as drag on
released-cloud drift instead of a constant force fought while held, or
just accept wind as flavor and rely on `cloudMaxWater`/mountains for real
difficulty. We took the third, cheapest option.

Be honest about what that costs: the original design brief called for
**"拖拽 + 风阻"** — wind resistance fought while actively dragging — as
part of the *core hand-feel*, not just an occasional level gimmick, and
this decision quietly walks that back for every level except the ones
where wind was never the point (L9/L10 lean on water-budget + mountains,
which are unaffected). L7 ("一点点风") and L8 ("阵风来了") are now
levels whose entire built-in premise — introducing wind as a mechanic —
is cosmetic; their difficulty was rebalanced to match a calm level's pace
rather than actually deliver what their names promise. We chose this
because round 1's snappy, near-zero-overshoot drag feel was itself a
deliberate, verified fix for a real problem (42% pointer-drag overshoot),
and re-opening that physics to make wind bite again risks reintroducing
it — not because the tradeoff is free.

If this gets revisited: the honest fix is giving wind resistance back its
own axis independent of pointer-follow stiffness (e.g. option 2 above —
wind as post-release drag), not just cranking `windBaseX` back up, which
would only matter during release/transit and do nothing for a held cloud
under the current spring-damper model.

Update this table (status: `dispatched` → `in review` → `done`, with a
one-line note on what actually landed) whenever a refinement round starts
or finishes — this file is the durable record other models/humans read.

Run before you start, and again before you hand back:
```
npm install
npm run typecheck   # must stay clean
npm test            # 54 tests must stay green
npm run build        # must succeed
npm run dev          # then ACTUALLY PLAY IT in a browser — see below
```

Tuning star gates or adding levels? Run the calibration rig:

```
npx vite-node tools/calibrate.ts
```

It drives the real Sim with the autopilot in `tools/autopilot.ts` and prints,
per level and tier, the ideal-run time and waste against the declared gates,
flagging anything outside the house band (3★ ≈ 2× ideal, 2★ ≈ 3×). The same
autopilot backs the "every level is completable on both tiers" test — but note
what it cannot see: it can aim off-screen, so it will happily "complete" a level
whose field is unreachable for a real finger. That is what the
thermal-over-field invariant test in `tests/levels.test.ts` is for, and it
caught exactly that in level 15 during round 7.

**Do not skip the manual browser check.** While building this, an inline
CSS rule (`#ui-root > * { pointer-events: auto }`) made the full-screen HUD
overlay swallow every pointer/mouse event across the *entire* viewport, not
just its own buttons — the cloud looked totally unresponsive to dragging.
`npm run typecheck` and `npm test` were 100% green the whole time; only
actually dragging the cloud in a browser caught it (the fix lives in
`src/ui/index.ts`'s injected styles — `.cs-screen` defaults to
`pointer-events:none`, only real controls opt back in with
`pointer-events:auto`). If your module touches DOM, canvas input, or CSS,
budget time to click/drag it yourself before calling it done.

## Architecture recap

```
[Input]──InputIntent──▶[Sim]──GameState──▶[Render]
 pointer/touch          sim core            pure draw
                            │ SimEvent[]
                            ▼
                        [Audio] synthesized sound
[Levels/progress] LevelDef · tiers · stars · localStorage
[UI shell] profile/menu/levelselect/playing HUD/result (DOM overlay)
```

Everything hangs off the frozen contract in `src/types.ts`. **Modules only
import types from `types.ts` — never another module's implementation
file.** The glue that wires all six together lives in `src/game/scenes.ts`
and `src/game/loop.ts`, which I own; changes there should be rare and
coordinated (open an issue / flag it rather than editing silently), since
every module's assumptions about how it's called live there.

Two small additions were made to the contract while wiring the glue layer,
after the original "frozen" draft — flagging them explicitly so nobody is
surprised:
- `UiCallbacks.onRainHold(held: boolean)` — the ☔ button needs a way to
  reach `Input.setRainButton()`; this was missing from the first draft.
- Everything else in `types.ts` is unchanged from the original spec.

## Per-module status

### ① Sim — `src/sim/index.ts`
**Suggested owner: Opus** (heaviest logic, needs to stay deterministic).

What's there: cloud physics (pointer-spring + wind + damping), sea
absorption (must fly low over the sea band), rain transfer with a
nearest-field lookup, mountain "leak" (flying at/under a mountain's peak
height drains water), field state machine (`dry → growing → bloom`, or
`overwater` which drains back into range and **still blooms — never a
failure**), a tiny seeded PRNG (`mulberry32`) so rain-particle jitter stays
fully deterministic run-to-run. All physics constants are named and grouped
at the top of the file.

Refinement ideas (all constant-tuning inside the existing structure — the
control flow doesn't need to change):
- Playtest the actual feel of `PULL_ACCEL`/`VEL_DAMPING_PER_SEC` on a real
  tablet — it was tuned by eye, not by a 6- or 9-year-old's thumb.
  `tests/sim.test.ts` only checks convergence/correctness, not "does this
  feel good."
  Both `tests/sim.test.ts` and `MODULES.md`'s per-level table in the
  original plan doc are your source of truth for intended difficulty feel.
- Mountain leak currently has no "safe margin" above the peak — clearing by
  1 unit is as safe as clearing by 50. A small buffer might read better.
- `TierParams.starThresholds` is only consumed by `Levels.evalStars`, not
  by Sim — no change needed there, just context.

**Must not change:** `SimModule`/`GameState`/`SimEvent` shapes in
`types.ts`, or the determinism guarantee (`tests/sim.test.ts`'s last test
runs two independent `createSim()` instances against identical input and
`toEqual()`s the results — don't introduce `Math.random()`, `Date.now()`,
or any other non-deterministic source into `step()`).

### ② Render — `src/render/index.ts`
**Suggested owner: Sonnet** (visual identity).

What's there: flat/pastel Canvas-only rendering — sky gradient, sea with
shimmer lines, land, mountains (triangle + snow cap), fields (color
interpolates dry→growing→bloom, bloom draws a simple 6-petal flower whose
scale eases in via `bloom01`, overwater droops), cloud (cluster-of-circles
puff, size/color driven by `water/maxWater`, blue underside while raining),
rain particles, a wind-direction chevron hint. Zero images, zero
`@font-face` — everything is `ctx` primitives, so nothing can fail to load.
No text is drawn on canvas (all text lives in the DOM/UI layer).

Refinement ideas:
- The cloud/field/mountain shapes are intentionally simple placeholders —
  this is the highest-leverage module for "make it charming" without
  touching gameplay.
  themed differently per fact-card key (water cycle stage).
- Layer order is fixed in `createRender().draw()` — sky → ground/sea →
  mountains → fields → wind hint → cloud → rain. Keep cloud drawn after
  fields/mountains (it flies above them).

**Must not change:** the `RenderModule.draw(ctx, state, vp)` signature, and
must stay a **pure read of `state`** — never mutate `GameState`. `vp.scale`
+ `vp.offsetX/offsetY` are already applied via `ctx.translate/scale` before
your draw calls run in world-space coordinates (`state.bounds.w/h`); don't
re-apply them.

### ③ Levels / difficulty / stars / save data — `src/levels/data.ts`,
`src/levels/progress.ts`, `src/levels/index.ts`
**Suggested owner: GPT** (data/rules-dense).

What's there: 11 `LevelDef`s (id 0 tutorial + 1–10) with per-tier
`TierParams`, `evalStars()` (easy tier is always 3 — no star pressure for
a 6-year-old; hard tier grades against `starThresholds`; finishing always
earns ≥1 star, never a failure), and a `localStorage`-backed
`ProgressStore` supporting **two independent profiles** that never
overwrite each other, keeping the *best* star count ever earned per level.

Important existing decision (see plan doc for the "why"): `FieldDef`
target windows and mountain geometry are **level-wide, not tier-specific**
— the frozen `types.ts` has no per-tier field/mountain override. Easy vs.
hard difficulty comes entirely from `TierParams` (wind, `cloudMaxWater`,
`evapRate`/`rainRate`, `starThresholds`). If you want tier-specific target
windows, that requires a `types.ts` change and re-syncing every module —
don't do it unilaterally.

Refinement ideas:
- Balance pass on the 10-level curve (`src/levels/data.ts`) — current
  numbers are internally consistent but were not extensively playtested
  for exact pacing.
- `starThresholds` only exist on `hard`; consider whether later levels
  need retuned thresholds after a Sim feel pass (coordinate with whoever
  owns Sim).

**Must not change:** `LevelsModule`/`LevelDef`/`ProgressStore` shapes.
`tests/levels.test.ts` and `tests/progress.test.ts` encode the exact
behavioral contracts (11 levels, only L0 has `tutorial`, easy=always-3,
hard thresholds, double-profile independence, best-score-kept,
localStorage round-trip) — keep them green.

### ④ Input — `src/input/index.ts`
**Suggested owner: GPT** (self-contained, well-bounded).

What's there: Pointer Events (`pointerdown/move/up/cancel/leave`) on the
canvas, single-pointer tracking with `setPointerCapture`, client→world
coordinate conversion via the `Viewport` inverse transform, and the "hold
still over a field" auto-rain heuristic (speed below a threshold + within
reach of a non-bloomed field ⇒ `rainHeld: true`) that combines with the
explicit ☔ button (`setRainButton`) via OR.

Refinement ideas:
- `NEAR_STILL_SPEED`/`NEAR_FIELD_REACH_FRAC` are eyeballed constants —
  tune alongside whoever's playtesting Sim, since "does the rain trigger
  reliably without being too forgiving" is a joint Input+Sim feel question.
- Currently single-touch only (first pointer wins, rest ignored) —
  intentional for v1 per the design brief, but flag if this needs
  revisiting.

**Must not change:** `InputModule`/`InputIntent` shapes.

### ⑤ Audio — `src/audio/index.ts`
**Suggested owner:** whoever's free — self-contained, low risk.

What's there: everything is synthesized with Web Audio oscillators/filtered
noise at call time — **zero audio files, zero network/disk load risk**.
Rain is a filtered looping noise buffer (starts on `rainStart`, ramps out
on `rainStop`); discrete events (bloom, level-complete, UI tap, stars) are
short tone sequences; high-frequency events (`evaporate`, `mountainLeak`)
are throttled so they read as a rhythmic "gulp gulp" / "hiss" rather than a
buzz. Muting is a single master-gain ramp to 0 — individual synth nodes
keep firing (harmlessly) so unmuting mid-rain sounds correct immediately.

Refinement ideas:
- The tones are functional, not pretty — this is the highest-leverage
  module for "make the sound design actually charming" without touching
  any other module at all.
- Consider persisting the mute preference to `localStorage` (currently
  resets each session) — would need a tiny addition inside this module
  only, no contract change, since `AudioModule` doesn't expose a
  "restore last mute state" hook and doesn't need one (just read
  `localStorage` inside `createAudio()` at construction time).

**Must not change:** `AudioModule` shape. Never load an external audio
file — that's a deliberate zero-dependency, zero-load-risk decision, not
an oversight.

### ⑥ UI shell — `src/ui/index.ts`
**Suggested owner: Sonnet or GPT** (DOM-heavy, fairly independent).

What's there: all five scenes (profile w/ 6 avatar choices + name entry,
menu, level-select grid with lock/star/✓ display, playing HUD with
bloom-count pill, water gauge, mute/pause icon buttons, big ☔ button,
pause overlay, and a lightweight tutorial-hint system that's active only
on levels with a `tutorial` array — currently just L0), and result screen
(stars + optional fact card). Pure DOM (`document.createElement`), one
injected `<style>` block, no framework, no external CSS.

Known small gaps (harmless, worth polishing, not blocking):
- `STRINGS.result.tapToFlip` ("点一下看看") is defined but unused — the
  fact card currently always shows its text directly rather than requiring
  a tap-to-flip interaction. Either wire up the flip or drop the string.
- The mute button's 🔊/🔇 icon toggles via local UI state in the click
  handler, not by reading `AudioModule.isMuted()` — fine as long as the
  button is the only way to mute, but if you add another mute entry point,
  revisit this.
- Tutorial hints are a simple 3-stage heuristic keyed off `GameState`
  (full cloud → near a field → done), not a real trigger-matcher against
  `LevelDef.tutorial[].trigger`/`textKey`. Fine for the one tutorial level;
  would need real work to generalize to more tutorial levels.

**The pointer-events lesson (read this before touching CSS):** every
interactive element must carry `pointer-events:auto` explicitly (see the
injected `STYLES` string) — containers (`.cs-screen`, `.cs-hud-bar`, etc.)
default to `pointer-events:none` so empty screen space doesn't block
canvas drag events underneath. If you add a new clickable element, add
`pointer-events:auto` to its rule, and **actually click/drag it in a
browser** to confirm — this exact class of bug is invisible to
`npm test`/typecheck.

**Must not change:** `UiModule`/`UiCallbacks`/`Scene` shapes. The
`data?: unknown` payloads each `setScene(scene, data)` call expects are an
internal convention (documented as comments at each `else if` branch in
`setScene`), not part of the frozen contract — fine to extend as long as
you keep handling what's already passed.

## Ground rules for all modules

1. **Read-only across module boundaries.** Only import from `../types.ts`
   (and `../strings.ts` for UI-facing copy). If you find yourself wanting
   to import another module's `index.ts`, that's a sign the contract needs
   a change — flag it instead of reaching around it.
2. Keep `npm run typecheck`, `npm test`, and `npm run build` green.
3. **Manually play it in a browser** before calling your module done —
   see the pointer-events story above for why this is non-negotiable, not
   boilerplate advice.
4. Don't touch `src/game/loop.ts` or `src/game/scenes.ts` unless the change
   is genuinely about the glue layer itself (and say so explicitly) — every
   other module assumes those files call it exactly the way they do today.
