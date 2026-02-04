import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import AccessDenied from "./AccessDenied.tsx";

const currentPath = window.location.pathname;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {currentPath === "/access-denied" ? <AccessDenied /> : <App />}
  </StrictMode>,
);
