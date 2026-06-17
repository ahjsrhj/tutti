import * as React from "react";

const WHY_DID_YOU_RENDER_STORAGE_KEY = "tuttiWhyDidYouRender";
const whyDidYouRenderEnableSource = import.meta.env.DEV
  ? resolveWhyDidYouRenderEnableSource()
  : null;

if (whyDidYouRenderEnableSource !== null) {
  const { default: whyDidYouRender } =
    await import("@welldone-software/why-did-you-render");
  whyDidYouRender(React, {
    collapseGroups: true,
    include: [/AgentGUI/u, /DesktopAgentGUI/u, /Workbench/u],
    logOwnerReasons: true,
    trackAllPureComponents: true,
    trackHooks: true
  });
  console.info(
    `[tutti] why-did-you-render enabled by ${whyDidYouRenderEnableSource}`
  );
}

function resolveWhyDidYouRenderEnableSource(): string | null {
  try {
    const storageValue = globalThis.localStorage?.getItem(
      WHY_DID_YOU_RENDER_STORAGE_KEY
    );
    if (storageValue === "1") {
      return `localStorage.${WHY_DID_YOU_RENDER_STORAGE_KEY}=1`;
    }
    if (storageValue === "0") {
      return null;
    }
  } catch {
    // Fall through to the env-based default for dev-gui.
  }
  return import.meta.env.VITE_TUTTI_WHY_DID_YOU_RENDER === "1"
    ? "VITE_TUTTI_WHY_DID_YOU_RENDER=1"
    : null;
}
