import type { WorkbenchHostDockEntryStateSource } from "@tutti-os/workbench-surface";
import type { AgentProviderStatus } from "@tutti-os/client-tuttid-ts";
import type {
  AgentProviderStatusService,
  IWorkspaceAgentActivityService
} from "@renderer/features/workspace-agent";
import {
  workspaceWorkbenchDesktopI18nKeys,
  type WorkspaceWorkbenchDesktopI18nRuntime
} from "../../../../../../shared/i18n/index.ts";
import { resolveAgentProviderDockStatusProps } from "./workspaceAgentProviderDockStatus.ts";
import {
  workspaceAgentGuiProviderFromIdentifier,
  type WorkspaceAgentGuiProvider
} from "./workspaceWorkbenchComposition.ts";
import {
  isWorkspaceAgentGuiDockSuppressedProvider,
  isWorkspaceAgentGuiDefaultDockProvider,
  workspaceAgentGuiProviders
} from "./workspaceAgentProviderCatalog.ts";

const installedDockOrderOffset = 0;
const pendingInstallDockOrderOffset = 100;
const openClawSetupRequiredDockOrderOffset = 200;

const agentProviderDockBaseOrder = new Map<WorkspaceAgentGuiProvider, number>(
  workspaceAgentGuiProviders.map((provider, index) => [provider, index])
);

export function createWorkspaceAgentProviderDockStateSource(input: {
  agentProviderStatusService: AgentProviderStatusService;
  i18n: WorkspaceWorkbenchDesktopI18nRuntime;
  workspaceAgentActivityService?: Pick<
    IWorkspaceAgentActivityService,
    "subscribe"
  >;
  workspaceId?: string;
}): WorkbenchHostDockEntryStateSource {
  return {
    getEntryState(entryId) {
      const provider = workspaceAgentGuiProviderFromIdentifier(entryId);
      if (!provider) {
        return null;
      }
      const snapshot = input.agentProviderStatusService.getSnapshot();
      const status = input.agentProviderStatusService.getStatus(provider);
      const state = resolveAgentProviderDockStatusProps({
        copy: {
          checking: input.i18n.t(
            workspaceWorkbenchDesktopI18nKeys.agentProviders.checking
          ),
          install: input.i18n.t(
            workspaceWorkbenchDesktopI18nKeys.agentProviders.install
          ),
          installing: input.i18n.t(
            workspaceWorkbenchDesktopI18nKeys.agentProviders.installing
          ),
          installRequired: input.i18n.t(
            workspaceWorkbenchDesktopI18nKeys.agentProviders.installRequired
          ),
          login: input.i18n.t(
            workspaceWorkbenchDesktopI18nKeys.agentProviders.login
          ),
          loginRequired: input.i18n.t(
            workspaceWorkbenchDesktopI18nKeys.agentProviders.loginRequired
          ),
          refresh: input.i18n.t(
            workspaceWorkbenchDesktopI18nKeys.agentProviders.refresh
          ),
          unsupported: input.i18n.t(
            workspaceWorkbenchDesktopI18nKeys.agentProviders.comingSoon
          ),
          unknown: input.i18n.t(
            workspaceWorkbenchDesktopI18nKeys.agentProviders.unknown
          )
        },
        isLoading: snapshot.isLoading,
        pendingActionIds: new Set(
          snapshot.pendingActions
            .filter((action) => action.provider === provider)
            .map((action) => action.actionId)
        ),
        order: resolveAgentProviderDockOrder(provider, status),
        status
      });
      return {
        ...state,
        visibility: shouldShowAgentProviderInDock(provider, status)
          ? "always"
          : "never"
      };
    },
    subscribe(listener) {
      const unsubscribeProviderStatus =
        input.agentProviderStatusService.subscribe(listener);
      const unsubscribeAgentActivity =
        input.workspaceAgentActivityService && input.workspaceId
          ? input.workspaceAgentActivityService.subscribe(
              input.workspaceId,
              () => {
                listener();
              }
            )
          : undefined;
      return () => {
        unsubscribeProviderStatus();
        unsubscribeAgentActivity?.();
      };
    }
  };
}

function shouldShowAgentProviderInDock(
  provider: WorkspaceAgentGuiProvider,
  status: AgentProviderStatus | null
): boolean {
  return (
    !isWorkspaceAgentGuiDockSuppressedProvider(provider) &&
    (isWorkspaceAgentGuiDefaultDockProvider(provider) ||
      status?.availability.status === "ready")
  );
}

function resolveAgentProviderDockOrder(
  provider: WorkspaceAgentGuiProvider,
  status: AgentProviderStatus | null
): number {
  const baseOrder = agentProviderDockBaseOrder.get(provider) ?? 0;
  if (provider === "openclaw" && status?.availability.status !== "ready") {
    return openClawSetupRequiredDockOrderOffset + baseOrder;
  }
  const statusOffset =
    status &&
    status.availability.status !== "not_installed" &&
    status.availability.status !== "unsupported"
      ? installedDockOrderOffset
      : pendingInstallDockOrderOffset;
  return statusOffset + baseOrder;
}
