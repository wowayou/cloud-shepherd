import type { Field, GameState, LevelDef, Profile, Scene, Tier, UiCallbacks, UiModule } from '../types.ts';
import { STRINGS, type FactCardKey } from '../strings.ts';

const AVATARS: { emoji: string; bg: string }[] = [
  { emoji: '🦊', bg: '#f4a259' },
  { emoji: '🐰', bg: '#f7cad0' },
  { emoji: '🐼', bg: '#cfd8dc' },
  { emoji: '🐸', bg: '#a8d5ba' },
  { emoji: '🦉', bg: '#c9b8ff' },
  { emoji: '🐢', bg: '#8ecae6' },
];

const STYLE_ID = 'cloud-shepherd-ui-style';
// Soft-pastel, softly-shaded chrome that echoes render/index.ts's palette
// (sky blues #8fd0ee/#bfe6f5, rain #5b86c2/#bcd6f2, sun/star gold
// #f4a259/#ffd166) — round 1 gave the Canvas a gradient-shaded, soft-shadowed
// redesign; this gives the DOM HUD the same treatment (gradients + blurred
// ambient shadows instead of flat fills + hard offsets) so the two layers
// read as one game instead of "polished art, placeholder UI".
const STYLES = `
  .cs-screen { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:16px; padding:24px; box-sizing:border-box; font-family:inherit;
    pointer-events:none; }
  .cs-btn { font:inherit; font-size:20px; font-weight:600; border:none; border-radius:20px;
    padding:14px 28px; min-height:56px; cursor:pointer; color:#20344a;
    background:linear-gradient(180deg, #ffffff 0%, #e9f4fb 100%);
    box-shadow:0 4px 0 rgba(32,52,74,0.15), 0 6px 12px rgba(32,52,74,0.14);
    touch-action:manipulation; pointer-events:auto; transition:transform 0.08s ease, box-shadow 0.08s ease; }
  .cs-btn:active { transform:translateY(2px); box-shadow:0 2px 0 rgba(32,52,74,0.15), 0 3px 6px rgba(32,52,74,0.14); }
  .cs-btn.primary { background:linear-gradient(180deg, #ffe08a 0%, #ffd166 100%); }
  .cs-btn.locked { opacity:0.45; cursor:default; }
  .cs-title { font-size:30px; font-weight:800; color:#16324f; margin:0; text-shadow:0 2px 0 rgba(255,255,255,0.6); }
  .cs-row { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; }
  .cs-avatar { width:64px; height:64px; border-radius:50%; display:flex; align-items:center;
    justify-content:center; font-size:32px; border:3px solid white;
    box-shadow:0 3px 0 rgba(0,0,0,0.15), 0 5px 10px rgba(32,52,74,0.2);
    pointer-events:auto; transition:transform 0.08s ease; }
  .cs-avatar:active { transform:scale(0.94); }
  .cs-profile-card { display:flex; flex-direction:column; align-items:center; gap:6px; background:none;
    border:none; cursor:pointer; font:inherit; pointer-events:auto; }
  .cs-input { font:inherit; font-size:18px; padding:10px 14px; border-radius:14px; border:2px solid #cfd8dc;
    pointer-events:auto; background:#ffffff; }
  .cs-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:14px;
    max-width:900px; width:100%; overflow-y:auto; padding:8px; }
  .cs-level-card { background:linear-gradient(165deg, rgba(255,255,255,0.96), rgba(224,242,253,0.88));
    border-radius:18px; padding:12px; text-align:center; box-shadow:0 4px 10px rgba(32,52,74,0.12);
    display:flex; flex-direction:column; gap:8px; }
  .cs-level-name { font-weight:700; color:#16324f; }
  .cs-stars { font-size:14px; color:#f4a259; min-height:18px; text-shadow:0 1px 0 rgba(255,255,255,0.7); }
  .cs-hud-bar { position:absolute; top:12px; left:12px; right:12px; display:flex; justify-content:space-between;
    align-items:flex-start; pointer-events:none; }
  .cs-hud-bar > * { pointer-events:auto; }
  .cs-pill { background:linear-gradient(180deg, rgba(255,255,255,0.96), rgba(220,240,253,0.88));
    border:1px solid rgba(255,255,255,0.8); border-radius:16px; padding:8px 14px; font-weight:700;
    color:#16324f; display:flex; align-items:center; gap:8px; box-shadow:0 4px 10px rgba(32,52,74,0.18); }
  .cs-water-track { width:120px; height:14px; border-radius:8px; background:rgba(32,52,74,0.14);
    box-shadow:inset 0 2px 3px rgba(32,52,74,0.28); overflow:hidden; }
  .cs-water-fill { height:100%; background:linear-gradient(90deg, #bcd6f2, #5b86c2); width:0%;
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.5); transition:width 0.1s linear; }
  .cs-icon-btn { width:44px; height:44px; border-radius:50%; border:1px solid rgba(255,255,255,0.8);
    background:linear-gradient(180deg, rgba(255,255,255,0.96), rgba(220,240,253,0.88));
    font-size:20px; cursor:pointer; box-shadow:0 4px 10px rgba(32,52,74,0.2);
    pointer-events:auto; transition:transform 0.08s ease; }
  .cs-icon-btn:active { transform:scale(0.9); }
  .cs-rain-btn { position:absolute; bottom:20px; left:50%; transform:translateX(-50%); width:84px; height:84px;
    border-radius:50%; border:none;
    background:radial-gradient(circle at 34% 28%, #eefaff 0%, #6cc3e8 45%, #3487ae 92%);
    font-size:34px; color:white;
    box-shadow:0 8px 16px rgba(24,64,96,0.4), inset 0 -6px 8px rgba(15,55,80,0.28), inset 0 4px 6px rgba(255,255,255,0.45);
    touch-action:none; pointer-events:auto; transition:transform 0.08s ease; }
  .cs-rain-btn:active { transform:translateX(-50%) translateY(2px) scale(0.97); }
  .cs-hint { position:absolute; top:70px; left:50%; transform:translateX(-50%); max-width:80%;
    background:rgba(22,50,79,0.85); color:white; padding:10px 18px; border-radius:16px; font-size:16px;
    text-align:center; box-shadow:0 6px 14px rgba(16,34,52,0.25); pointer-events:none; }
  .cs-pause-overlay { position:absolute; inset:0; background:rgba(20,40,60,0.55); backdrop-filter:blur(2px);
    display:flex; align-items:center; justify-content:center; pointer-events:auto; }
  .cs-pause-card { background:linear-gradient(165deg, #ffffff, #e9f4fb); border-radius:24px; padding:28px;
    display:flex; flex-direction:column; gap:12px; align-items:stretch; box-shadow:0 12px 28px rgba(16,34,52,0.3); }
  .cs-result-card { background:linear-gradient(165deg, rgba(255,255,255,0.97), rgba(224,242,253,0.92));
    border-radius:24px; padding:28px 36px; box-shadow:0 12px 30px rgba(16,34,52,0.25);
    display:flex; flex-direction:column; align-items:center; gap:14px; max-width:420px; pointer-events:auto; }
  .cs-star-row { display:flex; gap:6px; font-size:40px; justify-content:center; }
  .cs-star.filled { color:#ffd166; text-shadow:0 2px 0 rgba(196,132,20,0.4); animation:cs-star-pop 0.4s ease backwards; }
  .cs-star.empty { color:rgba(32,52,74,0.2); }
  .cs-fact-card { background:linear-gradient(165deg, #fff7df, #ffedb6); border-radius:16px;
    padding:16px 22px; cursor:pointer; text-align:center; max-width:340px; pointer-events:auto;
    box-shadow:0 4px 10px rgba(32,52,74,0.14); transition:background 0.18s ease; touch-action:manipulation; }
  .cs-fact-card:hover { background:linear-gradient(165deg, #fff3cf, #ffe8a6); }
  .cs-fact-card:has(.cs-fact-prompt) { animation:cs-fact-glow 1.8s ease-in-out infinite; }
  .cs-fact-prompt { color:#9a6a1e; font-weight:700; font-size:15px; line-height:1.4; }
  .cs-fact-text { color:#5a4416; font-size:16px; line-height:1.6; }
  .cs-cycle { gap:2px; font-size:15px; }
  .cs-cycle-arrow { opacity:0.35; font-size:12px; color:#16324f; }
  .cs-cycle-stage { opacity:0.3; filter:grayscale(0.6); transition:opacity 0.25s ease, transform 0.25s ease, filter 0.25s ease;
    display:inline-block; }
  .cs-cycle-stage.active { opacity:1; filter:none; transform:scale(1.3); }
  @keyframes cs-star-pop { 0% { transform:scale(0); opacity:0; } 70% { transform:scale(1.2); opacity:1; } 100% { transform:scale(1); } }
  @keyframes cs-fact-glow {
    0%, 100% { box-shadow:0 4px 10px rgba(32,52,74,0.14); }
    50% { box-shadow:0 4px 16px rgba(255,209,102,0.65); }
  }
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { className?: string; text?: string; onClick?: () => void } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.onClick) node.addEventListener('click', () => opts.onClick!());
  return node;
}

export function createUi(): UiModule {
  let callbacks: UiCallbacks;
  let currentProfileId: string | null = null;
  let paused = false;

  // tutorial-hint bookkeeping (only meaningful on levels that define `tutorial`)
  let hasTutorial = false;
  let everFull = false;
  let everOverField = false;

  const screens: Partial<Record<Scene, HTMLElement>> = {};
  let profileListEl: HTMLElement;
  let levelGridEl: HTMLElement;
  let hudBloomEl: HTMLElement;
  let hudLevelEl: HTMLElement;
  let hudCycleEls: Partial<Record<'evap' | 'carry' | 'rain' | 'back', HTMLElement>> = {};
  let prevCloudWater = 0;
  let everRained = false; // for the 🔁 stage: re-absorbing after having rained
  let hudWaterFillEl: HTMLElement;
  let hudMuteBtn: HTMLElement;
  let hintEl: HTMLElement;
  let pauseOverlay: HTMLElement;
  let resultStarsEl: HTMLElement;
  let resultFactEl: HTMLElement;
  let resultFactPromptEl: HTMLElement; // the "tap to flip" hint shown before the fact is revealed

  function injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function buildProfileScreen(): HTMLElement {
    const screen = el('div', { className: 'cs-screen' });
    screen.append(el('h1', { className: 'cs-title', text: STRINGS.profile.chooseTitle }));
    profileListEl = el('div', { className: 'cs-row' });
    screen.append(profileListEl);

    const nameInput = el('input', { className: 'cs-input' }) as HTMLInputElement;
    nameInput.placeholder = STRINGS.profile.namePlaceholder;
    nameInput.maxLength = 12;
    let pickedColor = 0;
    const swatches = el('div', { className: 'cs-row' });
    AVATARS.forEach((a, i) => {
      const btn = el('button', { className: 'cs-avatar', text: a.emoji, onClick: () => (pickedColor = i) });
      (btn as HTMLElement).style.background = a.bg;
      (btn as HTMLElement).style.border = i === 0 ? '3px solid #16324f' : '3px solid white';
      btn.addEventListener('click', () => {
        for (const child of Array.from(swatches.children)) (child as HTMLElement).style.border = '3px solid white';
        (btn as HTMLElement).style.border = '3px solid #16324f';
      });
      swatches.append(btn);
    });

    const confirmBtn = el('button', { className: 'cs-btn primary', text: STRINGS.profile.confirm });
    confirmBtn.addEventListener('click', () => {
      const name = nameInput.value.trim() || STRINGS.profile.namePlaceholder;
      callbacks.onCreateProfile(name, pickedColor);
      nameInput.value = '';
    });

    screen.append(el('h2', { className: 'cs-title', text: STRINGS.profile.newProfile }), swatches, nameInput, confirmBtn);
    return screen;
  }

  function buildMenuScreen(): HTMLElement {
    const screen = el('div', { className: 'cs-screen' });
    const title = el('h1', { className: 'cs-title', text: STRINGS.app.title });
    const playBtn = el('button', { className: 'cs-btn primary', text: STRINGS.menu.levelSelect, onClick: () => {
      // re-entering with the same profile routes back into level select
      if (currentProfileId) callbacks.onSelectProfile(currentProfileId);
    } });
    const switchBtn = el('button', { className: 'cs-btn', text: STRINGS.menu.switchProfile, onClick: () => setScene('profile') });
    screen.append(title, playBtn, switchBtn);
    return screen;
  }

  function starLabelFor(clear: Profile['clears'][number] | undefined): string {
    if (!clear) return '';
    if (clear.clearedHard) return '★'.repeat(clear.stars) + '☆'.repeat(3 - clear.stars);
    if (clear.clearedEasy) return '✓';
    return '';
  }

  function renderLevelSelect(profile: Profile, levels: LevelDef[]): void {
    levelGridEl.innerHTML = '';
    levels.forEach((level) => {
      const prevCleared = level.id === 0 || Boolean(profile.clears[level.id - 1]);
      const card = el('div', { className: 'cs-level-card' });
      card.append(el('div', { className: 'cs-level-name', text: level.name }));
      card.append(el('div', { className: 'cs-stars', text: starLabelFor(profile.clears[level.id]) }));
      if (!prevCleared) {
        card.append(el('div', { text: STRINGS.levelSelect.locked }));
      } else {
        const row = el('div', { className: 'cs-row' });
        const easyBtn = el('button', {
          className: 'cs-btn',
          text: STRINGS.levelSelect.tierEasy,
          onClick: () => callbacks.onSelectLevel(level.id, 'easy'),
        });
        const hardBtn = el('button', {
          className: 'cs-btn',
          text: STRINGS.levelSelect.tierHard,
          onClick: () => callbacks.onSelectLevel(level.id, 'hard'),
        });
        row.append(easyBtn, hardBtn);
        card.append(row);
      }
      levelGridEl.append(card);
    });
  }

  function buildLevelSelectScreen(): HTMLElement {
    const screen = el('div', { className: 'cs-screen' });
    screen.append(el('h1', { className: 'cs-title', text: STRINGS.levelSelect.title }));
    levelGridEl = el('div', { className: 'cs-grid' });
    screen.append(levelGridEl);
    const switchBtn = el('button', { className: 'cs-btn', text: STRINGS.menu.switchProfile, onClick: () => setScene('profile') });
    screen.append(switchBtn);
    return screen;
  }

  function buildPlayingScreen(): HTMLElement {
    const screen = el('div', { className: 'cs-screen' });
    screen.style.justifyContent = 'flex-end';
    screen.style.padding = '0';

    const bar = el('div', { className: 'cs-hud-bar' });
    hudLevelEl = el('div', { className: 'cs-pill', text: '' });
    hudBloomEl = el('div', { className: 'cs-pill', text: '🌼 0/0' });

    // Water-cycle stage strip: the sun evaporates sea water (☀️), the cloud
    // carries it (☁️), rain returns it to the land (🌧️), and it flows back
    // (🔁). The stage the player is causing *right now* lights up, so the
    // cycle is named by the game itself while the child plays it.
    hudCycleEls = {};
    const cyclePill = el('div', { className: 'cs-pill cs-cycle' });
    (['evap', 'carry', 'rain', 'back'] as const).forEach((k, i) => {
      if (i > 0) cyclePill.append(el('span', { className: 'cs-cycle-arrow', text: '→' }));
      const icon = el('span', { className: 'cs-cycle-stage', text: { evap: '☀️', carry: '☁️', rain: '🌧️', back: '🔁' }[k] });
      hudCycleEls[k] = icon;
      cyclePill.append(icon);
    });

    const leftGroup = el('div', { className: 'cs-row' });
    leftGroup.append(hudLevelEl, hudBloomEl, cyclePill);

    const waterPill = el('div', { className: 'cs-pill' });
    const waterTrack = el('div', { className: 'cs-water-track' });
    hudWaterFillEl = el('div', { className: 'cs-water-fill' });
    waterTrack.append(hudWaterFillEl);
    waterPill.append(el('span', { text: '☁️' }), waterTrack);

    let hudMuted = false;
    hudMuteBtn = el('button', { className: 'cs-icon-btn', text: '🔊', onClick: () => {
      hudMuted = !hudMuted;
      hudMuteBtn.textContent = hudMuted ? '🔇' : '🔊';
      callbacks.onToggleMute();
    } });
    const pauseBtn = el('button', { className: 'cs-icon-btn', text: '⏸', onClick: () => {
      paused = true;
      pauseOverlay.style.display = 'flex';
      callbacks.onPause();
    } });

    const rightGroup = el('div', { className: 'cs-row' });
    rightGroup.append(waterPill, hudMuteBtn, pauseBtn);
    bar.append(leftGroup, rightGroup);

    hintEl = el('div', { className: 'cs-hint', text: '' });
    hintEl.style.display = 'none';

    const rainBtn = el('button', { className: 'cs-rain-btn', text: '☔' });
    const setHeld = (held: boolean) => (e: Event) => {
      e.preventDefault();
      callbacks.onRainHold(held);
    };
    rainBtn.addEventListener('pointerdown', setHeld(true));
    rainBtn.addEventListener('pointerup', setHeld(false));
    rainBtn.addEventListener('pointercancel', setHeld(false));
    rainBtn.addEventListener('pointerleave', setHeld(false));

    pauseOverlay = el('div', { className: 'cs-pause-overlay' });
    pauseOverlay.style.display = 'none';
    const pauseCard = el('div', { className: 'cs-pause-card' });
    pauseCard.append(
      el('button', { className: 'cs-btn primary', text: STRINGS.hud.resume, onClick: () => {
        paused = false;
        pauseOverlay.style.display = 'none';
        callbacks.onResume();
      } }),
      el('button', { className: 'cs-btn', text: STRINGS.hud.retry, onClick: () => {
        paused = false;
        pauseOverlay.style.display = 'none';
        callbacks.onRetry();
      } }),
      el('button', { className: 'cs-btn', text: STRINGS.hud.quit, onClick: () => {
        paused = false;
        pauseOverlay.style.display = 'none';
        callbacks.onQuit();
      } }),
    );
    pauseOverlay.append(pauseCard);

    screen.append(bar, hintEl, rainBtn, pauseOverlay);
    return screen;
  }

  function buildResultScreen(): HTMLElement {
    const screen = el('div', { className: 'cs-screen' });
    const card = el('div', { className: 'cs-result-card' });
    card.append(el('h1', { className: 'cs-title', text: STRINGS.result.title }));
    card.append(el('div', { text: STRINGS.result.subtitleAllBloom }));
    resultStarsEl = el('div', { className: 'cs-star-row', text: '' });
    card.append(resultStarsEl);

    // Fact card with a prompt-then-flip reveal: shows the "tap to look" prompt
    // first, and only flips to the full fact text on tap. The classic "did you
    // know?" moment lands better when a child actively opens it than when it's
    // dumped under the stars unchecked. Touch devices get the same gesture — a
    // single tap — via the click handler.
    resultFactEl = el('div', { className: 'cs-fact-card' });
    resultFactEl.style.display = 'none';
    resultFactPromptEl = el('div', { className: 'cs-fact-prompt', text: STRINGS.result.tapToFlip });
    resultFactEl.addEventListener('click', () => flipFactCard());
    resultFactEl.append(resultFactPromptEl);
    card.append(resultFactEl);

    const row = el('div', { className: 'cs-row' });
    row.append(
      el('button', { className: 'cs-btn primary', text: STRINGS.result.nextLevel, onClick: () => callbacks.onNext() }),
      el('button', { className: 'cs-btn', text: STRINGS.result.backToLevels, onClick: () => callbacks.onQuit() }),
    );
    card.append(row);
    screen.append(card);
    return screen;
  }

  /** Show the prompt state (pre-flip) with the knowThis headline above the
   *  tap hint. Called from showResult() before the card is interacted with. */
  function resetFactCard(): void {
    resultFactPromptEl.textContent = `${STRINGS.result.knowThis} ${STRINGS.result.tapToFlip}`;
    resultFactPromptEl.className = 'cs-fact-prompt';
  }

  /** Flip to the full fact text (a one-way reveal — facts don't hide again). */
  function flipFactCard(): void {
    const text = resultFactPromptEl.dataset.factText;
    if (!text) return; // nothing to flip to (no fact card for this level)
    resultFactPromptEl.textContent = text;
    resultFactPromptEl.className = 'cs-fact-text';
    // the card already has cursor:pointer + hover; after reveal it's inert,
    // but leave the affordance — re-tapping just re-shows the same text harmlessly.
  }

  function setScene(scene: Scene, data?: unknown): void {
    for (const [key, node] of Object.entries(screens)) {
      node!.style.display = key === scene ? 'flex' : 'none';
    }
    if (scene === 'profile') {
      const profiles = (data as { profiles: Profile[] } | undefined)?.profiles ?? [];
      profileListEl.innerHTML = '';
      profiles.forEach((p) => {
        const avatar = AVATARS[p.colorId % AVATARS.length];
        const card = el('button', { className: 'cs-profile-card', onClick: () => callbacks.onSelectProfile(p.id) });
        const circle = el('div', { className: 'cs-avatar', text: avatar.emoji });
        circle.style.background = avatar.bg;
        card.append(circle, el('span', { text: p.name }));
        profileListEl.append(card);
      });
    } else if (scene === 'menu') {
      currentProfileId = (data as { profile: Profile } | undefined)?.profile?.id ?? currentProfileId;
    } else if (scene === 'levelselect') {
      const d = data as { profile: Profile; levels: LevelDef[] };
      currentProfileId = d.profile.id;
      renderLevelSelect(d.profile, d.levels);
    } else if (scene === 'playing') {
      const d = data as { level: LevelDef; tier: Tier };
      hasTutorial = Boolean(d.level.tutorial?.length);
      everFull = false;
      everOverField = false;
      prevCloudWater = 0;
      everRained = false;
      hudLevelEl.textContent = d.level.id === 0 ? `📖 ${d.level.name}` : `${d.level.id} · ${d.level.name}`;
      paused = false;
      pauseOverlay.style.display = 'none';
      hintEl.style.display = hasTutorial ? 'block' : 'none';
    }
  }

  function updateHud(state: GameState, _tier: Tier): void {
    const total = state.fields.length;
    const bloomed = state.fields.filter((f) => f.state === 'bloom').length;
    hudBloomEl.textContent = `🌼 ${bloomed}/${total}`;
    const pct = state.cloud.maxWater > 0 ? (state.cloud.water / state.cloud.maxWater) * 100 : 0;
    hudWaterFillEl.style.width = `${pct}%`;

    // Light up the water-cycle stage the player is causing right now.
    // Display-only inference from visible state — no gameplay logic here.
    const absorbing = state.cloud.water > prevCloudWater + 0.01;
    prevCloudWater = state.cloud.water;
    const raining = state.cloud.raining;
    if (raining) everRained = true;
    const active: Record<'evap' | 'carry' | 'rain' | 'back', boolean> = {
      evap: absorbing && !everRained,
      back: absorbing && everRained, // the same evaporation, but now it *closes the loop*
      carry: !absorbing && !raining && state.cloud.water > 0,
      rain: raining,
    };
    for (const k of ['evap', 'carry', 'rain', 'back'] as const) {
      hudCycleEls[k]?.classList.toggle('active', active[k]);
    }

    if (hasTutorial && !paused) {
      hintEl.textContent = computeHintText(state);
    }
  }

  function computeHintText(state: GameState): string {
    const fullNow = state.cloud.water >= state.cloud.maxWater * 0.98;
    if (fullNow) everFull = true;
    if (!everFull) {
      return `${STRINGS.tutorial.dragCloud} ${STRINGS.tutorial.goToSea}`;
    }
    const nearField = state.fields.some((f: Field) => f.state !== 'bloom' && Math.hypot(f.pos.x - state.cloud.pos.x, f.pos.y - state.cloud.pos.y) < f.radius * 1.6);
    if (nearField) everOverField = true;
    if (!everOverField) {
      return `${STRINGS.tutorial.cloudFull} ${STRINGS.tutorial.goToField}`;
    }
    return STRINGS.tutorial.holdToRain;
  }

  function showResult(stars: number, factCardText?: string): void {
    resultStarsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const filled = i < stars;
      const star = el('span', { className: `cs-star ${filled ? 'filled' : 'empty'}`, text: filled ? '★' : '☆' });
      if (filled) star.style.animationDelay = `${i * 0.12}s`;
      resultStarsEl.append(star);
    }
    if (factCardText) {
      // Stash the final text on the prompt element and start in the pre-flip
      // prompt state; the click handler on the card flips to it.
      resultFactPromptEl.dataset.factText = factCardText;
      resetFactCard();
      resultFactEl.style.display = 'block';
    } else {
      delete resultFactPromptEl.dataset.factText;
      resultFactEl.style.display = 'none';
    }
  }

  function mount(root: HTMLElement, cb: UiCallbacks): void {
    callbacks = cb;
    injectStyles();
    root.innerHTML = '';

    screens.profile = buildProfileScreen();
    screens.menu = buildMenuScreen();
    screens.levelselect = buildLevelSelectScreen();
    screens.playing = buildPlayingScreen();
    screens.result = buildResultScreen();

    for (const node of Object.values(screens)) root.appendChild(node!);
    setScene('profile');
  }

  return { mount, setScene, updateHud, showResult };
}

export function factCardText(key: FactCardKey): string {
  const fact = STRINGS.facts[key];
  return `${fact.emoji} ${fact.text}`;
}
