import { execCommandInTerminal } from "./command";

export async function installEdgeshark() {
    execCommandInTerminal("curl -sL \
https://github.com/siemens/edgeshark/raw/main/deployments/wget/docker-compose.yaml \
| DOCKER_DEFAULT_PLATFORM= docker compose -f - up -d", "Edgeshark Installation");
}

export async function uninstallEdgeshark() {
    execCommandInTerminal("curl -sL \
https://github.com/siemens/edgeshark/raw/main/deployments/wget/docker-compose.yaml \
| DOCKER_DEFAULT_PLATFORM= docker compose -f - down", "Edgeshark Uninstallation");
}