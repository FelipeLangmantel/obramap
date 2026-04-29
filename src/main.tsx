import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  const isCameraCaptureRoute = window.location.pathname === "/camera-capture";

  if (isCameraCaptureRoute) {
    import("./pages/CameraCapturePage").then(({ default: CameraCapturePage }) => {
      root.render(<CameraCapturePage />);
    });
  } else {
    import("./App").then(({ default: App }) => {
      // StrictMode removido temporariamente para evitar duplicação de efeitos
      root.render(<App />);
    });
  }
}

// Service Worker — apenas em produção e fora de iframes
if ('serviceWorker' in navigator) {
  const isCameraCaptureRoute = window.location.pathname === "/camera-capture";
  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const isPreview = window.location.hostname.includes('id-preview--') || window.location.hostname.includes('lovableproject.com');

  if (!isCameraCaptureRoute && !isInIframe && !isPreview) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
  }
}
