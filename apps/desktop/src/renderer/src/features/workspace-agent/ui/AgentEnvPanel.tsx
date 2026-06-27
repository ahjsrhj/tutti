import { type JSX } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  RefreshIcon
} from "@tutti-os/ui-system";
import {
  closeAgentEnvPanel,
  useAgentEnvPanelRequest
} from "@tutti-os/agent-gui/agent-env";
import { useTranslation } from "@renderer/i18n";
import type { IAgentProviderStatusService } from "../services/agentProviderStatusService.interface";
import { useAgentEnvWizard } from "./useAgentEnvWizard";
import { AgentEnvSetupTrack } from "./AgentEnvSetupTrack";
import { AgentEnvReportConsent } from "./AgentEnvReportConsent";
import { resolveProviderLabel } from "./agentEnvPanelText";

interface AgentEnvPanelProps {
  agentProviderStatusService: IAgentProviderStatusService;
  workspaceId: string;
  workbenchHost?: unknown;
}

export function AgentEnvPanel({
  agentProviderStatusService,
  workspaceId,
  workbenchHost
}: AgentEnvPanelProps): JSX.Element | null {
  const { t } = useTranslation();
  const request = useAgentEnvPanelRequest();
  const {
    provider,
    isSupported,
    viewModel,
    reportState,
    copied,
    logExpanded,
    actions
  } = useAgentEnvWizard({
    service: agentProviderStatusService,
    workspaceId,
    workbenchHost
  });
  const providerLabel = resolveProviderLabel(provider);

  // Do NOT early-return null when closed. This <Dialog> is a controlled Radix
  // dialog with disableOutsidePointerEvents; it must observe the open→false
  // transition to restore document.body pointer-events and the scroll lock.
  // Unmounting it while it still believes it is open strands the whole app
  // with `pointer-events: none` — clicks register nowhere and the wizard can
  // never be reopened until reload. Let the `open` prop drive visibility; the
  // DialogContent wrapper unmounts its own subtree after the close animation.
  return (
    <Dialog
      open={request.open}
      onOpenChange={(next) => {
        if (!next) closeAgentEnvPanel();
      }}
    >
      <DialogContent className="flex max-h-[min(640px,calc(100vh-32px))] flex-col gap-0 overflow-hidden bg-[var(--background-fronted)] p-0 sm:max-w-[560px]">
        <DialogHeader className="shrink-0 border-b border-[var(--border-1)] px-5 py-4">
          <DialogTitle>
            {t("workspace.agentEnv.configTitle", { provider: providerLabel })}
          </DialogTitle>
          <DialogDescription>
            {viewModel.ready
              ? t("workspace.agentEnv.configDescription", {
                  provider: providerLabel
                })
              : t("workspace.agentEnv.wizardDescription", {
                  provider: providerLabel
                })}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!isSupported ? (
            <p className="m-0 text-[13px] text-[var(--text-secondary)]">
              {t("workspace.agentEnv.providerUnsupported")}
            </p>
          ) : (
            <AgentEnvSetupTrack
              viewModel={viewModel}
              providerLabel={providerLabel}
              copied={copied}
              logExpanded={logExpanded}
              actions={actions}
              t={t}
            />
          )}
        </div>

        {reportState === "confirming" ? (
          <AgentEnvReportConsent
            onCancel={actions.dismissReport}
            onAgree={actions.confirmReport}
            t={t}
          />
        ) : null}

        <DialogFooter className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border-1)] px-5 py-4">
          <Button
            size="dialog"
            type="button"
            variant="ghost"
            disabled={viewModel.redetecting}
            onClick={actions.redetect}
          >
            <RefreshIcon className="size-4" />
            {t("workspace.agentEnv.actionDetect")}
          </Button>
          <Button
            size="dialog"
            type="button"
            onClick={() => closeAgentEnvPanel()}
          >
            {t("workspace.agentEnv.actionClose")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
