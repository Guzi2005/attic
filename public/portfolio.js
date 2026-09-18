/**
 * Drafting-paper portfolio — each work breaks into free image/text pieces.
 * Door enter logic keeps using #home / .bento / .tile selectors.
 */

const FRAME_VARIANTS = ["clear", "outer", "grid", "underline"];
const NOTE_FRAMES = ["outer", "grid"];

/** FNV-1a — stable across reloads for the same key. */
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickFrame(key, kind) {
  if (kind === "date") return "clear";
  if (kind === "copy" || kind === "combo") {
    return NOTE_FRAMES[hashStr(`frame:${key}`) % NOTE_FRAMES.length];
  }
  return FRAME_VARIANTS[hashStr(`frame:${key}`) % FRAME_VARIANTS.length];
}

function applyFrame(el, key, kind) {
  const frame = pickFrame(key, kind);
  el.dataset.frame = frame;
  el.classList.add(`frame-${frame}`);
  return frame;
}

function makeBlankTile(pushI, key) {
  const el = document.createElement("div");
  el.className = "tile folio-spacer";
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("--push-i", String(pushI));
  const quiet = hashStr(`blank-frame:${key}`) % 2 === 0 ? "clear" : "underline";
  el.dataset.frame = quiet;
  el.classList.add(`frame-${quiet}`);
  const drop = hashStr(`blank-h:${key}`) % 3 !== 1;
  el.dataset.span = drop ? "drop" : "1x1";
  el.classList.add(drop ? "span-drop" : "span-1x1");
  return el;
}

export async function initPortfolio() {
  const grid = document.getElementById("works-grid");
  if (!grid) return;

  applyStaticFrames();

  /** @type {Array<Record<string, unknown>>} */
  let works = [];
  try {
    const res = await fetch(new URL("./works.json", import.meta.url));
    works = await res.json();
  } catch (err) {
    console.warn("[attic] works.json failed", err);
    grid.innerHTML =
      '<p class="folio-empty">作品清单暂时读不出来——过会儿再推门进来看看。</p>';
    return;
  }

  works = [...works].sort((a, b) =>
    String(b.updated || "").localeCompare(String(a.updated || ""))
  );

  const frag = document.createDocumentFragment();
  let pushI = 1;
  let seenYear = "";

  works.forEach((w, i) => {
    const cluster = makeCluster(w);
    const pieces = blocksOf(w);
    const year = String(w.updated || w.started || "").slice(0, 4);
    const startY = String(w.started || "").slice(0, 4);
    const endY = String(w.ended || w.updated || "").slice(0, 4);
    const showYear = Boolean(year && year !== seenYear) || Boolean(startY && endY && startY !== endY);
    if (year) seenYear = year;
    placeDateBlock(pieces, showYear);
    pieces.forEach((block, pi) => {
      cluster.appendChild(
        makePiece(w, block, {
          index: i,
          piece: pi,
          pushI: pushI++,
          lead: pi === 0,
          tail: pi === pieces.length - 1,
          showTitle: isFirstText(pieces, pi),
        })
      );
    });
    frag.appendChild(cluster);
  });

  grid.replaceChildren(frag);
  setupFolioFilters(grid);
  setupFolioEditorLaunch();
  setupPieceSizes(grid);
}

function makeCluster(w) {
  const el = document.createElement("section");
  el.className = "folio-cluster";
  el.dataset.work = w.id;
  el.dataset.source = w.source || "other";
  el.dataset.updated = String(w.updated || "");
  el.dataset.month = monthKey(w.updated || w.started);
  el.setAttribute("aria-label", String(w.title || w.id).replace(/\n/g, " "));
  return el;
}

function monthKey(value) {
  const s = String(value || "").trim();
  const [y, m] = s.split("-");
  if (!y) return "";
  if (!m) return y;
  return `${y}.${m.padStart(2, "0")}`;
}

/** @returns {Array<{type: string, src?: string, text?: string}>} */
function blocksOf(w) {
  if (Array.isArray(w.blocks) && w.blocks.length) {
    return w.blocks.filter((b) => b && (b.type === "image" ? b.src : b.text));
  }
  const images = [];
  if (w.image) images.push(String(w.image));
  if (Array.isArray(w.images)) {
    w.images.forEach((src) => {
      if (src && !images.includes(src)) images.push(String(src));
    });
  }
  const blurb = String(w.blurb || "").trim();
  // Prefer one combo card (image + copy) so wide cards can sit image|text on one row.
  // Extra images remain separate pic pieces.
  if (images.length && blurb) {
    const [head, ...rest] = images;
    return [{ type: "combo", src: head, text: blurb }, ...rest.map((src) => ({ type: "image", src }))];
  }
  if (images.length) return images.map((src) => ({ type: "image", src }));
  if (blurb) return [{ type: "text", text: blurb }];
  return [];
}

function isFirstText(pieces, index) {
  const t = pieces[index]?.type;
  if (t !== "text" && t !== "combo") return false;
  return pieces.findIndex((p) => p.type === "text" || p.type === "combo") === index;
}

function placeDateBlock(pieces, showYear) {
  const note = { type: "date", showYear };
  const imgAt = pieces.findIndex((p) => p.type === "image" || p.type === "combo");
  if (imgAt >= 0) pieces.splice(imgAt + 1, 0, note);
  else pieces.unshift(note);
}

function makePiece(w, block, meta) {
  const extras = extraLinks(w);
  const href = w.url || extras[0]?.url || null;
  const isText = block.type === "text";
  const isDate = block.type === "date";
  const isCombo = block.type === "combo";
  const kind = isDate ? "date" : isCombo ? "combo" : isText ? "copy" : "pic";
  const card = document.createElement(
    (isText || isCombo) && href && extras.length === 0 ? "a" : "article"
  );
  card.className = `tile folio-card folio-piece folio-${kind}`;
  card.dataset.source = w.source || "other";
  card.dataset.work = w.id;
  card.dataset.updated = String(w.updated || "");
  card.dataset.lead = meta.lead ? "1" : "0";
  card.style.setProperty("--push-i", String(meta.pushI));
  applyFrame(card, `${w.id}:${meta.piece}:${block.type}`, kind);

  if (isCombo) {
    const n = hashStr(`combo-span:${w.id}`) % 10;
    const span = n <= 2 ? "1x2" : n === 3 ? "2x1" : "1x1";
    card.dataset.span = span;
    card.classList.add(`span-${span}`);
  }

  if (!isText && !isDate && hashStr(`grain:${w.id}:${meta.piece}`) % 3 !== 0) {
    card.classList.add("has-local-grain");
  }

  if (card.tagName === "A" && href) {
    card.href = href;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
  }

  if (isDate) fillDate(card, w, block.showYear);
  else if (isCombo) fillCombo(card, w, block, href, extras, meta);
  else if (isText) fillCopy(card, w, block, href, extras, { ...meta, showTitle: true });
  else fillPic(card, block, meta.index, meta.piece);
  return card;
}

function fillDate(card, w, showYear) {
  const start = compactDate(w.started, showYear);
  const end = compactDate(w.ended || w.updated, showYear);
  if (start) {
    const a = document.createElement("span");
    a.className = "folio-date__n";
    a.textContent = start;
    card.appendChild(a);
  }
  if (end && end !== start) {
    const row = document.createElement("span");
    row.className = "folio-date__to";
    const arrow = document.createElement("span");
    arrow.className = "folio-date__arrow";
    arrow.textContent = "→";
    const b = document.createElement("span");
    b.className = "folio-date__n";
    b.textContent = end;
    row.append(arrow, b);
    card.appendChild(row);
  } else if (end && !start) {
    const b = document.createElement("span");
    b.className = "folio-date__n";
    b.textContent = end;
    card.appendChild(b);
  }
}

function fillPic(card, block, workIndex, pieceIndex) {
  const img = document.createElement("img");
  const src = String(block.src || "");
  img.src = src;
  img.alt = "";
  img.loading = workIndex < 3 && pieceIndex === 0 ? "eager" : "lazy";
  img.decoding = "async";
  img.referrerPolicy = src.includes("hdslb.com") ? "origin" : "no-referrer";
  card.appendChild(img);
}

function fillCombo(card, w, block, href, extras, meta) {
  const media = document.createElement("div");
  media.className = "folio-card__media";
  const img = document.createElement("img");
  const src = String(block.src || "");
  img.src = src;
  img.alt = "";
  img.loading = meta.index < 8 ? "eager" : "lazy";
  img.decoding = "async";
  img.referrerPolicy = src.includes("hdslb.com") ? "origin" : "no-referrer";
  media.appendChild(img);
  card.appendChild(media);
  fillCopy(card, w, { type: "text", text: block.text }, href, extras, {
    ...meta,
    showTitle: true,
  });
}

function fillCopy(card, w, block, href, extras, meta) {
  const body = document.createElement("div");
  body.className = "folio-card__body";

  if (meta.showTitle) {
    const title = document.createElement("h3");
    title.className = "folio-card__title";
    title.textContent = String(w.title || "").replace(/\n/g, " / ");
    body.appendChild(title);
  }

  const blurb = document.createElement("p");
  blurb.className = "folio-card__blurb";
  blurb.textContent = String(block.text || "");
  body.appendChild(blurb);

  if (meta.showTitle && w.tags?.length) {
    const tags = document.createElement("p");
    tags.className = "folio-card__tags";
    tags.textContent = [sourceLabel(w.source), ...(w.tags || [])]
      .filter(Boolean)
      .join(" · ");
    body.appendChild(tags);
  }

  if (meta.showTitle) {
    const multi = extras.length > 0;
    if (multi) {
      const linksEl = document.createElement("p");
      linksEl.className = "folio-card__links";
      const shown = [];
      if (href) {
        const listed = (w.links || []).find((l) => l.url === href);
        shown.push({
          kind: listed?.kind || "primary",
          label: listed?.label || linkLabel({ url: href }),
          url: href,
        });
      }
      extras.forEach((l) => {
        if (!shown.some((s) => s.url === l.url)) shown.push(l);
      });
      shown.forEach((l) => {
        const a = document.createElement("a");
        a.className = "folio-card__link";
        a.href = l.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = l.label || linkLabel(l);
        a.dataset.kind = l.kind || "";
        linksEl.appendChild(a);
      });
      body.appendChild(linksEl);
    } else if (href && card.tagName !== "A") {
      const a = document.createElement("a");
      a.className = "folio-card__cta";
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "READ MORE";
      body.appendChild(a);
    } else if (href) {
      const cta = document.createElement("span");
      cta.className = "folio-card__cta";
      cta.textContent = "READ MORE";
      body.appendChild(cta);
    }
  }

  card.appendChild(body);
}

function compactDate(value, withYear) {
  const s = String(value || "").trim();
  if (!s) return "";
  const [y, m, d] = s.split("-");
  const mm = m ? m.padStart(2, "0") : "";
  const dd = d ? d.padStart(2, "0") : "";
  const tail = dd ? `${mm}.${dd}` : mm;
  if (!tail) return withYear ? y : "";
  return withYear ? `${y}.${tail}` : tail;
}

function sourceLabel(source) {
  if (source === "bugoo") return "Bugoo";
  if (source === "fluorescentmice") return "fluorescentmice";
  if (source === "cursor") return "Cursor";
  if (source === "bilibili") return "Bilibili";
  return source || "";
}

function extraLinks(w) {
  return (Array.isArray(w.links) ? w.links : []).filter((l) => l && l.url && l.url !== w.url);
}

function linkLabel(l) {
  if (l.label) return l.label;
  const kind = l.kind || "";
  if (kind === "github") return "GitHub";
  if (kind === "bilibili") return "Bilibili";
  if (kind === "live") return "站点";
  if (kind === "bugoo") return "Bugoo";
  if (kind === "itch") return "Itch";
  if (kind === "store") return "商店";
  const u = String(l.url || "");
  if (u.includes("github.com")) return "GitHub";
  if (u.includes("bilibili.com")) return "Bilibili";
  if (u.includes("itch.io")) return "Itch";
  return "打开";
}

function gridMetrics(scope) {
  const cs = getComputedStyle(scope);
  const cols = cs.gridTemplateColumns.split(" ").filter(Boolean).length || 6;
  const cell = parseFloat(cs.gridAutoRows) || parseFloat(cs.getPropertyValue("--cell")) || 32;
  const colGap = parseFloat(cs.columnGap) || 0;
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const inner = Math.max(1, scope.clientWidth - padL - padR);
  const colW = (inner - colGap * Math.max(0, cols - 1)) / cols;
  return { cols, cell, colGap, colW };
}

function visibleClusters(grid) {
  return [...grid.querySelectorAll(".folio-cluster")].filter((c) => !c.hidden);
}

function setupPieceSizes(grid) {
  const board = grid.closest(".folio-board") || grid;
  const sizeAll = () => {
    visibleClusters(grid).forEach((cluster) => {
      sizeComboPieces(cluster);
      sizeCopyPieces(cluster);
      sizeDatePieces(cluster);
      cluster.querySelectorAll(".folio-pic img").forEach((img) => {
        if (img.complete && img.naturalWidth) sizePicPiece(cluster, img);
      });
    });
    layoutTimeline(board, grid);
  };

  grid.querySelectorAll(".folio-pic img, .folio-combo img").forEach((img) => {
    const cluster = img.closest(".folio-cluster") || grid;
    const onReady = () => {
      if (img.closest(".folio-pic")) sizePicPiece(cluster, img);
      else sizeComboPieces(cluster);
      layoutTimeline(board, grid);
    };
    if (img.complete && img.naturalWidth) onReady();
    else img.addEventListener("load", onReady, { once: true });
  });

  sizeAll();
  window.addEventListener("resize", sizeAll, { passive: true });
}

function sizeComboPieces(scope) {
  const { cols, cell } = gridMetrics(scope);
  scope.querySelectorAll(".folio-combo").forEach((card) => {
    const span = card.dataset.span || "1x1";
    let colSpan = 2;
    let rowSpan = 8;
    if (span === "1x2") {
      colSpan = cols <= 2 ? Math.min(2, cols) : Math.max(2, cols - 2);
      rowSpan = 8;
    } else if (span === "2x1") {
      colSpan = cols <= 2 ? 1 : 2;
      rowSpan = 14;
    } else {
      colSpan = cols <= 2 ? 1 : 2;
      rowSpan = 10;
    }
    card.style.gridColumn = `span ${colSpan}`;
    if (!cell) {
      card.style.gridRow = "auto";
      return;
    }
    // measure after layout class applied
    card.style.gridRow = `span ${rowSpan}`;
    const h = card.scrollHeight;
    const measured = Math.max(rowSpan, Math.ceil(h / cell) + 1);
    card.style.gridRow = `span ${Math.min(28, measured)}`;
  });
}

function sizePicPiece(scope, img) {
  const card = img.closest(".folio-pic");
  if (!card || !img.naturalWidth || !img.naturalHeight) return;
  const { cols, cell, colGap, colW } = gridMetrics(scope);
  const r = img.naturalWidth / img.naturalHeight;
  card.dataset.ratio = r.toFixed(3);
  if (!cell) {
    card.style.gridColumn = `span ${Math.min(cols, r >= 1.2 ? cols : 1)}`;
    card.style.gridRow = "auto";
    return;
  }

  let colSpan;
  if (cols <= 2) colSpan = r >= 1.2 ? Math.min(2, cols) : 1;
  else if (r >= 1.55) colSpan = Math.min(3, cols);
  else if (r >= 1.12) colSpan = Math.min(3, cols);
  else colSpan = 2;

  const pieceW = colSpan * colW + Math.max(0, colSpan - 1) * colGap;
  const pieceH = pieceW / r;
  const rowSpan = Math.max(4, Math.min(32, Math.round(pieceH / cell) + 1));
  card.style.gridColumn = `span ${colSpan}`;
  card.style.gridRow = `span ${rowSpan}`;
}

function sizeCopyPieces(scope) {
  const { cols, cell } = gridMetrics(scope);
  scope.querySelectorAll(".folio-copy").forEach((card) => {
    const len = (card.querySelector(".folio-card__blurb")?.textContent || "").length;
    let colSpan = len > 88 && len < 170 ? 3 : 2;
    if (cols <= 2) colSpan = 1;
    else colSpan = Math.min(colSpan, cols);
    card.style.gridColumn = `span ${colSpan}`;
    if (!cell) {
      card.style.gridRow = "auto";
      return;
    }
    card.style.gridRow = "span 8";
    const h = card.scrollHeight;
    const rowSpan = Math.max(4, Math.ceil(h / cell) + 1);
    card.style.gridRow = `span ${rowSpan}`;
  });
}

function sizeDatePieces(scope) {
  const { cols, cell } = gridMetrics(scope);
  scope.querySelectorAll(".folio-date").forEach((card) => {
    const colSpan = cols <= 2 ? 1 : 2;
    card.style.gridColumn = `span ${colSpan}`;
    if (!cell) {
      card.style.gridRow = "auto";
      return;
    }
    const h = card.scrollHeight;
    card.style.gridRow = `span ${Math.max(5, Math.ceil(h / cell) + 1)}`;
  });
}

function layoutTimeline(board, grid) {
  const rail = document.getElementById("folio-rail");
  if (!rail || !board) return;
  rail.replaceChildren();
  const line = document.createElement("div");
  line.className = "folio-rail__line";
  rail.appendChild(line);

  const clusters = visibleClusters(grid);
  if (!clusters.length) return;

  const boardTop = board.getBoundingClientRect().top;
  let seenYear = "";
  let seenMonth = "";

  clusters.forEach((cluster) => {
    const r = cluster.getBoundingClientRect();
    const y = Math.max(0, r.top - boardTop + 10);
    const month = cluster.dataset.month || "";
    const year = month.slice(0, 4);

    const dot = document.createElement("span");
    dot.className = "folio-rail__dot";
    dot.style.top = `${y}px`;
    rail.appendChild(dot);

    if (month && month !== seenMonth) {
      const tick = document.createElement("span");
      tick.className = "folio-rail__tick";
      tick.textContent = year && year !== seenYear ? month : month.slice(5);
      tick.style.top = `${y}px`;
      rail.appendChild(tick);
      seenMonth = month;
      if (year) seenYear = year;
    }
  });
}

function setupFolioEditorLaunch() {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!local) return;
  const foot = document.querySelector(".home-foot");
  if (!foot || foot.querySelector(".folio-edit-launch")) return;
  const a = document.createElement("a");
  a.className = "folio-edit-launch";
  a.href = "./folio-edit.html";
  a.textContent = "维护作品";
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const popup = window.open(
      "./folio-edit.html",
      "attic-folio-edit",
      "width=1180,height=820,noopener"
    );
    if (!popup) window.location.href = "./folio-edit.html";
  });
  foot.appendChild(a);
}

function applyStaticFrames() {
  const hello = document.querySelector(".home-hello");
  const label = document.querySelector(".folio-section-label");
  const filters = document.querySelector(".folio-filters");
  const foot = document.querySelector(".home-foot");
  if (hello) applyFrame(hello, "hello");
  if (label) applyFrame(label, "section-label");
  if (filters) applyFrame(filters, "filters");
  if (foot) applyFrame(foot, "foot");
}

function setupFolioFilters(grid) {
  const bar = document.getElementById("folio-filters");
  if (!bar || bar.dataset.ready === "1") return;
  bar.dataset.ready = "1";

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest(".folio-filter");
    if (!btn) return;
    const source = btn.dataset.source || "all";
    bar.querySelectorAll(".folio-filter").forEach((el) => {
      const on = el === btn;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
    grid.querySelectorAll(".folio-cluster").forEach((cluster) => {
      const show = source === "all" || cluster.dataset.source === source;
      cluster.hidden = !show;
    });
    requestAnimationFrame(() => {
      visibleClusters(grid).forEach((cluster) => {
        sizeCopyPieces(cluster);
        sizeDatePieces(cluster);
        cluster.querySelectorAll(".folio-pic img").forEach((img) => {
          if (img.complete && img.naturalWidth) sizePicPiece(cluster, img);
        });
      });
      layoutTimeline(grid.closest(".folio-board") || grid, grid);
    });
  });
}
