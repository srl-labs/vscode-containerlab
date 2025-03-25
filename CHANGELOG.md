# Change Log

## [0.10.0] - 2025-03-25
* Changed the way of updating the tree
* Welcome page with a quick start guide
* Managing default ssh-user per kind via settings

## [0.9.2] - 2025-02-27
* TopoViewer Enhancements
* Fix: New version will not intervent extension activation.

## [0.9.1] - 2025-02-27
* Fixes for: Link Impairments via Webview (but remains buggy for some OS until the next clab release)

## [0.9.0] - 2025-02-23
* Performance Improvements
* Link Impairments via Webview
* Extension only activates if Linux or WSL
* Warnings when destroy, deploy or redeploy with cleanup
* TopoViewer enhancements:
    * Ctrl + Click: Connect to the node via SSH.
    * Shift + Click (non-group): Create a new group and reassign the clicked node to it.
    * Shift + Click (group): Open the editor panel to modify an existing group.
    * Alt + Click: Release the node from its group and remove an empty group if applicable.
    * Regular Click: Toggle the display of node properties in the UI.
    * Drag & Drop: Assign a node to a group by dragging it into the desired group.
    * New viewport button to add groups for easier group creation.
    * Enhanced node actions to release a node from its group directly.


## [0.8.1] - 2025-02-18
* Make TopoViewer the default graph action.
* Add commands to the editor tab context menu (right click on the open editor tab).
* Add TopoViewer support for getting labPath via the open editor filepath.

## [0.8.0] - 2025-02-14
* TopoViewer Enhancement by @asadarafat
    * Added topology management with preset layout saving and reload functionality
    * Implemented MAC address detection and subinterface discovery system
    * Enhanced link operational state detection and WebSocket-based property updates
    * Improved UI responsiveness with streamlined node/link panels and action handling
* fixes 

## [0.7.0] - 2025-02-09
* Save command for labs and nodes
* Packetcapture with Edgeshark supports now multi-interface selection (ctrl/cmd + click)
* Packtflix port is now configurable 
* Fixes

## [0.6.2] - 2025-02-04
* Fix containerlab version check (now sudoless)

## [0.6.1] - 2025-02-04
* The extension now works fully sudoless with containerlab 0.64.0
* fixes for version check and installation

## [0.5.5] - 2025-02-01
* Version check and Installation of Containerlab by @FloSch62
* Interface capture by @Kaelemc
* Interface impairment by @Kaelemc
* Edgeshark install/untinstall @Kaelemc
* Hostname discovery by @FloSch62


## [0.4.0] - 2025-02-01

* Refactor the tree provider by @kaelemc in https://github.com/srl-labs/vscode-containerlab/pull/35
* intial integration of TopoViewer via git-submodule topoViewer-frontend by @asadarafat in https://github.com/srl-labs/vscode-containerlab/pull/38

## New Contributors
* @asadarafat made their first contribution in https://github.com/srl-labs/vscode-containerlab/pull/38

## [0.3.0] - 2025-26-01
* Fix Selected lab status turn grey on selection by @FloSch62 in https://github.com/srl-labs/vscode-containerlab/pull/24
* Add lab folder to workspace by @FloSch62 in https://github.com/srl-labs/vscode-containerlab/pull/25
* Add command to open lab folder in a new window by @FloSch62 in https://github.com/srl-labs/vscode-containerlab/pull/26
* Add copy sub-menu for containers by @kaelemc in https://github.com/srl-labs/vscode-containerlab/pull/27
* Add exec command setting & mapping by @kaelemc in https://github.com/srl-labs/vscode-containerlab/pull/28
* Open drawio by @FloSch62 in https://github.com/srl-labs/vscode-containerlab/pull/30
* Inspect for labs by @FloSch62 in https://github.com/srl-labs/vscode-containerlab/pull/31

## [0.2.1] - 2025-25-01
### Added
- Add buttons for shell, ssh and logs next to Containers

## [0.2.0] - 2025-25-01
### Added
- Check if containerlab is installed

## [0.1.0] - 2025-25-01
- Initial public release

## [0.0.1] - 2025-22-01

- Initial release