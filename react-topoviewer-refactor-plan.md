# React TopoViewer Refactor Plan

1. Extract App‑local hooks from `src/reactTopoViewer/webview/App.tsx` into appropriate folders:
   - `useNavbarCommandCallbacks` → `src/reactTopoViewer/webview/hooks/ui/useNavbarCommands.ts`
   - `usePanelVisibility` → `src/reactTopoViewer/webview/hooks/ui/usePanelVisibility.ts`
   - `useDeploymentCommands`, `useEditorPanelCommands`, `useFloatingPanelCommands` → `src/reactTopoViewer/webview/hooks/ui/usePanelCommands.ts`
2. Move pure helper functions out of `App.tsx`:
   - `convertToLinkEditorData` → `src/reactTopoViewer/webview/utils/linkEditorConversions.ts`
   - Reuse/export `NodeData`/`LinkData` types from `src/reactTopoViewer/webview/hooks/useAppState.ts` instead of redefining them in panels.
3. Update `App.tsx` imports/usage to use the extracted hooks/helpers and remove dead locals.
4. Fix Cytoscape init cleanup in `src/reactTopoViewer/webview/components/canvas/CytoscapeCanvas.tsx`:
   - Replace the recursive “delay init if 0×0” logic with a `ResizeObserver`/single effect that waits for non‑zero size.
   - Ensure the cleanup always destroys the latest Cytoscape instance on unmount.
5. Tailwind v4 polish:
   - Either define a `text-2xs` utility in `@theme`/`@layer utilities` or switch to an existing size token where used.
   - Move top‑level custom blocks (e.g., Floating Action Panel styles) into `@layer components` for consistency.
6. Extract the large inline `ContainerlabLogo` SVG from `Navbar.tsx` into a dedicated component or static asset and import it.
7. Decide on a single draggable/persisted panel pattern:
   - Prefer reusing `BasePanel`/`useDraggable` where possible.
   - Deprecate or wrap `FloatingPanel` and `floatingPanel/usePanelPosition.ts` to reduce duplicate drag logic.
General: Run `npm run lint` very very often, fix any refactor‑introduced issues, and update docs/CHANGELOG only if user‑visible behavior changes.

