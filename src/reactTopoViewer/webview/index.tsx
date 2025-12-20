/**
 * React TopoViewer Webview Entry Point
 */
import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { TopoViewerProvider } from './context/TopoViewerContext';
import { log } from './utils/logger';
import './styles/tailwind.css';
import { PostMessageFsAdapter } from './adapters';
import { initializeServices } from './services';
import { subscribeToWebviewMessages } from './utils/webviewMessageBus';

const fsAdapter = new PostMessageFsAdapter();
initializeServices(fsAdapter, { verbose: false });

// Get the initial data from the window object (injected by extension)
const initialData = (window as any).__INITIAL_DATA__ || {};

// Extract and store schema data on window for useSchema hook
if (initialData.schemaData) {
  (window as any).__SCHEMA_DATA__ = initialData.schemaData;
}

// Extract and store docker images on window for useDockerImages hook
if (initialData.dockerImages) {
  (window as any).__DOCKER_IMAGES__ = initialData.dockerImages;
}

// Listen for docker images updates from extension
// Note: In VS Code webviews, messages always come from the extension (trusted source)
subscribeToWebviewMessages((event) => {
  // VS Code webviews are sandboxed - messages come from the extension host
  const message = event.data;
  if (message?.type === 'docker-images-updated' && message.dockerImages) {
    (window as any).__DOCKER_IMAGES__ = message.dockerImages;
    // Dispatch a custom event so hooks can react to the update
    window.dispatchEvent(
      new CustomEvent('docker-images-updated', {
        detail: message.dockerImages
      })
    );
  }
});

// Log initial data
log.info(`[ReactTopoViewer] Initial data received, elements count: ${initialData?.elements?.length || 0}`);

// Find the root element
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
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
