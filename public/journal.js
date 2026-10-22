/* Attic 拼贴手账 · journal.js — 从 works.json 取数据，渲染成可翻页的拼贴本 */
(() => {
  "use strict";

  const SECTIONS = [
    { key: "cover", label: "封面",   tint: 2 },
    { key: "games", label: "游戏",   tint: 0 },
    { key: "ugc",   label: "UGC平台", tint: 1 },
    { key: "tools", label: "工具集", tint: 4 },
  ];
  const CATS = { games: "游戏 GAMES", ugc: "UGC 平台", tools: "工具集 TOOLS" };
  const TINTS = 8;
  const SPANS = [5, 4, 7, 4, 3, 5];      // 12 列网格里的占宽循环
  const ROTS  = [-1.1, 0.9, 1.4, -0.7, 0.6, -1.5];
  const SCATTER = [0, 30, 10, 44, 0, 24]; // 上下错位（px），拼贴感

  const pagesEl = document.getElementById("pages");
  const tabsEl = document.getElementById("tabs");
  const prevBtn = document.getElementById("prev");
  const nextBtn = document.getElementById("next");
  const pagerLabel = document.getElementById("pagerLabel");
  let current = 0;

  /* ---------- 小工具 ---------- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function tape(cls) { return el("span", "tape " + cls); }
  function fmtDate(s) {
    if (!s) return "";
    const m = String(s).match(/^(\d{4})-(\d{2})/);
    return m ? `${m[1]}.${m[2]}` : String(s).replace(/-/g, ".");
  }
  function dateRange(w) {
    const a = w.started ? fmtDate(w.started) : "";
    const b = fmtDate(w.updated || w.ended || "");
    if (a && b && a !== b) return `${a} — ${b}`;
    return b || a || "";
  }
  function firstImage(w) {
    return (w.images || []).find(Boolean) || "";
  }

  /* ---------- 拼贴件 ---------- */
  function buildPiece(w, i) {
    const piece = el("article", "piece");
    const img = firstImage(w);
    const span = SPANS[i % SPANS.length];
    piece.style.gridColumn = `span ${span}`;
    piece.style.setProperty("--rot", ROTS[i % ROTS.length] + "deg");
    const sc = SCATTER[i % SCATTER.length];
    if (sc) piece.style.marginTop = sc + "px";

    if (w.status === "planned") piece.classList.add("is-planned");

    let body;
    const content = []; /* 标题/简介等，稍后决定放进卡片里还是卡片后 */
    if (img) {
      body = el("figure", "polaroid");
      body.appendChild(tape("tape--tl"));
      body.appendChild(tape("tape--tr"));
      const pic = el("img");
      pic.src = img; pic.alt = w.title || w.id; pic.loading = "lazy";
      body.appendChild(pic);
      const cap = el("figcaption");
      cap.append(el("span", null, "IMG " + String(i + 1).padStart(2, "0")));
      cap.append(el("span", null, dateRange(w) || "—"));
      body.appendChild(cap);
    } else {
      body = el("div", "notecard");
      const t = i % TINTS;
      body.style.setProperty("--card", `var(--tint-${t})`);
      body.style.setProperty("--stamp-c", `var(--tint-deep-${t})`);
      body.appendChild(tape("tape--tl"));
    }
    piece.appendChild(body);

    /* 标题行：标题 + 止日期橡皮章（照片件）/ 状态（纸条件） */
    const titleRow = el("h3", "piece__title");
    titleRow.append(el("span", null, w.title || w.id));
    const stop = fmtDate(w.updated || w.ended || "");
    if (img) {
      if (stop) titleRow.append(el("span", "piece__stamp", "止 " + stop));
    } else if (w.status === "planned") {
      titleRow.append(el("span", "piece__status", "计划中"));
    } else if (w.status === "in-development") {
      titleRow.append(el("span", "piece__status", "施工中"));
    } else if (stop) {
      titleRow.append(el("span", "piece__stamp", "止 " + stop));
    }
    content.push(titleRow);

    if (w.blurb) content.push(el("p", "piece__blurb", w.blurb));

    const tags = w.tags || [];
    if (tags.length) {
      const row = el("div", "piece__tags");
      tags.forEach(t => row.appendChild(el("span", "piece__tag", t)));
      content.push(row);
    }

    const links = w.links || [];
    if (links.length) {
      const row = el("ul", "piece__links");
      links.forEach(l => {
        const li = el("li");
        const a = el("a", "piece__link", l.label || l.kind || "链接");
        a.href = l.url; a.target = "_blank"; a.rel = "noopener";
        li.appendChild(a); row.appendChild(li);
      });
      content.push(row);
    }

    const rest = (w.images || []).filter(Boolean).length - (img ? 1 : 0);
    if (rest > 0) content.push(el("p", "piece__extra", `+ 还有 ${rest} 张补充图，见主站条目`));

    if (img) {
      content.forEach(n => piece.appendChild(n));
    } else {
      /* 无图作品：文字全部贴在索引卡里面 */
      content.forEach(n => body.appendChild(n));
    }
    return piece;
  }

  /* ---------- 章节页 ---------- */
  function buildSpread(sec, works, pageNo) {
    const page = el("section", "journal-page");
    page.dataset.key = sec.key;
    if (sec.key === "cover") { page.appendChild(buildCover()); return page; }

    const head = el("header", "spread-head");
    head.appendChild(tape("tape--header"));
    head.appendChild(el("p", "spread-head__cat", "CHAPTER / " + (CATS[sec.key] || sec.key)));
    head.appendChild(el("h2", "spread-head__title", sec.label));
    head.appendChild(el("p", "spread-head__count", `这一章贴了 ${works.length} 件，按时间大致排的。`));
    head.appendChild(el("span", "spread-head__pageno", "P." + pageNo));
    page.appendChild(head);

    const grid = el("div", "collage");
    works.forEach((w, i) => grid.appendChild(buildPiece(w, i)));
    page.appendChild(grid);
    return page;
  }

  /* ---------- 封面 ---------- */
  function buildCover() {
    const wrap = el("div", "cover");
    wrap.appendChild(el("p", "cover__kicker", "FLUORESCENTMICE.FUN / ATTIC"));
    wrap.appendChild(el("h1", "cover__title", "阁楼手账"));
    wrap.appendChild(el("p", "cover__sub", "把做过的东西剪下来，贴进一本本子里。"));

    const photos = el("div", "cover__photos");
    const rots = [-1.6, 1.2, -0.8];
    let pi = 0;
    for (const id of ["weave-and-wander", "tenennium", "hira-katakana"]) {
      const w = (window.__WORKS__ || []).find(x => x.id === id);
      const img = w && firstImage(w);
      if (!img) continue;
      const fig = el("figure", "polaroid");
      fig.style.setProperty("--rot", rots[pi % 3] + "deg");
      fig.appendChild(tape("tape--tl"));
      fig.appendChild(tape("tape--tr"));
      const pic = el("img");
      pic.src = img; pic.alt = w.title; pic.loading = "lazy";
      fig.appendChild(pic);
      const cap = el("figcaption");
      cap.append(el("span", null, w.title));
      cap.append(el("span", null, dateRange(w) || "—"));
      fig.appendChild(cap);
      photos.appendChild(fig);
      pi++;
    }
    wrap.appendChild(photos);

    const index = el("div", "notecard cover__index");
    index.appendChild(tape("tape--header"));
    const h = el("h2", null, "本子目录");
    index.appendChild(h);
    const ol = el("ol");
    SECTIONS.slice(1).forEach((s, i) => {
      ol.appendChild(el("li", null, `${s.label} — P.${i + 2}`));
    });
    index.appendChild(ol);
    wrap.appendChild(index);

    wrap.appendChild(el("p", "cover__hint", "点书本右侧伸出的小页签，可以直接翻到某一章；也可以用 ← → 键或下面的按钮翻页。"));
    return wrap;
  }

  /* ---------- 页签 ---------- */
  function buildTabs() {
    SECTIONS.forEach((sec, i) => {
      const b = el("button", "book-tab", sec.label);
      b.type = "button";
      b.dataset.tint = String(sec.tint);
      b.dataset.index = String(i);
      b.style.top = (86 + i * 86) + "px";
      b.addEventListener("click", () => goTo(i));
      tabsEl.appendChild(b);
    });
  }

  /* ---------- 翻页 ---------- */
  function goTo(idx, dirHint) {
    idx = Math.max(0, Math.min(SECTIONS.length - 1, idx));
    const pages = pagesEl.querySelectorAll(".journal-page");
    const dir = dirHint || (idx > current ? "fwd" : "back");
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const active = i === idx;
      p.classList.toggle("is-active", active);
      p.classList.remove("is-turn-fwd", "is-turn-back");
      p.setAttribute("aria-hidden", active ? "false" : "true");
      if (active) {
        void p.offsetWidth; /* 重启动画 */
        p.classList.add(dir === "fwd" ? "is-turn-fwd" : "is-turn-back");
      }
    }
    [...tabsEl.children].forEach((t, i) => {
      t.classList.toggle("is-active", i === idx);
      t.setAttribute("aria-current", i === idx ? "page" : "false");
    });
    current = idx;
    pagerLabel.textContent = `PAGE ${idx + 1} / ${SECTIONS.length} · ${SECTIONS[idx].label}`;
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === SECTIONS.length - 1;
    history.replaceState(null, "", "#" + SECTIONS[idx].key);
    if (window.scrollY > 40) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  prevBtn.addEventListener("click", () => goTo(current - 1, "back"));
  nextBtn.addEventListener("click", () => goTo(current + 1, "fwd"));
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    if (e.key === "ArrowLeft") goTo(current - 1, "back");
    if (e.key === "ArrowRight") goTo(current + 1, "fwd");
  });

  /* ---------- 启动 ---------- */
  fetch("./works.json")
    .then(r => { if (!r.ok) throw new Error("works.json " + r.status); return r.json(); })
    .then(works => {
      window.__WORKS__ = works;
      const byCat = (c) => works.filter(w => w.category === c);
      const counts = { games: 0, ugc: 0, tools: 0 };
      SECTIONS.forEach(sec => {
        if (sec.key !== "cover") {
          sec.works = byCat(sec.key);
          counts[sec.key] = sec.works.length;
        }
      });
      buildTabs();
      let pageNo = 1;
      SECTIONS.forEach((sec, i) => {
        const p = buildSpread(sec, sec.works || [], sec.key === "cover" ? null : ++pageNo);
        pagesEl.appendChild(p);
        void i;
      });
      const start = Math.max(0, SECTIONS.findIndex(s => "#" + s.key === location.hash));
      goTo(start === -1 ? 0 : start, "fwd");
    })
    .catch(err => {
      pagesEl.innerHTML = "";
      pagesEl.appendChild(el("p", "cover__hint", "读取 works.json 失败：" + err.message + "。请用本地服务器打开（如 scripts/serve.py），不要直接双击文件。"));
    });
})();
