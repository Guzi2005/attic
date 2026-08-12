/** Portrait letterbox swallow rows — sin path flow + responsive inner rows. */
const CIRCLE_SRC = new URL("./parts/cover-void-circle.png", import.meta.url).href;
const SWALLOW_SRC = new URL("./parts/cover-void-swallow.png", import.meta.url).href;
const CIRCLE_R_SRC = new URL("./parts/cover-void-circle-r.png", import.meta.url).href;
const SWALLOW_R_SRC = new URL("./parts/cover-void-swallow-r.png", import.meta.url).href;
const SPLITS_SRC = new URL("./parts/cover-void-splits.json", import.meta.url).href;
const PATTERN_ASPECT = 1018 / 517;
const ROW_H = 517;

const DEFAULT_SPLITS = {
  totalW: 1018,
  // disc/swallow *Frac: opaque visual center in PNG (frac of W/H)
  leftRow: {
    circleW: 448,
    swallowW: 570,
    beakPad: 22,
    beakSide: "left",
    discCx: 0.5502,
    discCy: 0.6006,
    discRFracW: 0.3917,
    swallowCx: 0.4569,
    swallowCy: 0.6199,
  },
  rightRow: {
    swallowW: 588,
    circleW: 430,
    beakPad: 22,
    beakSide: "right",
    discCx: 0.4395,
    discCy: 0.3772,
    discRFracW: 0.4163,
    swallowCx: 0.5361,
    swallowCy: 0.3781,
  },
};

const DEFAULT_TUNING = {
  tileScale: 0.78,
  sinAmp: 9.5,
  sinFreq: 2.4,
  flowSpeed: 0.018,
  wavePhaseSpeed: 0.035,
  rowGapRatio: 0.1,
  artGapOverride: null,
  deformY: 0.1,
  deformX: 0.04,
  padXFactor: 0.55,
  padYFactor: 0.3,
  padXTile: 0.12,
  insetBias: 0.38,
  stagger: 0.5,
  unitSpacing: 1,
  pageMarginX: 20,
  pageMarginY: 22,
  phoneWidth: 540,
  tileMin: 40,
  voidFactorDual: 0.44,
  voidFactorSingle: 0.62,
  /** half mode: tile ≈ voidH × this so ~half a large swallow peeks */
  halfTileFactor: 1.85,
  /** Landscape w/h floor for half-row; below this (e.g. < 930×794) use full single instead */
  halfMinAspect: 930 / 794,
  squareBoostDiv: 3.8,
};

const artboard = document.getElementById("artboard");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let splits = { ...DEFAULT_SPLITS };
let tuning = { ...DEFAULT_TUNING };

let circleImg = null;
let swallowImg = null;
let circleRImg = null;
let swallowRImg = null;
let swallowWhiteImg = null;
let swallowWhiteRImg = null;
let patternLoadPromise = null;
let patternReady = false;
let phase = 0;
/** Wave drift in time (not scroll) so left/right flight both ride the sin path. */
let waveClock = 0;
let lastTs = 0;
let rafId = 0;

/**
 * One sprint then coast: v = flowSpeed + boost0·e^(-t/τ).
 * No second ease-out (that stopped then restarted =「冲两次」).
 * boost0 chosen so ≈2/3 travel by COVER_TEXT_END_MS×2.
 */
const COVER_TEXT_END_MS = 1150 + 2 * 220 + 1350; // 2940
const INTRO_SPRINT_MARK_MS = COVER_TEXT_END_MS * 2; // when ~2/3 should be reached
const INTRO_BOOST_TAU_MS = 3400; // long slide down to cruise

const intro = {
  started: false,
  done: false,
  live: false,
  offset: 0,
  startedAt: 0,
  travel: 0,
  boost0: 0,
  tau: INTRO_BOOST_TAU_MS,
};

/** Wall clock when cover `.is-ready` appears — intro shares this t=0 with text. */
let coverReadyAt = 0;
/** Moon phases on gray discs — slow cycle with crossfade; click toggles pin/hide. */
const moon = {
  want: true,
  pinned: true,
  fade: 1,
  /** ms clock for phase travel */
  clock: 0,
};

const MOON_PHASES = 10;
const MOON_FADE_MS = 420;
/** Lit disc fills the gray circle (no leftover gray ring). */
const MOON_RADIUS_SCALE = 1.02;
/**
 * Half-lifecycle of one phase (fade-in OR fade-out duration).
 * Phase N starts every MOON_HALF_MS; full life = 2× this (in then out).
 * Neighbors overlap for a soft crossfade (sum of alphas ≈ 1).
 */
const MOON_HALF_MS = 3200;
/** Only force-finish intro if it never became live (stall), not mid-flight. */
const INTRO_STALL_MS = 2000;

const smooth = {
  tile: 64,
  artGap: 8,
  curveAmp: 4,
};

const canvases = [];

function snapVoidSmooth() {
  if (smooth._targetTile != null) smooth.tile = smooth._targetTile;
  if (smooth._targetArtGap != null) smooth.artGap = smooth._targetArtGap;
  if (smooth._targetCurveAmp != null) smooth.curveAmp = smooth._targetCurveAmp;
}

/** Push page margin CSS vars (shrinks artboard, grows letterbox). */
function refreshPageMargins() {
  document.documentElement.style.setProperty(
    "--page-margin-x",
    `${Math.max(0, tuning.pageMarginX)}px`
  );
  document.documentElement.style.setProperty(
    "--page-margin-y",
    `${Math.max(0, tuning.pageMarginY)}px`
  );
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Size sprint boost so ∫v ≈ (2/3)·travel by INTRO_SPRINT_MARK_MS. */
function configureIntroBoost(travel) {
  const tau = INTRO_BOOST_TAU_MS;
  const tMark = INTRO_SPRINT_MARK_MS;
  const target = travel * (2 / 3);
  const cruisePart = tuning.flowSpeed * tMark;
  const need = Math.max(0, target - cruisePart);
  const factor = tau * (1 - Math.exp(-tMark / tau));
  intro.tau = tau;
  intro.boost0 = factor > 1e-6 ? need / factor : 0;
}

/** px/ms: cruise + decaying sprint — never stops before handing off. */
function introSpeed(elapsedMs) {
  const t = Math.max(0, elapsedMs);
  return tuning.flowSpeed + intro.boost0 * Math.exp(-t / intro.tau);
}

/** Closed-form phase for catch-up when intro starts late. */
function introPhaseAt(elapsedMs) {
  const t = Math.max(0, elapsedMs);
  return (
    tuning.flowSpeed * t + intro.boost0 * intro.tau * (1 - Math.exp(-t / intro.tau))
  );
}

function introCoverReady() {
  return Boolean(artboard?.classList.contains("is-ready"));
}

function tintWhiteSwallow(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, w, h);
  return c;
}

function introAssetsReady() {
  return Boolean(
    patternReady &&
      circleImg?.naturalWidth &&
      swallowImg?.naturalWidth &&
      circleRImg?.naturalWidth &&
      swallowRImg?.naturalWidth &&
      swallowWhiteImg &&
      swallowWhiteRImg
  );
}

/** Layout box — ignores CSS transforms so camera zoom does not counter-scale sprites. */
function layoutBox(el) {
  if (!el) return { width: 0, height: 0 };
  return {
    width: el.clientWidth || el.offsetWidth || 0,
    height: el.clientHeight || el.offsetHeight || 0,
  };
}

function introLayoutReady() {
  if (!smooth._layoutTarget) return false;
  if (smooth._layoutTarget.mode === "hidden") return false;
  if (smooth._layoutTarget.voidH < 8) return false;
  const vis = canvases.filter((c) => c.visible);
  if (!vis.length) return false;
  return vis.every((c) => {
    const r = layoutBox(c.el);
    return r.width > 16 && r.height > 4;
  });
}

function introEntryLead(baseUnitW, unitStep) {
  // Peek immediately at the rim — not multiple body-lengths offscreen
  return Math.max(baseUnitW * 0.12, unitStep * 0.1);
}

/** One shared travel for every visible row (same px speed, same finish). */
function computeIntroTravel() {
  const tile = smooth._targetTile ?? smooth.tile ?? 64;
  const curveAmp = smooth._targetCurveAmp ?? smooth.curveAmp ?? 4;
  const unitStep = tile * PATTERN_ASPECT * tuning.unitSpacing;
  const baseUnitW = tile * PATTERN_ASPECT;
  const lead = introEntryLead(baseUnitW, unitStep);
  const { padX } = flowPadding(tile, curveAmp);
  let spanW = 0;
  for (const c of canvases) {
    if (!c.visible) continue;
    const w = layoutBox(c.el).width;
    spanW = Math.max(spanW, Math.max(1, w - padX * 2));
  }
  if (spanW < 1) {
    const stage = document.getElementById("stage");
    spanW = Math.max(
      1,
      (layoutBox(stage).width || window.innerWidth) - padX * 2
    );
  }
  // Matches |swallowEnd − swallowStart| so intro speed == loop speed (flowSpeed px).
  return spanW + lead + unitStep;
}

function syncIntroOffset() {
  intro.offset = Math.max(0, (intro.travel || 0) - phase);
}

function tryStartIntro() {
  if (intro.done || intro.started) return;
  if (!introAssetsReady() || !introLayoutReady() || !introCoverReady()) return;
  intro.started = true;
  intro.live = true;
  intro.startedAt = coverReadyAt || performance.now();
  intro.travel = computeIntroTravel();
  configureIntroBoost(intro.travel);
  if (reduceMotion) {
    phase = intro.travel;
    intro.done = true;
    syncIntroOffset();
    return;
  }
  const elapsed = performance.now() - intro.startedAt;
  phase = introPhaseAt(elapsed);
  if (phase >= intro.travel) finishIntro();
  else syncIntroOffset();
}

function finishIntro() {
  // Do not snap phase — keep velocity continuous into cruise.
  intro.done = true;
  intro.live = true;
  syncIntroOffset();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`void asset failed: ${src}`));
    img.src = src;
  });
}

function mergeSplits(meta) {
  const src = meta && typeof meta === "object" ? meta : {};
  return {
    ...DEFAULT_SPLITS,
    ...src,
    leftRow: { ...DEFAULT_SPLITS.leftRow, ...(src.leftRow || {}) },
    rightRow: { ...DEFAULT_SPLITS.rightRow, ...(src.rightRow || {}) },
  };
}

async function loadPattern() {
  if (patternReady && introAssetsReady()) {
    tryStartIntro();
    return { circleImg, swallowImg, circleRImg, swallowRImg };
  }
  if (patternLoadPromise) return patternLoadPromise;

  patternLoadPromise = (async () => {
    try {
      const meta = await fetch(SPLITS_SRC)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      splits = mergeSplits(meta);

      const [c, s, cr, sr] = await Promise.all([
        loadImage(CIRCLE_SRC),
        loadImage(SWALLOW_SRC),
        loadImage(CIRCLE_R_SRC),
        loadImage(SWALLOW_R_SRC),
      ]);
      if (!c.naturalWidth || !s.naturalWidth || !cr.naturalWidth || !sr.naturalWidth) {
        throw new Error("void assets decoded empty");
      }
      circleImg = c;
      swallowImg = s;
      circleRImg = cr;
      swallowRImg = sr;
      swallowWhiteImg = tintWhiteSwallow(swallowImg);
      swallowWhiteRImg = tintWhiteSwallow(swallowRImg);
      patternReady = true;
      tryStartIntro();
      return { circleImg, swallowImg, circleRImg, swallowRImg };
    } catch (err) {
      patternLoadPromise = null;
      patternReady = false;
      console.warn("[void-flow]", err);
      throw err;
    }
  })();

  return patternLoadPromise;
}

function unitOnCanvas(anchorX, baseUnitW, layoutUnit, padX, canvasW) {
  const swallowX = padX + anchorX + baseUnitW * layoutUnit.swallowFrac;
  const half = baseUnitW * 0.65;
  return swallowX + half > -8 && swallowX - half < canvasW + 8;
}

/**
 * One continuous flock: distance `phase` (px) from rim entry.
 * reversed → enter left / fly right; else enter right / fly left.
 * White leader: intro only — once it leaves, loop is gray lattice (no head wrap / rewind).
 */
function drawFlowTrain(entry, ctx, unitArgs, reversed, spanW, unitStep, canvasW) {
  const { baseUnitW, layoutUnit, swallowLeadSrc, padX } = unitArgs;
  const dir = reversed ? 1 : -1;
  const lead = introEntryLead(baseUnitW, unitStep);
  const swallowOff = baseUnitW * layoutUnit.swallowFrac;
  const swallowStart = reversed ? -lead : spanW + lead;
  const leaderStart = swallowStart - swallowOff;
  const staggerPx =
    entry.slot === "inner" ? unitStep * tuning.stagger : 0;
  const distance = phase - staggerPx;
  const leaderWorld = leaderStart + dir * distance;

  // Greys on an infinite lattice behind the (possibly offscreen) head — no wrap,
  // so left-fly never jumps a whole period backward.
  const lo = -unitStep * 2;
  const hi = spanW + unitStep * 2;
  let iMin;
  let iMax;
  if (dir === 1) {
    iMin = Math.ceil((leaderWorld - hi) / unitStep) - 1;
    iMax = Math.floor((leaderWorld - lo) / unitStep) - 1;
  } else {
    iMin = Math.ceil((lo - leaderWorld) / unitStep) - 1;
    iMax = Math.floor((hi - leaderWorld) / unitStep) - 1;
  }
  iMin = Math.max(0, iMin);
  iMax = Math.max(iMin, iMax + 2);

  for (let i = iMin; i <= iMax; i++) {
    const anchorX = leaderWorld - (i + 1) * dir * unitStep;
    if (!unitOnCanvas(anchorX, baseUnitW, layoutUnit, padX, canvasW)) continue;
    // 0 = first gray behind the (intro) white head → 全灰/新月
    const behindHead = (leaderWorld - anchorX) / (dir * unitStep) - 1;
    drawUnit(ctx, anchorX, unitArgs, behindHead);
  }

  // White lead swallow: intro only (while still on / near canvas)
  if (
    swallowLeadSrc &&
    !intro.done &&
    unitOnCanvas(leaderWorld, baseUnitW, layoutUnit, padX, canvasW)
  ) {
    drawWhiteLeader(ctx, leaderWorld, unitArgs);
  }
}

function collectCanvases() {
  canvases.length = 0;
  for (const el of document.querySelectorAll(".void-flow-canvas")) {
    canvases.push({
      el,
      side: el.dataset.side,
      slot: el.dataset.slot,
      reversed: el.dataset.reversed === "1",
      visible: false,
    });
  }
}

function rowGapFor(tile) {
  return Math.round(tile * tuning.rowGapRatio);
}

function isPhoneWidth(refW) {
  return refW < tuning.phoneWidth;
}

function isLandscape(refW) {
  return refW / window.innerHeight >= 1.05;
}

/** Wide enough landscape for half-row peeks (watershed: 930×794). */
function canUseHalfRow(refW) {
  const aspect = refW / Math.max(1, window.innerHeight);
  return aspect >= (tuning.halfMinAspect ?? 930 / 794);
}

function computeMode(voidH, tile, refW, artGap) {
  const rowGap = rowGapFor(tile);
  const stack2 = tile * 2 + rowGap;
  const gap = Math.max(0, artGap ?? 0);

  if (voidH < 12) return "hidden";

  if (voidH >= stack2 + gap + tile * 0.85) return "inset";
  if (voidH >= stack2 + gap && isPhoneWidth(refW)) return "dual";

  // Full single row when letterbox comfortably fits the tile
  if (voidH >= tile * 1.12 + Math.min(gap, 8)) return "single";

  // Thin band: half-row only when aspect ≥ 930/794; narrower → single (scaled to void)
  if (voidH >= 18) {
    if (canUseHalfRow(refW) && (isLandscape(refW) || voidH < tile * 0.98)) {
      return "half";
    }
    return "single";
  }
  return "hidden";
}

function unitsAcrossFor(refW) {
  const aspect = refW / window.innerHeight;
  if (isPhoneWidth(refW)) return 4.8;
  if (aspect >= 0.82 && aspect <= 1.48) return 4.1;
  return 4.3;
}

function computeTile(refW, voidH, mode) {
  const aspect = refW / window.innerHeight;
  const unitsAcross = unitsAcrossFor(refW);

  let tile = (refW / (unitsAcross * PATTERN_ASPECT)) * tuning.tileScale;

  if (aspect >= 0.82 && aspect <= 1.48 && voidH >= 56 && mode !== "half") {
    tile = Math.max(
      tile,
      (refW / (tuning.squareBoostDiv * PATTERN_ASPECT)) * tuning.tileScale
    );
  }

  if (voidH > 0) {
    if (mode === "dual" || mode === "inset") {
      tile = Math.min(tile, voidH * tuning.voidFactorDual);
    } else if (mode === "half") {
      // Larger than letterbox so about half the body peeks — size feels right in landscape
      const target = voidH * (tuning.halfTileFactor ?? 1.85);
      tile = Math.max(tile, voidH * 1.45);
      tile = Math.min(Math.max(tile, target * 0.85), target);
    } else if (mode === "single") {
      tile = Math.min(tile, voidH * 0.9);
    } else {
      // Probe pass: keep width-driven size so mode can choose half vs single
      if (canUseHalfRow(refW) && isLandscape(refW)) {
        tile = Math.min(tile, Math.max(voidH * 2.05, 64));
      } else {
        tile = Math.min(tile, Math.max(voidH * 0.95, voidH * 1.6));
      }
    }
  }

  const floor =
    mode === "half"
      ? Math.max(28, Math.floor(voidH * 1.2))
      : voidH > 0 && voidH < tuning.tileMin + 12
        ? Math.max(12, Math.floor(voidH * 0.86))
        : tuning.tileMin;

  return Math.round(Math.max(floor, tile));
}

function rowVisible(mode, slot) {
  if (mode === "hidden") return false;
  if (mode === "half") return slot === "edge";
  if (mode === "single") return slot === "art";
  if (mode === "dual") return slot === "art" || slot === "inner";
  if (mode === "inset") return slot === "art" || slot === "inner";
  return false;
}

function insetOffset(voidH, tile) {
  const blockH = tile * 2 + rowGapFor(tile);
  const free = Math.max(0, voidH - blockH);
  return Math.round(free * tuning.insetBias);
}

function flowPadding(tile, curveAmp) {
  const unitW = tile * PATTERN_ASPECT;
  return {
    padX: Math.round(unitW * tuning.padXFactor + tile * tuning.padXTile),
    padY: Math.round(tile * tuning.padYFactor + curveAmp + 4),
  };
}

function isPillarAspect(refW = window.innerWidth) {
  // Matches cover.css near-square posts: 41/50 … 1/1
  const aspect = refW / Math.max(1, window.innerHeight);
  return aspect >= 41 / 50 && aspect <= 1;
}

function unitLayout(reversed) {
  const total = splits.totalW || DEFAULT_SPLITS.totalW;
  const row = reversed ? splits.rightRow : splits.leftRow;
  const def = reversed ? DEFAULT_SPLITS.rightRow : DEFAULT_SPLITS.leftRow;
  const swallowW = row.swallowW;
  const circleW = row.circleW;
  const beakPad = row.beakPad || 0;
  const disc = {
    discCx: row.discCx ?? def.discCx ?? 0.5,
    discCy: row.discCy ?? def.discCy ?? 0.5,
    discRFracW: row.discRFracW ?? def.discRFracW ?? 0.38,
    swallowCx: row.swallowCx ?? def.swallowCx ?? 0.5,
    swallowCy: row.swallowCy ?? def.swallowCy ?? 0.5,
  };
  if (reversed) {
    return {
      circleW,
      swallowW,
      beakPad,
      beakSide: "right",
      ...disc,
      circleFrac: (swallowW + circleW / 2) / total,
      swallowFrac: swallowW / 2 / total,
    };
  }
  return {
    circleW,
    swallowW,
    beakPad,
    beakSide: "left",
    ...disc,
    circleFrac: circleW / 2 / total,
    swallowFrac: (circleW + swallowW / 2) / total,
  };
}

function moonPhaseForUnit(unitId) {
  const id = Math.floor(unitId);
  return ((id % MOON_PHASES) + MOON_PHASES) % MOON_PHASES;
}

/**
 * Phase 9 = new / all-gray. `behindHead` = 0 for first gray behind white lead.
 */
const MOON_ENTRY_PHASE = 9;

/** Continuous slot: clock + offset behind flock head. */
function moonSlotForUnit(behindHead) {
  if (reduceMotion) {
    return moonPhaseForUnit(MOON_ENTRY_PHASE + behindHead);
  }
  return moon.clock / MOON_HALF_MS + MOON_ENTRY_PHASE + behindHead;
}

/**
 * Draw current+next phase with crossfade.
 * In each half-step: previous fades out (1→0), next fades in (0→1).
 */
function drawMoonCrossfade(ctx, r, slot, masterAlpha) {
  if (masterAlpha < 0.01) return;
  const i0 = Math.floor(slot);
  const f = slot - i0;
  const phaseA = ((i0 % MOON_PHASES) + MOON_PHASES) % MOON_PHASES;
  const phaseB = (phaseA + 1) % MOON_PHASES;
  const aOut = (1 - f) * masterAlpha;
  const aIn = f * masterAlpha;
  // Dimmer under brighter so glow reads cleanly
  if (aOut >= aIn) {
    drawMoonPhase(ctx, r, phaseA, aOut);
    drawMoonPhase(ctx, r, phaseB, aIn);
  } else {
    drawMoonPhase(ctx, r, phaseB, aIn);
    drawMoonPhase(ctx, r, phaseA, aOut);
  }
}

function applyDomLayout(target) {
  const top = document.querySelector(".stage-void-top");
  const bot = document.querySelector(".stage-void-bot");
  if (!top || !bot) return;

  top.style.height = `${target.voidH}px`;
  bot.style.height = `${target.voidH}px`;

  for (const el of [top, bot]) {
    el.classList.toggle("is-hidden", target.mode === "hidden");
    el.classList.toggle("is-half", target.mode === "half");
    el.classList.toggle("is-dual", target.mode === "dual");
    el.classList.toggle("is-inset", target.mode === "inset");
  }

  const tile = smooth._targetTile ?? smooth.tile;
  const curveAmp = smooth._targetCurveAmp ?? smooth.curveAmp;
  document.documentElement.style.setProperty("--void-tile", `${Math.round(tile)}px`);
  document.documentElement.style.setProperty("--void-art-gap", `${Math.round(smooth.artGap)}px`);
  document.documentElement.style.setProperty("--void-row-gap", `${rowGapFor(tile)}px`);
  const { padX, padY } = flowPadding(tile, curveAmp);
  document.documentElement.style.setProperty("--void-pad-x", `${padX}px`);
  document.documentElement.style.setProperty("--void-pad-y", `${padY}px`);
  document.documentElement.style.setProperty(
    "--void-inset-top",
    `${insetOffset(target.voidH, tile)}px`
  );

  for (const c of canvases) {
    const show = rowVisible(target.mode, c.slot);
    c.visible = show;
    c.el.closest(".void-row")?.classList.toggle("is-active", show);
  }

  // Force reflow so the same frame's canvas measure sees new heights/classes.
  void top.offsetHeight;
}

function sinPoint(x, w, h, amp, wavePhase, flyRight = true) {
  const y0 = h * 0.5;
  const k = (Math.PI * 2 * tuning.sinFreq) / w;
  // Sample along flight axis (+x right, −x left) so both directions undulate
  // on the same waveClock — no φ flip (that desynced same-group rows).
  const u = flyRight ? x : -x;
  const s = Math.sin(k * u + wavePhase);
  const c = Math.cos(k * u + wavePhase);
  // dy/dx in canvas space (chain rule through u)
  const dyDx = (flyRight ? 1 : -1) * amp * k * c;
  return { y: y0 + amp * s, dy: dyDx, s };
}

/**
 * Bank along path (canvas y-down). Left-facing art already points −x —
 * use the same atan2(dy, 1) as right so pitch follows the wave (not inverted).
 */
function swallowBankAngle(dyDx, _flyRight) {
  return Math.atan2(dyDx, 1);
}

function drawUnit(ctx, anchorX, args, unitIndex = 0) {
  const {
    padX,
    padY,
    spanW,
    pathH,
    amp,
    wavePhase,
    baseUnitW,
    layoutUnit,
    circleDrawW,
    swallowDrawW,
    swallowDrawOx = 0,
    tile,
    circleSrc,
    swallowSrc,
    flyRight = false,
  } = args;
  const circlePath = sinPoint(
    anchorX + baseUnitW * layoutUnit.circleFrac,
    spanW,
    pathH,
    amp,
    wavePhase,
    flyRight
  );
  const swallowPath = sinPoint(
    anchorX + baseUnitW * layoutUnit.swallowFrac,
    spanW,
    pathH,
    amp,
    wavePhase,
    flyRight
  );
  const circleX = padX + anchorX + baseUnitW * layoutUnit.circleFrac;
  const swallowX = padX + anchorX + baseUnitW * layoutUnit.swallowFrac;
  const angle = swallowBankAngle(swallowPath.dy, flyRight);
  const deformY = 1 + tuning.deformY * swallowPath.s;
  const deformX = 1 + tuning.deformX * Math.abs(swallowPath.s);

  ctx.save();
  ctx.translate(circleX, padY + circlePath.y);
  // Align opaque disc center to path (assets are not centered in their PNGs)
  const cOx = (0.5 - layoutUnit.discCx) * circleDrawW;
  const cOy = (0.5 - layoutUnit.discCy) * tile;
  ctx.drawImage(
    circleSrc,
    -circleDrawW * 0.5 + cOx,
    -tile * 0.5 + cOy,
    circleDrawW,
    tile
  );
  if (moon.fade > 0.01) {
    const moonR = circleDrawW * layoutUnit.discRFracW * MOON_RADIUS_SCALE;
    drawMoonCrossfade(ctx, moonR, moonSlotForUnit(unitIndex), moon.fade);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(swallowX, padY + swallowPath.y);
  ctx.rotate(angle);
  ctx.scale(deformX, deformY);
  const sOx = (0.5 - layoutUnit.swallowCx) * swallowDrawW + swallowDrawOx;
  const sOy = (0.5 - layoutUnit.swallowCy) * tile;
  ctx.drawImage(
    swallowSrc,
    -swallowDrawW * 0.5 + sOx,
    -tile * 0.5 + sOy,
    swallowDrawW,
    tile
  );
  ctx.restore();
}

/**
 * 10-step cycle: 4 right-lit + full white + 4 left-lit + new (all gray).
 * Lit shape = circle ∩ side of a cubic terminator curve.
 */
function drawMoonPhase(ctx, r, phaseIdx, alpha) {
  if (alpha < 0.01 || phaseIdx === 9) return;

  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.shadowColor = "rgba(255, 255, 255, 0.95)";
  ctx.shadowBlur = Math.max(10, r * 0.95);
  ctx.fillStyle = "#ffffff";

  const rr = r;

  if (phaseIdx === 4) {
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const waxing = phaseIdx < 4;
  const step = waxing ? phaseIdx : 8 - phaseIdx; // 0..3
  const amount = (step + 1) / 5; // 0.2 .. 0.8
  // Terminator x: thin crescent near bright rim → gibbous past center
  const termX = (waxing ? 1 : -1) * rr * (1 - 2 * amount);

  ctx.beginPath();
  ctx.arc(0, 0, rr, 0, Math.PI * 2);
  ctx.clip();

  ctx.beginPath();
  if (waxing) {
    // Lit on the right of the curve
    ctx.moveTo(0, -rr);
    ctx.arc(0, 0, rr, -Math.PI / 2, Math.PI / 2, false);
    ctx.bezierCurveTo(termX, rr * 0.55, termX, -rr * 0.55, 0, -rr);
  } else {
    // Lit on the left of the curve
    ctx.moveTo(0, rr);
    ctx.arc(0, 0, rr, Math.PI / 2, -Math.PI / 2, false);
    ctx.bezierCurveTo(termX, -rr * 0.55, termX, rr * 0.55, 0, rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function bindMoonInteraction() {
  const voids = document.querySelectorAll(".stage-void");
  if (!voids.length) return;

  const setWant = (on) => {
    moon.want = on || moon.pinned;
  };

  for (const el of voids) {
    el.style.pointerEvents = "auto";
    el.addEventListener("pointerenter", () => setWant(true));
    el.addEventListener("pointerleave", () => {
      if (!moon.pinned) setWant(false);
    });
    el.addEventListener("click", (e) => {
      e.preventDefault();
      moon.pinned = !moon.pinned;
      setWant(moon.pinned);
      document.querySelectorAll(".stage-void").forEach((v) => {
        v.classList.toggle("is-moon-pinned", moon.pinned);
      });
    });
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", "显示或隐藏月相");
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        moon.pinned = !moon.pinned;
        setWant(moon.pinned);
        document.querySelectorAll(".stage-void").forEach((v) => {
          v.classList.toggle("is-moon-pinned", moon.pinned);
        });
      }
    });
    el.classList.toggle("is-moon-pinned", moon.pinned);
  }
}

function drawWhiteLeader(ctx, anchorX, args) {
  const {
    padX,
    padY,
    spanW,
    pathH,
    amp,
    wavePhase,
    baseUnitW,
    layoutUnit,
    swallowDrawW,
    swallowDrawOx = 0,
    tile,
    swallowLeadSrc,
    flyRight = false,
  } = args;
  const swallowPath = sinPoint(
    anchorX + baseUnitW * layoutUnit.swallowFrac,
    spanW,
    pathH,
    amp,
    wavePhase,
    flyRight
  );
  const swallowX = padX + anchorX + baseUnitW * layoutUnit.swallowFrac;
  const angle = swallowBankAngle(swallowPath.dy, flyRight);
  const deformY = 1 + tuning.deformY * swallowPath.s;
  const deformX = 1 + tuning.deformX * Math.abs(swallowPath.s);

  ctx.save();
  ctx.translate(swallowX, padY + swallowPath.y);
  ctx.rotate(angle);
  ctx.scale(deformX, deformY);
  const sOx = (0.5 - layoutUnit.swallowCx) * swallowDrawW + swallowDrawOx;
  const sOy = (0.5 - layoutUnit.swallowCy) * tile;
  ctx.drawImage(
    swallowLeadSrc,
    -swallowDrawW * 0.5 + sOx,
    -tile * 0.5 + sOy,
    swallowDrawW,
    tile
  );
  ctx.restore();
}

function drawCanvas(entry, layout) {
  const { el, reversed, visible } = entry;
  if (!visible || !patternReady || !circleImg?.naturalWidth) return;
  if (!intro.started && !intro.done) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { padX, padY } = flowPadding(layout.tile, layout.curveAmp);
  // Use layout size, not getBoundingClientRect — camera scale would inflate the
  // bitmap and cancel the zoom so swallows look fixed on screen.
  const rect = layoutBox(el);
  // Mode/class changes can run before reflow — don't skip a whole side for one frame.
  let w = rect.width;
  let h = rect.height;
  if (w < 16 || h < 4) {
    const voidH = smooth._layoutTarget?.voidH ?? layout.tile;
    const mode = smooth._targetMode;
    const rowH = mode === "half" ? Math.max(4, voidH) : layout.tile;
    const parentW =
      layoutBox(el.parentElement).width ||
      layoutBox(document.getElementById("stage")).width ||
      window.innerWidth;
    if (w < 16) w = Math.max(16, parentW + 2 * padX);
    if (h < 4) h = Math.max(4, rowH + 2 * padY);
  }
  w = Math.max(1, w);
  h = Math.max(1, h);

  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (el.width !== pw || el.height !== ph) {
    el.width = pw;
    el.height = ph;
  }

  const ctx = el.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const tile = layout.tile;
  const baseUnitW = tile * PATTERN_ASPECT;
  // Pillar gaps read better with a touch more unit pitch
  const unitStep = baseUnitW * tuning.unitSpacing;
  const total = splits.totalW || DEFAULT_SPLITS.totalW;
  const layoutUnit = unitLayout(reversed);
  const circleDrawW = baseUnitW * (layoutUnit.circleW / total);
  const beakPad = layoutUnit.beakPad || 0;
  const swallowDrawW = baseUnitW * ((layoutUnit.swallowW + beakPad) / total);
  const swallowPadDraw = baseUnitW * (beakPad / total);
  const swallowDrawOx =
    layoutUnit.beakSide === "left" ? swallowPadDraw * 0.5 : -swallowPadDraw * 0.5;
  const pathH = Math.max(8, h - padY * 2);
  const ampSign = entry.side === "top" ? -1 : 1;
  // Shared clock for the group; L/R only differ in wave height (amp).
  // Undulation uses flight-axis sampling in sinPoint — not φ flip.
  const amp = Math.min(tuning.sinAmp, tile * 0.22) * ampSign * (reversed ? 1 : 0.78);
  const wavePhase = waveClock;
  const spanW = Math.max(1, w - padX * 2);

  const circleSrc = reversed ? circleRImg : circleImg;
  const swallowSrc = reversed ? swallowRImg : swallowImg;
  const swallowLeadSrc = reversed ? swallowWhiteRImg : swallowWhiteImg;
  const unitArgs = {
    padX,
    padY,
    spanW,
    pathH,
    amp,
    wavePhase,
    baseUnitW,
    layoutUnit,
    circleDrawW,
    swallowDrawW,
    swallowDrawOx,
    tile,
    circleSrc,
    swallowSrc,
    swallowLeadSrc,
    flyRight: reversed,
  };

  drawFlowTrain(entry, ctx, unitArgs, reversed, spanW, unitStep, w);
}

function tick(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(48, ts - lastTs);
  lastTs = ts;

  const t = Math.min(1, dt * 0.09);
  smooth.tile = lerp(smooth.tile, smooth._targetTile ?? smooth.tile, t);
  smooth.artGap = lerp(smooth.artGap, smooth._targetArtGap ?? smooth.artGap, t);
  smooth.curveAmp = lerp(smooth.curveAmp, smooth._targetCurveAmp ?? smooth.curveAmp, t);

  if (smooth._targetMode) applyDomLayout(smooth._layoutTarget);
  if (!coverReadyAt && introCoverReady()) {
    const stamped = Number(artboard?.dataset?.readyAt);
    coverReadyAt = Number.isFinite(stamped) && stamped > 0 ? stamped : performance.now();
  }
  tryStartIntro();

  if (!reduceMotion) {
    if (intro.started) {
      // Stall only: never became live. Do not cut a healthy intro short.
      if (!intro.done && !intro.live && performance.now() - intro.startedAt > INTRO_STALL_MS) {
        finishIntro();
      } else if (intro.live) {
        // One sprint → exponential coast to flowSpeed (same integrator before/after done).
        intro.travel = computeIntroTravel();
        const elapsed = performance.now() - intro.startedAt;
        const v = introSpeed(elapsed);
        phase += dt * v;
        waveClock += dt * tuning.flowSpeed * tuning.wavePhaseSpeed;
        if (!intro.done && phase >= intro.travel) finishIntro();
        else if (!intro.done) syncIntroOffset();
      }
    }
  } else if (!intro.done && intro.started) {
    finishIntro();
  }

  const moonTarget = moon.want || moon.pinned ? 1 : 0;
  if (moon.fade !== moonTarget) {
    const step = dt / MOON_FADE_MS;
    if (moon.fade < moonTarget) moon.fade = Math.min(moonTarget, moon.fade + step);
    else moon.fade = Math.max(moonTarget, moon.fade - step);
  }
  // Advance phase clock only while moons are (or are becoming) visible
  if (!reduceMotion && moon.fade > 0.01) {
    moon.clock += dt;
  }

  const layout = {
    tile: smooth._targetTile ?? smooth.tile,
    curveAmp: smooth._targetCurveAmp ?? smooth.curveAmp,
  };
  for (const c of canvases) drawCanvas(c, layout);
  rafId = requestAnimationFrame(tick);
}

function ensureLoop() {
  if (rafId) return;
  rafId = requestAnimationFrame(tick);
}

export function layoutVoidPatterns() {
  const stage = document.getElementById("stage");
  if (!stage || !artboard) return;
  if (!canvases.length) collectCanvases();

  const sr = layoutBox(stage);
  const ar = layoutBox(artboard);
  const voidH = Math.max(0, (sr.height - ar.height) / 2);
  const refW = Math.min(sr.width || window.innerWidth, window.innerWidth);

  let tile = computeTile(refW, voidH, null);
  let artGap =
    tuning.artGapOverride != null
      ? tuning.artGapOverride
      : Math.round(Math.min(14, Math.max(2, voidH * 0.06)));
  // Pillar style: keep swallow rows farther from hand-drawn frame rails
  if (isPillarAspect(refW) && tuning.artGapOverride == null) {
    artGap = Math.round(
      Math.min(voidH * 0.32, Math.max(artGap + 12, voidH * 0.16))
    );
  }
  let mode = computeMode(voidH, tile, refW, artGap);
  tile = computeTile(refW, voidH, mode);
  mode = computeMode(voidH, tile, refW, artGap);

  // Clamp artGap so a single row still fits inside thin letterbox
  let gap = artGap;
  if (mode === "single" && voidH > 0 && tile + gap > voidH) {
    gap = Math.max(0, voidH - tile);
  }
  if (mode === "half") {
    gap = Math.min(gap, 2);
  }

  const curveAmp = Math.min(
    12,
    Math.max(2, Math.min(tuning.sinAmp, tile * 0.18))
  );

  smooth._targetTile = tile;
  smooth._targetArtGap = gap;
  smooth._targetMode = mode;
  smooth._targetCurveAmp = curveAmp;
  smooth._layoutTarget = { voidH, mode };

  applyDomLayout(smooth._layoutTarget);
  snapVoidSmooth();
  tryStartIntro();
  loadPattern()
    .catch(() => {})
    .finally(() => ensureLoop());
}

export function prefetchVoidAssets() {
  return loadPattern()
    .then(() => {
      tryStartIntro();
      ensureLoop();
    })
    .catch(() => ensureLoop());
}

export function initVoidFlow() {
  collectCanvases();
  refreshPageMargins();
  bindMoonInteraction();
  layoutVoidPatterns();
  loadPattern()
    .catch(() => {})
    .finally(() => ensureLoop());
}
