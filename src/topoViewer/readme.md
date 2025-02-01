# TopoViewer: An Add-On to the Containerlab VS Code Extension

Welcome to **TopoViewer**, an add-on for the existing **Containerlab VS Code Extension** that provides an interactive, web-based interface for visualizing Containerlab topologies. This document gives a concise overview of TopoViewer’s structure, how it works, and how to get started.

> **Note**: TopoViewer is **invoked directly from** the Containerlab VS Code Extension whenever the **Graph Lab (Web - TopoViewer)** command is used. This complementary relationship allows you to keep working with Containerlab’s features while seamlessly switching to an enhanced topology visualization experience.

---

## Overview

TopoViewer is split into two main parts:

1. **Backend (Extension Code)**  
   Located under [`src/topoViewer/backend`](./src/topoViewer/backend), this portion manages:
   - Parsing and converting Containerlab YAML files into a format consumable by the UI (via `topoViewerAdaptorClab.ts`).
   - Setting up and exposing the **WebView** panel within VS Code.
   - Facilitating communication between the WebView (frontend) and the backend, using the VS Code API (e.g., message passing).

2. **Frontend (WebView UI)**  
   Located in [`src/topoViewer/webview-ui`](./src/topoViewer/webview-ui), this is static HTML asset. It runs inside a VS Code **WebView** (essentially an isolated IFrame in the editor). 

> **Note**: The design loosely follows an **MVC-like** pattern, where the backend acts as a controller and model aggregator, while the static webview-ui handles the view.

---

## WebView Primer

A **WebView** in VS Code:

- Is an isolated environment. It cannot directly import or reference VS Code or backend code.  
- Communicates with the extension backend via messages only.  
- Implements the `acquireVsCodeApi()` function to send and receive messages to/from the extension backend. 
- Renders HTML/JS/CSS in an IFrame-like sandbox.  

For detailed information, refer to the official VS Code docs on [Webview UI Toolkit](https://code.visualstudio.com/api/extension-guides/webview).

---

## Directory Structure

```
.
├─ src/
│  └─ topoViewer/
│     ├─ backend/
│     │  ├─ topoViewerWebUiFacade.ts         # Backend facade for WebView
│     │  ├─ topoViewerAdaptorClab.ts         # Adapts Containerlab YAML to JSON for the UI
│     │  └─ ... (other backend logic files)
│     └─ webview-ui/                         # (frontend) project
│        ├─ html-static
│        │  ├─ ...
└─ ...
```

### Key Backend Files

- **`topoViewerAdaptorClab.ts`**  
  - Converts Containerlab YAML into data structures (Cytoscape elements) used by the React frontend.  
  - Handles creation and writing of JSON files (`dataCytoMarshall.json` & `environment.json`).  
  - Generates URIs for static assets (CSS, JS, images) to be used by the WebView.

- **`topoViewerWebUiFacade.ts`**  
  - Establishes WebView panels within VS Code.  
  - Bridges messages between the WebView UI and the rest of the extension.

### WebView UI (Frontend)

- **`webview-ui` directory**  
  - Static-HTML application.
  - Renders the topology using data from the backend.  

---

## Getting Started

1. **Install Dependencies**  
   
2. **Build and Run Extension**  
   - Press `F5` in VS Code to **start debugging** the extension.
   - This will open a new VS Code window with your extension loaded.

3. **Load TopoViewer**  
   - Within the new window, use the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) to find and launch commands provided by TopoViewer (e.g., “**Graph Lab (Web - TopoViewer)**”).  
   - TopoViewer’s WebView should appear, ready to visualize your Containerlab topology.

---

## Using TopoViewer

1. **Invoke TopoViewer** command to parse and display the topology:
   - The extension will convert the YAML into JSON and pass it to the WebView.
   - The React-based UI then renders the network topology interactively.

You can inspect the WebView by opening Developer Tools in VS Code (`Command Palette` → “Developer: Toggle Developer Tools”) to see the underlying `<iframe>` and the console logs.

---

## Further Notes

- **MVC-Like Approach**:  
  TopoViewer’s backend is responsible for data (the model) and controlling flow, while the React UI is strictly the view. This separation keeps the frontend simple and flexible.
- **Extensibility**:  
  `topoViewerAdaptorClab.ts` can be enhanced to validate YAML schema against [Containerlab’s JSON schema](https://github.com/srl-labs/containerlab/blob/e3a324a45032792258d92b8d3625fd108bdaeb9c/schemas/clab.schema.json).
- **Troubleshooting**:  
  - Check the extension’s output channel in VS Code (`View` → `Output`) for logs.  
  - Use VS Code debug console logs for messages from `console.log` in the backend.

---

**Happy coding** with TopoViewer! If you have any questions or feedback, feel free to open an issue or submit a pull request. Enjoy visualizing your Containerlab topologies directly within Visual Studio Code!