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
