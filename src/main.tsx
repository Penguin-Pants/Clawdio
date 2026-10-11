import "@fontsource-variable/geist";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyAppName } from "./lib/app-name";
import "dockview-react/dist/styles/dockview.css";
import "./styles/globals.css";
import "./styles/dockview-theme.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void applyAppName();
