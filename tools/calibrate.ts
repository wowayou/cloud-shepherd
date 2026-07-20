/**
 * Star-threshold calibration report.
 *
 * Round 2 calibrated `starThresholds` against "a measured ideal run" but the
 * measuring rig itself was never committed, so round 7 (wind became a real
 * displacement, three dynamic obstacles landed) had to rebuild it from scratch
 * before it could re-tune anything. It lives here now.
 *
 * Run:  npx vite-node tools/calibrate.ts
 *
 * House rule from round 2, kept: 3\u2605 \u2248 2\u00d7 the ideal run, 2\u2605 \u2248 3\u00d7. A real child
 * on a touchscreen is nowhere near the autopilot.
 */
import { LEVELS } from '../src/levels/data.ts';
import { evalStars } from '../src/levels/index.ts';
import { idealRun } from './autopilot.ts';
import type { Tier } from '../src/types.ts';

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const num = (s: string | number, n: number) => String(s).padStart(n);

console.log('level                       tier   ideal_t  ideal_w   3★gate   2★gate  w3  w2   stars@ideal  verdict');
console.log('─'.repeat(104));

let problems = 0;
for (const level of LEVELS) {
  for (const tier of ['easy', 'hard'] as Tier[]) {
    const r = idealRun(level, tier);
    const th = level.tiers[tier].starThresholds;
    const secs = (r.elapsedMs / 1000).toFixed(1);
    const waste = r.waste.toFixed(0);

    if (!r.completed) {
      console.log(`${pad(`${level.id} ${level.name}`, 26)} ${pad(tier, 6)} ${num(secs, 7)}  ${num(waste, 7)}   —        —        —   —    —            UNCOMPLETABLE`);
      problems++;
      continue;
    }
    if (!th) {
      console.log(`${pad(`${level.id} ${level.name}`, 26)} ${pad(tier, 6)} ${num(secs, 7)}  ${num(waste, 7)}   (no gates — always 3★)`);
      continue;
    }

    const starsAtIdeal = evalStars(level, tier, {
      elapsedMs: r.elapsedMs,
      waterEvaporated: 0,
      waterRained: 0,
      waterWasted: r.waste,
    });
    // The house rule: an ideal run should clear 3★ with room to spare, and the
    // 3★ gate should sit near 2× ideal. Flag gates that are unreachable (ideal
    // run can't 3★) or free (gate so loose it can't discriminate).
    const ratio3 = th.timeMs[0] / r.elapsedMs;
    let verdict = 'ok';
    if (starsAtIdeal < 3) {
      verdict = 'TOO TIGHT (ideal run misses 3★)';
      problems++;
    } else if (ratio3 > 3.2) {
      verdict = `loose (3★ = ${ratio3.toFixed(1)}× ideal)`;
      problems++;
    } else if (ratio3 < 1.35) {
      verdict = `tight (3★ = ${ratio3.toFixed(1)}× ideal)`;
      problems++;
    }

    console.log(
      `${pad(`${level.id} ${level.name}`, 26)} ${pad(tier, 6)} ${num(secs, 7)}  ${num(waste, 7)}   ` +
        `${num((th.timeMs[0] / 1000).toFixed(0) + 's', 6)}   ${num((th.timeMs[1] / 1000).toFixed(0) + 's', 6)}  ` +
        `${num(th.waste[0], 3)} ${num(th.waste[1], 3)}   ${num(starsAtIdeal, 3)}          ${verdict}`,
    );
  }
}

console.log('─'.repeat(104));
console.log(problems === 0 ? 'all gates within the 1.35×–3.2× band' : `${problems} gate(s) need attention`);
