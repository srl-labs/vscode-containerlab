import React from "react";
import { createRoot } from "react-dom/client";

import { App, subscribeToWebviewMessages, log } from "@srl-labs/clab-ui";
import { createClabUiRuntime, createWindowClabUiHost } from "@srl-labs/clab-ui/host";
import "@srl-labs/clab-ui/styles/global.css";

type TopoViewerWindow = Window & {
  __SCHEMA_DATA__?: unknown;
  __DOCKER_IMAGES__?: string[];
  __INITIAL_DATA__?: unknown;
};

const topoViewerWindow = window as TopoViewerWindow;

const runtime = createClabUiRuntime({ host: createWindowClabUiHost() });

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

const initialDataSource = topoViewerWindow.__INITIAL_DATA__;
const initialData = isRecord(initialDataSource) ? initialDataSource : {};

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
