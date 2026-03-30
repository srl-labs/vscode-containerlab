import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "@srl-labs/clab-ui";
import { createWindowClabUiHost, setClabUiHost } from "@srl-labs/clab-ui/host";
import { subscribeToWebviewMessages } from "@srl-labs/clab-ui/messaging/webviewMessageBus";
import { log } from "@srl-labs/clab-ui/utils/logger";
import "@srl-labs/clab-ui/styles/global.css";

setClabUiHost(createWindowClabUiHost());

const initialData = (window.__INITIAL_DATA__ ?? {}) as Record<string, unknown>;

if (initialData.schemaData) {
  window.__SCHEMA_DATA__ = initialData.schemaData as typeof window.__SCHEMA_DATA__;
}

if (initialData.dockerImages) {
  window.__DOCKER_IMAGES__ = initialData.dockerImages as typeof window.__DOCKER_IMAGES__;
}

subscribeToWebviewMessages((event) => {
  const message = event.data as { type?: string; dockerImages?: string[] } | undefined;
  if (message?.type === "docker-images-updated" && message.dockerImages) {
    window.__DOCKER_IMAGES__ = message.dockerImages;
    window.dispatchEvent(
      new CustomEvent("docker-images-updated", {
        detail: message.dockerImages
      })
    );
  }
});

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
      <App initialData={initialData} />
    </React.StrictMode>
  );
}

bootstrap();
