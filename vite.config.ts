import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @file vite.config.ts
// @description Vite 配置，启用 React 插件
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
});
