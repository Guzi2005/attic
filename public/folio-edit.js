import { uniqueLinks } from './folio-links.js';
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
let previewEditing = false;
let uploadBusy = false;
const liveFrame = document.getElementById('live-preview');

function renderLivePreview(w) {
  if (!previewEditing && liveFrame.contentWindow) liveFrame.contentWindow.postMessage({type:'folio-preview',work:w},location.origin);
}

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== liveFrame.contentWindow) return;
  if (event.data?.type === 'folio-ready' && selected >= 0) renderLivePreview(works[selected]);
  if (event.data?.type !== 'folio-edit' || selected < 0 || event.data.id !== works[selected].id || !['title','blurb'].includes(event.data.field)) return;
  form.elements.namedItem(event.data.field).value = event.data.value;
  previewEditing = true;
  persistCurrent();
  previewEditing = false;
});

async function uploadImages(files) {
  if (uploadBusy || selected < 0 || !files.length) return;
  persistCurrent();
  const targetId = works[selected].id;
  if (!targetId) { setStatus('请先填写作品短名和标题。','err'); return; }
  uploadBusy = true;
  document.getElementById('btn-save').disabled = true;
  const useCover = document.getElementById('upload-role').value === 'cover';
  let added = 0;
  try {
    for (const file of files) {
      if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size > 20*1024*1024) throw new Error(`${file.name}：仅支持 20 MB 以内的 PNG/JPG/WebP/GIF`);
      setStatus(`上传 ${added+1}/${files.length}：${file.name}`);
      const res = await fetch('./api/images',{method:'POST',headers:{'Content-Type':file.type},body:file});
      if (!res.ok) throw new Error(`上传失败（${res.status}），请确认本地管理服务已启动`);
      const result = await res.json();
      const index = works.findIndex(w=>w.id===targetId);
      if (index<0) throw new Error('目标作品已被删除，图片已上传但尚未挂入作品');
      const work = works[index];
      work.image_sizes = {...work.image_sizes,[result.src]:[result.width,result.height]};
      work.blocks ||= []; work.images ||= [];
      if (useCover && added === 0) {
        if (work.image && work.image !== result.src && !work.images.includes(work.image)) work.images.push(work.image);
        work.image = result.src;
        work.images = work.images.filter(src=>src!==result.src);
        work.blocks = work.blocks.filter(b=>b.type!=='image'||b.src!==result.src);
      } else if (work.image !== result.src && !work.images.includes(result.src) && !work.blocks.some(b=>b.src===result.src)) {
        work.images.push(result.src); work.blocks.push({type:'image',src:result.src});
      }
      work.media_override = true;
      added++;
      if (selected === index) applyForm(work);
      markDirty();
    }
    setStatus(`已上传 ${added} 张，预览已更新。点击「保存到仓库」完成发布到本地作品页。`,'dirty');
  } catch (error) { setStatus(`${error.message}；已成功 ${added} 张。`,'err'); }
  finally { uploadBusy=false;document.getElementById('btn-save').disabled=false; }
}

const drop = document.getElementById('image-drop');
const filePicker = document.getElementById('image-files');
drop.addEventListener('click',()=>filePicker.click());
drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();filePicker.click();}});
filePicker.addEventListener('change',()=>{uploadImages([...filePicker.files]);filePicker.value='';});
drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('is-over');});
drop.addEventListener('dragleave',()=>drop.classList.remove('is-over'));
drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('is-over');uploadImages([...e.dataTransfer.files]);});
window.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
window.addEventListener('drop',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
document.getElementById('preview-mobile').onclick=()=>liveFrame.classList.add('is-mobile');
document.getElementById('preview-desktop').onclick=()=>liveFrame.classList.remove('is-mobile');

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
    source: "other",
    category: "tools",
    status: "",
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
  const links = uniqueLinks([...linksRows.querySelectorAll(".link-row")].map((row) => ({
    kind: row.querySelector("[name=link-kind]").value,
    label: row.querySelector("[name=link-label]").value.trim(),
    url: row.querySelector("[name=link-url]").value.trim(),
  })).filter((l) => l.url));
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
    category: String(data.get("category") || "tools"),
    status: String(data.get("status") || ""),
    tags,
    links,
    blocks,
    images: blocks.filter(b => b.type === 'image').map(b => b.src),
    media_override: true,
    series_parent: String(data.get('series_parent') || ''),
    started: String(data.get("started") || "").trim(),
    updated: String(data.get("updated") || "").trim(),
    ended: String(data.get("ended") || "").trim(),
  };
}

function applyForm(w) {
  applying = true;
  form.elements.namedItem('id').value = w.id || "";
  form.elements.namedItem('title').value = w.title || "";
  form.elements.namedItem('blurb').value = w.blurb || "";
  form.elements.namedItem('image').value = w.image || "";
  form.elements.namedItem('url').value = w.url || "";
  form.elements.namedItem('source').value = w.source || "other";
  form.elements.namedItem('category').value = w.category || "tools";
  form.elements.namedItem('status').value = w.status || "";
  form.elements.namedItem('tags').value = (w.tags || []).join("，");
  form.elements.namedItem('started').value = w.started || "";
  form.elements.namedItem('updated').value = w.updated || "";
  form.elements.namedItem('ended').value = w.ended || "";
  renderLinks(w.links || []);
  const blocks = [...(w.blocks || [])];
  const known = new Set(blocks.filter(b => b.type === 'image').map(b => b.src));
  for (const src of w.images || []) if (src !== w.image && !known.has(src)) { blocks.push({type:'image',src}); known.add(src); }
  renderBlocks(blocks.filter(b => b.type !== 'image' || b.src !== w.image));
  const series = form.elements.namedItem('series_parent');
  series.replaceChildren(new Option('独立作品 / 系列首作', ''));
  works.filter(x => x.id && x.id !== w.id && !x.series_parent).forEach(x => series.add(new Option(x.title || x.id, x.id)));
  series.value = w.series_parent || '';
  updatePreview(w.image, w.title);
  applying = false;
  renderLivePreview(w);
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
  const thumb = document.createElement('img');
  thumb.className = 'block-thumb';
  thumb.alt = '插图预览';
  const refreshThumb = () => { thumb.hidden = type.value !== 'image' || !src.value; if (!thumb.hidden) thumb.src = src.value; };
  src.addEventListener('input', refreshThumb);
  type.addEventListener('change', refreshThumb);
  refreshThumb();
  field.prepend(thumb);
  const actions = document.createElement('div'); actions.className = 'block-actions';
  for (const [label, direction] of [['↑', -1], ['↓', 1]]) {
    const btn = document.createElement('button'); btn.type='button';btn.textContent=label;
    btn.setAttribute('aria-label',direction<0?'上移版面块':'下移版面块');
    btn.onclick=()=>{const other=direction<0?row.previousElementSibling:row.nextElementSibling;if(other){if(direction<0)other.before(row);else other.after(row);persistCurrent();}};
    actions.append(btn);
  }
  const cover = document.createElement('button');cover.type='button';cover.textContent='设为封面';
  cover.onclick=()=>{if(type.value!=='image'||!src.value)return;const old=form.elements.namedItem('image').value;form.elements.namedItem('image').value=src.value;if(old&&old!==src.value){src.value=old;refreshThumb();}else row.remove();persistCurrent();};
  actions.append(cover,del);
  row.append(type, field, actions);
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
  kind.name = "link-kind";
  KINDS.forEach(([v, label]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = label;
    kind.appendChild(o);
  });
  kind.value = link.kind && KINDS.some(([v]) => v === link.kind) ? link.kind : guessKind(link.url);
  const label = document.createElement("input");
  label.name = "link-label";
  label.placeholder = "标签";
  label.value = link.label || "";
  const url = document.createElement("input");
  url.name = "link-url";
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
  const next = { ...works[selected], ...collectForm() };
  if (!next.id && next.title) next.id = slugify(next.title);
  const prev = JSON.stringify(works[selected]);
  works[selected] = next;
  renderList();
  updatePreview(next.image, next.title);
  renderLivePreview(next);
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
  let media = {};
  try { media = await fetch('./folio-media.json', {cache:'no-store'}).then(r=>r.json()); } catch {}
  works = data.map(raw => normalize({...raw, images: [...new Set([...(raw.images || []), ...(raw.media_override ? [] : media[raw.id] || []).map(x=>x.src)])]}));
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
      ...w,
      id: w.id,
      title: w.title,
      blurb: w.blurb,
      image: w.image,
      url: w.url,
      source: w.source,
      category: w.category || "tools",
      tags: w.tags || [],
    };
    if (w.links?.length) out.links = w.links;
    if (w.blocks?.length) out.blocks = w.blocks;
    if (w.started) out.started = w.started;
    if (w.updated) out.updated = w.updated;
    if (w.ended) out.ended = w.ended;
    return out;
  });
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
    selected = -1;
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
  selected = -1;
  select(i - 1);
  markDirty();
});
document.getElementById("btn-down").addEventListener("click", () => {
  if (selected < 0 || selected >= works.length - 1) return;
  persistCurrent();
  const i = selected;
  [works[i + 1], works[i]] = [works[i], works[i + 1]];
  selected = -1;
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
  const index = selected;
  works.splice(index, 1);
  selected = -1;
  select(Math.min(index, works.length - 1));
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
