/**
 * UI SFX (synthesized, no samples).
 * - hover (tri-hit only) → MX Brown tactile tick
 * - thock → door enter body
 * - scribble → pencil stroke for text underlines (may overlap)
 * - moon on/off → crisp 噔 / power switch
 */

const muted =
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** @type {AudioContext | null} */
let ctx = null;
let unlocked = false;
let lastHoverAt = 0;
let lastClickAt = 0;
let lastMoonAt = 0;

/** @type {AudioBuffer | null} */
let softNoiseBake = null;
/** @type {AudioBuffer | null} */
let whiteNoiseBake = null;

const HOVER_GAP_MS = 55;
const CLICK_GAP_MS = 70;
const MOON_GAP_MS = 160;

function ac() {
  if (muted) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

function bakeBuffers(c) {
  if (!softNoiseBake) softNoiseBake = softNoiseBuffer(c, 1.2);
  if (!whiteNoiseBake) whiteNoiseBake = noiseBuffer(c, 0.08);
}

export function unlockUiSound() {
  const c = ac();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  bakeBuffers(c);
  unlocked = true;
}

function ensureUnlockHooks() {
  if (muted || ensureUnlockHooks.bound) return;
  ensureUnlockHooks.bound = true;
  const kick = () => unlockUiSound();
  // Unlock ASAP so first scribble isn't waiting on resume()
  window.addEventListener("pointerdown", kick, { once: true, capture: true });
  window.addEventListener("pointermove", kick, { once: true, capture: true });
  window.addEventListener("keydown", kick, { once: true, capture: true });
}
ensureUnlockHooks.bound = false;

function noiseBuffer(c, seconds) {
  const n = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function softNoiseBuffer(c, seconds) {
  const n = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    brown = (brown + white * 0.02) * 0.986;
    data[i] = brown * 3.4 + white * 0.1;
  }
  return buf;
}

function envGain(c, t0, peak, attack, hold, release) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  return g;
}

function synthBrown(c, when, vol = 1) {
  const t0 = when;
  bakeBuffers(c);
  const src = c.createBufferSource();
  src.buffer = whiteNoiseBake || noiseBuffer(c, 0.04);

  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2200;
  hp.Q.value = 0.7;

  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3400;
  bp.Q.value = 1.1;

  const g = envGain(c, t0, 0.045 * vol, 0.001, 0.004, 0.028);
  src.connect(hp);
  hp.connect(bp);
  bp.connect(g);
  g.connect(c.destination);
  src.start(t0);
  src.stop(t0 + 0.045);

  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1650, t0);
  osc.frequency.exponentialRampToValueAtTime(780, t0 + 0.03);
  const og = envGain(c, t0, 0.018 * vol, 0.001, 0.006, 0.03);
  osc.connect(og);
  og.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + 0.04);
}

function synthThock(c, when, vol = 1) {
  const t0 = when;
  bakeBuffers(c);
  const src = c.createBufferSource();
  src.buffer = whiteNoiseBake || noiseBuffer(c, 0.1);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 520;
  lp.Q.value = 0.8;
  const g = envGain(c, t0, 0.11 * vol, 0.002, 0.02, 0.07);
  src.connect(lp);
  lp.connect(g);
  g.connect(c.destination);
  src.start(t0);
  src.stop(t0 + 0.1);

  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, t0);
  osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.09);
  const og = envGain(c, t0, 0.08 * vol, 0.003, 0.025, 0.08);
  osc.connect(og);
  og.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + 0.12);
}

/**
 * Pencil stroke — overlaps allowed (no cancel of prior strokes).
 * Duration should be shorter than the underline CSS so audio ends first.
 */
function synthPencil(c, when, vol = 1, duration = 0.4) {
  const t0 = when;
  const dur = Math.max(0.26, Math.min(0.85, duration));
  bakeBuffers(c);

  const src = c.createBufferSource();
  src.buffer = softNoiseBake || softNoiseBuffer(c, dur + 0.05);
  // Play a slice from a random offset so overlapping strokes don't phase-lock
  const maxOffset = Math.max(0, src.buffer.duration - dur - 0.02);
  const offset = maxOffset > 0 ? Math.random() * maxOffset : 0;

  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 420;
  hp.Q.value = 0.5;

  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(1400, t0);
  bp.frequency.exponentialRampToValueAtTime(760, t0 + dur);
  bp.Q.value = 0.8;

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2300;
  lp.Q.value = 0.35;

  const master = c.createGain();
  const peak = 0.052 * vol;
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
  master.gain.linearRampToValueAtTime(peak * 0.7, t0 + dur * 0.75);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(hp);
  hp.connect(bp);
  bp.connect(lp);
  lp.connect(master);
  master.connect(c.destination);

  src.start(t0, offset, dur + 0.02);
}

/**
 * Crisp 噔 — short percussive mid-high ding (not a whiny “diu”).
 */
function synthFluoPop(c, when, vol = 1) {
  const t0 = when;
  bakeBuffers(c);

  // Hard attack body of 噔
  const body = c.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(1480, t0);
  body.frequency.exponentialRampToValueAtTime(820, t0 + 0.055);
  const bodyG = c.createGain();
  bodyG.gain.setValueAtTime(0.0001, t0);
  bodyG.gain.exponentialRampToValueAtTime(0.13 * vol, t0 + 0.002);
  bodyG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  body.connect(bodyG);
  bodyG.connect(c.destination);
  body.start(t0);
  body.stop(t0 + 0.1);

  // Clear pitched ring
  const ring = c.createOscillator();
  ring.type = "sine";
  ring.frequency.setValueAtTime(1760, t0);
  ring.frequency.exponentialRampToValueAtTime(1100, t0 + 0.08);
  const ringG = c.createGain();
  ringG.gain.setValueAtTime(0.0001, t0);
  ringG.gain.exponentialRampToValueAtTime(0.08 * vol, t0 + 0.003);
  ringG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
  ring.connect(ringG);
  ringG.connect(c.destination);
  ring.start(t0);
  ring.stop(t0 + 0.12);

  // Transient click
  const tick = c.createBufferSource();
  tick.buffer = whiteNoiseBake || noiseBuffer(c, 0.03);
  const tickBp = c.createBiquadFilter();
  tickBp.type = "bandpass";
  tickBp.frequency.value = 2200;
  tickBp.Q.value = 1.6;
  const tickG = envGain(c, t0, 0.045 * vol, 0.0004, 0.003, 0.02);
  tick.connect(tickBp);
  tickBp.connect(tickG);
  tickG.connect(c.destination);
  tick.start(t0);
  tick.stop(t0 + 0.03);
}

function synthPowerSwitch(c, when, vol = 1) {
  const t0 = when;
  bakeBuffers(c);

  const snap = c.createOscillator();
  snap.type = "square";
  snap.frequency.setValueAtTime(980, t0);
  snap.frequency.exponentialRampToValueAtTime(220, t0 + 0.025);
  const snapBp = c.createBiquadFilter();
  snapBp.type = "bandpass";
  snapBp.frequency.value = 1100;
  snapBp.Q.value = 1.4;
  const snapG = envGain(c, t0, 0.05 * vol, 0.0006, 0.004, 0.028);
  snap.connect(snapBp);
  snapBp.connect(snapG);
  snapG.connect(c.destination);
  snap.start(t0);
  snap.stop(t0 + 0.04);

  const thunk = c.createBufferSource();
  thunk.buffer = whiteNoiseBake || noiseBuffer(c, 0.05);
  const thunkLp = c.createBiquadFilter();
  thunkLp.type = "lowpass";
  thunkLp.frequency.value = 700;
  const thunkG = envGain(c, t0 + 0.004, 0.045 * vol, 0.001, 0.008, 0.03);
  thunk.connect(thunkLp);
  thunkLp.connect(thunkG);
  thunkG.connect(c.destination);
  thunk.start(t0 + 0.004);
  thunk.stop(t0 + 0.05);
}

function playNow(synth, vol, ...rest) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  unlockUiSound();
  const start = () => {
    try {
      synth(c, c.currentTime, vol, ...rest);
    } catch {
      /* ignore */
    }
  };
  if (c.state === "suspended") {
    c.resume().then(start).catch(() => {});
    // Also try immediately in case resume is sync in this browser
    start();
  } else {
    start();
  }
}

function playGapped(synth, gapMs, lastRef, setLast, vol, ...rest) {
  if (muted) return;
  const now = performance.now();
  if (now - lastRef < gapMs) return;
  setLast(now);
  playNow(synth, vol, ...rest);
}

export function playHover(vol = 1) {
  playGapped(synthBrown, HOVER_GAP_MS, lastHoverAt, (v) => {
    lastHoverAt = v;
  }, vol);
}

export function playThock(vol = 1) {
  playGapped(synthThock, CLICK_GAP_MS, lastClickAt, (v) => {
    lastClickAt = v;
  }, vol);
}

/** Overlapping pencil strokes OK — no mutual exclusion. */
export function playScribble(vol = 1, duration = 0.4) {
  playNow(synthPencil, vol, duration);
}

/**
 * Call BEFORE adding the underline hover class.
 * Sound starts immediately; ends before the CSS stroke finishes.
 */
export function playUnderlineScribble(animDurSec = 0.7) {
  const soundDur = Math.max(0.28, Math.min(0.75, animDurSec * 0.55));
  playScribble(1, soundDur);
}

export function playMoonOn(vol = 1) {
  playGapped(synthFluoPop, MOON_GAP_MS, lastMoonAt, (v) => {
    lastMoonAt = v;
  }, vol);
}

export function playMoonOff(vol = 1) {
  playGapped(synthPowerSwitch, MOON_GAP_MS, lastMoonAt, (v) => {
    lastMoonAt = v;
  }, vol);
}

export function initUiSound() {
  ensureUnlockHooks();
  if (muted || initUiSound.bound) return;
  initUiSound.bound = true;

  // Text underlines: cover.js calls playUnderlineScribble before class toggle.
  const SEL = ".door-hit, .door-link, .tri-hit, a.tile, .cover-fallback-btn";

  const interactive = (node) =>
    node instanceof Element ? node.closest(SEL) : null;

  document.addEventListener(
    "pointerover",
    (e) => {
      if (e.pointerType === "touch") return;
      const el = interactive(e.target);
      if (!el) return;
      const from = interactive(e.relatedTarget);
      if (from === el) return;
      if (el.classList.contains("tri-hit")) playHover(0.75);
    },
    true
  );

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button != null && e.button !== 0) return;
      const el = interactive(e.target);
      if (!el) return;
      if (el.classList.contains("tri-hit")) return;
      if (
        el.classList.contains("door-hit") ||
        el.classList.contains("door-link") ||
        el.hasAttribute("data-enter")
      ) {
        playThock(0.95);
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = interactive(e.target);
      if (!el) return;
      if (
        el.classList.contains("door-hit") ||
        el.classList.contains("door-link") ||
        el.hasAttribute("data-enter")
      ) {
        playThock(0.95);
      }
    },
    true
  );
}
initUiSound.bound = false;
