# vscode-containerlab

[![GitHub releases](https://img.shields.io/github/v/release/srl-labs/vscode-containerlab.svg?style=flat-square&color=00c9ff&labelColor=bec8d2)](https://github.com/srl-labs/vscode-containerlab/releases)
[![VS Code extension page](https://img.shields.io/visual-studio-marketplace/i/srl-labs.vscode-containerlab?style=flat-square&color=00c9ff&labelColor=bec8d2)](https://marketplace.visualstudio.com/items?itemName=srl-labs.vscode-containerlab)
[![Doc](https://img.shields.io/badge/Docs-containerlab.dev-blue?style=flat-square&color=00c9ff&labelColor=bec8d2)](https://containerlab.dev/manual/vsc-extension/)
[![DeepWiki](https://img.shields.io/badge/deepwiki-1DA1F2?logo=wikipedia&style=flat-square&color=00c9ff&labelColor=bec8d2&logoColor=black)](https://deepwiki.com/srl-labs/vscode-containerlab)
[![Bluesky](https://img.shields.io/badge/follow-containerlab-1DA1F2?logo=bluesky&style=flat-square&color=00c9ff&labelColor=bec8d2)](https://bsky.app/profile/containerlab.dev)
[![Discord](https://img.shields.io/discord/860500297297821756?style=flat-square&label=discord&logo=discord&color=00c9ff&labelColor=bec8d2)](https://discord.gg/vAyddtaEV9)

A Visual Studio Code extension that integrates [containerlab](https://containerlab.dev/) directly into your editor, providing a convenient tree view for managing labs and their containers.

![screencast](https://raw.githubusercontent.com/srl-labs/vscode-containerlab/refs/heads/main/resources/screenshot.png)

---

## Key Features

- **Auto-discovery & Tree View:**
  Automatically find `.clab.yml`/`.clab.yaml` files in your workspace and display them in a tree view. Labs are color-coded based on container states:
  - **Green:** All containers running
  - **Red:** All containers stopped
  - **Yellow:** Mixed (partial deployment)
  - **Gray:** Undeployed labs

- **Context Menu Actions:**
  For labs and containers, quickly deploy, destroy, redeploy (with or without cleanup), save, inspect, delete undeployed lab files, or open lab files and workspaces. For containers, additional commands include starting, stopping, attaching a shell, SSH, viewing logs, and copying key properties (name, ID, IP addresses, kind, image).

- **Interface Tools:**
  Capture traffic (via tcpdump/Wireshark or Edgeshark) and set link impairments such as delay, jitter, packet loss, rate-limit, and corruption. You can also copy an interface’s MAC address.

- **Graphing & Visualization:**
  Generate network graphs in multiple modes, with the UI-first workflow in TopoViewer:
  - **Interactive TopoViewer:** Launches a dynamic, web-based topology UI (view/edit mode depends on lab state).
  - **Draw.io (Horizontal):** Generates a `.drawio` file in a horizontal layout. (`pos` labels override the layout.)
  - **Draw.io (Vertical):** Generates a `.drawio` file in a vertical layout. (`pos` labels override the layout.)
  - **Draw.io (Interactive):** Runs containerlab graph generation in interactive Draw.io mode.

- **Clone Labs from Git:**
  Easily clone labs from any Git repository or choose from a list of popular labs directly within the extension.

- **Help & Feedback View:**
  Access documentation, community links, and other helpful resources from a dedicated tree view.

- **Inspection:**
  Use webviews to inspect either all labs or a single lab’s deployed containers in a neatly grouped table.

- **Remote Labs:**
  Works perfectly with the: [SSH-Remote extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh) to manage labs on remote servers.
- **Remote Topology URLs:**
  Deploy labs directly from GitHub or GitLab by providing a repository or file URL when using the "Deploy an existing lab" command.

---

## Requirements

The following requirements apply only to local containerlab integration:

- **containerlab** must be installed. The extension will offer to install it if not found.
- You must be in the `clab_admins` (and `docker` group if you're using Docker). Podman is also supported for runtime features.
- (Optional) **Edgeshark** for packet capture features - can be installed directly from the extension using the "Install Edgeshark" command.

A connected `clab-api-server` only requires network access to that server. Local and API-managed labs can be used in the same VS Code window; containerlab, a local container runtime, and Linux group membership are not required for the API-managed labs.

### Edgeshark Integration

- **Install Edgeshark**: installs Edgeshark using docker compose
- **Uninstall Edgeshark**: removes Edgeshark containers
- **Configure session hostname**: set hostname for remote connections (packet capture)

- If you want to live capture traffic using Wireshark, please [download the cshargextcap plugin](https://github.com/siemens/cshargextcap/releases) for the OS/distribution and install it.

Note: The extension will automatically prompt to add your user to the `clab_admins` group during setup to enable running containerlab commands without sudo.

---

## Getting Started

1. **Install** the extension.
2. **Open** a folder or workspace in VS Code containing `.clab.yml` or `.clab.yaml` files. Or just clone a popular lab.
3. **Click** on the _Containerlab_ icon in the Activity Bar to view your labs.
4. **Right-click** on a lab or container to see context menu commands (Deploy, Destroy, Redeploy, etc.).

---

## Extension Settings

Configure the extension behavior through VS Code settings (`containerlab.*`):

### 🚀 Core Settings

| Setting              | Type    | Default | Description                                                           |
| -------------------- | ------- | ------- | --------------------------------------------------------------------- |
| `binaryPath`         | string  | `""`    | Custom path to containerlab binary (leave empty to resolve from PATH) |
| `showWelcomePage`    | boolean | `true`  | Show welcome page on activation                                       |
| `skipUpdateCheck`    | boolean | `false` | Skip extension update check                                           |
| `skipCleanupWarning` | boolean | `false` | Skip warning popups for cleanup commands                              |
| `api.tls.verify`     | boolean | `true`  | Verify server TLS certificates                                        |
| `api.tls.caPath`     | string  | `""`    | Optional PEM CA bundle for a private CA                               |

The Containerlab Explorer listens to the containerlab event stream, so running labs update live without manual refresh intervals.

### clab-api-server endpoints

Run **Containerlab: Manage clab-api-server endpoints** from the command palette, or use the server button in the Containerlab Explorer title bar. The manager can add, reconnect, rename, connect, and remove saved endpoint profiles. Endpoint selection is profile state, not workspace configuration, so connecting a server never rewrites VS Code settings or disables local mode.

The Explorer presents **Local Workspace** and every saved API endpoint as peer roots. Each root has independent **Running** and **Undeployed** groups, so same-name labs on different machines remain distinct and local and API operations can be used in parallel. Disconnected profiles remain visible and can be reconnected in place. The API File Explorer provides lazy access to the selected server's workspace; text edits are synchronized back through the authenticated API.

Passwords are sent from the endpoint-manager webview to the extension host only for the requested login and are never persisted. Returned JWTs are scoped by API origin and Linux username in VS Code SecretStorage; non-secret profile metadata is stored in VS Code global state. The legacy **Containerlab: Sign in to clab-api-server** command opens the same manager.

API-owned Explorer resources route through their owning endpoint for lifecycle and node actions, topology editing, logs, authenticated shell/SSH/telnet sessions, browser ports, save, inspect, fcli, draw.io, sharing, images, packet capture, EdgeShark, and network impairments. The extension reads the authenticated `/api/v1/session` identity and server-advertised `/api/v1/capabilities`; older servers receive a conservative compatibility fallback. A `401` clears only the JWT scoped to that server and username and offers sign-in again.

The first deploy (including **Apply** on an undeployed topology) streams the directory containing the selected topology as a tar archive after a modal confirmation. `.git`, `node_modules`, `dist`, and `out` directories and all symlinks are excluded; everything else below that directory is included, up to 10,000 entries and 256 MiB. Files are reopened without following symlinks and must still match the confirmed inventory. The confirmation shows the upload root and explicitly lists sensitive-looking files such as `.env`, private keys, and certificates.

Archive deploy and reconfigure use a staged, atomic filesystem swap on the server; the previous workspace is restored when containerlab returns a deployment error. This is not a crash-recovery journal. What is still missing is a standalone atomic workspace-sync contract with explicit Apply/Redeploy semantics. After initial import, Apply/Redeploy can therefore synchronize YAML-only labs, but is deliberately blocked when sibling startup configs, binds, icons, or other deploy dependencies exist. The clab-ui `<topology>.annotations.json` sidecar is not treated as a containerlab dependency. This prevents a successful-looking YAML update from drifting from the uploaded workspace bundle.

The local working-copy mapping used by TopoViewer is persisted by API origin, account, and lab name. YAML and annotations are synchronized through the API while the server remains the authoritative topology store. Local CLI-only `deploy.extraArgs` and `destroy.extraArgs` are not forwarded to the API.

TLS verification is enabled by default. The extension explicitly combines Node's bundled roots with the operating-system trust store, so a separate `--use-system-ca` flag is not required. When the default API server presents its self-signed certificate, the endpoint manager shows its origin, identity, validity, and SHA-256 fingerprint before offering **Trust and Connect**. Approval pins that exact leaf certificate to the endpoint in VS Code global state; it does not modify the operating-system trust store, and a later certificate change is blocked until the replacement is explicitly approved. No password or stored JWT is sent before this check completes. For a managed private CA, `containerlab.api.tls.caPath` remains available and is added to the normal roots rather than replacing them. Disabling `containerlab.api.tls.verify` is intended only for isolated development systems and requires a modal confirmation before either a password or stored JWT is used. TLS policy remains machine-scoped and workspace overrides are rejected. Endpoint origin, account, and cleartext approval live in the explicitly created endpoint profile instead of settings. The API URL must be a credential-free HTTP(S) origin without a path, query, or fragment. Cleartext HTTP is accepted automatically only for loopback; a remote HTTP login requires a modal warning and stores that approval only on the endpoint profile.

The TopoViewer bootstrap already sends transport-neutral host capability data. The extension-host guards remain authoritative while consumers use `@srl-labs/clab-ui` 0.3.0; publish clab-ui 0.3.1 capability support before updating this consumer dependency.

### 🎯 Command Options

| Setting                       | Type   | Default | Description                                  |
| ----------------------------- | ------ | ------- | -------------------------------------------- |
| `deploy.extraArgs`            | string | `""`    | Additional args for deploy/redeploy commands |
| `destroy.extraArgs`           | string | `""`    | Additional args for destroy commands         |
| `extras.fcli.extraDockerArgs` | string | `""`    | Additional docker args for fcli commands     |

### 🖥️ Node Configuration

| Setting                   | Type   | Default | Description                                                                |
| ------------------------- | ------ | ------- | -------------------------------------------------------------------------- |
| `node.execCommandMapping` | object | `{}`    | Map node kind to exec command<br/>Example: `{ "nokia_srlinux": "sr_cli" }` |
| `node.sshUserMapping`     | object | `{}`    | Map node kind to SSH user<br/>Example: `{ "nokia_srlinux": "clab" }`       |
| `node.telnetPort`         | number | `5000`  | Port for telnet connections                                                |

### 🎨 TopoViewer

| Setting                                  | Type    | Default        | Description                                                |
| ---------------------------------------- | ------- | -------------- | ---------------------------------------------------------- |
| `editor.customNodes`                     | array   | See below\*    | Custom node templates for TopoViewer                       |
| `editor.updateLinkEndpointsOnKindChange` | boolean | `true`         | Auto-update link endpoints on kind change                  |
| `editor.lockLabByDefault`                | boolean | `true`         | Lock the lab canvas by default to prevent accidental edits |
| `drawioDefaultTheme`                     | string  | `nokia_modern` | Draw.io theme (`nokia_modern`, `nokia`, `grafana`)         |

\*Default custom nodes include SRLinux and Network Multitool templates. They ship with sensible interface naming patterns (for example `nokia_srlinux: "e1-{n}"`, `cisco_xrd: "Gi0-0-0-{n}"`). Patterns accept optional start indices (`{n:0}`), finite ranges (`{n:1-6}`), and comma-separated fallbacks (`1/1/c{n:1-6}/1, 2/1/c{n:1-12}/1`). Existing custom nodes without an Interface Pattern are automatically upgraded to use the defaults.

### 📦 Packet Capture

| Setting                                  | Type    | Default                                              | Description                                             |
| ---------------------------------------- | ------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `capture.preferredAction`                | string  | `Wireshark VNC`                                      | Preferred capture method (`Edgeshark`, `Wireshark VNC`) |
| `capture.wireshark.dockerImage`          | string  | `ghcr.io/kaelemc/`<br/>`wireshark-vnc-docker:latest` | Docker image for Wireshark VNC                          |
| `capture.wireshark.pullPolicy`           | string  | `always`                                             | Image pull policy (`always`, `missing`, `never`)        |
| `capture.wireshark.theme`                | string  | `Follow VS Code theme`                               | Wireshark theme                                         |
| `capture.wireshark.stayOpenInBackground` | boolean | `true`                                               | Keep sessions alive in background                       |
| `capture.edgeshark.extraEnvironmentVars` | string  | `HTTP_PROXY=,`<br/>`http_proxy=`                     | Environment variables for Edgeshark                     |
| `capture.remoteHostname`                 | string  | `""`                                                 | Hostname/IP for Edgeshark packet capture                |
| `capture.packetflixPort`                 | number  | `5001`                                               | Port for Packetflix endpoint (Edgeshark)                |

### 🌐 Lab Sharing

| Setting      | Type   | Default | Description                 |
| ------------ | ------ | ------- | --------------------------- |
| `gotty.port` | number | `8080`  | Port for GoTTY web terminal |

### Example Configuration

```json
{
  "containerlab.deploy.extraArgs": "--timeout 5m --max-workers 88",
  "containerlab.destroy.extraArgs": "--graceful --cleanup",
  "containerlab.node.execCommandMapping": {
    "nokia_srlinux": "sr_cli",
    "arista_ceos": "Cli"
  },
  "containerlab.node.sshUserMapping": {
    "nokia_srlinux": "admin",
    "cisco_xrd": "clab"
  },
  "containerlab.editor.customNodes": [
    {
      "name": "SRLinux Latest",
      "kind": "nokia_srlinux",
      "interfacePattern": "e1-{n}"
    }
  ]
}
```

---

## Monitor Deployment Progress

When deploying labs, you can monitor the detailed progress in the Output window:

1. Open the Output panel (`Ctrl+Shift+U` or `View -> Output`)
2. Select "Containerlab" from the dropdown menu
3. Watch the deployment logs in real-time

## Live Updates

- The Containerlab Explorer streams containerlab events, so running labs refresh immediately without polling
- Labs are consistently sorted:
  - Deployed labs appear before undeployed labs
  - Within each group (deployed/undeployed), labs are sorted by their absolute path

---

## Known Issues

### "I do not see any interfaces on my deployed lab"

Labs deployed with containerlab versions older than `0.64.0` may require a redeploy.

## Running Tests

The extension includes a suite of unit tests located in the `test` folder. To run them:

1. Install dependencies with `npm install` if you haven't already.
2. Compile the test TypeScript using `npm run test:compile`.
3. Execute `npm test` to run Mocha and generate an HTML report in `mochawesome-report`.

See `test/README.md` for a short overview of the test setup and stub utilities.

---

## UI Dependency Mode

By default, this repository consumes the published `@srl-labs/clab-ui` package from GitHub Packages after `npm install`.

This is the default path for normal development, CI, and packaging.

If you are working in a sibling checkout with `clab-ui` and want to test local unpublished UI changes, opt in explicitly:

```bash
CLAB_UI_SOURCE=local npm run build
CLAB_UI_SOURCE=local npm run package
```

Convenience scripts are also available:

```bash
npm run build:local-ui
npm run package:local-ui
```

The local override resolves against `../clab-ui/dist`, so make sure that the
package repo is built before running the local override scripts.

The local override affects only bundling/runtime resolution. The default install path remains the published npm package.

---

## Feedback and Contributions

If you’d like to request features or report issues:

- Open an issue on our GitHub repository.
- PRs are welcome! Let us know how we can improve the extension.

- **GitHub Issues:** [Create an issue](https://github.com/srl-labs/vscode-containerlab/issues) on GitHub.
- **Discord:** Join our [Discord community](https://discord.gg/vAyddtaEV9)

**Enjoy managing your containerlab topologies directly from VS Code!**
