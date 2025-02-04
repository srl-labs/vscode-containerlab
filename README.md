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
- **Right-click context menus** on interfaces:
  - **Capture interface**: starts packet capture using tcpdump/Wireshark
  - **Capture interface (Edgeshark)**: uses Edgeshark/packetflix
  - **Set delay**: configure link delay
  - **Set jitter**: configure link jitter
  - **Set packet loss**: configure packet loss percentage
  - **Set rate-limit**: configure egress rate-limit
  - **Set corruption**: configure packet corruption percentage
  - **Copy MAC address**: copy interface MAC address
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

- **containerlab** must be installed and accessible in your system `PATH`. The extension will offer to install it if not found.
- (Optional) **Edgeshark** for packet capture features - can be installed directly from the extension using the "Install Edgeshark" command.

Note: The extension will automatically prompt to add your user to the `clab_admins` group during setup to enable running containerlab commands without sudo.

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
- **Graph Lab (Topoviewer)**: interactive, web-based visualization

### Node / Container Management
- **Start node**, **Stop node**  
- **Attach shell** (exec into container—respects `containerlab.node.execCommandMapping` in settings)  
- **SSH**  
- **View logs** (tails `docker logs -f ...`)  
- **Copy** menu (Name, ID, IPv4, IPv6, Kind, Image)

### Interface Management
- **Capture interface**: starts packet capture on an interface using tcpdump/Wireshark
- **Capture interface (Edgeshark)**: uses Edgeshark/packetflix for packet capture
- **Set delay**: configure link delay for an interface
- **Set jitter**: configure link jitter for an interface
- **Set packet loss**: configure packet loss percentage for an interface
- **Set rate-limit**: configure egress rate-limit for an interface
- **Set corruption**: configure packet corruption percentage for an interface
- **Copy MAC address**: copy interface MAC address to clipboard

### Edgeshark Integration
- **Install Edgeshark**: installs Edgeshark using docker compose
- **Uninstall Edgeshark**: removes Edgeshark containers
- **Configure session hostname**: set hostname for remote connections (packet capture)

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

- **`containerlab.wsl.wiresharkPath`** (string)  
  The path to Wireshark executable on Windows from inside WSL.  
  Default: `/mnt/c/Program Files/Wireshark/wireshark.exe`

- **`containerlab.remote.hostname`** (string)  
  The hostname to use for connections to/from this host. Can be either DNS resolvable hostname, or an IPv4/6 address.  
  Used for packet capture features.  
  Note: A configured hostname for *this session of VS Code* takes precedence.

- **`containerlab.drawioDefaultTheme`** (string)  
  Default theme to use when generating DrawIO graphs.  
  Options: `nokia_modern`, `nokia`, `grafana`  
  Default: `nokia_modern`

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

### "Unable to detect containerlab version" Error

If you see this error message despite having containerlab correctly installed, there are two common causes:

1. **GitHub API Rate Limiting**
   - The version check makes API calls to GitHub to compare versions
   - Without authentication, these calls are subject to rate limiting
   - Solution: Set your GitHub token as an environment variable:

```
export GITHUB_TOKEN=your_github_token_here
```

2. **Sudo Permission Configuration**
   - The extension tries to run 'sudo containerlab version check'
   - This requires passwordless sudo access for the containerlab command
   - Solution: Configure passwordless sudo specifically for containerlab:

```
# Replace <user> with your actual username, e.g., john
sudo visudo -f /etc/sudoers.d/<user>
```

Add this line in the editor (replace <user> with your username):

```
<user> ALL=(ALL) NOPASSWD: /usr/bin/containerlab
```

Note: Future versions of the extension will improve handling of these scenarios to provide a better user experience.

---

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
