# TopoViewer Dev & Style Guide

This guide orients contributors to the TopoViewer webview architecture, message bridging, modular patterns, and styling conventions. It also clarifies the legacy role of `uiHandlers.ts` and how new code should be structured.

## High‑Level Architecture

- **Extension Host (VS Code side):** `src/topoViewer/providers/topoViewerEditorWebUiFacade.ts`
  - Creates the webview, generates HTML, reads/writes YAML, and handles messages from the webview.
  - Acts as the messaging facade for the webview, dispatching requests to VS Code commands and utilities.

- **Webview UI (browser side):** `src/topoViewer/webview-ui/`
  - `topologyWebviewController.ts`: orchestrates Cytoscape, hooks up managers, menus, keyboard/mouse interaction, and message listeners.
  - `manager*.ts` modules: feature-specific logic (groups, styles, panels, layouts, etc.). Each visual area has a corresponding manager.
  - `uiHandlers.ts`: legacy glue for DOM event handlers referenced by HTML. Keep it lean; move logic into managers and the controller. This file will be removed after refactors.
  - `index.ts`: bootstraps the controller and registers global handlers needed by existing HTML.

Text diagram of the flow:

```
      +-------------------------------------------+
      |  Extension Host                           |
      |  providers/topoViewerEditorWebUiFacade.ts |
      |    - Creates webview (panel)              |
      |    - onDidReceiveMessage()                |
      |    - postMessage() → webview              |
      +---------------------^---------------------+
                            | postMessage()
                            |
      +---------------------+---------------------+
      |  Webview (Browser)                        |
      |  topologyWebviewController.ts             |
      |    - Wires managers                       |
      |    - Listens to window.message            |
      |    - Exposes minimal globals for HTML     |
      |  manager*.ts (feature modules)            |
      |    - Use VscodeMessageSender to call      |
      |      extension endpoints (facade above)   |
      |  uiHandlers.ts (legacy, thin glue)        |
      +-------------------------------------------+
```

## Message Bridging

- **From webview to extension:**
  - Use `VscodeMessageSender` (see `src/topoViewer/webview-ui/managerVscodeWebview.ts`) from managers or the controller.
  - Call `sendMessageToVscodeEndpointPost(endpointName, payload)`; the extension receives it via `panel.webview.onDidReceiveMessage(...)` in `topoViewerEditorWebUiFacade.ts` and dispatches based on `endpointName`.
  - Examples on extension side include endpoints like `topo-editor-viewport-save`, `topo-editor-undo`, `clab-node-connect-ssh`, etc.

- **From extension to webview:**
  - The extension uses `panel.webview.postMessage({ type, ... })`.
  - The webview listens in `topologyWebviewController.ts` via `window.addEventListener('message', handler)` to react (e.g., `type: 'yaml-saved'` or `type: 'updateTopology'`).

Guideline: treat `src/topoViewer/providers/topoViewerEditorWebUiFacade.ts` as the extension-side messaging facade; do not bypass it. All backend interactions should be initiated from the webview through `VscodeMessageSender` and handled by this facade.

## Roles and Responsibilities

- `topologyWebviewController.ts` (webview orchestrator)
  - Initializes Cytoscape, managers, context menus, and global window hooks.
  - Delegates domain logic to `manager*.ts` modules.
  - Handles inbound extension messages and coordinates UI updates.
  - Exposes a minimal set of functions to `window` only when HTML needs them.

- `manager*.ts` (feature modules)
  - Encapsulate logic for a specific UI surface or feature (e.g., groups, styles, free text, panels, layouts).
  - If UI needs backend calls, use `VscodeMessageSender` to reach extension endpoints implemented in the facade.
  - Own their internal event wiring; avoid leaking logic into the controller unless orchestration is required.

- `uiHandlers.ts` (legacy, will be removed)
  - Purpose: a thin compatibility layer exposing handlers referenced by existing HTML `onclick` and similar attributes.
  - Do not add feature logic here. Instead, route to a manager, or invoke a controller method. Gradually migrate existing logic to managers and delete unused handlers.
  - Note: The file name is `uiHandlers.ts` (not “uiHandlres.ts”).

## HTML vs TypeScript

- Keep presentation in HTML; keep logic in TypeScript managers and the controller.
- Do not embed inline HTML templates inside TypeScript for new work. Instead:
  - Place markup into the HTML templates the webview loads, or
  - Render via existing DOM nodes and apply classes or data attributes from TS.
- Known exception (to be refactored): some context menu label content in `topologyWebviewController.ts` is assembled as HTML strings for the radial menus. Treat that as legacy and prefer template/DOM-driven markup for new features.

## Modular Pattern (HTML ↔ manager.ts)

- Each HTML panel or module should have a corresponding `manager*.ts` that:
  - Selects its DOM root(s) and sets up listeners.
  - Implements feature logic, data mutation, and calls to the messaging facade.
  - Exports a simple API consumed by the controller for initialization.
- Avoid placing module logic in `uiHandlers.ts`. Keep it in managers and, when needed, orchestrate via the controller.

## Styling and Theming

- Use Tailwind utility classes and design tokens defined in `src/topoViewer/webview-ui/tailwind.css`.
  - Colors should derive from VS Code theme variables (e.g., `--vscode-editor-background`, `--vscode-button-background`).
  - Prefer existing component classes such as `.panel-sheet`, `.btn`, `.btn-primary`, `.btn-secondary`, `.section-title`.
  - Avoid hardcoded colors in HTML or TS. Apply classes; let CSS resolve theme.
- Respect dark/light modes via the provided selectors and CSS variables.
- Keep icons and SVGs theme-aware where possible.

## File Header and Documentation Style

- Begin every TypeScript file with a header comment that names the file and
  briefly states its purpose, for example:
  `// file: topologyWebviewController.ts` followed by a one-line summary.
- Provide JSDoc for exported functions, classes and critical methods using
  `@param` and `@returns` annotations where applicable.

## Adding a New Feature (Checklist)

1. HTML: add the view markup in the template (no inline TS-generated HTML).
2. Manager: create `manager<Feature>.ts` to own logic and DOM wiring for that area.
3. Controller: initialize and connect the manager in `topologyWebviewController.ts`.
4. Messaging: from the manager, call backend via `VscodeMessageSender.sendMessageToVscodeEndpointPost(<endpoint>, <payload>)`.
5. Facade: implement/extend the endpoint in `topoViewerEditorWebUiFacade.ts` (extension side).
6. Styling: use Tailwind classes and theme variables; avoid hardcoded colors.
7. Tests/manual: verify both directions of messaging; confirm context menus and keyboard behavior are unaffected.

## Current Realities and Future Cleanup

- `uiHandlers.ts` exists as a legacy bridge from earlier JavaScript. It currently exposes a few handlers used by HTML attributes and performs simple DOM toggles or delegates to managers. The long-term plan is to migrate all logic into `manager*.ts` modules, wire events from TS, and delete `uiHandlers.ts`.
- Some radial context menu entries in `topologyWebviewController.ts` are defined with inline HTML strings. Treat these as transitional; for new code, favor templated content and manager-bound behaviors.
- Compound node UX (groups) uses a `dummyChild` sentinel to keep empty groups interactive and discovered by selectors. If you modify group behavior, centralize it in the relevant manager and preserve consistent selectors.

## Summary

- Controller orchestrates; managers implement; HTML presents.
- Messaging flows through the facade (`topoViewerEditorWebUiFacade.ts`)—use `VscodeMessageSender` from webview code.
- Keep `uiHandlers.ts` lean and shrinking; do not add new logic there.
- Style via Tailwind and VS Code theme tokens. No inline HTML in TS for new features.

