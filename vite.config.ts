import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @file vite.config.ts
// @description Vite 配置，启用 React 插件
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5175,
    /**
     * 文件监听改成轮询
     * @description Windows + 编辑器「原子保存」（先写临时文件再替换）时，原生 watcher
     *              会丢变更事件：dev server 认为文件没变，`?t=<mtime>` 一直停在旧值，
     *              页面继续用缓存的旧模块 —— 表现为「改了文件但页面不更新 / 报缺少导出」
     */
    watch: { usePolling: true, interval: 300 },
  },
});
