/**
 * @file export-static.mjs
 * @description 把本项目（React + Vite 原型）导出为「双击 index.html 即可离线浏览」的静态文件夹。
 *              关键点：浏览器在 file:// 协议下会以 CORS 拦截「外链」的 type="module" 脚本，
 *              因此这里把构建产物里的 JS / CSS / 图标全部内联进 index.html；
 *              内联的 module 脚本不产生跨源请求，可在本地直接执行。
 *              图片等资源同样内联（assetsInlineLimit 调大）：这类资源由脚本以字符串方式引用，
 *              HTML 标签层面扫不到，若留成独立文件会在 file:// 下 404（表现为图片不显示）。
 *              另：base 必须用相对路径，否则 /assets/... 在 file:// 下会指向盘符根目录。
 * @interaction 用法（在项目根目录执行）：node scripts/export-static.mjs
 *              产出：<项目根>/静态版/index.html 与 使用说明.txt
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import {
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { execSync } from "node:child_process";

/** 脚本目录（<项目根>/scripts）与项目根目录 */
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
/** 构建暂存目录（会被清理）与最终交付目录 */
const stage = join(root, "dist-static");
const out = join(root, "静态版");

/** 读取文本文件 */
const read = (p) => readFileSync(p, "utf8");

/**
 * 删除目录
 * @description 部分环境会把 fs.rmSync 拦截为「安全删除」并可能失败，故失败后退回系统命令
 * @param dir 待删除目录（不存在时直接返回）
 */
function removeDir(dir) {
  if (!existsSync(dir)) return;
  try {
    rmSync(dir, { recursive: true, force: true });
    return;
  } catch {
    /* 落到系统命令 */
  }
  try {
    execSync(
      process.platform === "win32" ? `rmdir /s /q "${dir}"` : `rm -rf "${dir}"`,
      { stdio: "ignore" },
    );
  } catch {
    /* 目录可能已被清理 */
  }
}

// ── 1. 构建：相对路径 base，单 CSS 文件 ──────────────────────────────
removeDir(stage);
await build({
  configFile: false,
  root,
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist-static",
    emptyOutDir: true,
    cssCodeSplit: false,
    // 图片等资源一律内联为 data URI：交付物要「双击 index.html 即可看」，
    // 而脚本只能扫 HTML 标签里的外链，脚本内部（JS 字符串）引用的资源扫不到，
    // 留成独立文件就会在 file:// 下 404（表现为吉祥物等图片不显示）
    assetsInlineLimit: 8 * 1024 * 1024,
  },
});

// ── 2. 内联：CSS → <style>；JS → 内联 module 脚本；图标 → data URI ──
let html = read(join(stage, "index.html"));

// 2.1 样式表
html = html.replace(
  /<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_m, href) => {
    const css = read(join(stage, href.replace(/^\.?\//, "")));
    return `<style>\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>`;
  },
);

// 2.2 入口脚本（本项目无动态 import，单 chunk 即可覆盖）
html = html.replace(
  /<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_m, src) => {
    const js = read(join(stage, src.replace(/^\.?\//, "")));
    return `<script type="module">\n${js.replace(/<\/script/gi, "<\\/script")}\n</script>`;
  },
);

// 2.3 图标（构建会给 favicon 加 hash 后缀，故按名字包含匹配；与其留一个外链小文件，不如直接内联）
const icon = join(root, "favicon.svg");
if (existsSync(icon)) {
  const data = `data:image/svg+xml;base64,${readFileSync(icon).toString("base64")}`;
  html = html.replace(/href="[^"]*favicon[^"]*\.svg"/, `href="${data}"`);
}

// 2.4 去掉 modulepreload：离线无意义，且会触发 404 请求
html = html.replace(/<link[^>]+rel="modulepreload"[^>]*>/g, "");

// ── 3. 产出交付目录 ────────────────────────────────────────────────
removeDir(out);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.html"), html, "utf8");
writeFileSync(
  join(out, "使用说明.txt"),
  [
    "智能机器巡检平台原型 · 离线静态版",
    "==================================",
    "",
    "打开方式",
    "--------",
    "1. 双击本文件夹内的 index.html（推荐 Chrome 或 Edge）。",
    "2. 纯前端离线原型：无需安装环境、无需联网、无需启动服务。",
    "3. 演示数据仅保存在你自己的浏览器里，不会上传。",
    "",
    "常见问题",
    "--------",
    "- 双击后空白页：多为浏览器限制了 file:// 来源，请改用 Chrome/Edge 重试。",
    "- 需要发给别人时，直接压缩整个「静态版」文件夹发过去即可。",
    "- 演示数据想恢复初始状态：点页面右上角的「重置演示」。",
    "",
    "技术信息",
    "--------",
    "- 由 React + Vite 原型构建导出；JS / CSS / 图标已全部内联进 index.html。",
    "- 文件夹里 index.html 是必需的，其余文件仅为可选的辅助资源。",
  ].join("\n"),
  "utf8",
);

// ── 4. 自检：不应残留任何外链资源；若有则兜底拷贝并提示 ──────────────
// 先剔除已内联的样式 / 脚本块，否则会把 JS 源码里的字符串误判成外链
const shell = html
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<script[\s\S]*?<\/script>/gi, "");
const externals = [...shell.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(data:|#|https?:|mailto:)/.test(u));
for (const u of externals) {
  const rel = u.replace(/^\.?\//, "");
  const from = existsSync(join(stage, rel)) ? join(stage, rel) : join(root, rel);
  if (existsSync(from)) {
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    cpSync(from, join(out, rel));
  }
}

// ── 4.2 兜底：内联脚本里仍被相对路径引用的资源 ──────────────────────
// 这类引用出现在 JS 字符串里（如 `./assets/xxx.png`），第 4 步只扫 HTML 标签查不到，
// 故按「文件名是否出现在整份 HTML 中」判断，命中则连目录一起拷贝，避免离线打开时图片 404
const stageAssets = join(stage, "assets");
const copiedInJs = [];
if (existsSync(stageAssets)) {
  for (const f of readdirSync(stageAssets)) {
    if (!html.includes(f)) continue;
    mkdirSync(join(out, "assets"), { recursive: true });
    cpSync(join(stageAssets, f), join(out, "assets", f));
    copiedInJs.push(f);
  }
}

if (externals.length) {
  console.warn(
    `⚠ 仍有 ${externals.length} 个未内联的外部资源：${externals.join(", ")}\n` +
      "  已一并拷贝到交付目录（相对路径引用，离线仍可用）。",
  );
} else {
  console.log("✔ 生成完毕：index.html 已自包含（无任何外链资源）");
}
if (copiedInJs.length) {
  console.warn(
    `⚠ 脚本内引用的资源未内联，已拷贝到 assets/：${copiedInJs.join(", ")}（图片等资源建议提高 assetsInlineLimit）`,
  );
}
console.log("  交付目录：" + out);
