/**
 * React TopoViewer Webview Entry Point
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TopoViewerProvider } from './context/TopoViewerContext';
import { log } from './utils/logger';
import './styles/tailwind.css';

// Get the initial data from the window object (injected by extension)
const initialData = (window as any).__INITIAL_DATA__ || {};

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
