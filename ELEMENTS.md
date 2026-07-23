# ELEMENTS.md — how to grow the water world without a rewrite

The v2 core (`src/v2/prototype.ts`) is a **closed water system**: a fixed total
of water (`TOTAL`) that only ever *moves* between reservoirs. Today there are
three kinds of reservoir — the sea, the cloud, and each field — and three kinds
of flow between them:

```
        ☀️ sun
         │  drives
         ▼
   sea ──evap──▶ cloud ──rain──▶ fields
    ▲                              │
    └──────── drain (percolation) ─┘
    ▲                              │
    └──────── runoff (missed rain)─┘
```

The design rule that keeps this extensible: **every new natural element is a
reservoir plus one or more flows.** Water is never created or destroyed — a new
element just gives water another *place to sit* and another *path to travel*.
If you honor that, the teaching bar and the conservation test keep working for
free, and the "水没变多也没变少，只是一直在转圈" lesson still holds.

## The seam

- `sumWater(state)` is the single source of truth for "how much water exists."
  Every reservoir must be included here. The conservation test
  (`tests/v2.prototype.test.ts`) asserts this stays constant across any actions.
- `state.flow` records the live per-second rate of every flow this step. Render
  reads these to draw *visible motion* (rising vapour ∝ `flow.evap`, return
  trickles ∝ `flow.drain[i]`). A new flow should add a `flow.*` entry so it can
  be drawn as motion too — that is what makes the link legible without text.

## Growth path (each is additive, not a rewrite)

| Element | New reservoir | New flow(s) | Teaches |
|---------|---------------|-------------|---------|
| **River** | `river: number` (or per-segment) | mountain-catch → river → sea/field | runoff, watersheds |
| **Snow cap** | `snow: number` per peak | rain→snow (freeze, above snow line); snow→river/field (melt ∝ sun) | solid precipitation, snowmelt delay |
| **Groundwater** | `ground: number` | field→ground (deep percolation); ground→spring→field (slow return) | aquifers, springs |
| **Pond / lake** | another entry in a reservoir list | field/river→pond; pond→cloud (its own small evap) | inland water bodies, local cycles |
| **Plants (beyond fields)** | moisture already on fields | field→air (transpiration, tiny evap that feeds cloud) | the biological arm of the cycle |

## When you add one, do all of:

1. Add the reservoir to state **and** to `sumWater()`.
2. Add its flow(s) to the `stepV2` body, moving water (never minting it), and
   record each as a `flow.*` rate.
3. Draw the flow as **motion** (a stream/trickle/wisp whose density ∝ the rate),
   not just a number — the whole point of round 17 was that the abstract bar
   alone did not convey the sea↔cloud↔field link.
4. Extend the conservation test to include the new reservoir in its sum.
5. Keep it **never-fail**: new elements can create scarcity or delay, but the
   valley must always be recoverable; dusk-without-balance is "try again," not
   a death.

## Deliberately NOT done yet (parked, honest)

- No real height field / cellular-automata hydrology — flows are lumped rates,
  chosen for legibility over physical fidelity (documented, not hidden).
- No RNG in the sim — replays are the same puzzle so a child can learn it.
- Only one valley layout. Multiple layouts are content, not core; add them once
  the core verb is proven fun (see `FUN.md`).
