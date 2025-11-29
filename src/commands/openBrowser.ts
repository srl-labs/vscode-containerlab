import * as vscode from "vscode";
import { promisify } from "util";
import { exec } from "child_process";
import { outputChannel } from "../extension";
import { ClabContainerTreeNode } from "../treeView/common";

const execAsync = promisify(exec);

interface PortMapping {
  containerPort: string;
  hostPort: string;
  protocol: string;
  description: string;
}

/**
 * Opens a port of a containerlab node in the default browser.
 * If multiple ports are exposed, presents a quick pick to select which one.
 */
export async function openBrowser(node: ClabContainerTreeNode) {
  if (!node) {
    vscode.window.showErrorMessage("No container node selected.");
    return;
  }

  const containerId = node.cID;
  if (!containerId) {
    vscode.window.showErrorMessage("No container ID found.");
    return;
  }

  try {
    // Get the exposed ports for this container
    const portMappings = await getExposedPorts(containerId);

    if (!portMappings || portMappings.length === 0) {
      vscode.window.showInformationMessage(`No exposed ports found for container ${node.name}.`);
      return;
    }

    // If only one port is exposed, open it directly
    if (portMappings.length === 1) {
      openPortInBrowser(portMappings[0], node.name);
      return;
    }

    // If multiple ports are exposed, show a quick pick
    const quickPickItems = portMappings.map(mapping => ({
      label: `${mapping.hostPort}:${mapping.containerPort}/${mapping.protocol}`,
      description: mapping.description || "",
      detail: `Open in browser`,
      mapping: mapping
    }));

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: "Select a port to open in browser"
    });

    if (selected) {
      openPortInBrowser(selected.mapping, node.name);
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error getting port mappings: ${error.message}`);
    outputChannel.error(`openPort() => ${error.message}`);
  }
}

/**
 * Get the exposed ports for a container using docker/podman port command
 */
async function getExposedPorts(containerId: string): Promise<PortMapping[]> {
  try {
    // Use runtime from user configuration
    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");

    // Use the 'port' command which gives cleaner output format
    const command = `${runtime} port ${containerId}`;

    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      outputChannel.warn(`stderr from port mapping command: ${stderr}`);
    }

    // Store unique port mappings by hostPort to avoid duplicates
    const portMap = new Map<string, PortMapping>();

    if (!stdout.trim()) {
      outputChannel.info(`No exposed ports found for container ${containerId}`);
      return [];
    }

    // Output can vary by Docker version, but generally looks like:
    // 8080/tcp -> 0.0.0.0:30008
    // or
    // 80/tcp -> 0.0.0.0:8080
    // or sometimes just
    // 80/tcp -> :8080
    const portLines = stdout.trim().split('\n');

    for (const line of portLines) {

      // Match container port and protocol
      let containerPort = '';
      let protocol = '';
      let hostPort = '';

      // Look for format like "80/tcp -> 0.0.0.0:8080" or "80/tcp -> :8080"
      const parts = line.trim().split(/\s+/);
      const first = parts[0] || '';
      const last = parts[parts.length - 1] || '';
      const portProto = /^(\d+)\/(\w+)$/;
      const hostPortRegex = /:(\d+)$/;
      const ppMatch = portProto.exec(first);
      const hpMatch = hostPortRegex.exec(last);
      const match = ppMatch && hpMatch ? [first, ppMatch[1], ppMatch[2], hpMatch[1]] as unknown as RegExpExecArray : null;

      if (match) {
        containerPort = match[1];
        protocol = match[2];
        hostPort = match[3];

        // Get a description for this port
        const description = getPortDescription(containerPort);

        // Use hostPort as the key to avoid duplicates
        if (!portMap.has(hostPort)) {
          portMap.set(hostPort, {
            containerPort,
            hostPort,
            protocol,
            description
          });
        }
      } else {
        outputChannel.warn(`Failed to parse port mapping from: ${line}`);
      }
    }

    // Convert the map values to an array
    return Array.from(portMap.values());
  } catch (error: any) {
    outputChannel.error(`Error getting port mappings: ${error.message}`);
    return [];
  }
}

/**
 * Open a specific port in the default browser
 */
function openPortInBrowser(mapping: PortMapping, containerName: string) {
  // Always use HTTP protocol - simple and direct
  const url = `http://localhost:${mapping.hostPort}`;

  outputChannel.info(`Opening ${url} for container ${containerName}`);

  // Ensure the URL has a proper protocol so the system opens it in a browser
  vscode.env.openExternal(vscode.Uri.parse(url));

  const desc = mapping.description ? ` (${mapping.description})` : '';
  vscode.window.showInformationMessage(`Opening port ${mapping.hostPort} in browser${desc}`);
}

/**
 * Get a description for common port numbers
 */
function getPortDescription(port: string): string {
  const portMap: Record<string, string> = {
    '22': 'SSH',
    '23': 'Telnet',
    '25': 'SMTP',
    '53': 'DNS',
    '80': 'HTTP',
    '443': 'HTTPS',
    '1880': 'Node-RED',
    '3000': 'Grafana',
    '5432': 'PostgreSQL',
    '5601': 'Kibana',
    '8080': 'Web Server',
    '8443': 'HTTPS (Alt)',
    '9000': 'Web Server',
    '9090': 'Prometheus',
    '9200': 'Elasticsearch'
  };

  return portMap[port] || '';
}
