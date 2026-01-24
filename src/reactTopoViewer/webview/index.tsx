/**
 * React TopoViewer Webview Entry Point
 */
import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { TopoViewerProvider } from "./context/TopoViewerContext";
import { log } from "./utils/logger";
import "./styles/tailwind.css";
import { PostMessageFsAdapter } from "./adapters";
import { initializeServices, getTopologyIO } from "./services";
import { subscribeToWebviewMessages } from "./utils/webviewMessageBus";

const fsAdapter = new PostMessageFsAdapter();
initializeServices(fsAdapter, { verbose: false });

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

// Log initial data
log.info(
  `[ReactTopoViewer] Initial data received, nodes: ${initialData?.nodes?.length || 0}, edges: ${initialData?.edges?.length || 0}`
);

/**
 * Bootstrap the application:
 * 1. Initialize TopologyIO with the YAML file (for editing support)
 * 2. Render React with the loaded data
 */
async function bootstrap(): Promise<void> {
  // Find the root element
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Root element not found");
  }

  // Initialize TopologyIO if we have a YAML file path (required for lab settings editing)
  const yamlFilePath = initialData.yamlFilePath as string | undefined;
  if (yamlFilePath) {
    try {
      const topologyIO = getTopologyIO();
      await topologyIO.initializeFromFile(yamlFilePath);
      log.info(`[ReactTopoViewer] TopologyIO initialized for: ${yamlFilePath}`);
    } catch (err) {
      log.warn(`[ReactTopoViewer] Failed to initialize TopologyIO: ${err}`);
    }
  }

  // Create React root and render
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <TopoViewerProvider initialData={initialData}>
        <App />
      </TopoViewerProvider>
    </React.StrictMode>
  );
}

// Start the app
void bootstrap();
