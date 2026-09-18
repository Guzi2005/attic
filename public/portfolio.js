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
  if (kind === "copy") {
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
  let breathI = 0;

  works.forEach((w, i) => {
    if (i > 0 && hashStr(`gap:${w.id}`) % 10 < 4) {
      frag.appendChild(makeBlankTile(pushI++, `blank-${breathI++}`));
    }
    if (i > 0 && i % 4 === 0) {
      frag.appendChild(makeBlankTile(pushI++, `mid-blank-${i}`));
    }
    const pieces = blocksOf(w);
    pieces.forEach((block, pi) => {
      frag.appendChild(
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
  });

  frag.appendChild(makeBlankTile(pushI++, "tail-blank"));

  grid.replaceChildren(frag);
  setupFolioFilters(grid);
  setupFolioEditorLaunch();
  setupPieceSizes(grid);
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
  const texts = splitBlurb(String(w.blurb || ""));
  return weaveBlocks(images, texts, w.id);
}

function splitBlurb(blurb) {
  const raw = blurb.trim();
  if (!raw) return [];
  const chunks = raw
    .split(/(?<=[。！？])|(?=——)/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (chunks.length <= 1) return [raw];
  const merged = [];
  chunks.forEach((part) => {
    const prev = merged[merged.length - 1];
    if (prev && prev.length < 42) merged[merged.length - 1] = prev + part;
    else merged.push(part);
  });
  if (merged.length > 3) {
    const head = merged.slice(0, 2);
    head.push(merged.slice(2).join(""));
    return head;
  }
  return merged;
}

function weaveBlocks(images, texts, id) {
  const imgs = images.map((src) => ({ type: "image", src }));
  const paras = texts.map((text) => ({ type: "text", text }));
  if (!imgs.length) return paras;
  if (!paras.length) return imgs;
  const pattern = hashStr(`weave:${id}`) % 5;
  if (pattern === 0) return [...imgs, ...paras];
  if (pattern === 1) return [...paras, ...imgs];
  if (pattern === 2) return zipLong(imgs, paras);
  if (pattern === 3) return zipLong(paras, imgs);
  const mid = Math.ceil(paras.length / 2);
  return [...paras.slice(0, mid), ...imgs, ...paras.slice(mid)];
}

function zipLong(a, b) {
  const out = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

function isFirstText(pieces, index) {
  return pieces[index]?.type === "text" && pieces.findIndex((p) => p.type === "text") === index;
}

function makePiece(w, block, meta) {
  const extras = extraLinks(w);
  const href = w.url || extras[0]?.url || null;
  const isText = block.type === "text";
  const card = document.createElement(isText && href && extras.length === 0 && meta.showTitle ? "a" : "article");
  card.className = `tile folio-card folio-piece folio-${isText ? "copy" : "pic"}`;
  card.dataset.source = w.source || "other";
  card.dataset.work = w.id;
  card.dataset.updated = String(w.updated || "");
  card.dataset.lead = meta.lead ? "1" : "0";
  card.dataset.tail = meta.tail ? "1" : "0";
  card.style.setProperty("--push-i", String(meta.pushI));
  applyFrame(card, `${w.id}:${meta.piece}:${block.type}`, isText ? "copy" : "pic");

  if (!isText && hashStr(`grain:${w.id}:${meta.piece}`) % 3 !== 0) {
    card.classList.add("has-local-grain");
  }

  if (card.tagName === "A" && href) {
    card.href = href;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
  }

  if (meta.lead) {
    const startEl = document.createElement("span");
    startEl.className = "folio-card__when folio-card__when--start";
    startEl.textContent = formatWhen(w.started);
    card.appendChild(startEl);
  }
  if (meta.tail) {
    const endEl = document.createElement("span");
    endEl.className = "folio-card__when folio-card__when--end";
    endEl.textContent = formatWhen(w.ended || w.updated);
    card.appendChild(endEl);
  }

  if (isText) {
    fillCopy(card, w, block, href, extras, meta);
  } else {
    fillPic(card, block, meta.index, meta.piece);
  }
  return card;
}

function fillPic(card, block, workIndex, pieceIndex) {
  const img = document.createElement("img");
  img.src = block.src;
  img.alt = "";
  img.loading = workIndex < 3 && pieceIndex === 0 ? "eager" : "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  card.appendChild(img);
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

function formatWhen(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const parts = s.split("-");
  if (parts.length === 3) return `${parts[0]}.${parts[1]}.${parts[2]}`;
  if (parts.length === 2) return `${parts[0]}.${parts[1]}`;
  return s;
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

function gridMetrics(grid) {
  const cs = getComputedStyle(grid);
  const cols = cs.gridTemplateColumns.split(" ").filter(Boolean).length || 6;
  const cell = parseFloat(cs.gridAutoRows) || parseFloat(cs.getPropertyValue("--cell")) || 32;
  const colGap = parseFloat(cs.columnGap) || 0;
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const inner = Math.max(1, grid.clientWidth - padL - padR);
  const colW = (inner - colGap * Math.max(0, cols - 1)) / cols;
  return { cols, cell, colGap, colW };
}

function setupPieceSizes(grid) {
  const sizeAll = () => {
    sizeCopyPieces(grid);
    grid.querySelectorAll(".folio-pic img").forEach((img) => {
      if (img.complete && img.naturalWidth) sizePicPiece(grid, img);
    });
  };

  grid.querySelectorAll(".folio-pic img").forEach((img) => {
    if (img.complete && img.naturalWidth) sizePicPiece(grid, img);
    else {
      img.addEventListener(
        "load",
        () => {
          sizePicPiece(grid, img);
        },
        { once: true }
      );
    }
  });

  sizeCopyPieces(grid);
  window.addEventListener("resize", sizeAll, { passive: true });
}

function sizePicPiece(grid, img) {
  const card = img.closest(".folio-pic");
  if (!card || !img.naturalWidth || !img.naturalHeight) return;
  const { cols, cell, colGap, colW } = gridMetrics(grid);
  const r = img.naturalWidth / img.naturalHeight;
  card.dataset.ratio = r.toFixed(3);

  let colSpan;
  if (cols <= 2) colSpan = r >= 1.2 ? Math.min(2, cols) : 1;
  else if (r >= 1.55) colSpan = Math.min(4, cols);
  else if (r >= 1.12) colSpan = Math.min(3, cols);
  else colSpan = 2;

  const pieceW = colSpan * colW + Math.max(0, colSpan - 1) * colGap;
  const pieceH = pieceW / r;
  const rowSpan = Math.max(4, Math.min(32, Math.round(pieceH / cell) + 1));
  card.style.gridColumn = `span ${colSpan}`;
  card.style.gridRow = `span ${rowSpan}`;
}

function sizeCopyPieces(grid) {
  const { cols, cell } = gridMetrics(grid);
  grid.querySelectorAll(".folio-copy").forEach((card) => {
    const len = (card.querySelector(".folio-card__blurb")?.textContent || "").length;
    let colSpan = len > 88 && len < 170 ? 3 : 2;
    if (cols <= 2) colSpan = 1;
    else colSpan = Math.min(colSpan, cols);
    card.style.gridColumn = `span ${colSpan}`;
    card.style.gridRow = "span 8";
    const h = card.scrollHeight;
    const rowSpan = Math.max(6, Math.ceil(h / cell) + 1);
    card.style.gridRow = `span ${rowSpan}`;
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
    grid.querySelectorAll(".folio-card").forEach((card) => {
      const show = source === "all" || card.dataset.source === source;
      card.hidden = !show;
    });
    grid.querySelectorAll(".folio-spacer").forEach((n) => {
      n.hidden = source !== "all";
    });
    requestAnimationFrame(() => {
      sizeCopyPieces(grid);
    });
  });
}
