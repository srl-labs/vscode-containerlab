# Change Log
## [0.22.2] - 2026-01-12
- Fixes

## [0.22.1] - 2026-01-08
- Fixes

## [0.22.0] - 2026-01-06
- TopoViewer rewritten in React
- TopoViewer/editor:
  - Undo/Redo support (Ctrl+Z / Ctrl+Shift+Z)
  - When custom icons are used in lab, they will be copied to lab folder.
  - Per-link endpoint label offset overrides
  - Global endpoint label offset setting
- Fixes

## [0.21.0] - 2025-12-03
- Events, with clab 0.72.0 the extension does not poll anymore, everything is streamed from clab
- TopoViewer/editor:
  - Show interface stats/histogram in link properties
  - Alligned Panel style to have a window look
  - Shapes, you can now freely add shapes, like rectangles and arrows
  - Text and shapes are now rotateable
- Several Fixes

## [0.20.0] - 2025-11-17
- TopoViewer/editor:
  - Custom Icon Support
  - Markdown support for freetext
- Fixes:
  - Fix interface capture (vnc) with multiple selected interfaces
  - Fix type deletion

## [0.19.8] - 2025-11-12
- TopoViewer/editor:
  - Unified the grid manager, added configurable/persisted grid line width
  - Improved bridge alias workflows
  - Panel network editor and viewport saver stay aligned with annotations so alias metadata survives saves without forcing manual reloads.
  - Added a native loading/saver screen so TopoViewer hydrates saved state and fetches deployment info in parallel before the UI appears.
- Fixes:
  - More resilient deployment-state detection when switching between view/edit modes.

## [0.19.7] - 2025-10-30
- Allow `cisco_iol` node kinds to expose and persist the `type` field the same way Nokia kinds do.

## [0.19.6] - 2025-10-24
- fix link creation

## [0.19.5] - 2025-10-23
- fluent transition between deploy/destroy on TV
- fixes

## [0.19.4] - 2025-10-11
- clab 0.71.0 support
- fixes

## [0.19.3] - 2025-10-2
- refresh docker images when node editor panel is opened
- fixes

## [0.19.0] - 2025-09-29
- TopoViewer/editor:
  - Improve custom nodes with interface patterns
  - Hover menu for networks
  - Custom nodes and Network can now be added mutliple times
  - sr-sim ssh and links support for distributed nodes
  - sr-sim mda fixes for integrated types
  - Env files
- General
  - Running Labs treeview now refreshes more specific in 5 seconds
  - Fixes

## [0.18.0] - 2025-09-25
- TopoViewer/editor:
  - Add SR-SIM component support to TopoViewer
  - Add regex capture groups to bulk link creation
  - Show labels on select option

## [0.17.5] - 2025-09-19
- TopoViewer/editor:
  - Lock the lab by default
  - Fixes

## [0.17.3] - 2025-09-11
- Refactor
- Fixes

## [0.17.2] - 2025-09-09
- Fixes

## [0.17.1] - 2025-09-06

- TopoViewer/editor:
  - Lab settings panel for topology-wide configuration
  - Node editor with full node property management
  - Link editor with extended link support and properties
  - Node templates support
  - Kind support and inheritance from it with live badge updates
  - UI improvements
  - Dynamic webview panel titles using lab names
  - Resolve interface aliases to actual names in capture commands
  - YAML image completion improvements
- Fixes:
  - Fixed node search functionality when external nodes exist (#337)

## [0.16.5] - 2025-08-22

- TopoViewer/editor:
  - Copy/Paste Feature
- General:
  - Fix blank vnc

## [0.16.3] - 2025-08-22

- TopoViewer/editor:
  - UI improvements like, better selection and delete selections, shortcuts docs
  - Fixes
- General:
  - Support for networks (bridges, macvlan, mgmt, ... )

## [0.16.1-2] - 2025-08-19

- TopoViewer/editor:
  - Filterable dropdowns
  - Node Positions are now saved in the .annotations.json
  - Autosave positions in viewer mode
  - Panels are now dragable
  - Split view toggle
  - Fixes and cosmetics

## [0.16.0] - 2025-08-15

- TopoViewer/editor:
  - Groups can now be freely styled
  - Streamlined object interaction ( now only via right click )
  - Bulk link creation
  - fixes
- General: 
  - Filters now support regex
  - fixes

## [0.15.0] - 2025-08-13

- TopoViewer/editor
  - Unified editor and viewer in typescript; cleaner shared templates and managers (navigation bar partials, manager registry, logging).
  - Floating action panel/buttons; improved stacked navigation and contextual actions; consistent pointer/hover affordances.
  - Improved edit/view mode switching and reload behavior; automatic reload on lab state change; fewer panel recreations.
  - Performance improvements and reduced duplication; faster tooltips; grid/layout fixes; persistent state across tabs.
  - Enhancements: free text annotations (with color/background handling), undo support, link editing fixes, properties panel fixes, SVG export refactor.

- Lab sharing
  - GoTTY web terminal sharing: attach/detach/reattach and copy link from the tree view.

## [0.14.0] - 2025-08-01
- Wireshark capture is now by default via noVNC
- Wireshark now fully relies on Edgeshark, no local tcpdump anymore
- TopoViewer supports new schema with groups
- QOL features and fixes

## [0.13.8] - 2025-06-28
- performance enhancements
- fixes

## [0.13.5] - 2025-06-28
- fcli (fabric-wide CLI for SR Linux)
- TopoViewer/Editor enhancements:
  - LayoutManager
  - Node type field
  - Fixes

## [0.13.3] - 2025-05-29
- Deploy labs from Git/HTTP URLs and local files
- Improved favorite lab handling
- TopoViewerEditor enhancements:
  - Queued updates and YAML schema validation
  - Offline assets and group manager so users can create groups
- Enhanced Inspect labs webview
- Draw.io graph generation commands for horizontal and vertical layouts
- Additional deploy/destroy arguments via settings
- Tree view now filters container interfaces
- Tree view overhaul:
  - Separate views for running and undeployed labs
  - Show local folder structure for undeployed labs
  - Button to hide labs not owned by the user
  - View welcome shown when no labs are discovered
  - Search button on both views for filtering labs
- Bundled extension resources resulting in a ~6 MB VSIX

## [0.12.1] - 2025-05-01
- TopoEditor: now supports link editing
- TopoViewer: can now be used with undeployed labs

## [0.12.0] - 2025-04-26
- TopoViewer Editor - a full GUI for authoring Containerlab topology files webview:
  - Viewport “+” button for adding nodes
  - Shift+Click on the canvas to place a new node at the click position
    - Node context-menu (right-click) on each node:
    - Edit Node — open its properties panel
    - Delete Node — remove the node
    - Add Link — begin link creation
  - Shortcuts

    | Shortcut                   | Action                   |
    |----------------------------|--------------------------|
    | Shift + Click (canvas)     | Add node at pointer      |
    | Shift + Click (on node)    | Begin link creation      |
    | Alt + Click (on node)      | Delete node              |
    | Alt + Click (on link)      | Delete link              |

## [0.11.2] - 2025-04-10
- Fix: welcome page
- Patch: support for containerlab 0.68.0

## [0.11.1] - 2025-04-10
- Fix: update terminal name for Telnet

## [0.11.0] - 2025-04-09
- Changed the look and feel of the welcome page
    - Example topology now has 2 nodes and a link connecting them
- Added badge to the extension icon which shows number of running labs
    - Hovering over the extension icon shows a tooltip which also reflects the running lab count
- Added 'Connect (Telnet)' to context menu of node in tree view. Telnets to a node using `docker exec -it <node> telnet 127.0.0.1 <port>`
    - <port> defaults to 5000, but is changeable with user modifiable setting of `containerlab.node.telnetPort`
- Added 'SSH (All nodes)' to context menu of lab in tree view. Opens VS Code terminals which SSH to all lab nodes


## [0.10.0] - 2025-03-25
- Changed the way of updating the tree
- Welcome page with a quick start guide
- Managing default SSH user per kind via settings
- Open in browser for exposed ports

## [0.9.2] - 2025-02-27
- TopoViewer enhancements
- Fix: new version will not interfere with extension activation

## [0.9.1] - 2025-02-27
- Fixes for link impairments via webview (may remain buggy for some OS until the next clab release)

## [0.9.0] - 2025-02-23
- Performance improvements
- Link impairments via webview
- Extension only activates if Linux or WSL
- Warnings when destroy, deploy or redeploy with cleanup
- TopoViewer enhancements:
    - Ctrl+Click: connect to the node via SSH
    - Shift+Click (non-group): create a new group and reassign the clicked node to it
    - Shift+Click (group): open the editor panel to modify an existing group
    - Alt+Click: release the node from its group and remove an empty group if applicable
    - Regular click: toggle the display of node properties in the UI
    - Drag & drop: assign a node to a group by dragging it into the desired group
    - New viewport button to add groups for easier group creation
    - Enhanced node actions to release a node from its group directly


## [0.8.1] - 2025-02-18
- Make TopoViewer the default graph action
- Add commands to the editor tab context menu (right-click on the open editor tab)
- Add TopoViewer support for getting labPath via the open editor filepath

## [0.8.0] - 2025-02-14
- TopoViewer enhancement by @asadarafat
    - Added topology management with preset layout saving and reload functionality
    - Implemented MAC address detection and subinterface discovery system
    - Enhanced link operational state detection and WebSocket-based property updates
    - Improved UI responsiveness with streamlined node/link panels and action handling
- fixes

## [0.7.0] - 2025-02-09
- Save command for labs and nodes
- Packet capture with Edgeshark supports multi-interface selection (Ctrl/Cmd+Click)
- Packetflix port is now configurable
- fixes

## [0.6.2] - 2025-02-04
- Fix containerlab version check (now sudoless)

## [0.6.1] - 2025-02-04
- The extension now works fully sudoless with containerlab 0.64.0
- fixes for version check and installation

## [0.5.5] - 2025-02-01
- Version check and installation of Containerlab by @FloSch62
- Interface capture by @Kaelemc
- Interface impairment by @Kaelemc
- Edgeshark install/uninstall by @Kaelemc
- Hostname discovery by @FloSch62


## [0.4.0] - 2025-02-01

- Refactor the tree provider by @kaelemc in https://github.com/srl-labs/vscode-containerlab/pull/35
- Initial integration of TopoViewer via git submodule topoViewer-frontend by @asadarafat in https://github.com/srl-labs/vscode-containerlab/pull/38

## New Contributors
- @asadarafat made their first contribution in https://github.com/srl-labs/vscode-containerlab/pull/38

## [0.3.0] - 2025-26-01
- Fix selected lab status turning grey on selection by @FloSch62 in https://github.com/srl-labs/vscode-containerlab/pull/24
- Add lab folder to workspace by @FloSch62 in https://github.com/srl-labs/vscode-containerlab/pull/25
- Add command to open lab folder in a new window by @FloSch62 in https://github.com/srl-labs/vscode-containerlab/pull/26
- Add copy sub-menu for containers by @kaelemc in https://github.com/srl-labs/vscode-containerlab/pull/27
- Add exec command setting and mapping by @kaelemc in https://github.com/srl-labs/vscode-containerlab/pull/28
- Open draw.io by @FloSch62 in https://github.com/srl-labs/vscode-containerlab/pull/30
- Inspect for labs by @FloSch62 in https://github.com/srl-labs/vscode-containerlab/pull/31

## [0.2.1] - 2025-25-01
- Add buttons for shell, SSH and logs next to containers

## [0.2.0] - 2025-25-01
- Check if containerlab is installed

## [0.1.0] - 2025-25-01
- Initial public release

## [0.0.1] - 2025-22-01

- Initial release
