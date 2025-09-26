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
  Generate network graphs in multiple modes:
  - **Draw.io (Horizontal):** Generates a `.drawio` file in a horizontal layout. (pos labels will overwrite the layout)
  - **Draw.io (Vertical):** Generates a `.drawio` file in a vertical layout. (pos labels will overwrite the layout)
  - **Interactive TopoViewer:** Launches a dynamic, web-based view of your topology.
  - **Interactive TopoEditor:** Let's your create in a graphical way network topologies

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

- **containerlab** must be installed and accessible in your system `PATH`. The extension will offer to install it if not found.
- (Optional) **Edgeshark** for packet capture features - can be installed directly from the extension using the "Install Edgeshark" command.


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

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sudoEnabledByDefault` | boolean | `false` | Prepend `sudo` to containerlab commands |
| `runtime` | string | `docker` | Container runtime (`docker`, `podman`, `ignite`) |
| `refreshInterval` | number | `10000` | Auto-refresh interval in milliseconds |
| `showWelcomePage` | boolean | `true` | Show welcome page on activation |
| `skipCleanupWarning` | boolean | `false` | Skip warning popups for cleanup commands |

### 🎯 Command Options

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `deploy.extraArgs` | string | `""` | Additional args for deploy/redeploy commands |
| `destroy.extraArgs` | string | `""` | Additional args for destroy commands |
| `extras.fcli.extraDockerArgs` | string | `""` | Additional docker args for fcli commands |

### 🖥️ Node Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `node.execCommandMapping` | object | `{}` | Map node kind to exec command<br/>Example: `{ "nokia_srlinux": "sr_cli" }` |
| `node.sshUserMapping` | object | `{}` | Map node kind to SSH user<br/>Example: `{ "nokia_srlinux": "clab" }` |
| `node.telnetPort` | number | `5000` | Port for telnet connections |

### 🎨 TopoViewer/Editor

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `editor.customNodes` | array | See below* | Custom node templates for TopoViewer |
| `editor.interfacePatternMapping` | object | See below** | Interface naming patterns<br/>Supports counters, start offsets, ranges, and sequences |
| `editor.updateLinkEndpointsOnKindChange` | boolean | `true` | Auto-update link endpoints on kind change |
| `drawioDefaultTheme` | string | `nokia_modern` | Draw.io theme (`nokia_modern`, `nokia`, `grafana`) |

*Default custom nodes include SRLinux and Network Multitool templates  
**Default patterns: `nokia_srlinux: "e1-{n}"`, `cisco_xrd: "Gi0-0-0-{n}"`, etc. Patterns accept optional start indices (`{n:0}`), finite ranges (`{n:1-6}`), and comma-separated fallbacks (`1/1/c{n:1-6}/1, 2/1/c{n:1-12}/1`). Custom node templates expose an Interface Pattern field to override the defaults per template.

### 📦 Packet Capture

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `capture.preferredAction` | string | `Wireshark VNC` | Preferred capture method (`Edgeshark`, `Wireshark VNC`) |
| `capture.wireshark.dockerImage` | string | `ghcr.io/kaelemc/`<br/>`wireshark-vnc-docker:latest` | Docker image for Wireshark VNC |
| `capture.wireshark.pullPolicy` | string | `always` | Image pull policy (`always`, `missing`, `never`) |
| `capture.wireshark.extraDockerArgs` | string | `-e HTTP_PROXY=""`<br/>`-e http_proxy=""` | Extra docker arguments |
| `capture.wireshark.theme` | string | `Follow VS Code theme` | Wireshark theme |
| `capture.wireshark.stayOpenInBackground` | boolean | `true` | Keep sessions alive in background |
| `edgeshark.extraEnvironmentVars` | string | `HTTP_PROXY=,`<br/>`http_proxy=` | Environment variables for Edgeshark |
| `remote.hostname` | string | `""` | Hostname/IP for Edgeshark packet capture |
| `remote.packetflixPort` | number | `5001` | Port for Packetflix endpoint (Edgeshark) |

### 🌐 Lab Sharing

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `gotty.port` | number | `8080` | Port for GoTTY web terminal |

### Example Configuration

```json
{
  "containerlab.deploy.extraArgs": "--timeout 5m --max-workers 88",
  "containerlab.destroy.extraArgs": "--graceful --cleanup",
  "containerlab.node.execCommandMapping": {
    "nokia_srlinux": "sr_cli",
    "arista_ceos": "Cli"
  },
  "containerlab.editor.interfacePatternMapping": {
    "nokia_srlinux": "e1-{n}",
    "cisco_xrd": "Gi0-0-0-{n}"
  }
}
```


---

## Monitor Deployment Progress
When deploying labs, you can monitor the detailed progress in the Output window:
1. Open the Output panel (`Ctrl+Shift+U` or `View -> Output`)
2. Select "Containerlab" from the dropdown menu
3. Watch the deployment logs in real-time

## Auto-refresh Behavior
- The Containerlab Explorer automatically refreshes based on the `containerlab.refreshInterval` setting
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

## Feedback and Contributions

If you’d like to request features or report issues:
- Open an issue on our GitHub repository.
- PRs are welcome! Let us know how we can improve the extension.

- **GitHub Issues:** [Create an issue](https://github.com/srl-labs/vscode-containerlab/issues) on GitHub.
- **Discord:** Join our [Discord community](https://discord.gg/vAyddtaEV9)

**Enjoy managing your containerlab topologies directly from VS Code!**
