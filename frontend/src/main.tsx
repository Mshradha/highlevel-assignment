import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element in index.html");
}

// StrictMode runs effects twice in development, which surfaces missing cleanup
// (for example, requests that are never aborted). We keep it on deliberately.
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
