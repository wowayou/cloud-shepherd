# LEARNINGS.md — transferable lessons for the next game

Started 2026-07-20, round 8, at the user's request: "过程中随时记录，以便于为之后
其他游戏的开发积累经验."

`MODULES.md` records **what this game is and why it's built this way**.
This file records **what we'd want to know before starting a different game**.
Keep entries short, dated, and honest about what was actually measured versus
what was reasoned. Prefer "we tried X, it cost Y" over "best practice is X".

---

## Product direction

**2026-07-23 — Feature stacking is not playtesting.** After a solid core loop
(drag cloud, drink, rain, bloom), we shipped rain pressure, multi-sea, runoff,
snow, eco-dex, ambient pad, seasons, daily challenge, ground soaks, and energy
in rapid succession. The user's next feedback was still "this doesn't feel
right" and "maybe we started wrong" — and they were right to question altitude.
Energy mismatched the level count; soak chrome papered over a too-tight hitbox
with ugly visuals. The durable fix for "must glue to field" was one constant
(`RAIN_REACH 0.055→0.12`), not a new subsystem. Transferable: when the player
complains about the verb, widen/retune the verb first; do not add a parallel
system that draws worse and needs its own tests.

## Rain / spatial fairness

**2026-07-23 — Rain should hit the ground first.** A hitbox that only waters
when the cloud is centered on a field teaches "aim" but fights the water-cycle
lesson and feels broken to kids. A ground-soak disc (rain lands → nearby fields
draw over ~2s) keeps aiming meaningful (direct hit still best; waste still
exists) while matching "rain falls on the land". Prefer re-routing waste into
a delayed feed over expanding the direct hitbox alone.

**2026-07-23 — Don't copy IAA stamina into education.** 《赵云与阿斗》-style
energy gates drive ads/return visits. For a 6yo water-cycle game: use a
*local, non-monetized* daily budget (e.g. 5 starts, 20min regen, midnight
refill) plus a soft rest hint after long play — never a hard lock, never an
ad button. Short levels already create "one more run"; energy only caps the
day, it doesn't sell the next one.

**2026-07-23 — Result-screen teaching is the wrong beat.** After a win the
child wants Next. A glowing "你知道吗" card is invasive. Put knowledge in a
dex the player opens, or a quiet footnote under the primary actions.

## Architecture / performance

**2026-07-20 — Measure before you re-platform.** Asked to evaluate whether the
stack (TS + Canvas 2D + Web Audio, static, zero runtime deps) could carry a much
richer atmospheric simulation, or whether it needed a real server. Measured in
headless Chromium at 1280×720:

| | |
|---|---|
| Live game, busiest level | 16.70ms median frame — locked 60fps, p95 16.80ms |
| 1000 soft particles/frame | 0.19ms (1% of frame budget) |
| 3000 | 0.81ms (5%) |
| 8000 | 1.63ms (10%) |

The game was running with `MAX_PARTICLES = 40`. So the particle budget could grow
~100× before rendering became the constraint. **Verdict: no server, no WebGL, no
engine change.** Nothing requested was server-shaped — no multiplayer, no shared
state, no heavy compute, no content pipeline. Caveat kept honest: desktop
headless numbers; a phone is ~5–10× slower on fill, which still leaves 1000+.

Transferable: for 2D games at this scale the bottleneck is almost never the
renderer, it's design and content. "Should we re-platform?" is answerable with a
20-line benchmark in ten minutes — do that before accepting a rewrite.

## Physics and feel

**2026-07-20 — Define forces in the units the player perceives.** Wind was
originally an acceleration added next to the pointer-follow spring, so its
*visible* effect was `windX / PULL_ACCEL`. When the spring was later retuned for
better drag feel (`PULL_ACCEL 22→90`), wind silently shrank to ~¼ of its former
displacement and two levels built around it became cosmetic. Nobody noticed for
several rounds because no test asserts "wind is felt".

The fix was to define wind as **the displacement it causes** (the cloud homes to
`pointer + windX`), making it independent of the spring constants. Now the level
data says what the player experiences, and retuning feel can't silently delete a
mechanic.

Transferable: when two subsystems multiply into one observable, express the
tunable in units of the observable. Otherwise a tuning pass on one silently
rescales the other.

**2026-07-20 — Clamp position *and* velocity, or you get phantom motion.** The
cloud's position was clamped to the playfield but its velocity was not. Holding
the finger below the floor left the cloud visually parked while carrying
~137 units/sec, because the spring kept accelerating toward an unreachable
target. A separate system gated on "is it nearly still?" and therefore never
fired — the game's primary rain gesture silently did nothing.

Transferable: any clamped integrator needs the constrained component of velocity
zeroed too. And when system A gates on a *derived* quantity of system B
(speed, not position), that coupling deserves a test, because it fails silently.

**2026-07-21 — Threshold checks against accumulated floats need an epsilon, or
"basically done" reads as a bug.** A field's moisture accumulates in small
per-frame increments (`rate * dt`); a downpour could land it a few hundredths
of a unit short of its bloom target — visually indistinguishable from "full"
on screen, but the strict `moisture >= targetMin` check kept it un-bloomed
forever. To a player who just watched a full cloud empty onto the field, a
field that still won't bloom reads as broken, not as "off by 0.055 out of 40."
Fixed with a small epsilon on the comparison (documented inline as deliberate:
"epsilon, not a hack").

The same session's calibration tooling needed the mirror-image fix: an
autopilot deciding "have I drunk enough for this trip?" with a hard `>=`
against a target computed from float accumulation could get stuck never quite
satisfying it, for the same reason.

Transferable: any `>=`/`<=` check against a value built from repeated small
float additions is a latent bug. Decide the epsilon deliberately (here, ~12ms
worth of the fastest rain rate — far below anything perceivable) and comment
why that magnitude was chosen, so a future tightening doesn't reintroduce the
same silent stall.

## Testing strategy

**2026-07-20 — Autopilots prove completability, not playability.** A scripted
autopilot that drives the real sim is excellent for "does every level finish"
and for calibrating difficulty gates against a measured ideal run. But it can
aim outside the screen, so it happily "completed" a level whose field required
holding a finger 8px below the display. What caught that was a cheap *invariant*
test asserting the level data itself is reachable by a real input.

Transferable: pair simulation tests (does it work?) with invariant tests (is it
expressible with real input?). They fail on different bugs.

**2026-07-20 — Green tests plus a real browser, always.** Two of this project's
worst bugs — an overlay swallowing every pointer event, and a scroll container
inheriting `pointer-events: none` so the level list couldn't be scrolled at all —
were 100% invisible to typecheck and unit tests. Both were input/CSS coupling.
Budget browser time for anything touching DOM, canvas input, or CSS.

**2026-07-21 — For pixel-level visual claims, diff the render function
directly; don't choreograph a drag and hope.** Verifying "wind makes grass lean"
or "a strong thermal looks visibly stronger" by scripting a Playwright drag
into the right on-screen position repeatedly failed on coordinate/timing
guesswork (three attempts, still didn't land the cloud where needed) before it
produced anything worth looking at. Switching to calling the exported render
function directly with two synthetic `GameState`s that differ in exactly one
field (`wind: 0` vs `wind: 60`; `sun.intensity: 0.3` vs `1.0`) and diffing the
resulting `getImageData()` output was faster to write, deterministic, and
immediately caught a real confound (a "no visible thermal difference" false
negative caused by the sky's own tint changing behind it) that a screenshot
eyeballing pass would likely have missed too.

Transferable: when the render module exposes a pure `draw(ctx, state, vp)`
function, prefer calling it directly with constructed state over driving the
whole app through simulated input to get a specific visual on screen. Reserve
the full-app Playwright pass for confirming the *pipeline* wires state through
correctly (no console errors, the right function gets called), not for proving
a specific pixel-level claim. When comparing two renders, diff isolates the
claim; comparing absolute brightness/color sums can be confounded by anything
else that also changed (here, a shared background element).

**2026-07-21 — A bug in your verification tooling looks exactly like a bug in
the game.** The calibration autopilot's "should I go drink or go water?"
decision compared current water to remaining need with no hysteresis; the
instant rain started, both fell together, so the decision flip-flopped every
frame and the autopilot ping-ponged between sea and field forever. This
initially reported as "level 10 hard: uncompletable" and "level 6: 29 seconds
to finish a 5-second level" — which looked like real game bugs (and briefly
were investigated as such) before the actual defect was found in the 40-line
autopilot script, not the ~300-line sim it was testing.

Transferable: when a measurement tool reports something alarming, first ask
whether the *tool's own logic* has a state machine that could be flip-flopping
or otherwise miscounting, especially anywhere it makes a binary A-or-B decision
based on two values that move together. Add a print of the intermediate
decision trace before concluding the system under test is broken.

## Audio

**2026-07-20 — Perceived loudness is not the gain number.** A rain loop was
"halved" from gain 0.18 to 0.09 during a timbre rework, but the new noise
generator already baked in a ×0.11 scale the old one didn't, and the new 850Hz
lowpass put the remainder under the rolloff of laptop/phone speakers. Net result
measured at ~-50 dBFS effective — silent in a real room, reported by the player
as "the rain sound is gone".

Transferable: verify audio by **rendering it offline and measuring** (RMS, plus
energy surviving a highpass at ~500Hz to approximate a small speaker), not by
reasoning about gain multipliers. An OfflineAudioContext harness in headless
Chromium takes minutes to write and catches this class every time.

## Hydrology (light)

**2026-07-23 — Snow as deferred runoff, not a new water type.** Freezing rain
into a pack that later melts into the *existing* runoff queue reuses one
delivery path for two lessons (runoff + solid precipitation). Avoided a
parallel "snow moisture" channel that would have needed its own waste rules
and soft-lock cases. Melt gated on sun intensity keeps the causality chain
(sun → phase change → water) visible without captions.



**2026-07-23 — Runoff without a height field.** Full Cellular-Automata or
particle-slope hydrology would teach more of the water cycle but multiplies
tuning surface and soft-lock modes. The cheaper lesson that still *looks*
like runoff: when rain lands on a mountain span with no field under the
cloud, queue a delayed packet to the nearest downhill field and draw a
trickle while it travels. 55% capture / 1.8s delay / 0.45·worldW range were
chosen so the child can see the stream and still feel "I made that field wet
by raining on the mountain", without making mountain levels auto-solve via
passive soak. The remaining 45% stays waste so "aim at the field" is still
the primary skill.

Transferable: for educational sims, a *re-routing of an existing waste path*
often teaches the concept better than a new subsystem, and keeps never-fail
invariants intact (no new way to soft-lock).

**2026-07-23 — Form as spring multiplier, not a second force.** Wanting
"full clouds feel heavy" without reopening the wind-axis bug (round 1's
PULL_ACCEL retune silently killed wind) means: multiply only the pointer
spring, leave the settle-point wind/thermal axis alone. Same pattern as
defining wind in displacement units — express the tunable in the units the
player feels, and don't let two systems multiply into one silent rescale.

## Layout / multi-source water

**2026-07-23 — Prefer `things[]` + legacy shorthand over `thing` + optional
`otherThings[]`.** When the game grew a second water body, the temptation was
to keep `GameState.sea` for the "main" ocean and add `ponds?: SeaRegion[]`.
That forces every absorb/render/resize/autopilot site to special-case two
paths forever, and the "main" vs "pond" distinction is fake — the physics is
identical (infinite horizontal water band). The cheaper long-term shape is
`seas: SeaRegion[]` everywhere, with the old `seaWidthN` field kept as a
*level-authoring shorthand* that expands to `[{x0:0, x1:…}]` at init. All
16 existing levels needed zero edits; multi-sea is opt-in per level.

Transferable: when a singular becomes plural, migrate the *runtime* to the
array form and keep the singular as a data convenience, not as a parallel
live path. Dual live paths are where the next bug will hide.

**2026-07-23 — Autopilots must pick nearest-of, not first-of.** After
multi-sea landed, the calibration autopilot still drank from `seas[0]`. On
a dual-coast level that meant every refill flew to the left shore even when
the target field sat next to the right one — ideal times ballooned and the
level looked "broken" in the rig while being fine for a human. Fixed by
anchoring drink target on the nearest sea midpoint to the current field.
Same class of bug as the round-8 drink/water hysteresis: the tool's own
decision rule, not the game.

## Procedural content

**2026-07-23 — Daily challenges without a server.** A date integer
(`YYYYMMDD`) into mulberry32 is enough for "everyone playing today sees the
same layout" on a single device family — no backend, no seed exchange. Keep
the generator inside the same constraints as hand-authored levels (sea on
left, fields on land, generous gates, optional obstacles only) and run the
*same* autopilot completability suite over several seeds. Reserved high id
(900) avoids colliding with campaign progress keys.

Transferable: procedural daily content is a seed function + the project's
existing invariant tests, not a new mode architecture.

## Design scope / ceiling-raise plans

**2026-07-22 — A 12-week ceiling-raise doc is a diagnosis, not a build order.**
A thorough design document correctly identified that Cloud Shepherd's verb is
thin (drag + binary rain), the particle budget is almost unused, and the
meta-game is stars + fact cards. It then proposed hydrology, cloud split,
seasons, eco-dex, music layers, cosmetics, daily challenges, sandbox, and a
32-level chapter plan. Most of that is *good design thinking* and *wrong
next step*.

What we actually shipped from it (round 9): continuous rain intensity via
hold-duration, pressure-scaled particles/audio/face, a sun+rain rainbow.
What we cut, and why it was the right cut:

| Proposed | Why not now |
|----------|-------------|
| Force-touch / second-finger rain | Breaks 6yo simplest path + device universality |
| Cloud split (dual control) | Turns one-verb game into multi-entity RTS on touch |
| Hydrology CA / rivers / snow | Multiplies tuning surface before the rain *verb* has depth |
| Music L1–4 | Real craft; project deliberately rain-only after playtest |
| Eco-dex / cosmetics / daily / sandbox | Meta content; zero effect on "drag feels thin" |
| 32-level chapter plan | Don't design 16 more levels until the verb they exercise is deeper |

Transferable: when a design doc arrives as a multi-phase roadmap, **optimize
the first shippable slice against the project's redlines before writing
code**. The highest-leverage move is usually deepening the existing verb
(here: binary rain → continuous pressure) so every later feature inherits a
richer foundation — not bolting on parallel systems. Also: any continuous
axis that tests/autopilot don't supply must default to the *calibrated*
midpoint (here: pressure that yields rate×1.0), or star gates silently
rescale.

**2026-07-22 — Optional fields beat migration churn for additive input.**
Adding `rainPressure?: number` to `InputIntent` (optional) let every
existing `rainHeld: true` call site — tests, autopilot, anything that
constructs intents by hand — keep working with zero edits, while the Sim
resolved the missing value to the mid-strength default. Required fields
would have forced a repo-wide touch for a change that is semantically
"same as before when unspecified".

Transferable: when extending a hot path that many pure-data constructors
build by hand (test fixtures, bots, replays), prefer optional + documented
default over a required field + migration, as long as the default preserves
prior calibrated meaning.

## Teaching through mechanics

**2026-07-20/21 — If the lesson needs a caption, the mechanic isn't teaching
it.** The stated goal for this game is that a child understands the water cycle
without reading anything. Round 5 responded to "操作没有体现水循环" by adding a
stage strip, labels and tutorial copy — text explaining a simulation that didn't
itself encode the causality. Round 8 replaced that with real causal coupling:
`sun.intensity` (a simulated dawn→noon→dusk arc) multiplies both evaporation
rate and thermal lift in the sim, AND every visual that represents those
things — the sun disc's size/color/rays, the sky's warmth, vapor wisp density,
a thermal's glow/wobble/chevron speed — reads from that same one number. The
causality isn't just present in the physics; it's present in every place the
player looks, so no caption is needed to connect them.

The same round also found the flip side of this principle: a value can be
*causally real* in the sim and still be *invisible* on screen if nothing reads
it. Wind moved the cloud and drew sky-arrow overlays, but the scenery itself
(field grass) never reacted — so wind read as a UI effect layered on top of the
world rather than a property of the world. Making grass lean and flutter with
wind strength was a two-line change once identified, but it required
deliberately auditing "what in this scene *could* react to this force but
currently doesn't."

Transferable: (1) when a player says the mechanic doesn't convey the concept,
adding UI that states the concept is a workaround — fix the mechanic's
causality instead. (2) After a value becomes causally real, audit every visual
element that's thematically related to it and ask whether it currently reads
from that value or is still independently time-animated. A force with only one
visual consequence (the thing it directly moves) still under-communicates.

## Content / level design

**2026-07-21 — Escalate difficulty by adding to existing levels, not by
renumbering.** Asked to move obstacle introductions from level 11 earlier to
level 3, the tempting move is reshuffling the level array so the difficulty
curve reads cleanly start-to-finish. Didn't do that: level IDs are the save-data
key (`profile.clears[level.id]`), so renumbering invalidates or silently
misattributes existing players' star progress with no way to detect it from
the data alone. Instead, obstacles were added *onto* existing levels (a small
thermal folded into level 3's existing "heavy cloud, two sea trips" identity, a
bird flock into level 6's existing three-field level) — same id, same name,
same fact card, same core lesson, additively harder. Re-ran the full
calibration/invariant/completability suite after each addition rather than
assuming it was still balanced.

Transferable: once a level/quest/stage list has shipped with player-facing save
state keyed by position or id, treat reordering as a migration problem, not a
content edit. Additive changes to existing entries sidestep it entirely and are
usually sufficient for "introduce X earlier."
