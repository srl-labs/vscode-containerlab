import React from "react";
import { createRoot } from "react-dom/client";

import { App, subscribeToWebviewMessages, log } from "@srl-labs/clab-ui";
import { createClabUiRuntime, createWindowClabUiHost } from "@srl-labs/clab-ui/host";
import "@srl-labs/clab-ui/styles/global.css";
import type { ClabUiHostCapabilitiesBootstrap } from "../../backends/hostCapabilities";

type TopoViewerWindow = Window & {
  __SCHEMA_DATA__?: unknown;
  __DOCKER_IMAGES__?: string[];
  __INITIAL_DATA__?: unknown;
};

const topoViewerWindow = window as TopoViewerWindow;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.every((entry) => typeof entry === "string")
    ? value
    : value.filter((entry): entry is string => typeof entry === "string");
}

function enabledCapability(value: unknown, name: string): boolean {
  return isRecord(value) && value[name] === true;
}

function normalizeHostCapabilities(value: unknown): ClabUiHostCapabilitiesBootstrap {
  const capabilities = isRecord(value) ? value : {};
  const lifecycle = capabilities.lifecycleActions;
  const nodes = capabilities.nodeActions;
  const features = capabilities.features;
  return {
    lifecycleActions: {
      deployLab: enabledCapability(lifecycle, "deployLab"),
      deployLabCleanup: enabledCapability(lifecycle, "deployLabCleanup"),
      destroyLab: enabledCapability(lifecycle, "destroyLab"),
      destroyLabCleanup: enabledCapability(lifecycle, "destroyLabCleanup"),
      redeployLab: enabledCapability(lifecycle, "redeployLab"),
      redeployLabCleanup: enabledCapability(lifecycle, "redeployLabCleanup"),
      applyLab: enabledCapability(lifecycle, "applyLab"),
      startLab: enabledCapability(lifecycle, "startLab"),
      stopLab: enabledCapability(lifecycle, "stopLab"),
      restartLab: enabledCapability(lifecycle, "restartLab")
    },
    nodeActions: {
      ssh: enabledCapability(nodes, "ssh"),
      shell: enabledCapability(nodes, "shell"),
      logs: enabledCapability(nodes, "logs"),
      start: enabledCapability(nodes, "start"),
      stop: enabledCapability(nodes, "stop"),
      restart: enabledCapability(nodes, "restart")
    },
    features: {
      grafanaExport: enabledCapability(features, "grafanaExport"),
      interfaceCapture: enabledCapability(features, "interfaceCapture"),
      linkImpairment: enabledCapability(features, "linkImpairment"),
      splitView: enabledCapability(features, "splitView")
    }
  };
}

const initialDataSource = topoViewerWindow.__INITIAL_DATA__;
const initialData = isRecord(initialDataSource) ? initialDataSource : {};

// clab-ui 0.3.1 formalizes this option. Keeping targetWindow in the options
// makes the object structurally compatible with 0.3.0, where capabilities is
// an ignored extra field, while local 0.3.1 builds verify the full contract.
type WindowHostOptionsWithCapabilities = NonNullable<
  Parameters<typeof createWindowClabUiHost>[0]
> & { capabilities?: ClabUiHostCapabilitiesBootstrap };
const hostOptions: WindowHostOptionsWithCapabilities = {
  targetWindow: window,
  capabilities: normalizeHostCapabilities(initialData.hostCapabilities)
};
const runtime = createClabUiRuntime({ host: createWindowClabUiHost(hostOptions) });

if ("schemaData" in initialData) {
  topoViewerWindow.__SCHEMA_DATA__ = initialData.schemaData;
}

const bootstrapDockerImages = asStringArray(initialData.dockerImages);
if (bootstrapDockerImages !== undefined) {
  topoViewerWindow.__DOCKER_IMAGES__ = bootstrapDockerImages;
}

subscribeToWebviewMessages(
  (event) => {
    const message = isRecord(event.data) ? event.data : undefined;
    const dockerImages = asStringArray(message?.dockerImages);
    if (message?.type === "docker-images-updated" && dockerImages !== undefined) {
      topoViewerWindow.__DOCKER_IMAGES__ = dockerImages;
      topoViewerWindow.dispatchEvent(
        new CustomEvent("docker-images-updated", {
          detail: dockerImages
        })
      );
    }
  },
  undefined,
  runtime.host
);

const customNodeCount = Array.isArray(initialData.customNodes) ? initialData.customNodes.length : 0;
const iconCount = Array.isArray(initialData.customIcons) ? initialData.customIcons.length : 0;
log.info(
  `[ReactTopoViewer] Bootstrap data loaded (customNodes: ${customNodeCount}, customIcons: ${iconCount})`
);

function bootstrap(): void {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Root element not found");
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App initialData={initialData} runtime={runtime} />
    </React.StrictMode>
  );
}

bootstrap();
