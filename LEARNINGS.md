# LEARNINGS.md — transferable lessons for the next game

Started 2026-07-20, round 8, at the user's request: "过程中随时记录，以便于为之后
其他游戏的开发积累经验."

`MODULES.md` records **what this game is and why it's built this way**.
This file records **what we'd want to know before starting a different game**.
Keep entries short, dated, and honest about what was actually measured versus
what was reasoned. Prefer "we tried X, it cost Y" over "best practice is X".

---

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
