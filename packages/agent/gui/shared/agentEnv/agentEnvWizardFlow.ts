import type { AgentEnvPanelFocus } from "./agentEnvPanelStore";
import type {
  CodexSetupPhase,
  CodexSetupStepStatus
} from "./codexSetupContract";

export type AgentSetupStageId =
  | "detect"
  | "install"
  | "adapter"
  | "login"
  | "ready";

export interface AgentSetupStage {
  id: AgentSetupStageId;
  label: string;
  status: CodexSetupStepStatus;
  detail: string | null;
}

export interface AgentSetupStageLabels {
  detect: string;
  install: string;
  adapter: string;
  login: string;
  ready: string;
}

export interface DeriveAgentSetupStagesInput {
  detected: boolean;
  cliInstalled: boolean;
  versionTooOld: boolean;
  adapterInstalled: boolean;
  adapterVersionMismatch: boolean;
  authenticated: boolean;
  authRequired: boolean;
  ready: boolean;
  activePhase: CodexSetupPhase | null;
  loginPending: boolean;
  cliVersionDetail: string | null;
  adapterDetail: string | null;
  accountDetail: string | null;
  labels: AgentSetupStageLabels;
}

const INSTALLING_PHASES: ReadonlySet<CodexSetupPhase> = new Set([
  "install",
  "repair",
  "verify"
]);

/**
 * Maps primitive provider-status flags onto the fixed 5-stage track the wizard
 * renders. Version verification folds into the install (CLI) stage (an
 * unsupported version means install is `error`, not `ok`). The adapter stage
 * covers the ACP adapter, which for some providers (e.g. claude-code) is a
 * separate, slow npm install distinct from the CLI; for providers where the
 * adapter is the CLI itself it simply tracks the CLI. Login `running` is driven
 * by the caller's pending flag because login runs as a terminal action, not via
 * the activeAction phase stream.
 */
export function deriveAgentSetupStages(
  input: DeriveAgentSetupStagesInput
): AgentSetupStage[] {
  const installing = input.activePhase
    ? INSTALLING_PHASES.has(input.activePhase)
    : false;
  const installOk =
    input.ready || (input.cliInstalled && !input.versionTooOld && !installing);

  const detectStatus: CodexSetupStepStatus = input.detected ? "ok" : "running";

  const installStatus: CodexSetupStepStatus = installing
    ? "running"
    : installOk
      ? "ok"
      : input.versionTooOld
        ? "error"
        : "pending";

  const adapterOk =
    input.ready ||
    (input.adapterInstalled && !input.adapterVersionMismatch && !installing);
  const adapterStatus: CodexSetupStepStatus = installing
    ? "running"
    : adapterOk
      ? "ok"
      : input.adapterVersionMismatch
        ? "error"
        : "pending";

  const loginStatus: CodexSetupStepStatus = input.authenticated
    ? "ok"
    : input.loginPending
      ? "running"
      : "pending";

  const readyStatus: CodexSetupStepStatus = input.ready ? "ok" : "pending";

  return [
    {
      id: "detect",
      label: input.labels.detect,
      status: detectStatus,
      detail: null
    },
    {
      id: "install",
      label: input.labels.install,
      status: installStatus,
      detail: input.cliVersionDetail
    },
    {
      id: "adapter",
      label: input.labels.adapter,
      status: adapterStatus,
      detail: input.adapterDetail
    },
    {
      id: "login",
      label: input.labels.login,
      status: loginStatus,
      detail: input.accountDetail
    },
    {
      id: "ready",
      label: input.labels.ready,
      status: readyStatus,
      detail: null
    }
  ];
}

/**
 * Step-by-step reveal: even when prerequisites are already satisfied, the wizard
 * walks a cursor down the track so each stage visibly "checks off" one at a time
 * instead of all flashing complete at once.
 *
 * `revealIndex` is the cursor position. Stages before it show their real status
 * (already revealed). The stage AT the cursor is shown as `running` when its
 * real status is terminal-ok (the brief "working on it" moment before it checks
 * off) and otherwise shows its real status (so a genuinely running install, an
 * error, or a blocked prerequisite are honest). Stages after the cursor are
 * dimmed to `pending`.
 */
export function projectRevealedStages(
  realStages: AgentSetupStage[],
  revealIndex: number
): AgentSetupStage[] {
  return realStages.map((stage, index) => {
    if (index < revealIndex) {
      return stage;
    }
    if (index === revealIndex) {
      if (stage.status === "ok" || stage.status === "skipped") {
        return { ...stage, status: "running" };
      }
      return stage;
    }
    return { ...stage, status: "pending" };
  });
}

/**
 * The reveal cursor advances past a stage only once that stage is really done
 * (`ok`/`skipped`). It parks on a stage that is still `running` (a real install
 * in progress), `error`, or `pending` (a blocked prerequisite) — so the
 * animation never races ahead of reality.
 */
export function shouldAdvanceReveal(
  realStages: AgentSetupStage[],
  revealIndex: number
): boolean {
  const cursor = realStages[revealIndex];
  if (!cursor) {
    return false;
  }
  return cursor.status === "ok" || cursor.status === "skipped";
}

export interface ResolveWizardAutoStartInput {
  focus: AgentEnvPanelFocus | null;
  detected: boolean;
  ready: boolean;
  installPending: boolean;
  loginPending: boolean;
}

/**
 * Decides whether opening the wizard with a remediation focus should auto-start
 * an action. Returns the action id to run, or null when nothing should run
 * (non-remediation focus, detection not settled, already ready, or already
 * pending). The caller is responsible for firing this at most once per open.
 */
export function resolveWizardAutoStartAction(
  input: ResolveWizardAutoStartInput
): "install" | "login" | null {
  const candidate = autoStartCandidate(input.focus);
  if (!candidate) {
    return null;
  }
  if (!input.detected || input.ready) {
    return null;
  }
  if (candidate === "install" && input.installPending) {
    return null;
  }
  if (candidate === "login" && input.loginPending) {
    return null;
  }
  return candidate;
}

function autoStartCandidate(
  focus: AgentEnvPanelFocus | null
): "install" | "login" | null {
  switch (focus) {
    case "install":
    case "repair":
    case "upgrade":
      return "install";
    case "auth":
      return "login";
    default:
      return null;
  }
}
