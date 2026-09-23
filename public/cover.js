import { initVoidFlow, layoutVoidPatterns, prefetchVoidAssets } from "./void-flow.js?v=20260921-editor";
import { initUiSound, playUnderlineScribble } from "./ui-sound.js";
import { initPortfolio } from "./portfolio.js?v=20260921-editor";

/** Block mobile pinch-zoom (iOS Safari ignores viewport user-scalable). */
function lockPinchZoom() {
  const block = (e) => e.preventDefault();
  document.addEventListener("gesturestart", block, { passive: false });
  document.addEventListener("gesturechange", block, { passive: false });
  document.addEventListener("gestureend", block, { passive: false });
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );
}
lockPinchZoom();

/**
 * Procedural paper grain — same idea as Leeroy MTL's postprocess grain
 * (random2d pixels), but as a CSS overlay tile instead of a WebGL pass.
 */
function initPaperGrain() {
  const el = document.getElementById("paper-grain");
  if (!el) return;
  if (window.matchMedia("(prefers-reduced-transparency: reduce)").matches) {
    el.remove();
    return;
  }

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  el.style.backgroundImage = `url("${canvas.toDataURL("image/png")}")`;
}
initPaperGrain();

/* —— Splash loader (bloom + embroidered text progress) —— */
const splashEl = document.getElementById("splash");
const splashWelcome = document.getElementById("splash-welcome");
const splashReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Keep in sync with splash.css:
 * last large = 7*48 + 36 + 420 = 792ms
 * smalls together after +72ms gap, dur 360ms → end = 792+72+360 = 1224ms
 * core starts at 8ms
 */
const SPLASH_BLOOM_START_MS = 8;
const SPLASH_BLOOM_END_MS = 1224;
const SPLASH_MIN_MS = splashReduceMotion ? 160 : SPLASH_BLOOM_END_MS + 80;

let splashBloomAt = 0;
let splashShownP = 0;
let splashProgressRaf = 0;
let splashAssetsReady = false;
/** @type {((v: number) => void) | null} */
let splashProgressWaiter = null;

function paintSplashProgress(v) {
  splashShownP = v;
  if (!splashWelcome) return;
  const done = v >= 0.995;
  // Snap to 1 so trailing glyph (C) is fully covered once embroidery completes
  splashWelcome.style.setProperty("--splash-p", String(done ? 1 : v));
  splashWelcome.classList.toggle("is-complete", done);
}

function bloomProgressAt(elapsedMs) {
  if (splashReduceMotion) return 1;
  const span = SPLASH_BLOOM_END_MS - SPLASH_BLOOM_START_MS;
  return Math.max(0, Math.min(1, (elapsedMs - SPLASH_BLOOM_START_MS) / span));
}

function tickBloomProgress() {
  splashProgressRaf = 0;
  const elapsed = performance.now() - splashBloomAt;
  const p = bloomProgressAt(elapsed);
  paintSplashProgress(p);

  if (splashProgressWaiter && p >= 1) {
    const resolve = splashProgressWaiter;
    splashProgressWaiter = null;
    resolve(p);
  }

  if (p < 1) {
    splashProgressRaf = requestAnimationFrame(tickBloomProgress);
  }
}

/** Load events only gate dismiss — visual fill follows the flower clock. */
function setSplashProgress(_p) {
  /* kept for call sites; embroidery is bloom-timed */
}

function waitSplashBloomComplete() {
  if (splashShownP >= 0.999) return Promise.resolve(splashShownP);
  return new Promise((resolve) => {
    splashProgressWaiter = resolve;
    if (!splashProgressRaf) {
      splashProgressRaf = requestAnimationFrame(tickBloomProgress);
    }
  });
}

function startSplashBloom() {
  if (!splashEl) return;
  requestAnimationFrame(() => {
    splashBloomAt = performance.now();
    splashEl.classList.add("is-bloom");
    paintSplashProgress(0);
    if (splashReduceMotion) {
      paintSplashProgress(1);
      return;
    }
    splashProgressRaf = requestAnimationFrame(tickBloomProgress);
  });
}

/** @returns {Promise<void>} */
async function dismissSplash() {
  if (!splashEl || splashEl.classList.contains("is-done")) {
    document.body.classList.remove("is-splash");
    return;
  }

  const waitMin = Math.max(0, SPLASH_MIN_MS - (performance.now() - splashBloomAt));
  await Promise.all([
    waitSplashBloomComplete(),
    new Promise((r) => window.setTimeout(r, waitMin)),
    new Promise((resolve) => {
      if (splashAssetsReady) {
        resolve();
        return;
      }
      const id = window.setInterval(() => {
        if (splashAssetsReady) {
          window.clearInterval(id);
          resolve();
        }
      }, 40);
    }),
  ]);

  // Cover must already be painted under splash — no flash after dissolve
  if (artboard && !artboard.classList.contains("is-ready")) {
    artboard.dataset.readyAt = String(performance.now());
    artboard.classList.add("is-ready");
  }
  await waitCoverPainted();

  await new Promise((r) => window.setTimeout(r, splashReduceMotion ? 40 : 120));
  await dissolveSplashMosaic();

  // Hide splash hard BEFORE any cleanup — removing mask/canvas must not flash loading
  splashEl.style.transition = "none";
  splashEl.style.opacity = "0";
  splashEl.style.visibility = "hidden";
  splashEl.classList.add("is-done");
  document.body.classList.remove("is-splash", "is-on-home");
  const home = document.getElementById("home");
  home?.classList.remove("is-visible", "is-enter-zoom", "is-floor-zoom", "is-bento-hold");
  home?.setAttribute("aria-hidden", "true");
  splashEl.style.removeProperty("--splash-mask");
  splashEl.classList.remove("is-mosaic");
  document.querySelector(".splash-mosaic-fx")?.remove();
}

/** Decode cover images + wait two frames so first paint is under splash. */
function waitCoverPainted() {
  if (!artboard) return Promise.resolve();
  const imgs = [...artboard.querySelectorAll("img")].filter((img) => img.getAttribute("src"));
  return Promise.all(
    imgs.map((img) => {
      if (typeof img.decode === "function") {
        return img.decode().catch(() => undefined);
      }
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    })
  ).then(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })
  );
}

/**
 * Mosaic dissolve — splash DOM stays as-is until each cell is reached.
 * - Mask punches splash cells when wave arrives (cover shows through)
 * - Overlay draws morph ONLY for active cells
 * - Flower morph: white / gray only; text: white stroke pixels; cloth: splash bg
 * - Never recolor the intact splash (no global quantize / no fake banners)
 */
function dissolveSplashMosaic() {
  if (!splashEl) return Promise.resolve();
  if (splashReduceMotion) return Promise.resolve();

  const BAYER8 = [
    [0, 48, 12, 60, 3, 51, 15, 63],
    [32, 16, 44, 28, 35, 19, 47, 31],
    [8, 56, 4, 52, 11, 59, 7, 55],
    [40, 24, 36, 20, 43, 27, 39, 23],
    [2, 50, 14, 62, 1, 49, 13, 61],
    [34, 18, 46, 30, 33, 17, 45, 29],
    [10, 58, 6, 54, 9, 57, 5, 53],
    [42, 26, 38, 22, 41, 25, 37, 21],
  ];

  const COL_WHITE = "#ffffff";
  const COL_GRAY = "#c4c7d4";

  const flowerEl = splashEl.querySelector(".splash-flower");
  const flowerW = flowerEl?.getBoundingClientRect().width || 72;
  const cell = Math.max(2, Math.round(flowerW / 42));
  const cols = Math.ceil(window.innerWidth / cell);
  const rows = Math.ceil(window.innerHeight / cell);
  const bg = getComputedStyle(splashEl).backgroundColor || "#3a3e50";

  const mask = document.createElement("canvas");
  // Full-res mask so splash text/font stay crisp (no low-res upscale)
  mask.width = window.innerWidth;
  mask.height = window.innerHeight;
  const mctx = mask.getContext("2d", { willReadFrequently: true });
  if (!mctx) return Promise.resolve();
  mctx.imageSmoothingEnabled = false;

  const fx = document.createElement("canvas");
  fx.className = "splash-mosaic-fx";
  fx.width = window.innerWidth;
  fx.height = window.innerHeight;
  fx.style.imageRendering = "pixelated";
  const fctx = fx.getContext("2d");
  if (!fctx) return Promise.resolve();
  fctx.imageSmoothingEnabled = false;

  // Bottom→top percolation with Bayer noise (no lace)
  const Y_W = 0.42;
  const D_W = 0.42;
  const R_W = 0.1;
  const thr = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    const yB = rows <= 1 ? 0 : (rows - 1 - y) / (rows - 1);
    for (let x = 0; x < cols; x++) {
      const dither = BAYER8[y & 7][x & 7] / 64;
      thr[y * cols + x] = yB * Y_W + dither * D_W + Math.random() * R_W;
    }
  }

  const morphSpan = 0.07;

  /** 0 cloth, 1 flower-white, 2 flower-gray, 3 text */
  const kind = new Uint8Array(cols * rows);
  const flowerRect = flowerEl?.getBoundingClientRect() || null;
  const textRect = splashWelcome?.getBoundingClientRect() || null;

  // Classify cells from live DOM geometry (does not alter splash look)
  const classify = () => {
    // Prefer SVG petal hit: large = white, small = gray
    const lgPetals = flowerEl
      ? [...flowerEl.querySelectorAll(".splash-flower__petal--lg")]
      : [];
    const smPetals = flowerEl
      ? [...flowerEl.querySelectorAll(".splash-flower__petal--sm, .splash-flower__core")]
      : [];

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const vx = (x + 0.5) * cell;
        const vy = (y + 0.5) * cell;
        kind[i] = 0;

        if (
          textRect &&
          vx >= textRect.left &&
          vx <= textRect.right &&
          vy >= textRect.top &&
          vy <= textRect.bottom
        ) {
          // Only mark if over actual glyph ink (sample splash welcome canvas later)
          kind[i] = 3;
          continue;
        }

        if (
          flowerRect &&
          vx >= flowerRect.left &&
          vx <= flowerRect.right &&
          vy >= flowerRect.top &&
          vy <= flowerRect.bottom
        ) {
          // Map to SVG viewBox 0..100
          const sx = ((vx - flowerRect.left) / flowerRect.width) * 100;
          const sy = ((vy - flowerRect.top) / flowerRect.height) * 100;
          let hit = 0;
          for (const g of smPetals) {
            const poly = g.tagName === "rect" ? g : g.querySelector("polygon");
            if (!poly) continue;
            if (pointInPetal(poly, sx, sy)) {
              hit = 2;
              break;
            }
          }
          if (!hit) {
            for (const g of lgPetals) {
              const poly = g.querySelector("polygon");
              if (poly && pointInPetal(poly, sx, sy)) {
                hit = 1;
                break;
              }
            }
          }
          if (hit) kind[i] = hit;
        }
      }
    }
  };

  const pointInPetal = (el, px, py) => {
    if (el.tagName === "rect") {
      const x = +el.getAttribute("x");
      const y = +el.getAttribute("y");
      const w = +el.getAttribute("width");
      const h = +el.getAttribute("height");
      return px >= x && px <= x + w && py >= y && py <= y + h;
    }
    const pts = (el.getAttribute("points") || "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (pts.length < 6) return false;
    const verts = [];
    for (let i = 0; i < pts.length; i += 2) verts.push([pts[i], pts[i + 1]]);
    // Ray cast
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const xi = verts[i][0];
      const yi = verts[i][1];
      const xj = verts[j][0];
      const yj = verts[j][1];
      const intersect =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Refine text cells + capture glyph ink with the SAME CSS font as splash
  /** @type {HTMLCanvasElement | null} */
  let textSrc = null;
  /** @type {number} */
  let textSrcLeft = 0;
  /** @type {number} */
  let textSrcTop = 0;

  const refineTextInk = () => {
    if (!splashWelcome || !textRect) return;
    const cs = getComputedStyle(splashWelcome);
    const pad = 4;
    const tw = Math.max(1, Math.ceil(textRect.width) + pad * 2);
    const th = Math.max(1, Math.ceil(textRect.height) + pad * 2);
    textSrcLeft = Math.round(textRect.left) - pad;
    textSrcTop = Math.round(textRect.top) - pad;
    textSrc = document.createElement("canvas");
    textSrc.width = tw;
    textSrc.height = th;
    const ctx = textSrc.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, tw, th);
    // Exact computed font — do not invent another face/weight/size
    ctx.font = cs.font;
    try {
      ctx.letterSpacing = cs.letterSpacing;
    } catch (_) {
      /* older engines */
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    const label =
      splashWelcome.querySelector(".splash-welcome__sr")?.textContent?.trim() ||
      "Welcome to my ATTIC";
    ctx.fillText(label, tw / 2, th / 2);

    // Hard threshold — keep Syne glyph shapes, kill AA fringe
    const data = ctx.getImageData(0, 0, tw, th);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 128) {
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        d[i + 3] = 255;
      } else {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 0;
      }
    }
    ctx.putImageData(data, 0, 0);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (kind[i] !== 3) continue;
        const vx = (x + 0.5) * cell;
        const vy = (y + 0.5) * cell;
        const lx = Math.min(tw - 1, Math.max(0, Math.floor(vx - textSrcLeft)));
        const ly = Math.min(th - 1, Math.max(0, Math.floor(vy - textSrcTop)));
        const o = (ly * tw + lx) * 4;
        if (data.data[o + 3] < 128) kind[i] = 0;
      }
    }
  };

  classify();
  refineTextInk();

  // Cross-stitch cloth eyes (sparse holes) on cloth only
  const clothEye = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (kind[i] !== 0) continue;
      const b = BAYER8[y & 7][x & 7];
      if (b <= 4 && ((x * 5 + y * 3) & 15) === 0) clothEye[i] = 1;
    }
  }

  // Flower/text: sync life with local mosaic front (only slightly later)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (kind[i] === 0) continue;
      let sum = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx;
          if (kind[j] !== 0) continue; // compare against surrounding cloth
          sum += thr[j];
          n++;
        }
      }
      if (n > 0) {
        // Sit just behind the local cloth front — late a little, not immortal
        thr[i] = sum / n + 0.035;
      } else {
        const yB = rows <= 1 ? 0 : (rows - 1 - y) / (rows - 1);
        thr[i] = yB * Y_W + 0.05;
      }
    }
  }

  const colorFor = (i) => {
    if (kind[i] === 1) return COL_WHITE;
    if (kind[i] === 2) return COL_GRAY;
    if (kind[i] === 3) return COL_WHITE;
    return bg;
  };

  const alive = new Uint8Array(cols * rows);
  alive.fill(1);

  const paintMask = () => {
    mctx.clearRect(0, 0, mask.width, mask.height);
    mctx.fillStyle = "#ffffff";
    mctx.fillRect(0, 0, mask.width, mask.height);
    mctx.globalCompositeOperation = "destination-out";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (alive[y * cols + x]) continue;
        mctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    mctx.globalCompositeOperation = "source-over";
    splashEl.style.setProperty("--splash-mask", `url("${mask.toDataURL("image/png")}")`);
  };

  const drawSpindleV = (cx, cy, tip, waist, bulge) => {
    const pull = waist * (1 + bulge * 0.55);
    fctx.beginPath();
    fctx.moveTo(cx, cy - tip);
    fctx.quadraticCurveTo(cx + pull, cy - tip * 0.12, cx + waist, cy);
    fctx.quadraticCurveTo(cx + pull, cy + tip * 0.12, cx, cy + tip);
    fctx.quadraticCurveTo(cx - pull, cy + tip * 0.12, cx - waist, cy);
    fctx.quadraticCurveTo(cx - pull, cy - tip * 0.12, cx, cy - tip);
    fctx.closePath();
    fctx.fill();
  };

  const drawSpindleH = (cx, cy, tip, waist, bulge) => {
    const pull = waist * (1 + bulge * 0.55);
    fctx.beginPath();
    fctx.moveTo(cx - tip, cy);
    fctx.quadraticCurveTo(cx - tip * 0.12, cy + pull, cx, cy + waist);
    fctx.quadraticCurveTo(cx + tip * 0.12, cy + pull, cx + tip, cy);
    fctx.quadraticCurveTo(cx + tip * 0.12, cy - pull, cx, cy - waist);
    fctx.quadraticCurveTo(cx - tip * 0.12, cy - pull, cx - tip, cy);
    fctx.closePath();
    fctx.fill();
  };

  const drawSpindleMorph = (cx, cy, half, u) => {
    if (u >= 1) return;
    // Gentler initial velocity → fat spindle; then thin & die
    let tip = half * 0.98;
    let waist;
    let bulge;
    if (u < 0.16) {
      const t = u / 0.16;
      const e = 1 - (1 - t) ** 2.5;
      waist = half * (0.9 - 0.42 * e); // → ~0.48 fat
      bulge = 0.3 + 0.7 * e;
    } else if (u < 0.42) {
      waist = half * 0.48;
      bulge = 1;
    } else if (u < 0.68) {
      const t = (u - 0.42) / 0.26;
      const e = t * t;
      waist = half * (0.48 - 0.38 * e);
      bulge = 1 - e;
    } else {
      const t = (u - 0.68) / 0.32;
      const e = t * t;
      waist = half * 0.1 * (1 - e);
      bulge = 0;
      tip = half * 0.98 * (1 - e);
    }
    waist = Math.max(half * 0.005, waist);
    tip = Math.max(half * 0.005, tip);
    drawSpindleV(cx, cy, tip, waist, bulge);
    drawSpindleH(cx, cy, tip, waist, bulge);
  };

  const drawTextMorph = (x, y, u) => {
    if (u >= 1 || !textSrc) return;
    // Scale original Syne glyph pixels in this cell — do not replace the typeface
    const scale = Math.max(0.04, 1 - u * u);
    const cw = cell * scale;
    const ch = cell * scale;
    const dx = x * cell + (cell - cw) * 0.5;
    const dy = y * cell + (cell - ch) * 0.5;
    const sx = Math.round(x * cell - textSrcLeft);
    const sy = Math.round(y * cell - textSrcTop);
    fctx.imageSmoothingEnabled = false;
    fctx.drawImage(textSrc, sx, sy, cell, cell, dx, dy, cw, ch);
  };

  /** Hairline stitch gutters on flower once its mosaic cell starts dissolving */
  const stitchGutter = () => (cell >= 3 ? 1 : 0);

  const drawFlowerStitchGrid = (x, y) => {
    const g = stitchGutter();
    if (g <= 0) return;
    fctx.fillStyle = bg;
    const x0 = Math.round(x * cell);
    const y0 = Math.round(y * cell);
    const w = Math.round((x + 1) * cell) - x0;
    const h = Math.round((y + 1) * cell) - y0;
    fctx.fillRect(x0 + w - g, y0, g, h);
    fctx.fillRect(x0, y0 + h - g, w, g);
  };

  const cellU = (p, i, y, x) => {
    const u0 = (p - thr[i]) / morphSpan;
    const isContent = kind[i] === 1 || kind[i] === 2 || kind[i] === 3;

    // Cloth eyes open a bit early
    if (clothEye[i] && !isContent && u0 > -0.12) {
      return Math.min(1, Math.max(0, u0) * 2.2 + 0.1);
    }

    let u = u0;

    if (isContent) {
      let deadN = 0;
      let nearN = 0;
      let minThr = thr[i];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx;
          if (kind[j] !== 0) continue;
          nearN++;
          minThr = Math.min(minThr, thr[j]);
          if (p >= thr[j]) deadN++;
        }
      }
      if (nearN > 0 && deadN / nearN >= 0.35) {
        u = Math.max(u, (p - (minThr + 0.025)) / morphSpan);
      }
    }

    // Short trail: after mid morph, accelerate to clean
    if (u > 0.35) u = 0.35 + (u - 0.35) * 2.4;
    if (u0 > 1.2) u = Math.max(u, Math.min(1, (u0 - 0.4) / 0.9));
    return u;
  };

  splashEl.classList.add("is-mosaic");
  document.body.appendChild(fx);
  paintMask();

  const duration = 920;
  const start = performance.now();
  let lastMask = 0;

  return new Promise((resolve) => {
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const p = t * t * (3 - 2 * t);

      fctx.clearRect(0, 0, fx.width, fx.height);
      fctx.globalAlpha = 1;
      fctx.imageSmoothingEnabled = false;

      let maskDirty = false;
      const half = cell * 0.5;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const u = cellU(p, i, y, x);
          const isFlower = kind[i] === 1 || kind[i] === 2;

          if (u <= 0) {
            if (!alive[i]) {
              alive[i] = 1;
              maskDirty = true;
            }
            continue;
          }

          if (alive[i]) {
            alive[i] = 0;
            maskDirty = true;
          }

          if (u >= 1) continue;

          const cx = x * cell + half;
          const cy = y * cell + half;
          const g = stitchGutter();

          if (kind[i] === 3) {
            fctx.fillStyle = colorFor(i);
            drawTextMorph(x, y, u);
          } else if (isFlower) {
            fctx.fillStyle = bg;
            fctx.fillRect(Math.round(x * cell), Math.round(y * cell), cell, cell);
            fctx.fillStyle = colorFor(i);
            drawSpindleMorph(cx, cy, Math.max(half - g, half * 0.85), u);
            drawFlowerStitchGrid(x, y);
          } else {
            fctx.fillStyle = colorFor(i);
            drawSpindleMorph(cx, cy, half, u);
          }
        }
      }

      if (maskDirty || now - lastMask > 48) {
        paintMask();
        lastMask = now;
      }

      if (t < 1) requestAnimationFrame(tick);
      else {
        alive.fill(0);
        paintMask();
        fctx.clearRect(0, 0, fx.width, fx.height);
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

startSplashBloom();

const layoutUrl = new URL("./cover-layout.json", import.meta.url);
const doorsUrl = new URL("./doors.svg", import.meta.url);
const lettersUrl = new URL("./letters.json", import.meta.url);
const marksUrl = new URL("./marks.json", import.meta.url);
const regionsUrl = new URL("./illustration-regions.json", import.meta.url);
const railsUrl = new URL("./frame-rails.svg", import.meta.url);

const artboard = document.getElementById("artboard");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** @type {any} */
let coverLayout = null;

function pct(n, total) {
  return `${(n / total) * 100}%`;
}

function placeBox(el, place, AW, AH) {
  el.style.left = pct(place.x, AW);
  el.style.top = pct(place.y, AH);
  el.style.width = pct(place.w, AW);
  el.style.height = pct(place.h, AH);
}

function assetUrl(path) {
  return new URL(`./${path}`, import.meta.url).href;
}

let coverFallbackShown = false;
let coverAssetFails = 0;

function showCoverFallback() {
  if (coverFallbackShown || !artboard) return;
  coverFallbackShown = true;
  const panel = document.getElementById("cover-fallback");
  if (panel) {
    panel.hidden = false;
    panel.removeAttribute("hidden");
  }
  artboard.classList.add("is-fallback", "is-ready");
  console.warn("[attic] cover assets failed — showing SVG fallback");
}

function noteCoverAssetFail(critical = false) {
  coverAssetFails += 1;
  if (critical || coverAssetFails >= 3) showCoverFallback();
}

/** Hide broken <img> immediately so alt text never piles up. */
function watchCoverImg(img, { critical = false } = {}) {
  if (!img) return;
  img.alt = "";
  img.setAttribute("alt", "");
  const fail = () => {
    img.removeAttribute("src");
    img.style.display = "none";
    img.setAttribute("aria-hidden", "true");
    noteCoverAssetFail(critical);
  };
  img.addEventListener("error", fail, { once: true });
  if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) {
    fail();
  }
}

function watchSvgImage(img, { critical = false } = {}) {
  if (!img) return;
  img.addEventListener(
    "error",
    () => {
      img.remove();
      noteCoverAssetFail(critical);
    },
    { once: true }
  );
}

function setupCoverFallbackUi() {
  const panel = document.getElementById("cover-fallback");
  if (!panel || panel.dataset.bound === "1") return;
  panel.dataset.bound = "1";
  panel.querySelectorAll("[data-enter]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const side = btn.getAttribute("data-enter") === "right" ? "right" : "left";
      const doorId = side === "left" ? "door-left-path" : "door-right-path";
      const hasDoor = Boolean(document.getElementById(doorId)?.getAttribute("d"));
      if (!coverLayout || !hasDoor) {
        const home = document.getElementById("home");
        document.body.classList.add("is-on-home");
        home?.setAttribute("aria-hidden", "false");
        home?.classList.add("is-enter-zoom");
        window.location.hash = "home";
        return;
      }
      enterAttic(side);
    });
  });
}

function setupLayers(layout, AW, AH) {
  const skip = new Set([
    "text-youre-now-at",
    "center-illustration",
    "checklist-marks",
  ]);
  const criticalLayers = new Set(["outline", "text-reason", "checklist-text"]);

  for (const [name, place] of Object.entries(layout.placements)) {
    if (skip.has(name)) continue;

    const wipe = artboard.querySelector(`[data-wipe="${name}"]`);
    const src =
      place.source === "file" && place.file
        ? assetUrl(place.file)
        : assetUrl(`parts/${name}.png`);

    if (wipe) {
      placeBox(wipe, place, AW, AH);
      const img = wipe.querySelector("img");
      if (img) {
        img.src = src;
        img.style.left = "0";
        img.style.top = "0";
        img.style.width = "100%";
        img.style.height = "100%";
        watchCoverImg(img);
      }
      continue;
    }

    const nodes = artboard.querySelectorAll(`[data-layer="${name}"]`);
    for (const el of nodes) {
      placeBox(el, place, AW, AH);
      el.src = src;
      watchCoverImg(el, { critical: criticalLayers.has(name) });
    }
  }
}

const HORIZ_RAILS = new Set([
  "top-outer",
  "top-inner",
  "bottom-inner",
  "bottom-outer",
]);

function parsePolyPoints(d) {
  const pts = [];
  const re = /([ML])\s*([-\d.]+)\s+([-\d.]+)/gi;
  let m;
  while ((m = re.exec(d))) {
    pts.push({ x: Number(m[2]), y: Number(m[3]) });
  }
  return pts;
}

function sampleRailY(pts, x) {
  if (!pts.length) return 0;
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return pts[pts.length - 1].y;
}

/** Extend a hand-drawn horizontal across [x0, x1] (past the verticals). */
function extendHorizontalPath(d, x0, x1, step = 6) {
  const pts = parsePolyPoints(d);
  if (pts.length < 2) return d;
  const out = [];
  for (let x = x0; x <= x1; x += step) {
    out.push([x, Math.round(sampleRailY(pts, x))]);
  }
  if (out[out.length - 1][0] !== x1) {
    out.push([x1, Math.round(sampleRailY(pts, x1))]);
  }
  return `M ${out[0][0]} ${out[0][1]} ` + out.slice(1).map(([x, y]) => `L ${x} ${y}`).join(" ");
}

/** Match hand-stroke weight across IDE preview vs full browser windows. */
function syncStrokeScale() {
  if (!artboard) return;
  const w = artboard.getBoundingClientRect().width;
  // IDE Simple Browser is often ~800–1000px wide; full windows are wider.
  // Scale stroke so relative ink weight stays close to that preview.
  const ref = 920;
  const scale = Math.min(2.35, Math.max(0.92, w / ref));
  artboard.style.setProperty("--stroke-scale", scale.toFixed(3));
  document.documentElement.style.setProperty("--stroke-scale", scale.toFixed(3));
}

function layoutRailsBleed() {
  const bleed = document.getElementById("rails-bleed");
  const stage = document.getElementById("stage");
  if (!bleed || !stage || !artboard) return;
  // Freeze layout while camera zooms — transformed rects would fight the scale.
  if (
    artboard.classList.contains("is-entering") ||
    document.getElementById("camera")?.classList.contains("is-zooming")
  ) {
    return;
  }

  syncStrokeScale();
  layoutVoidPatterns();

  const ar = artboard.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  if (ar.height < 2 || ar.width < 2) return;

  bleed.style.top = `${ar.top - sr.top}px`;
  bleed.style.height = `${ar.height}px`;
  bleed.style.width = "100%";
  bleed.style.left = "0";

  // map full stage width into artboard units (artboard = 2880 wide)
  const fullW = (sr.width / ar.width) * 2880;
  const margin = (fullW - 2880) / 2;
  bleed.setAttribute("viewBox", `${-margin} 0 ${fullW} 1920`);
  bleed.setAttribute("preserveAspectRatio", "none");

  // stretch each horizontal to the current bleed span
  for (const path of bleed.querySelectorAll("path[data-rail]")) {
    const src = path.dataset.srcD;
    if (!src) continue;
    path.setAttribute("d", extendHorizontalPath(src, -margin - 40, 2880 + margin + 40, 5));
  }
}

function setupRails(railsXml) {
  const host = artboard.querySelector(".frame-rails");
  const bleed = document.getElementById("rails-bleed");
  if (!host) return;
  const parsed = new DOMParser().parseFromString(railsXml, "image/svg+xml");
  const srcSvg = parsed.querySelector("svg");
  if (!srcSvg) return;

  host.innerHTML = "";
  if (bleed) bleed.innerHTML = "";

  for (const path of srcSvg.querySelectorAll("path")) {
    const id = path.getAttribute("id") || path.getAttribute("data-rail") || "";
    const node = document.importNode(path, true);
    if (HORIZ_RAILS.has(id)) {
      if (!bleed) continue;
      node.dataset.srcD = path.getAttribute("d") || "";
      node.dataset.rail = id;
      bleed.appendChild(node);
    } else {
      // verticals stay inside the artboard
      host.appendChild(node);
    }
  }

  layoutRailsBleed();
  syncStrokeScale();
  window.addEventListener("resize", layoutRailsBleed);
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => layoutRailsBleed());
    ro.observe(artboard);
    const stage = document.getElementById("stage");
    if (stage) ro.observe(stage);
  }
}

function setupDoors(doorsXml) {
  const parsed = new DOMParser().parseFromString(doorsXml, "image/svg+xml");
  const left = parsed.querySelector("#door-left");
  const right = parsed.querySelector("#door-right");
  const leftPath = document.getElementById("door-left-path");
  const rightPath = document.getElementById("door-right-path");
  if (left && leftPath) leftPath.setAttribute("d", left.getAttribute("d"));
  if (right && rightPath) rightPath.setAttribute("d", right.getAttribute("d"));

  const setHover = (side, on) => {
    if (artboard.classList.contains("is-entering")) return;
    artboard.classList.toggle("is-hover-left", side === "left" && on);
    artboard.classList.toggle("is-hover-right", side === "right" && on);
  };

  for (const side of ["left", "right"]) {
    const hit = artboard.querySelector(`.door-hit[data-door="${side}"]`);
    hit?.addEventListener("pointerenter", () => setHover(side, true));
    hit?.addEventListener("pointerleave", () => setHover(side, false));
  }

  const leftLink = document.getElementById("door-left-link");
  const rightLink = document.getElementById("door-right-link");
  leftLink?.setAttribute("href", "#home");
  rightLink?.setAttribute("href", "#home");

  const onEnter = (side, event) => {
    event.preventDefault();
    enterAttic(side);
  };
  leftLink?.addEventListener("click", (e) => onEnter("left", e));
  rightLink?.addEventListener("click", (e) => onEnter("right", e));
}

function doorMetrics(side) {
  const hit = artboard.querySelector(`.door-hit[data-door="${side}"]`);
  if (!hit || typeof hit.getBBox !== "function") {
    return {
      cx: side === "left" ? 18 : 82,
      cy: 52,
      hingeX: side === "left" ? 220 : 2660,
      hingeY: 920,
    };
  }
  const bb = hit.getBBox();
  return {
    cx: ((bb.x + bb.width / 2) / 2880) * 100,
    cy: ((bb.y + bb.height / 2) / 1920) * 100,
    hingeX: side === "left" ? bb.x + 8 : bb.x + bb.width - 8,
    hingeY: bb.y + bb.height * 0.42,
    bb,
  };
}

/** Camera zoom target = door opening center in #camera % coords */
function doorCameraOrigin(side, camera) {
  const hit = artboard.querySelector(`.door-hit[data-door="${side}"]`);
  const cam = camera.getBoundingClientRect();
  if (!hit || cam.width < 1 || cam.height < 1) {
    return {
      originX: side === "left" ? 22 : 78,
      originY: 52,
    };
  }
  const r = hit.getBoundingClientRect();
  // aim through the arch cavity (slightly above geometric mid)
  const px = r.left + r.width * 0.5;
  const py = r.top + r.height * 0.42;
  return {
    originX: ((px - cam.left) / cam.width) * 100,
    originY: ((py - cam.top) / cam.height) * 100,
  };
}

/** Door leaf layer aligned to the artboard box inside #camera */
function syncDoorEnterLayer(camera) {
  const layer = document.getElementById("door-enter-layer");
  if (!layer || !camera) return;
  const cam = camera.getBoundingClientRect();
  const ab = artboard.getBoundingClientRect();
  if (cam.width < 1 || ab.width < 1) return;
  layer.style.left = `${ab.left - cam.left}px`;
  layer.style.top = `${ab.top - cam.top}px`;
  layer.style.width = `${ab.width}px`;
  layer.style.height = `${ab.height}px`;
}

/** Punch a luminance hole only at the door so home peeks through (your mask). */
function applyDoorHoleMask(side, camera) {
  const stage = document.getElementById("stage");
  const pathEl = document.getElementById(
    side === "left" ? "door-left-path" : "door-right-path"
  );
  const d = pathEl?.getAttribute("d");
  const box = stage?.getBoundingClientRect();
  const ab = artboard.getBoundingClientRect();
  if (!stage || !d || !box || box.width < 1 || box.height < 1 || ab.width < 1) {
    camera?.classList.remove("has-door-hole");
    return;
  }
  // Mask is painted on .stage — size the SVG to the stage box.
  const ox = ab.left - box.left;
  const oy = ab.top - box.top;
  const sx = ab.width / 2880;
  const sy = ab.height / 1920;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(
    box.width
  )}" height="${Math.round(box.height)}" viewBox="0 0 ${box.width} ${
    box.height
  }"><rect width="100%" height="100%" fill="#fff"/><g transform="translate(${ox},${oy}) scale(${sx},${sy})"><path d="${d}" fill="#000"/></g></svg>`;
  stage.style.setProperty(
    "--door-hole-mask",
    `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
  );
  camera.classList.add("has-door-hole");
}

function clearDoorHoleMask(camera) {
  const stage = document.getElementById("stage");
  camera?.classList.remove("has-door-hole");
  stage?.style.removeProperty("--door-hole-mask");
}

function prepareBentoPush() {
  const bento = document.querySelector(".bento");
  if (!bento) return;
  const cells = bento.querySelectorAll(
    ".tile, .home-hello, .folio-section-label, .folio-filters, .home-foot, .folio-spacer"
  );
  const br = bento.getBoundingClientRect();
  const cx = br.left + br.width / 2;
  const cy = br.top + br.height / 2;
  cells.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    // start clustered toward center, then shove out to final slot
    el.style.setProperty("--push-x", `${(cx - ex) * 0.62}px`);
    el.style.setProperty("--push-y", `${(cy - ey) * 0.62}px`);
    el.style.setProperty("--push-i", String(i));
  });
}

function setupPortfolioChrome() {
  const back = document.getElementById("folio-back-cover");
  back?.addEventListener("click", (e) => {
    e.preventDefault();
    const url = new URL(location.href);
    url.searchParams.delete("view");
    url.hash = "";
    location.assign(url.href);
  });
}

function doorMaskImage(d) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2880 1920"><path fill="#fff" d="${d}"/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function buildDoorThickness(host, d, depthPx = 40) {
  if (!host) return;
  host.innerHTML = "";
  const svgNS = "http://www.w3.org/2000/svg";
  const stepPx = 2;
  const steps = Math.max(8, Math.round(depthPx / stepPx));
  for (let i = steps; i >= 1; i -= 1) {
    const slab = document.createElement("div");
    slab.className = "door-slab";
    slab.style.transform = `translateZ(${-i * stepPx}px)`;
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 2880 1920");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", d);
    // slight darken toward back for edge read
    const t = i / steps;
    const shade = Math.round(197 - t * 18);
    path.setAttribute("fill", `rgb(${shade}, ${shade + 1}, ${shade + 13})`);
    svg.appendChild(path);
    slab.appendChild(svg);
    host.appendChild(slab);
  }
}

function mountDoorDeco(side, d) {
  const deco = document.getElementById("door-pivot-deco");
  if (!deco || !coverLayout) return;

  const textKey =
    side === "left" ? "text-left-fluorescent" : "text-right-florescent";
  const arrowKey = side === "left" ? "arrow-left" : "arrow-right";
  const textPlace = coverLayout.placements[textKey];
  const arrowPlace = coverLayout.placements[arrowKey];
  const srcText = artboard.querySelector(`[data-layer="${textKey}"]`);
  const srcArrow = artboard.querySelector(`[data-layer="${arrowKey}"]`);

  deco.innerHTML = "";
  const mask = doorMaskImage(d);
  deco.style.webkitMaskImage = mask;
  deco.style.maskImage = mask;

  const AW = 2880;
  const AH = 1920;
  for (const [place, src] of [
    [textPlace, srcText],
    [arrowPlace, srcArrow],
  ]) {
    if (!place || !src?.src) continue;
    const img = document.createElement("img");
    img.className = "layer";
    img.alt = "";
    img.draggable = false;
    img.src = src.src;
    placeBox(img, place, AW, AH);
    watchCoverImg(img);
    deco.appendChild(img);
  }
}

function enterAttic(side) {
  if (document.body.classList.contains("is-on-home")) return;
  if (artboard.classList.contains("is-entering")) return;

  const camera = document.getElementById("camera");
  const stage = document.getElementById("stage");
  const flash = document.getElementById("flash");
  const home = document.getElementById("home");
  const enterLayer = document.getElementById("door-enter-layer");
  const pivotRoot = document.getElementById("door-pivot-root");
  const leafPath = document.getElementById("door-leaf-path");
  const thicknessHost = document.getElementById("door-leaf-thickness");
  const beyondPath = document.getElementById("door-beyond-path");
  const srcPath = document.getElementById(
    side === "left" ? "door-left-path" : "door-right-path"
  );

  if (srcPath) {
    const d = srcPath.getAttribute("d");
    leafPath?.setAttribute("d", d);
    beyondPath?.setAttribute("d", d);
    buildDoorThickness(thicknessHost, d, 40);
    mountDoorDeco(side, d);
  }

  const m = doorMetrics(side);
  const { originX, originY } = doorCameraOrigin(side, camera);

  camera.style.removeProperty("--cam-x");
  camera.style.removeProperty("--cam-y");
  camera.style.transformOrigin = `${originX}% ${originY}%`;
  home?.style.setProperty("--floor-origin-x", `${originX}%`);
  home?.style.setProperty("--floor-origin-y", `${originY}%`);
  // Letterbox parallax shares door X so layers expand toward the opening
  document.querySelectorAll(".stage-void .void-parallax").forEach((el) => {
    el.style.setProperty("--void-px-ox", `${originX}%`);
  });
  syncDoorEnterLayer(camera);
  applyDoorHoleMask(side, camera);

  const hingeXPct = `${(m.hingeX / 2880) * 100}%`;
  const hingeYPct = `${(m.hingeY / 1920) * 100}%`;
  artboard.style.setProperty("--door-hinge-x", hingeXPct);
  artboard.style.setProperty("--door-hinge-y", hingeYPct);
  enterLayer?.style.setProperty("--door-hinge-x", hingeXPct);
  enterLayer?.style.setProperty("--door-hinge-y", hingeYPct);
  const pivot = document.getElementById("door-pivot");
  pivot?.style.setProperty("--door-hinge-x", hingeXPct);
  pivot?.style.setProperty("--door-hinge-y", hingeYPct);
  if (pivotRoot) {
    pivotRoot.style.transformOrigin = `${hingeXPct} ${hingeYPct}`;
  }

  artboard.classList.remove("is-hover-left", "is-hover-right");
  artboard.classList.add(
    "is-entering",
    side === "left" ? "is-enter-left" : "is-enter-right"
  );
  enterLayer?.classList.remove("is-enter-left", "is-enter-right");
  enterLayer?.classList.add(
    "is-active",
    side === "left" ? "is-enter-left" : "is-enter-right"
  );
  enterLayer?.setAttribute("aria-hidden", "false");
  stage?.classList.add("is-exiting");

  /* hold clustered pose first — peek through door without a finished layout flash */
  home?.classList.add("is-bento-hold");
  home?.setAttribute("aria-hidden", "false");
  layoutFlowerRow();
  prepareBentoPush();

  const finish = () => {
    document.body.classList.add("is-on-home");
    home?.classList.add("is-visible");
    home?.classList.remove("is-bento-hold", "is-enter-zoom", "is-floor-zoom");
    home?.setAttribute("aria-hidden", "false");
    enterLayer?.classList.remove("is-active", "is-enter-left", "is-enter-right");
    enterLayer?.setAttribute("aria-hidden", "true");
    clearDoorHoleMask(camera);
    layoutFlowerRow();
    if (location.hash !== "#home") {
      history.pushState({ view: "home" }, "", "#home");
    }
  };

  if (reduceMotion) {
    flash?.classList.remove("is-burst");
    home?.classList.add("is-visible");
    home?.classList.remove("is-bento-hold");
    finish();
    return;
  }

  requestAnimationFrame(() => {
    camera.classList.add("is-zooming");
    home?.classList.add("is-floor-zoom");
  });

  window.setTimeout(() => {
    home?.classList.add("is-visible", "is-enter-zoom");
    // reflow so hold transform is committed, then release into one push-out
    void home?.offsetWidth;
    home?.classList.remove("is-bento-hold");
  }, 300);

  window.setTimeout(() => {
    flash?.classList.add("is-burst");
  }, 1320);

  window.setTimeout(() => {
    finish();
  }, 1650);
}

function showHomeImmediate() {
  const home = document.getElementById("home");
  document.body.classList.add("is-on-home");
  home?.classList.add("is-visible");
  home?.setAttribute("aria-hidden", "false");
  layoutFlowerRow();
}

const FLOWER_SVG = `<svg class="flower-unit" viewBox="0 0 24 56" aria-hidden="true"><path d="M12 56 V24" stroke="#4a6b38" stroke-width="2.2"/><circle cx="12" cy="14" r="10" fill="#c45c4a"/><circle cx="12" cy="14" r="3.6" fill="#e8c84a"/></svg>`;

function layoutFlowerRow() {
  const row = document.getElementById("flower-row");
  if (!row) return;
  const h = row.clientHeight;
  const w = row.clientWidth;
  if (h < 4 || w < 4) return;

  const gap = parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap) || 0;
  const unitW = h * (24 / 56);
  // only whole flowers that fit with gaps — never clip a half flower
  const n = Math.max(0, Math.floor((w + gap) / (unitW + gap)));
  if (row.dataset.count === String(n)) return;
  row.dataset.count = String(n);
  row.innerHTML = n > 0 ? FLOWER_SVG.repeat(n) : "";
}

function setupFlowerRow() {
  const row = document.getElementById("flower-row");
  if (!row) return;
  const tile = row.closest(".span-flower");
  const home = document.getElementById("home");

  const schedule = () => {
    requestAnimationFrame(() => layoutFlowerRow());
  };

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(schedule);
    ro.observe(row);
    if (tile) ro.observe(tile);
    if (home) ro.observe(home);
  }
  window.addEventListener("resize", schedule);
  if (home) {
    new MutationObserver(schedule).observe(home, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
  schedule();
}

function setupRouting() {
  // Splash → cover. Don't skip to home just because a prior visit left #home.
  if (document.body.classList.contains("is-splash") && location.hash === "#home") {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }

  window.addEventListener("popstate", () => {
    if (location.hash === "#home") {
      showHomeImmediate();
    } else {
      // hard reload cover — simplest clean reset of camera state
      location.reload();
    }
  });
}

function setupLetters(lettersData, AW, AH) {
  const root = document.getElementById("letters");
  root.innerHTML = "";

  lettersData.letters.forEach((letter, i) => {
    const el = document.createElement("div");
    el.className = "letter";
    el.dataset.char = letter.char;
    placeBox(el, letter, AW, AH);
    el.style.animationDelay = `${0.08 + i * 0.07}s`;

    const string = document.createElement("span");
    string.className = "letter-string";
    string.style.left = "0";
    string.style.bottom = "100%";
    string.style.height = "130%";
    string.style.animationDelay = `${0.08 + i * 0.07}s`;

    const img = document.createElement("img");
    img.src = assetUrl(letter.file);
    img.alt = "";
    img.draggable = false;
    watchCoverImg(img);

    el.append(string, img);
    root.appendChild(el);
  });
}

function expandPathFromCenter(d, cx, cy, factor) {
  return d.replace(/([ML])\s*([-\d.]+)\s+([-\d.]+)/gi, (_, cmd, xs, ys) => {
    const x = Number(xs);
    const y = Number(ys);
    const nx = cx + (x - cx) * factor;
    const ny = cy + (y - cy) * factor;
    return `${cmd} ${nx.toFixed(2)} ${ny.toFixed(2)}`;
  });
}

function setupIllustration(regionsData, AW, AH) {
  const root = document.getElementById("illustration");
  root.innerHTML = "";
  const place = regionsData.placement;
  placeBox(root, place, AW, AH);

  const w = place.w;
  const h = place.h;
  const imgSrc = assetUrl(regionsData.image);
  const [cx, cy] = regionsData.centerLocal || [w / 2, h / 2];
  // overlap clips so diagonal X seams don't flash page bg through the middle
  const clipExpand = 1.16;

  const svgNS = "http://www.w3.org/2000/svg";
  const xlinkNS = "http://www.w3.org/1999/xlink";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");

  const defs = document.createElementNS(svgNS, "defs");
  for (const region of regionsData.regions) {
    const clip = document.createElementNS(svgNS, "clipPath");
    clip.setAttribute("id", `clip-${region.id}`);
    clip.setAttribute("clipPathUnits", "userSpaceOnUse");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", expandPathFromCenter(region.localPath, cx, cy, clipExpand));
    clip.appendChild(path);
    defs.appendChild(clip);
  }
  svg.appendChild(defs);

  const padSrc = assetUrl(
    regionsData.padShadowImage || "parts/illu-pad-shadow.png"
  );
  // Front light: fixed inset silhouette under shards, scaled to 90%
  const padScale = 0.9;
  const padW = w * padScale;
  const padH = h * padScale;
  const padX = (w - padW) / 2;
  const padY = (h - padH) / 2;

  const placePadImage = (img) => {
    img.setAttribute("href", padSrc);
    img.setAttributeNS(xlinkNS, "href", padSrc);
    img.setAttribute("x", String(padX));
    img.setAttribute("y", String(padY));
    img.setAttribute("width", String(padW));
    img.setAttribute("height", String(padH));
    img.setAttribute("preserveAspectRatio", "none");
  };

  const floorLayer = document.createElementNS(svgNS, "g");
  floorLayer.classList.add("illu-floor");
  const basePad = document.createElementNS(svgNS, "image");
  basePad.classList.add("illu-pad");
  placePadImage(basePad);
  watchSvgImage(basePad);
  floorLayer.appendChild(basePad);

  // lift = nearby lightens (same inset pad, brighter in that region)
  for (const region of regionsData.regions) {
    const lit = document.createElementNS(svgNS, "g");
    lit.classList.add("illu-pad-lit");
    lit.dataset.region = region.id;
    lit.setAttribute("clip-path", `url(#clip-${region.id})`);
    const litImg = document.createElementNS(svgNS, "image");
    placePadImage(litImg);
    watchSvgImage(litImg);
    lit.appendChild(litImg);
    floorLayer.appendChild(lit);
  }

  const pieceLayer = document.createElementNS(svgNS, "g");
  pieceLayer.classList.add("tri-pieces");
  const liftLayer = document.createElementNS(svgNS, "g");
  liftLayer.classList.add("tri-lifted");
  const hitLayer = document.createElementNS(svgNS, "g");
  hitLayer.classList.add("tri-hits");

  const order = ["bottom", "left", "right", "top"];
  const byId = Object.fromEntries(regionsData.regions.map((r) => [r.id, r]));
  const visuals = {};
  const padLits = {};
  for (const el of floorLayer.querySelectorAll(".illu-pad-lit")) {
    padLits[el.dataset.region] = el;
  }
  const hovered = new Set();
  // individual outward nudge; pairs share one vector so their seam stays closed
  const OUT = {
    top: [0, -32],
    bottom: [0, 32],
    left: [-32, 0],
    right: [32, 0],
  };

  const doorRegions = () => {
    // fluorescent (left door) → left + top; florescent (right) → right + bottom
    if (artboard.classList.contains("is-hover-left")) return ["left", "top"];
    if (artboard.classList.contains("is-hover-right")) return ["right", "bottom"];
    return [];
  };

  const liftOffsetFor = (activeIds) => {
    if (activeIds.length === 0) return [0, 0];
    if (activeIds.length === 1) return OUT[activeIds[0]] || [0, 0];
    let sx = 0;
    let sy = 0;
    for (const id of activeIds) {
      const o = OUT[id] || [0, 0];
      sx += o[0];
      sy += o[1];
    }
    let dx = sx / activeIds.length;
    let dy = sy / activeIds.length;
    const mag = Math.hypot(dx, dy);
    if (mag > 0.1) {
      const k = 32 / mag;
      dx *= k;
      dy *= k;
    }
    return [dx, dy];
  };

  const syncLift = () => {
    const fromDoor = new Set(doorRegions());
    const active = order.filter((id) => hovered.has(id) || fromDoor.has(id));
    const [dx, dy] = liftOffsetFor(active);
    for (const id of order) {
      const on = active.includes(id);
      const visual = visuals[id];
      if (!visual) continue;
      visual.classList.toggle("is-up", on);
      visual.style.transform = on
        ? `translate3d(${dx}px, ${dy}px, 0)`
        : "translate3d(0, 0, 0)";
      padLits[id]?.classList.toggle("is-bright", on);
      (on ? liftLayer : pieceLayer).appendChild(visual);
    }
  };

  for (const id of order) {
    const region = byId[id];
    if (!region) continue;

    const visual = document.createElementNS(svgNS, "g");
    visual.classList.add("tri-visual");
    visual.dataset.region = id;
    visual.setAttribute("clip-path", `url(#clip-${id})`);
    const image = document.createElementNS(svgNS, "image");
    image.setAttribute("href", imgSrc);
    image.setAttributeNS(xlinkNS, "href", imgSrc);
    image.setAttribute("width", String(w));
    image.setAttribute("height", String(h));
    image.setAttribute("preserveAspectRatio", "none");
    watchSvgImage(image, { critical: id === "bottom" });
    visual.appendChild(image);
    pieceLayer.appendChild(visual);
    visuals[id] = visual;

    const hit = document.createElementNS(svgNS, "path");
    hit.classList.add("tri-hit");
    hit.dataset.region = id;
    hit.setAttribute("d", region.localPath);
    hitLayer.appendChild(hit);

    hit.addEventListener("pointerenter", () => {
      hovered.add(id);
      syncLift();
    });
    hit.addEventListener("pointerleave", () => {
      hovered.delete(id);
      syncLift();
    });
  }

  // floor (inset shadow) → resting pieces → lifted pieces → hits
  svg.append(floorLayer, pieceLayer, liftLayer, hitLayer);
  root.appendChild(svg);

  root.addEventListener("pointerleave", () => {
    if (!hovered.size) return;
    hovered.clear();
    syncLift();
  });

  const mo = new MutationObserver(syncLift);
  mo.observe(artboard, { attributes: true, attributeFilter: ["class"] });
}

function setupMarks(marksData, AW, AH) {
  const root = document.getElementById("marks");
  root.innerHTML = "";

  const marks = marksData.marks;
  if (!marks.length) return;

  // shared origin: midpoint of the three marks' centers
  const centers = marks.map((m) => ({
    x: m.x + m.w / 2,
    y: m.y + m.h / 2,
  }));
  const origin = {
    x: centers.reduce((s, c) => s + c.x, 0) / centers.length,
    y: centers.reduce((s, c) => s + c.y, 0) / centers.length,
  };

  marks.forEach((mark, i) => {
    const el = document.createElement("div");
    el.className = "mark";
    el.dataset.kind = mark.kind;
    placeBox(el, mark, AW, AH);

    const cx = mark.x + mark.w / 2;
    const cy = mark.y + mark.h / 2;
    // vector from final center back to shared origin, in % of mark box
    const fromX = ((origin.x - cx) / mark.w) * 100;
    const fromY = ((origin.y - cy) / mark.h) * 100;
    el.style.setProperty("--from-x", `${fromX}%`);
    el.style.setProperty("--from-y", `${fromY}%`);
    el.style.animationDelay = `${1.15 + i * 0.22}s`;

    const svgNS = "http://www.w3.org/2000/svg";
    const star = document.createElementNS(svgNS, "svg");
    star.classList.add("mark-star");
    star.setAttribute("viewBox", "0 0 100 100");
    star.setAttribute("aria-hidden", "true");
    star.style.animationDelay = `${1.15 + i * 0.22}s`;
    const poly = document.createElementNS(svgNS, "polygon");
    poly.setAttribute(
      "points",
      "50,1 66,34 99,50 66,66 50,99 34,66 1,50 34,34"
    );
    star.appendChild(poly);

    const src = assetUrl(mark.file);
    const shadow = document.createElement("img");
    shadow.className = "mark-shadow";
    shadow.src = src;
    shadow.alt = "";
    shadow.draggable = false;
    shadow.setAttribute("aria-hidden", "true");
    watchCoverImg(shadow);

    const ink = document.createElement("img");
    ink.className = "mark-ink";
    ink.src = src;
    ink.alt = "";
    ink.draggable = false;
    watchCoverImg(ink);

    el.append(star, shadow, ink);
    root.appendChild(el);
  });
}

function wobbleLine(x0, y0, x1, y1, segs = 7, amp = 3.5, seed = 1) {
  const pts = [[x0, y0]];
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const n =
      Math.sin(t * 12.7 + seed * 1.7) * amp +
      Math.sin(t * 27.3 + seed * 3.1) * (amp * 0.45);
    pts.push([x, y + n]);
  }
  pts.push([x1, y1]);
  return pts;
}

function pathFromPoints(pts) {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
}

function addSketchUline(svg, { d, classes, delay = 0 }) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  path.setAttribute("pathLength", "1");
  path.setAttribute("class", `sketch-uline ${classes}`);
  if (delay) path.style.transitionDelay = `${delay}s`;
  svg.appendChild(path);
  return path;
}

function setupSketchUnderlines(lettersData, marksData, layout, AW, AH) {
  const svg = artboard.querySelector(".sketch-underlines");
  const hitTop = document.getElementById("hit-top-text");
  const hitsBottom = document.getElementById("hits-bottom-text");
  if (!svg || !hitTop || !hitsBottom) return;
  svg.innerHTML = "";
  hitsBottom.innerHTML = "";

  const letters = lettersData.letters;
  const topRow = letters.filter((l) => l.y < 200);
  const botRow = letters.filter((l) => l.y >= 200);

  const topBlock = layout.placements["text-youre-now-at"];
  placeBox(hitTop, topBlock, AW, AH);

  if (topRow.length) {
    const x0 = Math.min(...topRow.map((l) => l.x)) + 8;
    const x1 = Math.max(...topRow.map((l) => l.x + l.w)) - 8;
    const y = Math.max(...topRow.map((l) => l.y + l.h)) - 10;
    addSketchUline(svg, {
      d: pathFromPoints(wobbleLine(x0, y, x1, y + 2, 9, 4.2, 2)),
      classes: "is-top",
    });
  }
  if (botRow.length) {
    const x0 = Math.min(...botRow.map((l) => l.x)) + 4;
    const x1 = Math.max(...botRow.map((l) => l.x + l.w)) - 4;
    const y = Math.max(...botRow.map((l) => l.y + l.h)) - 8;
    addSketchUline(svg, {
      d: pathFromPoints(wobbleLine(x0, y, x1, y - 1, 6, 3.6, 5)),
      classes: "is-top",
      delay: 0.1,
    });
  }

  const reason = layout.placements["text-reason"];
  const checklist = layout.placements["checklist-text"];
  const marks = marksData.marks || [];

  const bind = (el, cls) => {
    const animDur = cls === "is-hover-top-text" ? 1.15 : 0.7;
    const startLine = () => {
      // Sound first (≤ animation start), then kick the underline.
      playUnderlineScribble(animDur);
      artboard.classList.add(cls);
    };
    const endLine = () => artboard.classList.remove(cls);
    el.addEventListener("pointerenter", startLine);
    el.addEventListener("pointerleave", endLine);
    el.addEventListener("focus", startLine);
    el.addEventListener("blur", endLine);
  };
  bind(hitTop, "is-hover-top-text");

  // title hit + underline
  const hitReason = document.createElement("button");
  hitReason.type = "button";
  hitReason.className = "text-hit text-hit-reason";
  hitReason.setAttribute("aria-label", "The Reason I'm Here");
  placeBox(hitReason, reason, AW, AH);
  hitsBottom.appendChild(hitReason);
  bind(hitReason, "is-hover-reason");

  addSketchUline(svg, {
    d: pathFromPoints(
      wobbleLine(
        reason.x + 10,
        reason.y + reason.h + 4,
        reason.x + reason.w - 12,
        reason.y + reason.h + 8,
        8,
        3.2,
        7
      )
    ),
    classes: "is-reason",
  });

  // each checklist row: hit spans mark + text line
  marks.forEach((m, i) => {
    const padY = i === 0 ? 8 : 4;
    const nextY = i < marks.length - 1 ? marks[i + 1].y : m.y + m.h + 18;
    const row = {
      x: Math.min(m.x, checklist.x) - 6,
      y: m.y - padY,
      w: Math.max(m.x + m.w, checklist.x + checklist.w) - Math.min(m.x, checklist.x) + 12,
      h: Math.max(28, nextY - m.y - 2),
    };

    const hit = document.createElement("button");
    hit.type = "button";
    hit.className = `text-hit text-hit-row text-hit-row-${i}`;
    hit.setAttribute("aria-label", m.kind === "cross" ? "checklist item cross" : "checklist item check");
    placeBox(hit, row, AW, AH);
    hitsBottom.appendChild(hit);
    bind(hit, `is-hover-row-${i}`);

    const y = m.y + m.h + 6;
    const x0 = checklist.x - 8;
    const x1 = checklist.x + checklist.w - 6;
    const kind = m.kind === "cross" ? "is-cross" : "is-check";
    addSketchUline(svg, {
      d: pathFromPoints(wobbleLine(x0, y, x1, y + (i % 2 === 0 ? 2 : -1), 8, 3.4, 10 + i * 3)),
      classes: `is-row-${i} ${kind}`,
    });
  });
}

async function load() {
  if (new URLSearchParams(location.search).get("view") === "portfolio") {
    splashEl?.remove();
    document.body.classList.remove("is-splash");
    setupPortfolioChrome();
    await initPortfolio();
    showHomeImmediate();
    return;
  }
  initUiSound();
  setupCoverFallbackUi();
  prefetchVoidAssets();

  const jobs = [
    fetch(layoutUrl).then((r) => r.json()),
    fetch(doorsUrl).then((r) => r.text()),
    fetch(lettersUrl).then((r) => r.json()),
    fetch(marksUrl).then((r) => r.json()),
    fetch(regionsUrl).then((r) => r.json()),
    fetch(railsUrl).then((r) => r.text()),
  ];

  const [layout, doorsXml, lettersData, marksData, regionsData, railsXml] =
    await Promise.all(jobs);

  const { w: AW, h: AH } = layout.meta.artboard;
  coverLayout = layout;

  setupLayers(layout, AW, AH);
  initVoidFlow();
  setupRails(railsXml);
  setupDoors(doorsXml);
  setupLetters(lettersData, AW, AH);
  setupIllustration(regionsData, AW, AH);
  setupMarks(marksData, AW, AH);
  setupSketchUnderlines(lettersData, marksData, layout, AW, AH);
  setupRouting();
  setupFlowerRow();
  setupPortfolioChrome();
  await initPortfolio();
  splashAssetsReady = true;

  await dismissSplash();

  console.info("[attic] cover ready", {
    letters: lettersData.letters.length,
    marks: marksData.marks.length,
    regions: regionsData.regions.length,
  });
}

load().catch((err) => {
  console.error(err);
  setupCoverFallbackUi();
  showCoverFallback();
  splashAssetsReady = true;
  dismissSplash();
});
