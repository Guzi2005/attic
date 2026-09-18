const KINDS = [
  ["github", "GitHub"],
  ["bilibili", "Bilibili"],
  ["live", "站点"],
  ["bugoo", "Bugoo"],
  ["itch", "Itch"],
  ["store", "商店"],
  ["other", "其他"],
];

const form = document.getElementById("form");
const listEl = document.getElementById("work-list");
const statusEl = document.getElementById("status");
const sheet = document.getElementById("sheet");
const sheetEmpty = document.getElementById("sheet-empty");
const linksRows = document.getElementById("links-rows");
const blocksRows = document.getElementById("blocks-rows");
const countEl = document.getElementById("work-count");
const preview = document.querySelector(".preview");
const previewImg = document.getElementById("preview-img");
const previewCap = document.getElementById("preview-cap");

/** @type {Array<Record<string, unknown>>} */
let works = [];
let selected = -1;
let dirty = false;
let applying = false;

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = "desk-status" + (kind ? ` is-${kind}` : "");
}

function markDirty() {
  if (applying) return;
  dirty = true;
  setStatus("有未保存的改动。本机可点「保存到仓库」，否则请下载 JSON。", "dirty");
}

function slugify(title) {
  const ascii = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (ascii.length >= 3) return ascii.slice(0, 40);
  return `work-${Date.now().toString(36)}`;
}

function guessKind(url) {
  const u = String(url || "").toLowerCase();
  if (u.includes("github.com")) return "github";
  if (u.includes("bilibili.com")) return "bilibili";
  if (u.includes("bugoostudio.com")) return "bugoo";
  if (u.includes("itch.io")) return "itch";
  if (u.includes("chromewebstore") || u.includes("microsoftedge.microsoft.com")) return "store";
  if (u.includes("vercel.app") || u.includes(".fun")) return "live";
  return "other";
}

function emptyWork() {
  return {
    id: "",
    title: "",
    blurb: "",
    image: "",
    url: "",
    source: "cursor",
    tags: [],
    links: [],
    blocks: [],
    started: "",
    updated: "",
    ended: "",
  };
}

function normalize(raw) {
  const w = { ...emptyWork(), ...(raw || {}) };
  w.tags = Array.isArray(w.tags) ? w.tags.map(String) : [];
  w.links = Array.isArray(w.links)
    ? w.links
        .filter((l) => l && l.url)
        .map((l) => ({
          kind: l.kind || guessKind(l.url),
          label: l.label || "",
          url: l.url,
        }))
    : [];
  if (w.url && !w.links.some((l) => l.url === w.url)) {
    w.links.unshift({ kind: guessKind(w.url), label: "", url: w.url });
  }
  w.blocks = Array.isArray(w.blocks)
    ? w.blocks
        .filter((b) => b && (b.type === "image" ? b.src : String(b.text || "").trim()))
        .map((b) =>
          b.type === "image"
            ? { type: "image", src: String(b.src || "").trim() }
            : { type: "text", text: String(b.text || "").trim() }
        )
    : [];
  w.images = Array.isArray(w.images) ? w.images.map(String).filter(Boolean) : [];
  return w;
}

function collectForm() {
  const data = new FormData(form);
  const links = [...linksRows.querySelectorAll(".link-row")].map((row) => ({
    kind: row.querySelector("[name=kind]").value,
    label: row.querySelector("[name=label]").value.trim(),
    url: row.querySelector("[name=url]").value.trim(),
  })).filter((l) => l.url);
  const tags = String(data.get("tags") || "")
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const blocks = [...blocksRows.querySelectorAll(".block-row")].map((row) => {
    const type = row.querySelector("[name=btype]").value;
    if (type === "image") {
      const src = row.querySelector("[name=bsrc]").value.trim();
      return src ? { type: "image", src } : null;
    }
    const text = row.querySelector("[name=btext]").value.trim();
    return text ? { type: "text", text } : null;
  }).filter(Boolean);
  return {
    id: String(data.get("id") || "").trim(),
    title: String(data.get("title") || "").trim(),
    blurb: String(data.get("blurb") || "").trim(),
    image: String(data.get("image") || "").trim(),
    url: String(data.get("url") || "").trim(),
    source: String(data.get("source") || "other"),
    tags,
    links,
    blocks,
    started: String(data.get("started") || "").trim(),
    updated: String(data.get("updated") || "").trim(),
    ended: String(data.get("ended") || "").trim(),
  };
}

function applyForm(w) {
  applying = true;
  form.id.value = w.id || "";
  form.title.value = w.title || "";
  form.blurb.value = w.blurb || "";
  form.image.value = w.image || "";
  form.url.value = w.url || "";
  form.source.value = w.source || "other";
  form.tags.value = (w.tags || []).join("，");
  form.started.value = w.started || "";
  form.updated.value = w.updated || "";
  form.ended.value = w.ended || "";
  renderLinks(w.links || []);
  renderBlocks(w.blocks?.length ? w.blocks : deriveBlocks(w));
  updatePreview(w.image, w.title);
  applying = false;
}

function renderBlocks(blocks) {
  blocksRows.replaceChildren();
  const rows = blocks.length ? blocks : [];
  rows.forEach((b) => blocksRows.appendChild(blockRow(b)));
}

function deriveBlocks(w) {
  const images = [];
  if (w.image) images.push(w.image);
  (w.images || []).forEach((src) => {
    if (src && !images.includes(src)) images.push(src);
  });
  const texts = String(w.blurb || "")
    .split(/(?<=[。！？])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const paras = [];
  texts.forEach((part) => {
    const prev = paras[paras.length - 1];
    if (prev && prev.length < 42) paras[paras.length - 1] = prev + part;
    else paras.push(part);
  });
  const imgBlocks = images.map((src) => ({ type: "image", src }));
  const textBlocks = (paras.length ? paras : w.blurb ? [w.blurb] : []).map((text) => ({
    type: "text",
    text,
  }));
  if (!imgBlocks.length) return textBlocks;
  if (!textBlocks.length) return imgBlocks;
  const out = [];
  const n = Math.max(imgBlocks.length, textBlocks.length);
  for (let i = 0; i < n; i += 1) {
    if (i < imgBlocks.length) out.push(imgBlocks[i]);
    if (i < textBlocks.length) out.push(textBlocks[i]);
  }
  return out;
}

function blockRow(block = { type: "text", text: "" }) {
  const row = document.createElement("div");
  row.className = "block-row";
  const type = document.createElement("select");
  type.name = "btype";
  [
    ["image", "插图"],
    ["text", "文字"],
  ].forEach(([v, label]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = label;
    type.appendChild(o);
  });
  type.value = block.type === "image" ? "image" : "text";
  const src = document.createElement("input");
  src.name = "bsrc";
  src.placeholder = "图片 URL";
  src.value = block.src || "";
  const text = document.createElement("textarea");
  text.name = "btext";
  text.rows = 3;
  text.placeholder = "这一块的文字";
  text.value = block.text || "";
  const field = document.createElement("div");
  field.append(src, text);
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "×";
  del.addEventListener("click", () => {
    row.remove();
    persistCurrent();
  });
  const paint = () => {
    const image = type.value === "image";
    src.hidden = !image;
    text.hidden = image;
  };
  type.addEventListener("change", () => {
    paint();
    persistCurrent();
  });
  paint();
  row.append(type, field, del);
  return row;
}

function renderLinks(links) {
  linksRows.replaceChildren();
  const rows = links.length ? links : [{ kind: "github", label: "", url: "" }];
  rows.forEach((l) => linksRows.appendChild(linkRow(l)));
}

function linkRow(link = {}) {
  const row = document.createElement("div");
  row.className = "link-row";
  const kind = document.createElement("select");
  kind.name = "kind";
  KINDS.forEach(([v, label]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = label;
    kind.appendChild(o);
  });
  kind.value = link.kind && KINDS.some(([v]) => v === link.kind) ? link.kind : guessKind(link.url);
  const label = document.createElement("input");
  label.name = "label";
  label.placeholder = "标签";
  label.value = link.label || "";
  const url = document.createElement("input");
  url.name = "url";
  url.placeholder = "https://";
  url.value = link.url || "";
  url.addEventListener("change", () => {
    if (!kind.value || kind.value === "other") kind.value = guessKind(url.value);
  });
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "×";
  del.addEventListener("click", () => {
    row.remove();
    persistCurrent();
  });
  row.append(kind, label, url, del);
  return row;
}

function updatePreview(src, title) {
  if (!src) {
    preview.hidden = true;
    return;
  }
  preview.hidden = false;
  previewImg.src = src;
  previewImg.alt = "";
  previewCap.textContent = title || src;
}

function persistCurrent() {
  if (selected < 0 || applying) return;
  const next = collectForm();
  if (!next.id && next.title) next.id = slugify(next.title);
  const prev = JSON.stringify(works[selected]);
  works[selected] = next;
  renderList();
  if (JSON.stringify(next) !== prev) markDirty();
}

function renderList() {
  countEl.textContent = String(works.length);
  listEl.replaceChildren();
  works.forEach((w, i) => {
    const li = document.createElement("li");
    if (i === selected) li.classList.add("is-on");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pick";
    btn.innerHTML = `<span class="idx">${String(i + 1).padStart(2, "0")}</span><span><span class="ttl">${escapeHtml(w.title || w.id || "未命名")}</span><span class="src">${escapeHtml(w.source || "")} · ${(w.links || []).length} 链</span></span>`;
    btn.addEventListener("click", () => select(i));
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function select(i) {
  if (selected >= 0) persistCurrent();
  selected = i;
  const w = works[i];
  sheet.hidden = !w;
  sheetEmpty.hidden = Boolean(w);
  if (w) applyForm(w);
  renderList();
}

async function loadWorks() {
  const res = await fetch(new URL("./works.json", import.meta.url), { cache: "no-store" });
  if (!res.ok) throw new Error(`读取失败 ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("works.json 不是数组");
  works = data.map(normalize);
  dirty = false;
  selected = works.length ? 0 : -1;
  renderList();
  if (selected >= 0) {
    sheet.hidden = false;
    sheetEmpty.hidden = true;
    applyForm(works[selected]);
  } else {
    sheet.hidden = true;
    sheetEmpty.hidden = false;
  }
  setStatus(`已读取 ${works.length} 条。`, "ok");
}

function payload() {
  if (selected >= 0) persistCurrent();
  return works.map((w) => {
    const out = {
      id: w.id,
      title: w.title,
      blurb: w.blurb,
      image: w.image,
      url: w.url,
      source: w.source,
      tags: w.tags || [],
    };
    if (w.links?.length) out.links = w.links;
    if (w.blocks?.length) out.blocks = w.blocks;
    if (w.started) out.started = w.started;
    if (w.updated) out.updated = w.updated;
    if (w.ended) out.ended = w.ended;
    return out;
  }).sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")));
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(payload(), null, 2) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "works.json";
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("已下载 works.json。把它放回 public/ 即可。", "ok");
}

async function copyJson() {
  await navigator.clipboard.writeText(JSON.stringify(payload(), null, 2) + "\n");
  setStatus("JSON 已复制到剪贴板。", "ok");
}

async function saveToRepo() {
  const body = JSON.stringify(payload(), null, 2) + "\n";
  const res = await fetch("./works.json", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  dirty = false;
  setStatus("已写入 public/works.json。刷新首页即可看到。", "ok");
}

function addNew() {
  persistCurrent();
  works.push(emptyWork());
  select(works.length - 1);
  markDirty();
}

form.addEventListener("input", persistCurrent);
form.addEventListener("change", persistCurrent);

document.getElementById("btn-add-link").addEventListener("click", () => {
  linksRows.appendChild(linkRow());
  persistCurrent();
});
document.getElementById("btn-add-image").addEventListener("click", () => {
  blocksRows.appendChild(blockRow({ type: "image", src: "" }));
  persistCurrent();
});
document.getElementById("btn-add-text").addEventListener("click", () => {
  blocksRows.appendChild(blockRow({ type: "text", text: "" }));
  persistCurrent();
});

document.getElementById("btn-new").addEventListener("click", addNew);
document.getElementById("btn-reload").addEventListener("click", () => {
  if (dirty && !confirm("有未保存改动，确定重新读取？")) return;
  loadWorks().catch((err) => setStatus(String(err.message || err), "err"));
});
document.getElementById("btn-download").addEventListener("click", () => {
  persistCurrent();
  downloadJson();
});
document.getElementById("btn-copy").addEventListener("click", () => {
  persistCurrent();
  copyJson().catch((err) => setStatus(String(err.message || err), "err"));
});
document.getElementById("btn-save").addEventListener("click", () => {
  persistCurrent();
  saveToRepo().catch((err) => {
    setStatus(`本机保存失败（${err.message}）。已可改用下载 JSON。`, "err");
  });
});

document.getElementById("file-import").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error("不是数组");
    works = data.map(normalize);
    select(works.length ? 0 : -1);
    markDirty();
    setStatus(`已导入 ${works.length} 条，记得保存或下载。`, "dirty");
  } catch (err) {
    setStatus(`导入失败：${err.message}`, "err");
  }
});

document.getElementById("btn-up").addEventListener("click", () => {
  if (selected <= 0) return;
  persistCurrent();
  const i = selected;
  [works[i - 1], works[i]] = [works[i], works[i - 1]];
  select(i - 1);
  markDirty();
});
document.getElementById("btn-down").addEventListener("click", () => {
  if (selected < 0 || selected >= works.length - 1) return;
  persistCurrent();
  const i = selected;
  [works[i + 1], works[i]] = [works[i], works[i + 1]];
  select(i + 1);
  markDirty();
});
document.getElementById("btn-dup").addEventListener("click", () => {
  if (selected < 0) return;
  persistCurrent();
  const copy = structuredClone(works[selected]);
  copy.id = `${copy.id || "work"}-copy`;
  copy.title = `${copy.title || "未命名"}（副本）`;
  works.splice(selected + 1, 0, copy);
  select(selected + 1);
  markDirty();
});
document.getElementById("btn-del").addEventListener("click", () => {
  if (selected < 0) return;
  const name = works[selected].title || works[selected].id || "这一条";
  if (!confirm(`删除「${name}」？`)) return;
  works.splice(selected, 1);
  select(Math.min(selected, works.length - 1));
  if (!works.length) {
    selected = -1;
    sheet.hidden = true;
    sheetEmpty.hidden = false;
    renderList();
  }
  markDirty();
});

window.addEventListener("beforeunload", (e) => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = "";
});

loadWorks().catch((err) => setStatus(String(err.message || err), "err"));
