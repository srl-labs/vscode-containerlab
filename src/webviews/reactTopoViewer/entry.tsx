import React from "react";
import { createRoot } from "react-dom/client";

import { App, subscribeToWebviewMessages, log } from "@srl-labs/clab-ui";
import { createClabUiRuntime, createWindowClabUiHost } from "@srl-labs/clab-ui/host";
import "@srl-labs/clab-ui/styles/global.css";

type TopoViewerWindow = Window & {
  __SCHEMA_DATA__?: unknown;
  __DOCKER_IMAGES__?: string[];
};

const topoViewerWindow = window as TopoViewerWindow;

const runtime = createClabUiRuntime({ host: createWindowClabUiHost() });

const initialData = (topoViewerWindow.__INITIAL_DATA__ ?? {}) as Record<string, unknown>;

if (initialData.schemaData) {
  topoViewerWindow.__SCHEMA_DATA__ = initialData.schemaData;
}

if (initialData.dockerImages) {
  topoViewerWindow.__DOCKER_IMAGES__ = initialData.dockerImages as string[];
}

subscribeToWebviewMessages(
  (event) => {
    const message = event.data as { type?: string; dockerImages?: string[] } | undefined;
    if (message?.type === "docker-images-updated" && message.dockerImages) {
      topoViewerWindow.__DOCKER_IMAGES__ = message.dockerImages;
      topoViewerWindow.dispatchEvent(
        new CustomEvent("docker-images-updated", {
          detail: message.dockerImages
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
