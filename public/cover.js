const layoutUrl = new URL("./cover-layout.json", import.meta.url);
const doorsUrl = new URL("./doors.svg", import.meta.url);
const lettersUrl = new URL("./letters.json", import.meta.url);
const marksUrl = new URL("./marks.json", import.meta.url);
const regionsUrl = new URL("./illustration-regions.json", import.meta.url);
const railsUrl = new URL("./frame-rails.svg", import.meta.url);

const artboard = document.getElementById("artboard");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

function setupRails(railsXml) {
  const host = artboard.querySelector(".frame-rails");
  if (!host) return;
  const parsed = new DOMParser().parseFromString(railsXml, "image/svg+xml");
  const srcSvg = parsed.querySelector("svg");
  if (!srcSvg) return;
  // keep host viewBox; inject paths
  host.innerHTML = "";
  for (const path of srcSvg.querySelectorAll("path")) {
    host.appendChild(document.importNode(path, true));
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
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    leftLink?.setAttribute("href", "#enter-left");
    rightLink?.setAttribute("href", "#enter-right");
  }
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
  // slightly expand clips so diagonal seams don't flash page bg as white edges
  const clipExpand = 1.045;

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

    // cast only paints onto neighbors (full board minus own footprint)
    const castClip = document.createElementNS(svgNS, "clipPath");
    castClip.setAttribute("id", `cast-onto-${region.id}`);
    castClip.setAttribute("clipPathUnits", "userSpaceOnUse");
    castClip.setAttribute("clip-rule", "evenodd");
    const board = document.createElementNS(svgNS, "path");
    board.setAttribute("d", `M0 0H${w}V${h}H0Z`);
    const hole = document.createElementNS(svgNS, "path");
    hole.setAttribute("d", region.localPath);
    castClip.append(board, hole);
    defs.appendChild(castClip);
  }
  svg.appendChild(defs);

  const padD = regionsData.padShadowPath;
  // Fixed pad: rounded continuous silhouette under pieces (no pokey corners)
  const floorLayer = document.createElementNS(svgNS, "g");
  floorLayer.classList.add("illu-floor");
  if (padD) {
    const basePad = document.createElementNS(svgNS, "path");
    basePad.classList.add("illu-pad");
    basePad.setAttribute("d", padD);
    floorLayer.appendChild(basePad);

    // per-region brightness boost while that piece is lifted
    for (const region of regionsData.regions) {
      const lit = document.createElementNS(svgNS, "g");
      lit.classList.add("illu-pad-lit");
      lit.dataset.region = region.id;
      lit.setAttribute("clip-path", `url(#clip-${region.id})`);
      const litPath = document.createElementNS(svgNS, "path");
      litPath.setAttribute("d", padD);
      lit.appendChild(litPath);
      floorLayer.appendChild(lit);
    }
  }

  const pieceLayer = document.createElementNS(svgNS, "g");
  pieceLayer.classList.add("tri-pieces");
  const castLayer = document.createElementNS(svgNS, "g");
  castLayer.classList.add("tri-casts");
  const liftLayer = document.createElementNS(svgNS, "g");
  liftLayer.classList.add("tri-lifted");
  const hitLayer = document.createElementNS(svgNS, "g");
  hitLayer.classList.add("tri-hits");

  const order = ["bottom", "left", "right", "top"];
  // unit vectors from each piece toward diagonal cross (inward cast)
  const inward = {
    top: [0, 1],
    bottom: [0, -1],
    left: [1, 0],
    right: [-1, 0],
  };
  const castDist = 18;
  const byId = Object.fromEntries(regionsData.regions.map((r) => [r.id, r]));
  const visuals = {};
  const casts = {};
  const padLits = {};
  for (const el of floorLayer.querySelectorAll(".illu-pad-lit")) {
    padLits[el.dataset.region] = el;
  }
  const hovered = new Set();

  const doorRegions = () => {
    if (artboard.classList.contains("is-hover-left")) return ["right", "bottom"];
    if (artboard.classList.contains("is-hover-right")) return ["top", "left"];
    return [];
  };

  const syncLift = () => {
    const fromDoor = new Set(doorRegions());
    for (const id of order) {
      const on = hovered.has(id) || fromDoor.has(id);
      const visual = visuals[id];
      const cast = casts[id];
      if (!visual) continue;
      visual.classList.toggle("is-up", on);
      cast?.classList.toggle("is-on", on);
      padLits[id]?.classList.toggle("is-bright", on);
      (on ? liftLayer : pieceLayer).appendChild(visual);
      if (on && cast) castLayer.appendChild(cast);
    }
  };

  for (const id of order) {
    const region = byId[id];
    if (!region) continue;

    const visual = document.createElementNS(svgNS, "g");
    visual.classList.add("tri-visual");
    visual.dataset.region = id;
    visual.setAttribute("clip-path", `url(#clip-${id})`);
    visual.style.transformOrigin = `${cx}px ${cy}px`;
    const image = document.createElementNS(svgNS, "image");
    image.setAttribute("href", imgSrc);
    image.setAttributeNS(xlinkNS, "href", imgSrc);
    image.setAttribute("width", String(w));
    image.setAttribute("height", String(h));
    image.setAttribute("preserveAspectRatio", "none");
    visual.appendChild(image);
    pieceLayer.appendChild(visual);
    visuals[id] = visual;

    const castG = document.createElementNS(svgNS, "g");
    castG.classList.add("tri-cast");
    castG.dataset.region = id;
    castG.setAttribute("clip-path", `url(#cast-onto-${id})`);
    const [ix, iy] = inward[id] || [0, 0];
    castG.style.setProperty("--cast-x", `${ix * castDist}px`);
    castG.style.setProperty("--cast-y", `${iy * castDist}px`);
    const castPath = document.createElementNS(svgNS, "path");
    castPath.classList.add("tri-cast-shape");
    castPath.setAttribute("d", region.localPath);
    castG.appendChild(castPath);
    castLayer.appendChild(castG);
    casts[id] = castG;

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

  // floor → resting pieces → inward casts on neighbors → lifted pieces → hits
  svg.append(floorLayer, pieceLayer, castLayer, liftLayer, hitLayer);
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

  setupLayers(layout, AW, AH);
  setupRails(railsXml);
  setupDoors(doorsXml);
  setupLetters(lettersData, AW, AH);
  setupIllustration(regionsData, AW, AH);
  setupMarks(marksData, AW, AH);
  setupSketchUnderlines(lettersData, marksData, layout, AW, AH);

  // kick entrance animations after first paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      artboard.classList.add("is-ready");
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
