# React TopoViewer Development Server

This directory contains a standalone Vite dev server for rapid UI prototyping of the React TopoViewer without needing to run the full VS Code extension.

## Quick Start

```bash
npm run dev
```

This opens `http://localhost:5173` in your browser with the React TopoViewer running in standalone mode.

## Features

- **Instant Updates**: Changes to React components are reflected immediately (full page reload, Fast Refresh disabled for stability)
- **VS Code Theme Simulation**: CSS variables simulate the VS Code dark/light themes
- **Mock VS Code API**: All `postMessage` calls are logged to browser console
- **Sample Topology Data**: Pre-loaded spine-leaf topology for testing

## Settings Panel

Click the **⚙ gear button** (bottom-right) to open the settings panel:

| Setting | Options | Description |
|---------|---------|-------------|
| **Topology** | Sample, Empty, Large (25), Large (100), Massive (1000) | Load different test topologies |
| **Mode** | Edit, View | Switch between editor and viewer modes |
| **Deployment State** | Deployed, Undeployed, Unknown | Simulate lab deployment status |
| **Light Theme** | Toggle switch | Switch between dark/light themes |

The panel closes when clicking outside of it.

## Console Utilities

The same utilities are also available in the browser console:

```javascript
__DEV__.loadTopology('sample')        // spine-leaf topology (6 nodes)
__DEV__.loadTopology('empty')         // empty canvas
__DEV__.loadTopology('large')         // 25-node grid
__DEV__.loadTopology('large100')      // 100-node grid
__DEV__.loadTopology('large1000')     // 1000-node grid

__DEV__.setMode('edit')               // editor mode
__DEV__.setMode('view')               // view-only mode

__DEV__.setDeploymentState('deployed')
__DEV__.setDeploymentState('undeployed')
__DEV__.setDeploymentState('unknown')
```

## UI Indicators

- **DEV MODE banner** (top-center): Confirms you're in development mode
- **⚙ gear button** (bottom-right): Opens settings panel

## File Structure

```
dev/
├── vite.config.ts    # Vite configuration with path aliases
├── tsconfig.json     # TypeScript config for the dev environment
├── index.html        # Entry HTML with VS Code CSS variables
├── main.tsx          # Bootstrap with mocked VS Code API
├── mockData.ts       # Sample topology data and utilities
└── README.md         # This file
```

## How It Works

1. **Vite** serves the dev environment with hot module replacement
2. **Path aliases** (`@webview/*`, `@shared/*`) point to the actual source files
3. **Mock VS Code API** intercepts `postMessage` calls and logs them
4. **CSS variables** simulate VS Code's theme system

## Workflow

1. Run `npm run dev`
2. Make changes to components in `src/reactTopoViewer/webview/`
3. Browser reloads automatically
4. Test UI behavior with different topologies/states
5. When ready, test in VS Code with `npm run package`

## Troubleshooting

### Blank screen with console errors
Clear Vite cache and restart:
```bash
rm -rf node_modules/.vite
npm run dev
```

### Styles not updating
Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)

### Mock API not receiving messages
Check browser console - all `postMessage` calls are logged with green `[postMessage to Extension]` prefix.

## Notes

- Fast Refresh is disabled to avoid React hook order issues with the complex hook structure
- The dev server runs independently of VS Code - no extension debugging needed
- Changes to `src/reactTopoViewer/` files are picked up automatically
