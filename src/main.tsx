// 样式从入口引入：dev 下由 Vite 注入 <style> 并接入 HMR，构建时自动抽成独立 CSS
import "./styles.css";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Store } from "./data/store";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Store>
      <App />
    </Store>
  </React.StrictMode>,
);
