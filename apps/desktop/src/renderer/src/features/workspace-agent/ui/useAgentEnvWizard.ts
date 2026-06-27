import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { WorkspaceAgentProvider } from "@tutti-os/client-tuttid-ts";
import {
  buildAgentEnvWizardViewModel,
  readCodexSetupActiveAction,
  useAgentEnvPanelRequest,
  type AgentEnvWizardViewModel,
  type StageActionId
} from "@tutti-os/agent-gui/agent-env";
import { useTranslation } from "@renderer/i18n";
import type { IAgentProviderStatusService } from "../services/agentProviderStatusService.interface";
import {
  desktopManagedAgentProviders,
  isDesktopManagedAgentProvider
} from "../services/internal/desktopManagedAgentProviders.ts";
import {
  attachAgentEnvWizard,
  restartAgentEnvWizardDetection
} from "../services/internal/agentEnvWizardController.ts";
import {
  setWizardCopied,
  setWizardReportState,
  toggleWizardLog,
  useAgentEnvWizardState,
  type WizardReportState
} from "../services/internal/agentEnvWizardStore.ts";

function useStatusSnapshot(service: IAgentProviderStatusService) {
  return useSyncExternalStore(
    (l) => service.subscribe(l),
    () => service.getSnapshot()
  );
}

function resolveActiveProvider(
  requested: string | null,
  defaultProvider: WorkspaceAgentProvider | null
): WorkspaceAgentProvider {
  if (requested && isDesktopManagedAgentProvider(requested)) {
    return requested;
  }
  if (defaultProvider && isDesktopManagedAgentProvider(defaultProvider)) {
    return defaultProvider;
  }
  return desktopManagedAgentProviders.includes("codex")
    ? "codex"
    : desktopManagedAgentProviders[0];
}

export interface AgentEnvWizardActions {
  redetect(): void;
  runStageAction(actionId: StageActionId): void;
  confirmReport(): void;
  dismissReport(): void;
  copyManual(command: string): void;
  toggleLog(): void;
}

export function useAgentEnvWizard(input: {
  service: IAgentProviderStatusService;
  workspaceId: string;
  workbenchHost?: unknown;
}): {
  provider: WorkspaceAgentProvider;
  isSupported: boolean;
  viewModel: AgentEnvWizardViewModel;
  reportState: WizardReportState;
  copied: boolean;
  logExpanded: boolean;
  actions: AgentEnvWizardActions;
} {
  const { service, workspaceId, workbenchHost } = input;
  const { t } = useTranslation();
  const request = useAgentEnvPanelRequest();
  const snapshot = useStatusSnapshot(service);
  const wizard = useAgentEnvWizardState();

  const provider = useMemo(
    () => resolveActiveProvider(request.provider, snapshot.defaultProvider),
    [request.provider, snapshot.defaultProvider]
  );

  const status = useMemo(
    () => snapshot.statuses.find((s) => s.provider === provider) ?? null,
    [snapshot.statuses, provider]
  );

  const attachParams = useMemo(
    () => ({
      service,
      provider,
      focus: request.focus,
      requestSequence: request.requestSequence,
      context: { workspaceId, workbenchHost }
    }),
    [
      service,
      provider,
      request.focus,
      request.requestSequence,
      workspaceId,
      workbenchHost
    ]
  );

  // Single lifecycle effect: synchronize the orchestrator with the open panel.
  useEffect(() => {
    if (!request.open) {
      return;
    }
    return attachAgentEnvWizard(attachParams);
  }, [request.open, attachParams]);

  const stageLabels = useMemo(
    () => ({
      detect: t("workspace.agentEnv.stageDetect"),
      network: t("workspace.agentEnv.stageNetwork"),
      install: t("workspace.agentEnv.stageInstall"),
      adapter: t("workspace.agentEnv.stageAdapter"),
      login: t("workspace.agentEnv.stageLogin"),
      ready: t("workspace.agentEnv.stageReady")
    }),
    [t]
  );

  const viewModel = useMemo(
    () =>
      buildAgentEnvWizardViewModel({
        provider,
        status,
        isLoading: snapshot.isLoading,
        activeAction: readCodexSetupActiveAction(status),
        installActionPending: service.isActionPending(provider, "install"),
        loginPending: service.isActionPending(provider, "login"),
        revealIndex: wizard.revealIndex,
        stageLabels
      }),
    [
      provider,
      status,
      snapshot.isLoading,
      snapshot.pendingActions,
      service,
      wizard.revealIndex,
      stageLabels
    ]
  );

  const redetect = useCallback(
    () => restartAgentEnvWizardDetection(attachParams),
    [attachParams]
  );
  const runStageAction = useCallback(
    (actionId: StageActionId) => {
      if (actionId === "redetect") {
        restartAgentEnvWizardDetection(attachParams);
        return;
      }
      void service.runAction(provider, actionId, {
        workbenchHost,
        workspaceId
      });
    },
    [attachParams, service, provider, workbenchHost, workspaceId]
  );
  const confirmReport = useCallback(() => {
    service.setDiagnosticsConsent(true);
    void service.reportEnvIssue(provider);
    setWizardReportState("reported");
  }, [service, provider]);
  const dismissReport = useCallback(
    () => setWizardReportState("dismissed"),
    []
  );
  const copyManual = useCallback(async (command: string) => {
    try {
      await navigator.clipboard?.writeText(command);
      setWizardCopied(true);
    } catch {
      setWizardCopied(false);
    }
  }, []);
  const copyManualSync = useCallback(
    (c: string) => void copyManual(c),
    [copyManual]
  );
  const toggleLog = useCallback(() => toggleWizardLog(), []);

  return {
    provider,
    isSupported: isDesktopManagedAgentProvider(provider),
    viewModel,
    reportState: wizard.reportState,
    copied: wizard.copied,
    logExpanded: wizard.logExpanded,
    actions: {
      redetect,
      runStageAction,
      confirmReport,
      dismissReport,
      copyManual: copyManualSync,
      toggleLog
    }
  };
}
