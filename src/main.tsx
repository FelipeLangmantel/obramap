import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  // StrictMode removido temporariamente para evitar duplicação de efeitos
  root.render(<App />);
}

// Service Worker — apenas em produção e fora de iframes
if ('serviceWorker' in navigator) {
  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const isPreview = window.location.hostname.includes('id-preview--') || window.location.hostname.includes('lovableproject.com');

  if (!isInIframe && !isPreview) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
  }
}
