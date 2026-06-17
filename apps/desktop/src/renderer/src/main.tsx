import "./lib/whyDidYouRender";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@tutti-os/ui-system";
import { RendererApp } from "./app";
import { I18nProvider } from "./i18n";
import { NativeTooltipSuppressor } from "./lib/nativeTooltipSuppression";
import { DesktopToastProvider } from "./lib/toast";
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Renderer root element '#app' was not found.");
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <TooltipProvider>
        <NativeTooltipSuppressor />
        <DesktopToastProvider>
          <RendererApp />
        </DesktopToastProvider>
      </TooltipProvider>
    </I18nProvider>
  </StrictMode>
);
