import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { WorkspaceAgentProvider } from "@tutti-os/client-tuttid-ts";
import { Button, toast } from "@tutti-os/ui-system";
import { useService } from "@tutti-os/infra/di";
import { IAgentProviderStatusService } from "@renderer/features/workspace-agent";
import { useTranslation } from "@renderer/i18n";
import { resolveWorkspaceAgentGuiLabel } from "../services/workspaceAgentProviderCatalog";

const externalImportPromptProviders: WorkspaceAgentProvider[] = [
  "codex",
  "claude-code"
];

export function ExternalAgentSessionImportPrompt({
  onOpenImport,
  workspaceId
}: {
  onOpenImport: (providers: WorkspaceAgentProvider[]) => void;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const agentProviderStatusService = useService(IAgentProviderStatusService);
  const shownToastIds = useRef<Set<string>>(new Set());
  const snapshot = useSyncExternalStore(
    (listener) => agentProviderStatusService.subscribe(listener),
    () => agentProviderStatusService.getSnapshot(),
    () => agentProviderStatusService.getSnapshot()
  );
  const readyProviders = useMemo(
    () =>
      externalImportPromptProviders.filter((provider) => {
        const status = snapshot.statuses.find(
          (candidate) => candidate.provider === provider
        );
        return status?.availability.status === "ready";
      }),
    [snapshot.statuses]
  );

  useEffect(() => {
    void agentProviderStatusService.ensureLoaded({
      providers: externalImportPromptProviders
    });
  }, [agentProviderStatusService]);

  useEffect(() => {
    const providers = readyProviders.filter((provider) => {
      const promptKey = externalImportPromptKey(workspaceId, provider);
      return (
        !externalImportPromptMarked(workspaceId, provider) &&
        !shownToastIds.current.has(promptKey)
      );
    });
    if (providers.length === 0) {
      return;
    }
    for (const provider of providers) {
      shownToastIds.current.add(externalImportPromptKey(workspaceId, provider));
      markExternalImportPrompt(workspaceId, provider);
    }
    const providerNames = providers
      .map((provider) => resolveWorkspaceAgentGuiLabel(provider))
      .join(" / ");
    toast.custom(
      (id) => (
        <div className="flex max-w-[360px] flex-col gap-3 rounded-[10px] border border-[var(--border-1)] bg-[var(--background-fronted)] p-3 text-[13px] text-[var(--text-primary)] shadow-panel">
          <div className="flex flex-col gap-1">
            <strong className="font-semibold">
              {t("workspace.externalImport.promptTitle")}
            </strong>
            <p className="m-0 leading-[1.35] text-[var(--text-secondary)]">
              {t("workspace.externalImport.promptDescription", {
                provider: providerNames
              })}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => toast.dismiss(id)}
            >
              {t("workspace.externalImport.promptLater")}
            </Button>
            <Button
              size="sm"
              type="button"
              onClick={() => {
                toast.dismiss(id);
                onOpenImport(providers);
              }}
            >
              {t("workspace.externalImport.promptImport")}
            </Button>
          </div>
        </div>
      ),
      { duration: 16000 }
    );
  }, [onOpenImport, readyProviders, t, workspaceId]);

  return null;
}

function externalImportPromptMarked(
  workspaceId: string,
  provider: WorkspaceAgentProvider
): boolean {
  return (
    localStorage.getItem(externalImportPromptKey(workspaceId, provider)) === "1"
  );
}

function markExternalImportPrompt(
  workspaceId: string,
  provider: WorkspaceAgentProvider
): void {
  localStorage.setItem(externalImportPromptKey(workspaceId, provider), "1");
}

function externalImportPromptKey(
  workspaceId: string,
  provider: WorkspaceAgentProvider
): string {
  return `tutti.externalAgentImportPrompt.v1.${workspaceId}.${provider}`;
}
