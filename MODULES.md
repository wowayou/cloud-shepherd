# MODULES.md — handoff spec for GPT / Sonnet / Opus

## Where things stand

The v1 grey-box milestone turned into a **fully working game**, not just
stubs: all 11 levels (tutorial + 10, × easy/hard) are playable start to
finish — drag the cloud, fight the wind, absorb over the sea, rain on
fields, bloom, get scored, see a fact card, progress to the next level. It
has been manually verified end-to-end in a real Chromium browser (not just
`npm test`/typecheck — see "the pointer-events bug" below for why that
distinction matters).

All five rounds so far (module refinements 1–4 plus the round-5 playtest
fix pass) are **done** — the table below is complete; there is no
outstanding `dispatched`/`in review` work. The game deploys to GitHub
Pages via `.github/workflows/deploy.yml` on every push to main. The remaining known, *decided*
shortcut is the wind-as-cosmetic one (L7/L8), documented in its own section
below — it stays unless someone re-opens it deliberately.

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

### Known shortcut (decided, not just flagged): wind is cosmetic now, not a real difficulty lever

Found by the round 2 Levels agent while rebalancing. A held cloud's
steady-state wind displacement is `windX / PULL_ACCEL`. Before round 1's
Sim retune that was `14/22 ≈ 0.64` world-units; after (`PULL_ACCEL: 22→90`)
it's `14/90 ≈ 0.16` — negligible on a ~1150-unit-wide world. L7/L8 (which
exist specifically to introduce wind/gusts) now play indistinguishably
from a calm level.

**Decision (2026-07-19): accept this, don't fix it.** Three options were on
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
npm test            # 21 tests must stay green
npm run build        # must succeed
npm run dev          # then ACTUALLY PLAY IT in a browser — see below
```

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
