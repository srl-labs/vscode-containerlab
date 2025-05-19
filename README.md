# vscode-containerlab

[![GitHub releases](https://img.shields.io/github/v/release/srl-labs/vscode-containerlab.svg?style=flat-square&color=00c9ff&labelColor=bec8d2)](https://github.com/srl-labs/vscode-containerlab/releases)
[![VS Code extension page](https://img.shields.io/visual-studio-marketplace/d/srl-labs.vscode-containerlab?style=flat-square&color=00c9ff&labelColor=bec8d2)](https://marketplace.visualstudio.com/items?itemName=srl-labs.vscode-containerlab)
[![Doc](https://img.shields.io/badge/Docs-containerlab.dev-blue?style=flat-square&color=00c9ff&labelColor=bec8d2)](https://containerlab.dev/manual/vsc-extension/)
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
  For labs and containers, quickly deploy, destroy, redeploy (with or without cleanup), save, inspect, or open lab files and workspaces. For containers, additional commands include starting, stopping, attaching a shell, SSH, viewing logs, and copying key properties (name, ID, IP addresses, kind, image).

- **Interface Tools:**  
  Capture traffic (via tcpdump/Wireshark or Edgeshark) and set link impairments such as delay, jitter, packet loss, rate-limit, and corruption. You can also copy an interface’s MAC address.

- **Graphing & Visualization:**  
  Generate network graphs in multiple modes:
  - **Web-based:** Opens the topology in a dedicated Terminal session.
  - **Draw.io:** Generates a `.drawio` file for visual editing.
  - **Interactive TopoViewer:** Launches a dynamic, web-based view of your topology.
  - **Interactive TopoEditor:** Let's your create in a graphical way network topologies

- **Inspection:**  
  Use webviews to inspect either all labs or a single lab’s deployed containers in a neatly grouped table.

- **Remote Labs:**  
  Works perfectly with the: [SSH-Remote extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh) to manage labs on remote servers.

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
2. **Open** a folder or workspace in VS Code containing `.clab.yml` or `.clab.yaml` files.
3. **Click** on the _Containerlab_ icon in the Activity Bar to view your labs.
4. **Right-click** on a lab or container to see context menu commands (Deploy, Destroy, Redeploy, etc.).

---
## Extension Settings

Customize your experience under `containerlab.*` in VS Code Settings:

- **`containerlab.sudoEnabledByDefault`** (boolean)  
  Whether to prepend `sudo` to containerlab commands.  
  _Default: `true`_

- **`containerlab.refreshInterval`** (number)  
  Auto-refresh interval (in ms) for the Containerlab Explorer.  
  _Default: `10000`_

- **`containerlab.node.execCommandMapping`** (object)  
  Map a node’s `kind` to its preferred exec command (e.g. `{ "nokia_srlinux": "sr_cli" }`).

- **`containerlab.node.sshUserMapping`** (object)  
  Map a node’s `kind` to its preferred ssh user (e.g. `{ "nokia_srlinux": "clab" }`).

- **`containerlab.wsl.wiresharkPath`** (string)  
  Path to Wireshark in Windows from inside WSL.  
  _Default: `/mnt/c/Program Files/Wireshark/wireshark.exe`_

- **`containerlab.remote.hostname`** (string)  
  Hostname or IP used for remote connections (affects packet capture).  
  _Note: Session-specific hostname settings take precedence._

- **`containerlab.drawioDefaultTheme`** (string)  
  Theme for Draw.io graphs. Options: `nokia_modern`, `nokia`, `grafana`.  
  _Default: `nokia_modern`_

- **`containerlab.runtime`** (string)  
  The container runtime to use. Options: `docker`, `podman`, `ignite`.  
  _Default: `docker`_

- **`containerlab.skipCleanupWarning`** (boolean)  
  If enabled, the extension will skip warning popups for cleanup commands (redeploy/destroy with cleanup).  
  _Default: `false`_


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

## Running Tests
Run `npm test` after compiling the test sources to execute the unit tests. A detailed HTML report is generated in `mochawesome-report`.

---

## Known Issues

### "I do not see any interfaces on my deployed lab" 
Labs which are deployed with containerlab < 0.64.0 , needing a redeploy.

---

## Feedback and Contributions

If you’d like to request features or report issues:
- Open an issue on our GitHub repository.
- PRs are welcome! Let us know how we can improve the extension.

- **GitHub Issues:** [Create an issue](https://github.com/srl-labs/vscode-containerlab/issues) on GitHub.
- **Discord:** Join our [Discord community](https://discord.gg/vAyddtaEV9)

**Enjoy managing your containerlab topologies directly from VS Code!**
