const workspaceAppOpenUrlChannel = "workspace-app:open-url";

interface WorkspaceAppLinkInterceptionOptions {
  reportDiagnostic?: (
    diagnostic: WorkspaceAppLinkInterceptionDiagnostic
  ) => void;
  scope: Window;
  send(this: void, channel: string, payload: unknown): void;
}

export function installWorkspaceAppLinkInterception({
  reportDiagnostic,
  scope,
  send
}: WorkspaceAppLinkInterceptionOptions): () => void {
  return installPreloadLinkInterception({
    reportDiagnostic,
    scope,
    sendOpenUrl(url) {
      send(workspaceAppOpenUrlChannel, { url });
    }
  });
}

export function installPreloadLinkInterception({
  reportDiagnostic,
  scope,
  sendOpenUrl
}: {
  reportDiagnostic?: (
    diagnostic: WorkspaceAppLinkInterceptionDiagnostic
  ) => void;
  scope: Window;
  sendOpenUrl: (url: string) => void;
}): () => void {
  const originalOpen = scope.open;
  if (typeof originalOpen === "function") {
    scope.open = ((url?: string | URL, target?: string, features?: string) => {
      if (shouldNavigateOpenInPlace(target)) {
        const resolvedSameOriginUrl = resolveSameOriginUrl(scope, url);
        if (resolvedSameOriginUrl) {
          scope.location.assign(resolvedSameOriginUrl);
          return scope as unknown as WindowProxy;
        }
      }

      return originalOpen.call(scope, url, target, features);
    }) as Window["open"];
  }

  const handleClick = (event: MouseEvent) => {
    const anchor = resolveAnchorTarget(event);
    if (!anchor) {
      return;
    }

    const href = anchor.href.trim();
    const target = anchor.getAttribute("target")?.trim().toLowerCase() ?? "";
    if (target !== "_blank") {
      return;
    }
    if (!isInterceptableBlankTarget(anchor)) {
      reportDiagnostic?.({
        action: "skip",
        href,
        reason: anchor.hasAttribute("download")
          ? "download-link"
          : href.startsWith("javascript:")
            ? "javascript-url"
            : "invalid-url",
        target
      });
      return;
    }
    if (!shouldInterceptMouseOpen(event)) {
      reportDiagnostic?.({
        action: "skip",
        button: event.button,
        defaultPrevented: event.defaultPrevented,
        href,
        modifiers: getMouseModifiers(event),
        reason: event.defaultPrevented
          ? "default-prevented"
          : event.button !== 0
            ? "non-left-click"
            : hasMouseModifier(event)
              ? "modified-click"
              : "not-interceptable",
        target
      });
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const resolvedSameOriginUrl = resolveSameOriginUrl(scope, href);
    if (resolvedSameOriginUrl) {
      reportDiagnostic?.({
        action: "navigate-in-place",
        button: event.button,
        defaultPrevented: event.defaultPrevented,
        href,
        modifiers: getMouseModifiers(event),
        target,
        url: resolvedSameOriginUrl
      });
      scope.location.assign(resolvedSameOriginUrl);
      return;
    }

    reportDiagnostic?.({
      action: "open-url",
      button: event.button,
      defaultPrevented: event.defaultPrevented,
      href,
      modifiers: getMouseModifiers(event),
      target
    });
    sendOpenUrl(href);
  };

  reportDiagnostic?.({
    action: "installed",
    readyState: scope.document.readyState,
    url: scope.location.href
  });
  scope.addEventListener("click", handleClick, true);

  return () => {
    scope.open = originalOpen;
    scope.removeEventListener("click", handleClick, true);
  };
}

function shouldNavigateOpenInPlace(target: string | undefined): boolean {
  const normalizedTarget = target?.trim().toLowerCase() ?? "";
  return normalizedTarget.length === 0 || normalizedTarget === "_blank";
}

function resolveSameOriginUrl(
  scope: Window,
  url: string | URL | undefined
): string | null {
  if (url === undefined) {
    return null;
  }

  const rawUrl = url.toString().trim();
  if (rawUrl.length === 0) {
    return null;
  }

  try {
    const currentUrl = new URL(scope.location.href);
    const nextUrl = new URL(rawUrl, currentUrl);
    return nextUrl.origin === currentUrl.origin ? nextUrl.href : null;
  } catch {
    return null;
  }
}

function resolveAnchorTarget(event: Event): HTMLAnchorElement | null {
  const path =
    typeof event.composedPath === "function"
      ? event.composedPath()
      : [event.target].filter(Boolean);

  for (const entry of path) {
    if (entry instanceof HTMLAnchorElement) {
      return entry;
    }
    if (entry instanceof Element) {
      const anchor = entry.closest("a[href]");
      if (anchor instanceof HTMLAnchorElement) {
        return anchor;
      }
    }
  }

  let current = event.target;
  while (current instanceof Element) {
    if (
      current instanceof HTMLAnchorElement &&
      current.href.trim().length > 0
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function isInterceptableBlankTarget(anchor: HTMLAnchorElement): boolean {
  const href = anchor.href.trim();
  if (href.length === 0 || anchor.hasAttribute("download")) {
    return false;
  }

  const target = anchor.getAttribute("target")?.trim().toLowerCase() ?? "";
  if (target !== "_blank") {
    return false;
  }

  return !href.startsWith("javascript:");
}

interface WorkspaceAppLinkInterceptionDiagnostic {
  readonly action: "installed" | "navigate-in-place" | "open-url" | "skip";
  readonly button?: number;
  readonly defaultPrevented?: boolean;
  readonly href?: string;
  readonly modifiers?: {
    readonly alt: boolean;
    readonly ctrl: boolean;
    readonly meta: boolean;
    readonly shift: boolean;
  };
  readonly readyState?: string;
  readonly reason?: string;
  readonly target?: string;
  readonly url?: string;
}

function getMouseModifiers(event: MouseEvent): {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
} {
  return {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey
  };
}

function hasMouseModifier(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function shouldInterceptMouseOpen(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented && event.button === 0 && !hasMouseModifier(event)
  );
}
