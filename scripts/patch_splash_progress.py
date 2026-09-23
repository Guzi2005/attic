from pathlib import Path

p = Path(r"D:\D盘桌面\attic\public\cover.js")
text = p.read_text(encoding="utf-8")
start = text.index("/* —— Splash loader (bloom + text progress) —— */")
end = text.index("const layoutUrl = new URL")
new = r'''/* —— Splash loader (bloom + embroidered text progress) —— */
const splashEl = document.getElementById("splash");
const splashWelcome = document.getElementById("splash-welcome");
const splashReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Keep in sync with splash.css:
 * last small = pair7 * 48 + 36 + 420 + 72 + 360 = 1224ms
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
  if (splashWelcome) splashWelcome.style.setProperty("--splash-p", String(v));
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

  await new Promise((r) => window.setTimeout(r, splashReduceMotion ? 40 : 160));

  splashEl.classList.add("is-done");
  document.body.classList.remove("is-splash");

  await new Promise((resolve) => {
    const done = () => {
      splashEl.removeEventListener("transitionend", onEnd);
      resolve();
    };
    const onEnd = (e) => {
      if (e.propertyName === "opacity") done();
    };
    splashEl.addEventListener("transitionend", onEnd);
    window.setTimeout(done, 900);
  });
}

startSplashBloom();

'''
p.write_text(text[:start] + new + text[end:], encoding="utf-8")
print("replaced", start, end)
