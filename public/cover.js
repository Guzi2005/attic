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

function setupLayers(layout, AW, AH) {
  const skip = new Set([
    "text-youre-now-at",
    "center-illustration",
    "checklist-marks",
  ]);

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
      }
      continue;
    }

    const nodes = artboard.querySelectorAll(`[data-layer="${name}"]`);
    for (const el of nodes) {
      placeBox(el, place, AW, AH);
      el.src = src;
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

/**
 * Portrait voids: at most 2 swallow rows.
 * 1 row  → hug artboard
 * 2 rows → artboard + outer edge
 * 3+ fit → outer edge + next inward (skip artboard-adjacent)
 */
function layoutVoidPatterns() {
  const stage = document.getElementById("stage");
  const top = document.querySelector(".stage-void-top");
  const bot = document.querySelector(".stage-void-bot");
  if (!stage || !artboard || !top || !bot) return;

  const sr = stage.getBoundingClientRect();
  const ar = artboard.getBoundingClientRect();
  const voidH = Math.max(0, (sr.height - ar.height) / 2);
  const tile = Math.round(
    Math.min(168, Math.max(48, Math.min(sr.width, window.innerWidth) * 0.18))
  );

  document.documentElement.style.setProperty("--void-tile", `${tile}px`);

  top.style.height = `${voidH}px`;
  bot.style.height = `${voidH}px`;

  const rowsFit = Math.floor(voidH / tile + 1e-6);
  const edgePair = rowsFit >= 3;
  const dual = !edgePair && rowsFit >= 2;

  for (const el of [top, bot]) {
    el.classList.toggle("is-dual", dual);
    el.classList.toggle("is-edge-pair", edgePair);
  }
}

function layoutRailsBleed() {
  const bleed = document.getElementById("rails-bleed");
  const stage = document.getElementById("stage");
  if (!bleed || !stage || !artboard) return;

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
  camera.style.setProperty("--cam-x", `${(50 - m.cx) * 0.22}%`);
  camera.style.setProperty("--cam-y", `${(50 - m.cy) * 0.12}%`);
  camera.style.transformOrigin = `${m.cx}% ${m.cy}%`;

  const hingeXPct = `${(m.hingeX / 2880) * 100}%`;
  const hingeYPct = `${(m.hingeY / 1920) * 100}%`;
  artboard.style.setProperty("--door-hinge-x", hingeXPct);
  artboard.style.setProperty("--door-hinge-y", hingeYPct);
  if (pivotRoot) {
    pivotRoot.style.transformOrigin = `${hingeXPct} ${hingeYPct}`;
  }

  artboard.classList.remove("is-hover-left", "is-hover-right");
  artboard.classList.add(
    "is-entering",
    side === "left" ? "is-enter-left" : "is-enter-right"
  );
  stage?.classList.add("is-exiting");

  const finish = () => {
    document.body.classList.add("is-on-home");
    home?.classList.add("is-visible");
    home?.setAttribute("aria-hidden", "false");
    if (location.hash !== "#home") {
      history.pushState({ view: "home" }, "", "#home");
    }
  };

  if (reduceMotion) {
    flash?.classList.remove("is-burst");
    finish();
    return;
  }

  requestAnimationFrame(() => {
    camera.classList.add("is-zooming");
  });

  window.setTimeout(() => {
    flash?.classList.add("is-burst");
  }, 1050);

  window.setTimeout(() => {
    finish();
  }, 1280);
}

function showHomeImmediate() {
  const home = document.getElementById("home");
  document.body.classList.add("is-on-home");
  home?.classList.add("is-visible");
  home?.setAttribute("aria-hidden", "false");
}

function setupRouting() {
  if (location.hash === "#home") {
    showHomeImmediate();
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
    img.alt = letter.char === "apos" ? "'" : letter.char.replace(/\d/g, "");
    img.draggable = false;

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
  const clipExpand = 1.14;

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
  floorLayer.appendChild(basePad);

  // lift = nearby lightens (same inset pad, brighter in that region)
  for (const region of regionsData.regions) {
    const lit = document.createElementNS(svgNS, "g");
    lit.classList.add("illu-pad-lit");
    lit.dataset.region = region.id;
    lit.setAttribute("clip-path", `url(#clip-${region.id})`);
    const litImg = document.createElementNS(svgNS, "image");
    placePadImage(litImg);
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

    const ink = document.createElement("img");
    ink.className = "mark-ink";
    ink.src = src;
    ink.alt = mark.kind === "cross" ? "x" : "check";
    ink.draggable = false;

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
    el.addEventListener("pointerenter", () => artboard.classList.add(cls));
    el.addEventListener("pointerleave", () => artboard.classList.remove(cls));
    el.addEventListener("focus", () => artboard.classList.add(cls));
    el.addEventListener("blur", () => artboard.classList.remove(cls));
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
  const [layout, doorsXml, lettersData, marksData, regionsData, railsXml] = await Promise.all([
    fetch(layoutUrl).then((r) => r.json()),
    fetch(doorsUrl).then((r) => r.text()),
    fetch(lettersUrl).then((r) => r.json()),
    fetch(marksUrl).then((r) => r.json()),
    fetch(regionsUrl).then((r) => r.json()),
    fetch(railsUrl).then((r) => r.text()),
  ]);

  const { w: AW, h: AH } = layout.meta.artboard;
  coverLayout = layout;

  setupLayers(layout, AW, AH);
  setupRails(railsXml);
  setupDoors(doorsXml);
  setupLetters(lettersData, AW, AH);
  setupIllustration(regionsData, AW, AH);
  setupMarks(marksData, AW, AH);
  setupSketchUnderlines(lettersData, marksData, layout, AW, AH);
  setupRouting();

  // kick entrance animations after first paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!document.body.classList.contains("is-on-home")) {
        artboard.classList.add("is-ready");
      }
    });
  });

  console.info("[attic] cover ready", {
    letters: lettersData.letters.length,
    marks: marksData.marks.length,
    regions: regionsData.regions.length,
  });
}

load().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<pre style="color:#900;padding:1rem;white-space:pre-wrap">${err}</pre>`
  );
});
