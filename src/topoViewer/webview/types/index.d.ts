// Type declarations for modules without TypeScript definitions

declare module 'cytoscape-expand-collapse';
declare module 'cytoscape-svg';
declare module 'cytoscape-node-edge-html-label';
declare global {
  interface Window {
    topoViewerMode?: 'editor' | 'viewer' | string;
    updateTopoGridTheme?: (theme: 'light' | 'dark') => void;
    // Optional debug logger injected by the webview host
    writeTopoDebugLog?: (message: string) => void;
  }
}
export {};
