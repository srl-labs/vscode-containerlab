// Type declarations for modules without TypeScript definitions

declare module 'cytoscape-expand-collapse';
declare module 'cytoscape-svg';
declare module 'cytoscape-node-edge-html-label';

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    topoViewerMode?: 'editor' | 'viewer' | string;
  }
}
export {};
