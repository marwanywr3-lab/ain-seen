import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/arabic-600.css";
import "@fontsource/cairo/arabic-800.css";
import React from "react";
import { createRoot } from "react-dom/client";
import RemoteApp from "./RemoteApp";
import "./style.css";
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RemoteApp />
  </React.StrictMode>,
);
