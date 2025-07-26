import { execCommandInTerminal } from "./command";

export const EDGESHARK_INSTALL_CMD = "curl -sL \
https://github.com/siemens/edgeshark/raw/main/deployments/wget/docker-compose.yaml \
| DOCKER_DEFAULT_PLATFORM= docker compose -f - up -d"

export const EDGESHARK_UNINSTALL_CMD = "curl -sL \
https://github.com/siemens/edgeshark/raw/main/deployments/wget/docker-compose.yaml \
| DOCKER_DEFAULT_PLATFORM= docker compose -f - down"

export async function installEdgeshark() {
    execCommandInTerminal(EDGESHARK_INSTALL_CMD, "Edgeshark Installation");
}

export async function uninstallEdgeshark() {
    execCommandInTerminal(EDGESHARK_UNINSTALL_CMD, "Edgeshark Uninstallation");
}