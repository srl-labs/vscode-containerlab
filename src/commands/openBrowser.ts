import * as vscode from "vscode";

import { outputChannel, dockerClient } from "../globals";
import type { ClabContainerTreeNode } from "../treeView/common";

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
  const containerId = resolveContainerId(node);
  if (!containerId) {
    return;
  }

  const portMappings = await getExposedPorts(containerId);
  if (!portMappings || portMappings.length === 0) {
    vscode.window.showInformationMessage(`No exposed ports found for container ${node.name}.`);
    return;
  }

  const mapping = await pickPortMapping(portMappings);
  if (!mapping) {
    return;
  }

  openPortInBrowser(mapping, node.name);
}

function resolveContainerId(node?: ClabContainerTreeNode): string | undefined {
  if (!node) {
    vscode.window.showErrorMessage("No container node selected.");
    return undefined;
  }

  if (!node.cID) {
    vscode.window.showErrorMessage("No container ID found.");
    return undefined;
  }

  return node.cID;
}

async function pickPortMapping(portMappings: PortMapping[]): Promise<PortMapping | undefined> {
  if (portMappings.length === 1) {
    return portMappings[0];
  }

  const quickPickItems = portMappings.map(mapping => ({
    label: `${mapping.hostPort}:${mapping.containerPort}/${mapping.protocol}`,
    description: mapping.description || "",
    detail: `Open in browser`,
    mapping
  }));

  const selected = await vscode.window.showQuickPick(quickPickItems, {
    placeHolder: "Select a port to open in browser"
  });

  return selected?.mapping;
}

/**
 * Get the exposed ports for a container using Dockerode
 */
async function getExposedPorts(containerId: string): Promise<PortMapping[]> {
  if (!dockerClient) {
    outputChannel.error('Docker client not initialized');
    return [];
  }

  try {
    const container = dockerClient.getContainer(containerId);
    const containerInfo = await container.inspect();
    const ports = containerInfo.NetworkSettings.Ports || {};

    const mappings = collectPortMappings(ports);

    if (mappings.length === 0) {
      outputChannel.info(`No exposed ports found for container ${containerId}`);
    }

    return mappings;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.error(`Error getting port mappings: ${message}`);
    return [];
  }
}

type DockerPortBinding = { HostIp?: string; HostPort?: string };
type DockerPortBindings = Record<string, DockerPortBinding[] | undefined>;

function collectPortMappings(ports: DockerPortBindings): PortMapping[] {
  const portMap = new Map<string, PortMapping>();

  for (const [portProto, bindings] of Object.entries(ports)) {
    addBindingsForPort(portMap, portProto, bindings);
  }

  return Array.from(portMap.values());
}

function addBindingsForPort(
  portMap: Map<string, PortMapping>,
  portProto: string,
  bindings?: DockerPortBinding[]
) {
  if (!bindings || bindings.length === 0) {
    return;
  }

  const parsed = parseContainerPort(portProto);
  if (!parsed) {
    return;
  }

  for (const binding of bindings) {
    addBinding(portMap, binding.HostPort, parsed.containerPort, parsed.protocol);
  }
}

function parseContainerPort(portProto: string): { containerPort: string; protocol: string } | undefined {
  const match = /^(\d+)\/(\w+)$/.exec(portProto);
  if (!match) {
    return undefined;
  }
  return { containerPort: match[1], protocol: match[2] };
}

function addBinding(
  portMap: Map<string, PortMapping>,
  hostPort: string | undefined,
  containerPort: string,
  protocol: string
) {
  if (!hostPort || portMap.has(hostPort)) {
    return;
  }

  portMap.set(hostPort, {
    containerPort,
    hostPort,
    protocol,
    description: getPortDescription(containerPort)
  });
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
