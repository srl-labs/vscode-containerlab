import * as vscode from 'vscode';
import { execCommandInTerminal } from './command';

export function getEdgesharkInstallCmd(): string {
    const config = vscode.workspace.getConfiguration('containerlab');
    const extraEnvVars = config.get<string>('edgeshark.extraEnvironmentVars', '');

    if (extraEnvVars) {
        // Parse the environment variables from the setting
        const envLines = extraEnvVars.split(',').map(env => env.trim()).filter(env => env);
        if (envLines.length > 0) {
            // Create a temporary file approach with proper YAML injection
            const envSection = envLines.map(env => `          - ${env}`).join('\\n');

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

export async function installEdgeshark() {
    execCommandInTerminal(getEdgesharkInstallCmd(), "Edgeshark Installation");
}

export async function uninstallEdgeshark() {
    execCommandInTerminal(getEdgesharkUninstallCmd(), "Edgeshark Uninstallation");
}
