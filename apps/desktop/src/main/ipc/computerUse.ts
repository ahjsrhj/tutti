import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { desktopIpcChannels } from "../../shared/contracts/ipc.ts";
import { registerDesktopIpcHandler } from "./handle.ts";

const CUA_DRIVER_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh";

function isCuaDriverInstalled(): boolean {
  if (process.platform !== "darwin") {
    return false;
  }
  if (existsSync("/Applications/CuaDriver.app")) {
    return true;
  }
  // Also check common PATH locations for dev installs
  for (const p of [
    `${process.env.HOME}/.local/bin/cua-driver`,
    "/usr/local/bin/cua-driver",
    "/opt/homebrew/bin/cua-driver"
  ]) {
    if (existsSync(p)) {
      return true;
    }
  }
  return false;
}

function runSubprocess(
  command: string,
  args: string[]
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const child = spawn(command, args, {
      env: {
        ...process.env,
        // Ensure ~/.local/bin is on PATH for cua-driver lookups
        PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}`
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk));

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        output: Buffer.concat(chunks).toString("utf8")
      });
    });

    child.on("error", (err) => {
      resolve({ success: false, output: err.message });
    });
  });
}

export function registerComputerUseIpc(): void {
  registerDesktopIpcHandler(desktopIpcChannels.computerUse.checkStatus, () =>
    Promise.resolve({ installed: isCuaDriverInstalled() })
  );

  registerDesktopIpcHandler(desktopIpcChannels.computerUse.install, () =>
    runSubprocess("/bin/bash", [
      "-c",
      `curl -fsSL ${CUA_DRIVER_INSTALL_SCRIPT_URL} | bash`
    ])
  );

  registerDesktopIpcHandler(
    desktopIpcChannels.computerUse.grantPermissions,
    () =>
      runSubprocess("bash", [
        "-c",
        `"${process.env.HOME}/.local/bin/cua-driver" permissions grant 2>&1 || cua-driver permissions grant 2>&1`
      ])
  );
}
