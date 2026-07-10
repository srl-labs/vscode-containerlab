import * as vscode from "vscode";

import { execCommandInTerminal } from "./command";
import { resolveApiBackend } from "./backendGuards";

export function getEdgesharkInstallCmd(): string {
  const config = vscode.workspace.getConfiguration("containerlab");
  const extraEnvVars = config.get<string>("edgeshark.extraEnvironmentVars", "");

  if (extraEnvVars) {
    // Parse the environment variables from the setting
    const envLines = extraEnvVars
      .split(",")
      .map((env) => env.trim())
      .filter((env) => env);
    if (envLines.length > 0) {
      // Create a temporary file approach with proper YAML injection
      const envSection = envLines.map((env) => `          - ${env}`).join("\\n");

      // Download, modify, and run the compose file using a secure temp file
      return `tmpFile="$(mktemp -t edgeshark-compose.XXXXXX)" && \
curl -sL https://github.com/siemens/edgeshark/raw/main/deployments/wget/docker-compose.yaml -o "$tmpFile" && \
sed -i '/gostwire:/,/^    [^ ]/ { /pull_policy:.*always/a\\        environment:\\n${envSection}
}' "$tmpFile" && \
sed -i '/edgeshark:/,/^    [^ ]/ { /pull_policy:.*always/a\\        environment:\\n${envSection}
}' "$tmpFile" && \
DOCKER_DEFAULT_PLATFORM= docker compose -f "$tmpFile" up -d && \
rm -f "$tmpFile"`;
    }
  }

  // Default command without modifications
  return `curl -sL \
https://github.com/siemens/edgeshark/raw/main/deployments/wget/docker-compose.yaml \
| DOCKER_DEFAULT_PLATFORM= docker compose -f - up -d`;
}

export function getEdgesharkUninstallCmd(): string {
  return `curl -sL \
https://github.com/siemens/edgeshark/raw/main/deployments/wget/docker-compose.yaml \
| DOCKER_DEFAULT_PLATFORM= docker compose -f - down`;
}

export const EDGESHARK_INSTALL_CMD = getEdgesharkInstallCmd();
export const EDGESHARK_UNINSTALL_CMD = getEdgesharkUninstallCmd();

export async function installEdgeshark(resource?: unknown) {
  const apiBackend = resolveApiBackend(resource);
  if (apiBackend) {
    try {
      await apiBackend.operations.setEdgeSharkInstalled(true);
      vscode.window.showInformationMessage("EdgeShark installed on the API endpoint.");
    } catch (error) {
      vscode.window.showErrorMessage(
        `EdgeShark installation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return;
  }
  execCommandInTerminal(getEdgesharkInstallCmd(), "Edgeshark Installation");
}

export async function uninstallEdgeshark(resource?: unknown) {
  const apiBackend = resolveApiBackend(resource);
  if (apiBackend) {
    try {
      await apiBackend.operations.setEdgeSharkInstalled(false);
      vscode.window.showInformationMessage("EdgeShark uninstalled from the API endpoint.");
    } catch (error) {
      vscode.window.showErrorMessage(
        `EdgeShark removal failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return;
  }
  execCommandInTerminal(getEdgesharkUninstallCmd(), "Edgeshark Uninstallation");
}
