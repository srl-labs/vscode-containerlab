/**
 * React TopoViewer Webview Entry Point
 */
import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { log } from "./utils/logger";
import "./styles/tailwind.css";
import { subscribeToWebviewMessages } from "./messaging/webviewMessageBus";

// Get the initial data from the window object (injected by extension)
const initialData = window.__INITIAL_DATA__ ?? {};

// Extract and store schema data on window for useSchema hook
if (initialData.schemaData) {
  // Schema data is validated at runtime by useSchema hook
  window.__SCHEMA_DATA__ = initialData.schemaData as typeof window.__SCHEMA_DATA__;
}

// Extract and store docker images on window for useDockerImages hook
if (initialData.dockerImages) {
  window.__DOCKER_IMAGES__ = initialData.dockerImages;
}

// Listen for docker images updates from extension
// Note: In VS Code webviews, messages always come from the extension (trusted source)
subscribeToWebviewMessages((event) => {
  // VS Code webviews are sandboxed - messages come from the extension host
  const message = event.data as { type?: string; dockerImages?: string[] } | undefined;
  if (message?.type === "docker-images-updated" && message.dockerImages) {
    window.__DOCKER_IMAGES__ = message.dockerImages;
    // Dispatch a custom event so hooks can react to the update
    window.dispatchEvent(
      new CustomEvent("docker-images-updated", {
        detail: message.dockerImages
      })
    );
  }
});

// Log bootstrap data
const customNodeCount = Array.isArray(initialData?.customNodes)
  ? initialData.customNodes.length
  : 0;
const iconCount = Array.isArray(initialData?.customIcons) ? initialData.customIcons.length : 0;
log.info(
  `[ReactTopoViewer] Bootstrap data loaded (customNodes: ${customNodeCount}, customIcons: ${iconCount})`
);

/**
 * Bootstrap the application.
 */
function bootstrap(): void {
  // Find the root element
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Root element not found");
  }

  // Create React root and render
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App initialData={initialData} />
    </React.StrictMode>
  );
}

// Start the app
bootstrap();
