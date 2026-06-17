import assert from "node:assert/strict";
import test from "node:test";
import type { AgentProviderStatus } from "@tutti-os/client-tuttid-ts";
import type {
  AgentProviderStatusService,
  IWorkspaceAgentActivityService
} from "@renderer/features/workspace-agent";
import type { WorkspaceWorkbenchDesktopI18nRuntime } from "@shared/i18n";
import { createWorkspaceAgentProviderDockStateSource } from "./workspaceAgentProviderDockStateSource.ts";
import { workspaceAgentGuiDockEntryId } from "./workspaceWorkbenchComposition.ts";

test("agent provider dock state source resolves dynamic login state", () => {
  const service = createAgentProviderStatusService({
    statuses: [
      createStatus({
        actions: [
          { id: "login", kind: "terminal_command" },
          { id: "refresh", kind: "refresh" }
        ],
        availability: "auth_required",
        provider: "claude-code"
      })
    ]
  });
  const source = createWorkspaceAgentProviderDockStateSource({
    agentProviderStatusService: service,
    i18n: createI18n()
  });

  assert.deepEqual(
    source.getEntryState(workspaceAgentGuiDockEntryId("claude-code")),
    {
      hoverActions: [
        { id: "login", label: "login" },
        { id: "refresh", label: "refresh" }
      ],
      order: 0,
      state: {
        kind: "disabled",
        reason: "login"
      },
      visibility: "always"
    }
  );
});

test("agent provider dock state source emits subscription updates", () => {
  const service = createAgentProviderStatusService({ statuses: [] });
  const source = createWorkspaceAgentProviderDockStateSource({
    agentProviderStatusService: service,
    i18n: createI18n()
  });
  let callCount = 0;

  const unsubscribe = source.subscribe(() => {
    callCount += 1;
  });
  service.emit();
  unsubscribe();
  service.emit();

  assert.equal(callCount, 1);
});

test("agent provider dock state source refreshes when agent activity changes", () => {
  const service = createAgentProviderStatusService({ statuses: [] });
  const activityService = createWorkspaceAgentActivityService();
  const source = createWorkspaceAgentProviderDockStateSource({
    agentProviderStatusService: service,
    i18n: createI18n(),
    workspaceAgentActivityService: activityService,
    workspaceId: "workspace-1"
  });
  let callCount = 0;

  const unsubscribe = source.subscribe(() => {
    callCount += 1;
  });
  activityService.emit("workspace-1");
  activityService.emit("workspace-2");
  unsubscribe();
  activityService.emit("workspace-1");

  assert.equal(callCount, 1);
});

test("agent provider dock state source reads latest service snapshot without recreating", () => {
  const service = createAgentProviderStatusService({
    statuses: [
      createStatus({
        actions: [{ id: "install", kind: "daemon_action" }],
        availability: "not_installed",
        provider: "claude-code"
      })
    ]
  });
  const source = createWorkspaceAgentProviderDockStateSource({
    agentProviderStatusService: service,
    i18n: createI18n()
  });

  assert.deepEqual(
    source.getEntryState(workspaceAgentGuiDockEntryId("claude-code")),
    {
      hoverActions: [{ id: "install", label: "install" }],
      order: 100,
      state: {
        kind: "disabled",
        reason: "install required"
      },
      visibility: "always"
    }
  );

  service.setStatuses([
    createStatus({
      actions: [
        { id: "login", kind: "terminal_command" },
        { id: "refresh", kind: "refresh" }
      ],
      availability: "auth_required",
      provider: "claude-code"
    })
  ]);

  assert.deepEqual(
    source.getEntryState(workspaceAgentGuiDockEntryId("claude-code")),
    {
      hoverActions: [
        { id: "login", label: "login" },
        { id: "refresh", label: "refresh" }
      ],
      order: 0,
      state: {
        kind: "disabled",
        reason: "login"
      },
      visibility: "always"
    }
  );
});

test("agent provider dock state source orders installed providers before not installed providers", () => {
  const service = createAgentProviderStatusService({
    statuses: [
      createStatus({
        actions: [{ id: "install", kind: "daemon_action" }],
        availability: "not_installed",
        provider: "claude-code"
      }),
      createStatus({
        actions: [],
        availability: "ready",
        provider: "codex"
      })
    ]
  });
  const source = createWorkspaceAgentProviderDockStateSource({
    agentProviderStatusService: service,
    i18n: createI18n()
  });

  const claudeState = source.getEntryState(
    workspaceAgentGuiDockEntryId("claude-code")
  );
  const codexState = source.getEntryState(
    workspaceAgentGuiDockEntryId("codex")
  );

  assert.equal(claudeState?.order, 100);
  assert.equal(codexState?.order, 1);
  assert.ok((codexState?.order ?? 0) < (claudeState?.order ?? 0));
});

test("agent provider dock state source treats unsupported providers as setup pending", () => {
  const service = createAgentProviderStatusService({
    statuses: [
      createStatus({
        actions: [],
        availability: "unsupported",
        provider: "claude-code"
      })
    ]
  });
  const source = createWorkspaceAgentProviderDockStateSource({
    agentProviderStatusService: service,
    i18n: createI18n()
  });

  assert.deepEqual(
    source.getEntryState(workspaceAgentGuiDockEntryId("claude-code")),
    {
      order: 100,
      state: {
        kind: "unavailable",
        reason: "coming soon"
      },
      visibility: "always"
    }
  );
});

test("agent provider dock state source puts OpenClaw last when setup is required", () => {
  const service = createAgentProviderStatusService({
    statuses: [
      createStatus({
        actions: [{ id: "install", kind: "daemon_action" }],
        availability: "not_installed",
        provider: "claude-code"
      }),
      createStatus({
        actions: [{ id: "login", kind: "terminal_command" }],
        availability: "auth_required",
        provider: "openclaw"
      })
    ]
  });
  const source = createWorkspaceAgentProviderDockStateSource({
    agentProviderStatusService: service,
    i18n: createI18n()
  });

  const claudeState = source.getEntryState(
    workspaceAgentGuiDockEntryId("claude-code")
  );
  const openClawState = source.getEntryState(
    workspaceAgentGuiDockEntryId("openclaw")
  );

  assert.equal(claudeState?.order, 100);
  assert.equal(openClawState?.order, 205);
  assert.equal(openClawState?.visibility, "never");
  assert.ok((openClawState?.order ?? 0) > (claudeState?.order ?? 0));
});

test("agent provider dock state source keeps ready OpenClaw with installed providers", () => {
  const service = createAgentProviderStatusService({
    statuses: [
      createStatus({
        actions: [],
        availability: "ready",
        provider: "openclaw"
      })
    ]
  });
  const source = createWorkspaceAgentProviderDockStateSource({
    agentProviderStatusService: service,
    i18n: createI18n()
  });

  const openClawState = source.getEntryState(
    workspaceAgentGuiDockEntryId("openclaw")
  );

  assert.equal(openClawState?.order, 5);
  assert.equal(openClawState?.visibility, "always");
});

test("agent provider dock state source hides Hermes and Gemini from dock", () => {
  const service = createAgentProviderStatusService({
    statuses: [
      createStatus({
        actions: [],
        availability: "ready",
        provider: "hermes"
      }),
      createStatus({
        actions: [],
        availability: "ready",
        provider: "gemini"
      })
    ]
  });
  const source = createWorkspaceAgentProviderDockStateSource({
    agentProviderStatusService: service,
    i18n: createI18n()
  });

  const hermesState = source.getEntryState(
    workspaceAgentGuiDockEntryId("hermes")
  );
  const geminiState = source.getEntryState(
    workspaceAgentGuiDockEntryId("gemini")
  );

  assert.equal(hermesState?.visibility, "never");
  assert.equal(geminiState?.visibility, "never");
});

test("agent provider dock state source hides non-default providers until ready", () => {
  const service = createAgentProviderStatusService({
    statuses: [
      createStatus({
        actions: [{ id: "install", kind: "daemon_action" }],
        availability: "not_installed",
        provider: "openclaw"
      })
    ]
  });
  const source = createWorkspaceAgentProviderDockStateSource({
    agentProviderStatusService: service,
    i18n: createI18n()
  });

  assert.equal(
    source.getEntryState(workspaceAgentGuiDockEntryId("openclaw"))?.visibility,
    "never"
  );

  service.setStatuses([
    createStatus({
      actions: [],
      availability: "ready",
      provider: "openclaw"
    })
  ]);

  assert.equal(
    source.getEntryState(workspaceAgentGuiDockEntryId("openclaw"))?.visibility,
    "always"
  );
});

test("agent provider dock state source hides Nexight until ready", () => {
  const service = createAgentProviderStatusService({
    statuses: [
      createStatus({
        actions: [],
        availability: "auth_required",
        provider: "nexight"
      })
    ]
  });
  const source = createWorkspaceAgentProviderDockStateSource({
    agentProviderStatusService: service,
    i18n: createI18n()
  });

  assert.equal(
    source.getEntryState(workspaceAgentGuiDockEntryId("nexight"))?.visibility,
    "never"
  );

  service.setStatuses([
    createStatus({
      actions: [],
      availability: "ready",
      provider: "nexight"
    })
  ]);

  assert.equal(
    source.getEntryState(workspaceAgentGuiDockEntryId("nexight"))?.visibility,
    "always"
  );
});

function createAgentProviderStatusService(input: {
  statuses: AgentProviderStatus[];
}): AgentProviderStatusService & {
  emit(): void;
  setStatuses(statuses: AgentProviderStatus[]): void;
} {
  const listeners = new Set<() => void>();
  let statuses = input.statuses;
  return {
    _serviceBrand: undefined,
    emit() {
      for (const listener of listeners) {
        listener();
      }
    },
    getRevision: () => 0,
    getSnapshot: () => ({
      capturedAt: null,
      defaultProvider: null,
      error: null,
      isLoading: false,
      pendingActions: [],
      statuses
    }),
    getStatus: (provider) =>
      statuses.find((status) => status.provider === provider) ?? null,
    isActionPending: () => false,
    ensureLoaded: async () => null,
    refresh: async () => {},
    runAction: async () => {},
    setStatuses(nextStatuses) {
      statuses = nextStatuses;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

function createWorkspaceAgentActivityService(): Pick<
  IWorkspaceAgentActivityService,
  "subscribe"
> & {
  emit(workspaceId: string): void;
} {
  const listenersByWorkspaceId = new Map<
    string,
    Set<Parameters<IWorkspaceAgentActivityService["subscribe"]>[1]>
  >();
  return {
    emit(workspaceId) {
      for (const listener of listenersByWorkspaceId.get(workspaceId) ?? []) {
        listener({} as never);
      }
    },
    subscribe(workspaceId, listener) {
      const listeners = listenersByWorkspaceId.get(workspaceId) ?? new Set();
      listeners.add(listener);
      listenersByWorkspaceId.set(workspaceId, listeners);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

function createStatus(input: {
  actions: AgentProviderStatus["actions"];
  availability: AgentProviderStatus["availability"]["status"];
  provider: AgentProviderStatus["provider"];
}): AgentProviderStatus {
  return {
    actions: input.actions,
    adapter: {
      command: [],
      installed:
        input.availability !== "not_installed" &&
        input.availability !== "unsupported"
    },
    auth: {
      status: input.availability === "auth_required" ? "required" : "unknown"
    },
    availability: {
      status: input.availability
    },
    cli: {
      installed:
        input.availability !== "not_installed" &&
        input.availability !== "unsupported"
    },
    provider: input.provider
  };
}

function createI18n(): WorkspaceWorkbenchDesktopI18nRuntime {
  const values: Record<string, string> = {
    "agentProviders.checking": "checking",
    "agentProviders.install": "install",
    "agentProviders.installing": "installing",
    "agentProviders.installRequired": "install required",
    "agentProviders.login": "login",
    "agentProviders.loginRequired": "login required",
    "agentProviders.refresh": "refresh",
    "agentProviders.comingSoon": "coming soon",
    "agentProviders.unknown": "unknown"
  };
  return {
    has: (key: string) => key in values,
    t: (key: string) => values[key] ?? key
  } as unknown as WorkspaceWorkbenchDesktopI18nRuntime;
}
