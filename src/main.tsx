import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Store } from "./data/store";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Store>
      <App />
    </Store>
  </React.StrictMode>,
);
