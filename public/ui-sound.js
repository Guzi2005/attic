/**
 * UI ticks inspired by famous mech switch profiles (synthesized, no samples).
 * - hover  → MX Brown tactile tick (soft, short)
 * - click  → MX Blue click-bar (bright click + plastic clack)
 * - thock  → deep linear “ink / cream” body for door enter
 */

const muted =
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** @type {AudioContext | null} */
let ctx = null;
let unlocked = false;
let lastHoverAt = 0;
let lastClickAt = 0;

const HOVER_GAP_MS = 55;
const CLICK_GAP_MS = 70;

function ac() {
  if (muted) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

export function unlockUiSound() {
  const c = ac();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  unlocked = true;
}

function ensureUnlockHooks() {
  if (muted || ensureUnlockHooks.bound) return;
  ensureUnlockHooks.bound = true;
  const kick = () => unlockUiSound();
  window.addEventListener("pointerdown", kick, { once: true, capture: true });
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

function envGain(c, t0, peak, attack, hold, release) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  return g;
}

/** Soft tactile tick — Cherry MX Brown family */
function synthBrown(c, when, vol = 1) {
  const t0 = when;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.04);

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

  // muted stem body
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

/** Clicky — Cherry MX Blue / Box Jade click-bar + housing clack */
function synthBlue(c, when, vol = 1) {
  const t0 = when;

  // click bar snap
  const bar = c.createOscillator();
  bar.type = "square";
  bar.frequency.setValueAtTime(4200, t0);
  bar.frequency.exponentialRampToValueAtTime(2100, t0 + 0.012);
  const barG = envGain(c, t0, 0.055 * vol, 0.0005, 0.002, 0.014);
  const barBp = c.createBiquadFilter();
  barBp.type = "bandpass";
  barBp.frequency.value = 3800;
  barBp.Q.value = 2.2;
  bar.connect(barBp);
  barBp.connect(barG);
  barG.connect(c.destination);
  bar.start(t0);
  bar.stop(t0 + 0.02);

  // plastic clack (housing)
  const clack = c.createBufferSource();
  clack.buffer = noiseBuffer(c, 0.06);
  const lp = c.createBiquadFilter();
  lp.type = "bandpass";
  lp.frequency.value = 1150;
  lp.Q.value = 0.9;
  const cg = envGain(c, t0 + 0.004, 0.07 * vol, 0.001, 0.008, 0.035);
  clack.connect(lp);
  lp.connect(cg);
  cg.connect(c.destination);
  clack.start(t0 + 0.004);
  clack.stop(t0 + 0.06);

  // short bottom-out thud
  const thud = c.createOscillator();
  thud.type = "sine";
  thud.frequency.setValueAtTime(220, t0 + 0.006);
  thud.frequency.exponentialRampToValueAtTime(90, t0 + 0.05);
  const tg = envGain(c, t0 + 0.006, 0.03 * vol, 0.002, 0.01, 0.04);
  thud.connect(tg);
  tg.connect(c.destination);
  thud.start(t0 + 0.006);
  thud.stop(t0 + 0.06);
}

/** Deep thock — Ink Black / creamy linear bottom-out (door enter) */
function synthThock(c, when, vol = 1) {
  const t0 = when;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.1);
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

function play(synth, gapMs, lastRef, setLast, vol) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  unlockUiSound();
  const now = performance.now();
  if (now - lastRef < gapMs) return;
  setLast(now);
  const t = c.currentTime + 0.002;
  try {
    synth(c, t, vol);
  } catch {
    /* ignore autoplay / closed context */
  }
}

export function playHover(vol = 1) {
  play(synthBrown, HOVER_GAP_MS, lastHoverAt, (v) => {
    lastHoverAt = v;
  }, vol);
}

export function playClick(vol = 1) {
  play(synthBlue, CLICK_GAP_MS, lastClickAt, (v) => {
    lastClickAt = v;
  }, vol);
}

export function playThock(vol = 1) {
  play(synthThock, CLICK_GAP_MS, lastClickAt, (v) => {
    lastClickAt = v;
  }, vol);
}

/**
 * Delegate hover/click SFX onto interactive cover + home targets.
 * pointerover (bubbles) so dynamically created hits still work.
 */
export function initUiSound() {
  ensureUnlockHooks();
  if (muted || initUiSound.bound) return;
  initUiSound.bound = true;

  const SEL =
    ".door-hit, .door-link, .text-hit, .tri-hit, .stage-void, a.tile, .cover-fallback-btn";

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
      // Softer on dense illustration shards
      playHover(el.classList.contains("tri-hit") ? 0.7 : 1);
    },
    true
  );

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button != null && e.button !== 0) return;
      const el = interactive(e.target);
      if (!el) return;
      if (el.classList.contains("door-hit") || el.classList.contains("door-link") || el.hasAttribute("data-enter")) {
        playThock(0.95);
        playClick(0.55);
        return;
      }
      playClick(el.classList.contains("tri-hit") ? 0.75 : 1);
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
        playClick(0.55);
        return;
      }
      playClick();
    },
    true
  );
}
initUiSound.bound = false;
