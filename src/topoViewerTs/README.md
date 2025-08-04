# TopoViewerTs Migration

This folder contains the in-progress TypeScript rewrite of the legacy **TopoViewer** webview.
It adopts the same modular framework as the existing **TopoEditor** to eventually merge
viewer and editor capabilities into a single, fully typed implementation.

## Current Progress

- Migrated backend from the original `topoViewer`.
- Converted initial webview managers to TypeScript:
  - `managerVscodeWebview.ts` handles messaging with the VS Code extension.
  - `managerLayoutAlgo.ts` provides the GeoMap layout logic.
  - `managerSocketDataEnrichment.ts` enriches nodes and edges with backend lab data.
  - `managerCyTextBox.ts` adds rich-text overlays for Cytoscape nodes.

## Next Steps

- Port remaining JavaScript managers from `src/topoViewer/webview-ui/html-static/js` to TypeScript (e.g. `managerGroupManagement.js`, `managerSvg.js`).
- Refactor globals into proper modules with explicit types.
- Integrate viewer/editor features to automatically show relevant information based on lab deployment state.
- Remove the old JavaScript-based `topoViewer` once feature parity is achieved.
- Remove the old topoEditor as finally its one merged thing, written in clean typescript

