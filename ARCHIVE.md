# ARCHIVE.md — the v1 campaign, retired 2026-07-23

## What v1 was

A 21-level campaign (tutorial + 20, × easy/hard) where you **drag a cloud from
sea to field and hold to rain**. Real wind, dynamic obstacles (thermals, bird
flocks, cold fronts), a simulated sun driving evaporation, multi-sea layouts,
light hydrology (mountain runoff, snow line), seasons, an eco-dex, and a
date-seeded daily challenge. It was fully playable, `npm test`-green, and
deployed to GitHub Pages.

## Why it was retired

The owner played it and reported the verdict that no amount of features fixed:
**"会摸到，不想再来一把，没意思"** (I figure it out, but I don't want another
go — it's boring). Rounds 9–16 kept adding systems (pressure, seasons, daily,
eco-dex, energy) on top of the same core verb — *move water from A to B* — and
satisfaction never moved. The bottleneck was the **core loop**, not the feature
count. See `FUN.md` for the acceptance bar that made this explicit and
`LEARNINGS.md` for the "stacking systems ≠ fun" lesson.

## What replaced it

`src/v2/` — a **closed-water-cycle** toy. One conserved pool of water moves
between sea, cloud, and fields; you keep it *circulating* so every field sits
in its happy band at once. The pivot the campaign never made: water is finite
and visible, so the loop itself is the puzzle and the lesson. See
`ELEMENTS.md` for how new natural elements (river, snow, groundwater…) attach
without a rewrite.

## Status of the v1 code

- **Still in the tree, still compiles, still tested** by `tests/smoke.test.ts`
  (so it doesn't bit-rot) — but **no longer referenced by `src/main.ts`**.
- Modules: `src/game/scenes.ts`, `src/sim/`, `src/render/`, `src/levels/`,
  `src/input/`, `src/audio/`, `src/ui/`, plus `tests/sim.test.ts`,
  `tests/levels.test.ts`, `tests/daily.test.ts`, `tests/progress.test.ts`.
- **Reusable assets** if v2 grows: the ADSR/pink-noise audio engine
  (`src/audio/`), the Canvas art vocabulary (cloud blob, fields, mountains,
  birds) in `src/render/`, the deterministic PRNG + calibration rig in
  `tools/`, and the profile/localStorage store in `src/levels/progress.ts`.
- To bring v1 back for comparison: `bootGame` in `src/game/scenes.ts` is intact
  — point `src/main.ts` at it, or embed v2 under it by passing `bootV2` an
  `onExit` handler (the back-button path still works).

Nothing was deleted. This is a pivot, not a purge — if the v2 core doesn't earn
"one more go" either, v1 is still here to fall back to or mine for parts.
