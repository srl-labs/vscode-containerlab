# vscode-containerlab

A Visual Studio Code extension that integrates [containerlab](https://containerlab.dev/) directly into your editor, providing a convenient tree view for managing labs and their containers.

---

- **Auto-discovery** of local `*.clab.yml` or `*.clab.yaml` files in your workspace.
- **Tree view** showing labs (green/red/grey icons) based on container states.
- **Right-click context menus** on labs to deploy, destroy, redeploy (with or without cleanup), or open lab files.
- **Right-click context menus** on containers to start/stop, attach a shell, SSH, or view logs.
- **Color-coded statuses**:
  - **Green**: all containers in the lab are running.
  - **Grey**: undeployed (no containers found).
  - **Yellow**: partially running (some containers running, others stopped).


---

## Requirements

- **containerlab** must be installed and accessible via `sudo containerlab` in your system `PATH`.
- **Docker** (or another container runtime) must be set up and running if your labs rely on container-based nodes.
- (Optional) A local folder with `*.clab.yml` or `*.clab.yaml` topologies, opened in VS Code.

---

## Getting Started

1. **Install** the extension.
2. **Open** a folder or workspace in VS Code containing `.clab.yml` or `.clab.yaml` files.
3. **Click** on the _Containerlab_ icon in the Activity Bar to view your labs.
4. **Right-click** on a lab or container to see context menu commands (Deploy, Destroy, Redeploy, etc.).


## Extension Settings

You can customize the following settings under `containerlab.*`:

- **`containerlab.defaultSshUser`** (string): Default SSH user to use when connecting to containerlab nodes. Default: `admin`.
- **`containerlab.sudoEnabledByDefault`** (boolean): Whether to prepend `sudo` to containerlab commands by default. Default: `true`.
- **`containerlab.refreshInterval`** (number): Refresh interval (in milliseconds) for the Containerlab Explorer. Default: `10000`.

---

## Commands

- **Deploy** / **Deploy (cleanup)**  
- **Destroy** / **Destroy (cleanup)**  
- **Redeploy** / **Redeploy (cleanup)**  
- **Deploy lab file** (pick a file from the file‐open dialog)  
- **Attach shell**, **SSH**, **View logs** for individual containers  
- **Graph** in either local web mode or draw.io mode  

These commands are available via:
- **Context menus** on labs and containers
- **Editor Title** actions (when editing a `*.clab.yml` or `*.clab.yaml` file)
- **Command Palette** (`F1` or `Ctrl+Shift+P` / `Cmd+Shift+P`)

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
