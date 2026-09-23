/**
 * Folio: month-stacked sticky calendar (Lama Lama push) + one relaxed screen per work.
 * Door enter still uses #home / .bento / .tile.
 */

import { linkKey } from './folio-links.js';
const NOTE_FRAMES = ["outer", "grid"];
let imageSizes = {};
export function setImageSizes(sizes) { imageSizes = { ...imageSizes, ...sizes }; }

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function applyFrame(el, key, kind) {
  const frame =
    kind === "copy"
      ? NOTE_FRAMES[hashStr(`frame:${key}`) % NOTE_FRAMES.length]
      : "clear";
  el.dataset.frame = frame;
  el.classList.add(`frame-${frame}`);
  return frame;
}

export async function initPortfolio() {
  const grid = document.getElementById("works-grid");
  if (!grid) return;

  applyStaticFrames();
  try {
    imageSizes = await fetch(new URL('./folio-image-sizes.json', import.meta.url), { cache: 'no-store' }).then(r => r.json());
  } catch { /* Natural image dimensions remain the fallback. */ }

  /** @type {Array<Record<string, unknown>>} */
  let works = [];
  try {
    const res = await fetch(new URL("./works.json", import.meta.url), { cache: 'no-store' });
    works = await res.json();
  } catch (err) {
    console.warn("[attic] works.json failed", err);
    grid.innerHTML =
      '<p class="folio-empty">作品清单暂时读不出来——过会儿再推门进来看看。</p>';
    return;
  }

  try {
    const media = await fetch(new URL('./folio-media.json', import.meta.url), { cache: 'no-store' }).then(r => r.json());
    works = works.map(w => ({ ...w, images: [...(w.images || []), ...(w.media_override ? [] : media[w.id] || []).map(item => item.src)] }));
  } catch (err) { console.warn('[attic] supplementary media unavailable', err); }

  for (const w of works) {
    if (w?.blurb_note) {
      console.warn(`[attic] works.json ${w.id}: ${w.blurb_note}`);
    }
  }

  works = [...works].sort((a, b) => {
    const born = String(b.started || b.updated || "").localeCompare(String(a.started || a.updated || ""));
    if (born) return born;
    return String(b.updated || "").localeCompare(String(a.updated || ""));
  });

  // Keep every member as a complete work, anchored beneath its founding work.
  const byId = new Map(works.map(w => [w.id, w]));
  const children = new Map();
  works.forEach(w => {
    if (!w.series_parent || !byId.has(w.series_parent) || w.series_parent === w.id) return;
    const members = children.get(w.series_parent) || [];
    members.push(w);
    children.set(w.series_parent, members);
  });
  works.forEach(w => { w.series_members = (children.get(w.id) || []).sort((a, b) => bornOf(a).localeCompare(bornOf(b))); });
  works = works.filter(w => !w.series_parent || !byId.has(w.series_parent));
  const frag = document.createDocumentFragment();
  let index = 0;
  const planned = works.filter(w => w.status === 'planned');
  if (planned.length) {
    frag.appendChild(makeYear({ year: '计划', months: [{ key: '计划-—', items: planned }] }, index));
    index += planned.length;
  }
  const undated = works.filter(w => w.status !== 'planned' && !bornOf(w));
  if (undated.length) {
    frag.appendChild(makeYear({year:'未定',months:[{key:'未定-—',items:undated}]},index));
    index += undated.length;
  }
  groupByYear(works.filter(w => w.status !== 'planned' && bornOf(w))).forEach((year) => {
    frag.appendChild(makeYear(year, index));
    year.months.forEach((month) => {
      index += month.items.length;
    });
  });
  grid.replaceChildren(frag);

  setupFolioFilters(grid);
  setupFolioEditorLaunch();
}

function bornOf(w) {
  return String(w.started || w.updated || "").trim();
}

function untilOf(w) {
  return String(w.ended || w.updated || "").trim();
}

function dateParts(value) {
  const [y, m, d] = String(value || "").split("-");
  return {
    y: y || "",
    m: m ? m.padStart(2, "0") : "",
    d: d ? d.padStart(2, "0") : "",
  };
}

function completeParts(value, fallback) {
  const born = dateParts(value);
  const fb = dateParts(fallback || "");
  const y = born.y || fb.y || "0000";
  const m = born.m || fb.m || "01";
  let d = born.d;
  if (!d) d = "—";
  return { y, m, d };
}

function monthKey(parts) {
  return `${parts.y}-${parts.m}`;
}

function groupByMonth(works) {
  const groups = [];
  works.forEach((w) => {
    const parts = completeParts(bornOf(w), untilOf(w));
    const key = monthKey(parts);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(w);
    else groups.push({ key, items: [w] });
  });
  return groups;
}

function groupByYear(works) {
  const years = [];
  groupByMonth(works).forEach((month) => {
    const year = month.key.slice(0, 4);
    const last = years[years.length - 1];
    if (last && last.year === year) last.months.push(month);
    else years.push({ year, months: [month] });
  });
  return years;
}

function compactStamp(value, withYear) {
  const { y, m, d } = dateParts(value);
  if (!m) return withYear ? y : "";
  const tail = d ? `${m}.${d}` : m;
  return withYear ? `${y}.${tail}` : tail;
}

function srcKey(src) {
  const raw = String(src || "").trim().split("?")[0].replace(/\\/g, "/");
  if (!raw) return "";
  const base = raw.split("/").pop() || raw;
  return base.toLowerCase();
}

function relatedImages(w) {
  const seen = new Set([srcKey(w.image)].filter(Boolean));
  const out = [];
  const add = (src) => {
    const s = String(src || "").trim();
    const key = srcKey(s);
    if (!s || !key || seen.has(key) || s === String(w.image || "").trim()) return;
    seen.add(key);
    out.push(s);
  };
  (Array.isArray(w.images) ? w.images : []).forEach(add);
  (Array.isArray(w.blocks) ? w.blocks : []).forEach((b) => {
    if (b && b.type === "image") add(b.src);
  });
  return out;
}

function makeYear(group, startIndex) {
  const section = document.createElement("section");
  section.className = "folio-year";
  section.dataset.year = group.year;

  const mark = document.createElement("aside");
  mark.className = "folio-year__mark";
  mark.setAttribute("aria-label", group.year === '计划' ? '计划中项目' : `${group.year}年`);
  mark.textContent = group.year;

  const body = document.createElement("div");
  body.className = "folio-year__body";
  let index = startIndex;
  group.months.forEach((month) => {
    body.appendChild(makeMonth(month, index));
    index += month.items.length;
  });

  section.append(mark, body);
  return section;
}

function makeMonth(group, startIndex) {
  const section = document.createElement("section");
  section.className = "folio-month";
  section.dataset.month = group.key;
  const mark = document.createElement('aside');
  mark.className = 'folio-month__mark';
  mark.textContent = group.key.split('-')[1];
  mark.setAttribute('aria-label', `${mark.textContent}月`);
  const body = document.createElement('div');
  body.className = 'folio-month__body';
  group.items.forEach((w, j) => {
    body.appendChild(makeSeries(w, startIndex + j));
  });
  section.append(mark, body);
  return section;
}

function makeSeries(w, index) {
  if (!w.series_members?.length) return makeSlide(w, index);
  const group = document.createElement('section');
  group.className = 'folio-series';
  group.dataset.series = w.id;
  group.setAttribute('aria-label', w.series_title || w.title);
  const label = document.createElement('p');
  label.className = 'folio-series__label';
  label.textContent = `${w.series_title || w.title} · ${w.series_members.length + 1} 件作品`;
  group.append(label, makeSlide(w, index));
  const branch = document.createElement('div');
  branch.className = 'folio-series__branch';
  w.series_members.forEach((member, i) => {
    const article = makeSlide(member, index + i + 1);
    article.classList.add('folio-slide--member');
    article.querySelector('.folio-tab__day').textContent = compactStamp(bornOf(member), true);
    branch.append(article);
  });
  group.append(branch);
  return group;
}

function classifyAr(w, h) {
  if (!w || !h) return "sq";
  const ar = w / h;
  if (ar >= 1.15) return "land";
  if (ar <= 0.88) return "port";
  return "sq";
}

function makeFig(src, kind, eager, title, number) {
  const fig = document.createElement("figure");
  fig.className = `folio-mag__fig folio-mag__fig--${kind}`;
  const img = document.createElement("img");
  img.src = src;
  img.alt = `${title} · 图 ${String(number).padStart(2, '0')}`;
  img.loading = eager ? "eager" : "lazy";
  img.decoding = "async";
  const size = imageSizes[src];
  if (size) {
    [img.width, img.height] = size;
    fig.dataset.ar = classifyAr(...size);
  }
  const applyAr = () => {
    fig.dataset.ar = classifyAr(img.naturalWidth, img.naturalHeight);
  };
  if (img.complete && img.naturalWidth) applyAr();
  else img.addEventListener("load", applyAr, { once: true });
  img.addEventListener("error", () => {
    const slide = fig.closest(".folio-slide");
    fig.remove();
    if (slide && !slide.querySelector(".folio-mag__fig")) slide.classList.add("folio-slide--text");
  }, { once: true });
  fig.appendChild(img);
  const caption = document.createElement('figcaption');
  caption.textContent = `${String(number).padStart(2, '0')} / ${kind === 'cover' ? 'OVERVIEW' : 'DETAIL'}`;
  fig.appendChild(caption);
  return fig;
}

export function makeSlide(w, index = 0) {
  if (w.image_sizes) setImageSizes(w.image_sizes);
  const parts = completeParts(bornOf(w), untilOf(w));
  const slide = document.createElement("article");
  slide.className = "tile folio-slide";
  slide.dataset.category = w.category || "tools";
  slide.dataset.work = w.id;
  slide.dataset.born = bornOf(w);
  slide.dataset.until = untilOf(w);
  slide.dataset.y = parts.y;
  slide.dataset.m = parts.m;
  slide.dataset.d = parts.d;
  slide.dataset.mag = String(index % 3);
  slide.style.setProperty("--push-i", String(index + 1));

  const tab = document.createElement("header");
  tab.className = "folio-tab";
  const day = document.createElement("span");
  day.className = "folio-tab__day";
  day.textContent = w.status === 'planned' ? '待启' : parts.d;
  const title = document.createElement("h3");
  title.className = "folio-tab__title";
  title.textContent = String(w.title || "").replace(/\n/g, " / ");
  tab.append(day, title);
  slide.appendChild(tab);

  const mag = document.createElement("div");
  mag.className = "folio-mag";

  const cover = String(w.image || "").trim();
  if (cover) mag.appendChild(makeFig(cover, "cover", index < 2, w.title, 1));

  const note = document.createElement("div");
  note.className = "folio-slide__note folio-mag__note";
  if (w.status === 'planned') {
    const status = document.createElement('span');
    status.className = 'folio-status';
    status.textContent = '计划中 / PLANNED';
    note.appendChild(status);
  }
  applyFrame(note, `${w.id}:note`, "copy");

  if (w.blurb) {
    const blurb = document.createElement("p");
    blurb.className = "folio-card__blurb";
    blurb.textContent = String(w.blurb);
    note.appendChild(blurb);
  }
  for (const block of w.blocks || []) {
    if (block.type !== 'text' || !block.text || String(w.blurb || '').includes(block.text)) continue;
    const p = document.createElement('p');
    p.className = 'folio-card__blurb';
    p.textContent = block.text;
    note.append(p);
  }

  if (w.description_full && w.description_full !== w.blurb) {
    const details = document.createElement("details");
    details.className = "folio-description";
    const summary = document.createElement("summary");
    summary.textContent = "完整说明与制作名单";
    const full = document.createElement("p");
    full.className = "folio-card__blurb";
    full.textContent = w.description_full;
    details.append(summary, full);
    note.appendChild(details);
  }

  if (w.tags?.length) {
    const tags = document.createElement("p");
    tags.className = "folio-card__tags";
    tags.textContent = [categoryLabel(w.category), ...(w.tags || [])].filter(Boolean).join(" · ");
    note.appendChild(tags);
  }

  const until = untilOf(w);
  const born = bornOf(w);
  if (until) {
    const end = document.createElement("p");
    end.className = "folio-slide__until";
    const bornY = dateParts(born).y;
    const untilY = dateParts(until).y;
    end.textContent = `→ ${compactStamp(until, Boolean(untilY && untilY !== bornY))}`;
    note.appendChild(end);
  }

  const rest = restLinks(w);
  if (rest.length) {
    const linksEl = document.createElement("p");
    linksEl.className = "folio-card__links";
    rest.forEach((l) => {
      const a = document.createElement("a");
      a.className = "folio-card__link";
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = l.label || linkLabel(l);
      linksEl.appendChild(a);
    });
    note.appendChild(linksEl);
  }
  mag.appendChild(note);

  relatedImages(w).forEach((src, i) => {
    const fig = makeFig(src, "extra", false, w.title, i + (cover ? 2 : 1));
    fig.dataset.slot = String(i % 3);
    mag.appendChild(fig);
  });

  const brands = brandLinks(w);
  if (brands.length) {
    const dock = document.createElement("div");
    dock.className = "folio-dock folio-mag__dock";
    brands.forEach((l) => dock.appendChild(makeChip(l)));
    mag.appendChild(dock);
  }

  if (!mag.querySelector(".folio-mag__fig")) slide.classList.add("folio-slide--text");
  const longFigure = [...mag.querySelectorAll('.folio-mag__fig')].find(fig => {
    const img = fig.querySelector('img');
    return img.width && img.height / img.width > 2;
  });
  if (longFigure) {
    mag.classList.add('folio-mag--long');
    const main = document.createElement('div');
    main.className = 'folio-mag__main';
    main.append(longFigure);
    const side = document.createElement('div');
    side.className = 'folio-mag__side';
    side.append(...mag.children);
    mag.append(main, side);
  }
  slide.appendChild(mag);
  return slide;
}

function categoryLabel(category) {
  return { games: "游戏", ugc: "UGC平台", tools: "工具集" }[category] || "工具集";
}

function linkKind(l) {
  const kind = String(l?.kind || "").toLowerCase();
  if (kind === "github" || kind === "bilibili" || kind === "bugoo") return kind;
  if (kind === "live" || kind === "itch" || kind === "store") return kind;
  const u = String(l?.url || "");
  if (u.includes("github.com")) return "github";
  if (u.includes("bilibili.com")) return "bilibili";
  if (u.includes("bugoostudio.com")) return "bugoo";
  if (u.includes("itch.io")) return "itch";
  if (u) return kind || "live";
  return kind;
}

function allLinks(w) {
  const out = [];
  const add = (item) => {
    if (!item?.url) return;
    const key = linkKey(item.url);
    if (!key || out.some((x) => linkKey(x.url) === key)) return;
    out.push({ ...item, kind: linkKind(item), url: String(item.url) });
  };
  (Array.isArray(w.links) ? w.links : []).forEach(add);
  add({ url: w.url, kind: w.source === "bugoo" ? "bugoo" : "" });
  return out;
}

function brandLinks(w) {
  return allLinks(w).filter(l => ['github', 'bilibili', 'bugoo', 'itch', 'live'].includes(l.kind))
    .map(l => ({ ...l, label: l.label && l.label !== brandLabel(l.kind) ? `${brandLabel(l.kind)} · ${l.label}` : brandLabel(l.kind) }));
}

function restLinks(w) {
  const primary = new Set(brandLinks(w).map((l) => l.url));
  return allLinks(w).filter((l) => !primary.has(l.url));
}

function brandLabel(kind) {
  if (kind === "github") return "GitHub";
  if (kind === "bilibili") return "Bilibili";
  if (kind === "bugoo") return "Bugoo";
  if (kind === "itch") return "Itch";
  if (kind === "live") return "直达网站";
  return kind;
}

const CHIP_ICONS = {
  itch: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 8h18l-2-5H5L3 8Zm1 0v12h16V8M8 20v-7h8v7M3 8c0 4 4 4 4 0 0 4 5 4 5 0 0 4 5 4 5 0 0 4 4 4 4 0"/></svg>',
  live: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>',
  github:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.1.39-1.99 1.03-2.7-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.8c.85 0 1.71.11 2.51.32 1.9-1.29 2.74-1.02 2.74-1.02.55 1.37.2 2.39.1 2.64.64.71 1.03 1.6 1.03 2.7 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.86v2.76c0 .26.18.57.69.48A10 10 0 0 0 12 2Z"/></svg>',
  bilibili:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.4" y="8.2" width="17.2" height="11.2" rx="2.2"/><path d="m7.2 4.6 2.6 3.6M16.8 4.6l-2.6 3.6"/><path d="M9.1 12.4v3.4M14.9 12.4v3.4"/></svg>',
};

function makeChip(link) {
  const a = document.createElement("a");
  a.className = `folio-chip folio-chip--${link.kind}`;
  a.href = link.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.setAttribute("aria-label", link.label);
  const icon = document.createElement("span");
  icon.className = "folio-chip__icon";
  icon.setAttribute("aria-hidden", "true");
  if (link.kind === "bugoo") {
    const img = document.createElement("img");
    img.src = "./parts/brand/bugoo-mark.png";
    img.alt = "";
    icon.appendChild(img);
  } else {
    icon.innerHTML = CHIP_ICONS[link.kind] || "";
  }
  const text = document.createElement("span");
  text.className = "folio-chip__label";
  text.textContent = link.label;
  a.append(icon, text);
  return a;
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

function setupFolioFilters(grid) {
  const bar = document.getElementById("folio-filters");
  if (!bar || bar.dataset.ready === "1") return;
  bar.dataset.ready = "1";

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest(".folio-filter");
    if (!btn) return;
    const category = btn.dataset.category || "all";
    bar.querySelectorAll(".folio-filter").forEach((el) => {
      const on = el === btn;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
    grid.querySelectorAll(".folio-slide").forEach((slide) => {
      slide.hidden = !(category === "all" || slide.dataset.category === category);
    });
    grid.querySelectorAll(".folio-month").forEach((month) => {
      month.hidden = ![...month.querySelectorAll(".folio-slide")].some((s) => !s.hidden);
    });
    grid.querySelectorAll('.folio-series').forEach(series => {
      series.hidden = ![...series.querySelectorAll('.folio-slide')].some(s => !s.hidden);
    });
    grid.querySelectorAll(".folio-year").forEach((year) => {
      year.hidden = ![...year.querySelectorAll(".folio-slide")].some((s) => !s.hidden);
    });
    requestAnimationFrame(() => {
      grid._folioPick?.();
    });
  });
}
