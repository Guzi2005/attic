# Attic

个人站点阁楼封面页 —— 手绘美学 + 交互门洞。

## 本地预览

```bash
python scripts/serve.py 8899
```

打开 http://127.0.0.1:8899/

请用上面的脚本起服务（不要用默认 `python -m http.server`，本机路径编码可能出问题）。

## 上线

静态资源在 `public/`。可用 GitHub Pages（已指向 `/public`）或其他静态托管。

## 域名

`attic.fluorescentmice.fun` / `fluorescentmice.fun` / `florescentmice.fun` 预期均进入本页。

作品集直接展示：http://127.0.0.1:8899/?view=portfolio

作品分类使用 `category`（games / ugc / tools），`source` 仅保留来源信息。封面留空即显示文字纸条；加载失败的图片自动隐藏。说明来源记录见 `assets/portfolio-source-audit.json`，草拟说明标记为 `description_status: draft`。
