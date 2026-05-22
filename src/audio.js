// ============================================================
//  AUDIO MODULE — BGM + SFX with crossfade, per-track volumes,
//  master/music/sfx mix, mute, and persisted prefs.
//
//  Module-level singletons match the rest of main.js (no classes).
//  Autoplay-safe: nothing plays until unlockAudio() is called on
//  first user interaction.
// ============================================================
import Phaser from 'phaser';

const PREFS_KEY = 'recruiterQuest.audio.v1';
const DEFAULT_PREFS = { master: 0.8, music: 0.8, sfx: 0.9, muted: false };

// iOS Mobile Chrome / Safari use HTML5 audio (see main.js), where each
// .play() call costs ~10–50ms on the main thread. Used to throttle the
// most-frequent SFX (footstep) so walking stays smooth.
const IS_IOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

const BGM_REGISTRY = {
  title:             { file: 'bgm/title.mp3',             loop: true,  volume: 0.55, fadeMs: 800  },
  house:             { file: 'bgm/house.mp3',             loop: true,  volume: 0.45, fadeMs: 800  },
  town:              { file: 'bgm/town.mp3',              loop: true,  volume: 0.50, fadeMs: 800  },
  salesforce_office: { file: 'bgm/salesforce_office.mp3', loop: true,  volume: 0.45, fadeMs: 800  },
  anthropic_office:  { file: 'bgm/anthropic_office.mp3',  loop: true,  volume: 0.50, fadeMs: 800  },
  airport:           { file: 'bgm/airport.mp3',           loop: true,  volume: 0.45, fadeMs: 1200 },
  battle_normal:     { file: 'bgm/battle_normal.mp3',     loop: true,  volume: 0.60, fadeMs: 250  },
  battle_final:      { file: 'bgm/battle_final.mp3',      loop: true,  volume: 0.65, fadeMs: 400  },
  victory:           { file: 'bgm/victory.mp3',           loop: false, volume: 0.70, fadeMs: 150  },
  credits:           { file: 'bgm/credits.mp3',           loop: true,  volume: 0.55, fadeMs: 1500 },
};

const SFX_REGISTRY = {
  ui_confirm:    { files: ['sfx/ui_confirm.wav'],    volume: 0.70 },
  ui_cancel:     { files: ['sfx/ui_cancel.wav'],     volume: 0.60 },
  ui_select:     { files: ['sfx/ui_select.wav'],     volume: 0.50 },
  menu_open:     { files: ['sfx/menu_open.wav'],     volume: 0.60 },
  save:          { files: ['sfx/save.wav'],          volume: 0.70 },
  dialogue_blip: { files: ['sfx/dialogue_blip.wav'], volume: 0.35 },
  footstep:      { files: ['sfx/footstep_1.wav', 'sfx/footstep_2.wav'], volume: 0.25 },
  hit_player:    { files: ['sfx/hit_player.wav'],    volume: 0.75 },
  hit_enemy:     { files: ['sfx/hit_enemy.wav'],     volume: 0.75 },
  skill_cast:    { files: ['sfx/skill_cast.wav'],    volume: 0.70 },
  miss:          { files: ['sfx/miss.wav'],          volume: 0.55 },
  ko:            { files: ['sfx/ko.wav'],            volume: 0.85 },
  level_up:      { files: ['sfx/level_up.wav'],      volume: 0.85 },
  stage_unlock:  { files: ['sfx/stage_unlock.wav'],  volume: 0.90 },
  shop_buy:      { files: ['sfx/shop_buy.wav'],      volume: 0.70 },
  potion_use:    { files: ['sfx/potion_use.wav'],    volume: 0.65 },
  exit:          { files: ['sfx/exit.wav'],          volume: 0.50 },
};

const MAP_TO_BGM = {
  house:             'house',
  town:              'town',
  salesforce_office: 'salesforce_office',
  anthropic_office:  'anthropic_office',
  airport:           'airport',
};

// ---- Module state ----
let prefs = loadPrefs();
let unlocked = false;
let currentBgmId = null;
let currentBgmSound = null;
let lastSceneRef = null;
let footstepIdx = 0;

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return Object.assign({}, DEFAULT_PREFS);
    const parsed = JSON.parse(raw);
    return Object.assign({}, DEFAULT_PREFS, parsed);
  } catch (e) { return Object.assign({}, DEFAULT_PREFS); }
}

function persistPrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
}

function assetUrl(path) {
  return (import.meta.env.BASE_URL || '/') + 'assets/' + path;
}

function musicMix(id) {
  const def = BGM_REGISTRY[id];
  if (!def) return 0;
  if (prefs.muted) return 0;
  return def.volume * prefs.music * prefs.master;
}

function sfxMix(id) {
  const def = SFX_REGISTRY[id];
  if (!def) return 0;
  if (prefs.muted) return 0;
  return def.volume * prefs.sfx * prefs.master;
}

// ============================================================
//  Preload — call from every scene's preload() that uses sound.
//  Idempotent via Phaser's cache.audio check.
// ============================================================
export function preloadAudio(scene) {
  lastSceneRef = scene;
  for (const id of Object.keys(BGM_REGISTRY)) {
    const def = BGM_REGISTRY[id];
    const key = 'bgm_' + id;
    if (scene.cache.audio.exists(key)) continue;
    scene.load.audio(key, assetUrl(def.file));
  }
  for (const id of Object.keys(SFX_REGISTRY)) {
    const def = SFX_REGISTRY[id];
    def.files.forEach((file, i) => {
      const key = 'sfx_' + id + (def.files.length > 1 ? '_' + i : '');
      if (scene.cache.audio.exists(key)) return;
      scene.load.audio(key, assetUrl(file));
    });
  }
}

// ============================================================
//  Unlock — call on the first user input (menu tap/key).
//  Resumes the WebAudio context per browser autoplay rules.
// ============================================================
// 1-sample silent WAV (8 kHz 8-bit mono). Used to wake iOS media output.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA';

export function unlockAudio(scene) {
  if (scene) lastSceneRef = scene;
  if (unlocked) return;
  unlocked = true;
  const ctx = scene && scene.sound && scene.sound.context;
  if (ctx) {
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) {}
    // WebAudio side of the iOS unlock: a 1-sample silent buffer.
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch (e) {}
  }
  // HTMLMediaElement side of the iOS unlock. Calling .play() on a silent
  // <audio> during the first user gesture is what actually grants the
  // browser app audio output on iOS 15+ — WebAudio alone isn't enough.
  try {
    const a = new Audio(SILENT_WAV);
    a.muted = false;
    const p = a.play();
    if (p && typeof p.then === 'function') p.catch(() => {});
  } catch (e) {}
}

// ============================================================
//  BGM — playBgm/stopBgm with crossfade.
// ============================================================
export function playBgm(id) {
  if (!id) { stopBgm(); return; }
  if (!unlocked) {
    // Defer until unlocked. Just record intent.
    currentBgmId = id;
    return;
  }
  if (!lastSceneRef) return;
  const def = BGM_REGISTRY[id];
  if (!def) return;

  // Already playing this exact track — just re-apply mix in case prefs changed.
  if (currentBgmSound && currentBgmId === id && currentBgmSound.isPlaying) {
    currentBgmSound.setVolume(musicMix(id));
    return;
  }

  const scene = lastSceneRef;
  const fadeOutMs = currentBgmSound ? (BGM_REGISTRY[currentBgmId]?.fadeMs || 400) : 0;
  const fadeInMs  = def.fadeMs || 400;
  const oldSound  = currentBgmSound;
  currentBgmId    = id;

  // Build new sound — guard on cache existence so a missing asset doesn't throw.
  const newKey = 'bgm_' + id;
  if (!scene.cache.audio.exists(newKey)) {
    console.warn('[audio] missing BGM asset:', newKey);
    return;
  }

  let nextSound;
  try {
    nextSound = scene.sound.add(newKey, { loop: !!def.loop, volume: 0 });
    nextSound.play();
  } catch (e) {
    console.warn('[audio] failed to play BGM:', id, e);
    return;
  }
  currentBgmSound = nextSound;

  // Fade in new
  scene.tweens.add({
    targets: nextSound,
    volume: musicMix(id),
    duration: fadeInMs,
    ease: 'Linear',
  });

  // Fade out old, then destroy
  if (oldSound && oldSound.isPlaying) {
    scene.tweens.add({
      targets: oldSound,
      volume: 0,
      duration: fadeOutMs,
      ease: 'Linear',
      onComplete: () => { try { oldSound.stop(); oldSound.destroy(); } catch (e) {} },
    });
  }
}

export function stopBgm() {
  if (!currentBgmSound) { currentBgmId = null; return; }
  const scene = lastSceneRef;
  const sound = currentBgmSound;
  const fadeMs = BGM_REGISTRY[currentBgmId]?.fadeMs || 400;
  currentBgmSound = null;
  currentBgmId = null;
  if (!scene) { try { sound.stop(); sound.destroy(); } catch (e) {} return; }
  scene.tweens.add({
    targets: sound, volume: 0, duration: fadeMs, ease: 'Linear',
    onComplete: () => { try { sound.stop(); sound.destroy(); } catch (e) {} },
  });
}

export function pauseBgm() {
  if (currentBgmSound && currentBgmSound.isPlaying) {
    try { currentBgmSound.pause(); } catch (e) {}
  }
}

export function resumeBgm() {
  if (currentBgmSound && currentBgmSound.isPaused) {
    try { currentBgmSound.resume(); } catch (e) {}
  }
}

// ============================================================
//  SFX — one-shot.
// ============================================================
export function playSfx(id) {
  if (!unlocked || !lastSceneRef) return;
  const def = SFX_REGISTRY[id];
  if (!def) return;
  const variantCount = def.files.length;
  let variantIdx;
  if (id === 'footstep' && variantCount > 1) {
    // iOS HTML5 audio: skip every other footstep to halve main-thread
    // cost. Still increment the counter so variant alternation continues.
    if (IS_IOS && (footstepIdx % 2 === 1)) { footstepIdx++; return; }
    variantIdx = footstepIdx % variantCount;
    footstepIdx++;
  } else {
    variantIdx = Math.floor(Math.random() * variantCount);
  }
  const key = 'sfx_' + id + (variantCount > 1 ? '_' + variantIdx : '');
  if (!lastSceneRef.cache.audio.exists(key)) return;
  try {
    lastSceneRef.sound.play(key, { volume: sfxMix(id) });
  } catch (e) {}
}

// ============================================================
//  Map → BGM resolver
// ============================================================
export function bgmForMap(mapId) {
  return MAP_TO_BGM[mapId] || null;
}

// ============================================================
//  Prefs API (for pause-menu audio panel)
// ============================================================
export function getAudioPrefs() {
  return Object.assign({}, prefs);
}

export function setAudioPref(key, value) {
  if (!(key in DEFAULT_PREFS)) return;
  if (key === 'muted') prefs.muted = !!value;
  else prefs[key] = Math.max(0, Math.min(1, value));
  persistPrefs();
  applyAudioPrefs();
}

export function toggleMute() {
  prefs.muted = !prefs.muted;
  persistPrefs();
  applyAudioPrefs();
  return prefs.muted;
}

export function applyAudioPrefs() {
  if (currentBgmSound && currentBgmId) {
    try { currentBgmSound.setVolume(musicMix(currentBgmId)); } catch (e) {}
  }
}

// Expose for browser-console debugging.
if (typeof window !== 'undefined') {
  window.__audio = { playBgm, stopBgm, playSfx, getAudioPrefs, setAudioPref, toggleMute };
}
