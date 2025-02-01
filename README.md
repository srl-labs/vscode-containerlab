# vscode-containerlab

A Visual Studio Code extension that integrates [containerlab](https://containerlab.dev/) directly into your editor, providing a convenient tree view for managing labs and their containers.

---
## Features

- **Auto-discovery** of local `*.clab.yml` or `*.clab.yaml` files in your workspace.  
- **Tree view** showing labs (green/red/gray/yellow icons) based on container states:
  - **Green**: all containers in the lab are running  
  - **Gray**: undeployed (no containers found)  
  - **Red**: all containers are stopped  
  - **Yellow**: partially running (some containers running, others stopped)
- **Right-click context menus** on labs:
  - **Deploy**, **Destroy**, **Redeploy** (with or without cleanup)
  - **Open Lab File**, **Copy Lab File Path**
  - **Graph** topologies (local Web or draw.io modes)
  - **Inspect** single lab
  - **Add Lab to Workspace**
  - **Open Folder in New Window**
- **Right-click context menus** on containers:
  - **Start**, **Stop**  
  - **Attach shell** (with user-defined exec commands per node kind)  
  - **SSH**  
  - **View logs**  
  - **Copy** submenu for container properties:
    - Name, ID, IPv4, IPv6, Kind, Image
- **Inspect** commands:
  - **Inspect (All Labs)**: shows a webview with **all** labs in a grouped table
  - **Inspect Lab**: show only the selected lab’s containers in a webview
- **Graph**:
  - **Graph Lab (Web)**: runs `containerlab graph` in a Terminal
  - **Graph Lab (draw.io)**: runs `containerlab graph --drawio` , then opens the `.drawio` file
  - **Graph Lab (draw.io, Interactive)**: runs in Terminal with in interactive mode
  - **Graph Lab (Topoviewer)**: interactive, web-based interface for visualizing Containerlab topologies

---

## Requirements

- **containerlab** must be installed and accessible via `sudo containerlab` in your system `PATH`.
- **Passwordless sudo access** for containerlab commands must be configured:
  1. Edit sudoers file with `sudo visudo`
  2. Add the following line:
     ```
     username ALL=(ALL) NOPASSWD: /usr/bin/containerlab
     ```
     (Replace `username` with your actual username)
- **Docker** (or another container runtime) must be set up and running if your labs rely on container-based nodes.
- (Optional) A local folder with `*.clab.yml` or `*.clab.yaml` topologies, opened in VS Code.


---

## Getting Started

1. **Install** the extension.
2. **Open** a folder or workspace in VS Code containing `.clab.yml` or `.clab.yaml` files.
3. **Click** on the _Containerlab_ icon in the Activity Bar to view your labs.
4. **Right-click** on a lab or container to see context menu commands (Deploy, Destroy, Redeploy, etc.).

---

## Commands

These are some key commands contributed by the extension:

### Lab Management
- **Deploy / Deploy (cleanup)**  
- **Redeploy / Redeploy (cleanup)**  
- **Destroy / Destroy (cleanup)**
- **Deploy lab file** (choose a `.clab.yml/.yaml` from a file picker)

### Lab Inspection
- **Inspect (All Labs)**: Summaries all labs in one webview  
- **Inspect Lab**: Summaries the containers for a single lab

### Graph
- **Graph Lab (Web)**: runs in Terminal  
- **Graph Lab (draw.io)**: uses a spinner and opens the `.drawio` file  
- **Graph Lab (draw.io, Interactive)**: same but with additional `--drawio-args "-I"`.

### Node / Container Management
- **Start node**, **Stop node**  
- **Attach shell** (exec into container—respects `containerlab.node.execCommandMapping` in settings)  
- **SSH**  
- **View logs** (tails `docker logs -f ...`)  
- **Copy** menu (Name, ID, IPv4, IPv6, Kind, Image)

### Other
- **Add Lab to Workspace**: adds the lab’s folder to the current VS Code workspace  
- **Open Folder in New Window**: opens a separate VS Code window rooted at the lab’s folder  

All these commands are accessible via:
- **Context menus** on labs/containers (in the _Containerlab Explorer_)
- **Editor title** (top-right) when editing a `.clab.(yml|yaml)`
- **Command Palette** (`Ctrl+Shift+P` or `Cmd+Shift+P`, then type “Containerlab:”)

## Extension Settings

You can customize the following settings under `containerlab.*`:

- **`containerlab.defaultSshUser`** (string)  
  Default SSH user for the **SSH** command (e.g. `"admin"`).
- **`containerlab.sudoEnabledByDefault`** (boolean)  
  Whether to prepend `sudo` to containerlab commands. Default: `true`.
- **`containerlab.refreshInterval`** (number)  
  How often (in ms) the Containerlab Explorer refreshes. Default: `10000`.
- **`containerlab.node.execCommandMapping`** (object)  
  Mapping of node `kind` to the exec command used by **Attach shell**.  
  For example, if you have `"nokia_srlinux": "sr_cli"`, then `docker exec -it <container> sr_cli` is used.

---

## Known Issues

- None reported. If you spot any bug or have a feature request, please open an issue on our repository.

---

## Feedback and Contributions

If you’d like to request features or report issues:
- Open an issue on our GitHub repository.
- PRs are welcome! Let us know how we can improve the extension.

- **GitHub Issues:** [Create an issue](https://github.com/srl-labs/vscode-containerlab/issues) on GitHub.
- **Discord:** Join our [Discord community](https://discord.gg/vAyddtaEV9)

**Enjoy managing your containerlab topologies directly from VS Code!**
