import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Fonts are bundled, not fetched: the app is offline-first and a build that
// reaches out to Google Fonts contradicts that.
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

import { SidebarProvider } from "@/components/ui/sidebar";
import App from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

createRoot(container).render(
  <StrictMode>
    <SidebarProvider defaultOpen>
      <App />
    </SidebarProvider>
  </StrictMode>,
);
