/**
 * Commands barrel file - exports all commands with named exports
 */

// Base command classes and utilities
export {
  Command,
  execCommandInTerminal,
  execCommandInOutput
} from "./command";
export type {
  SpinnerOptions,
  TerminalOptions,
  CmdOptions,
  SpinnerMsg,
  CommandFailureHandler
} from "./command";
export { ClabCommand } from "./clabCommand";

// Lifecycle commands (deploy, destroy, redeploy, save)
export { deploy, deployCleanup, deploySpecificFile } from "./deploy";
export { destroy, destroyCleanup } from "./destroy";
export { redeploy, redeployCleanup } from "./redeploy";
export { saveLab, saveNode } from "./save";
export { runClabAction } from "./runClabAction";

// Node-related commands
export { startNode, stopNode, pauseNode, unpauseNode } from "./nodeActions";
export { attachShell, telnetToNode } from "./nodeExec";
export { sshToNode, sshToLab } from "./ssh";
export { manageNodeImpairments } from "./nodeImpairments";
export { showLogs } from "./showLogs";

// Session sharing commands (sshx, gotty)
export { sshxAttach, sshxDetach, sshxReattach, sshxCopyLink } from "./sshxShare";
export { gottyAttach, gottyDetach, gottyReattach, gottyCopyLink } from "./gottyShare";

// Network and interface commands
export {
  captureInterface,
  captureInterfaceWithPacketflix,
  captureEdgesharkVNC,
  killAllWiresharkVNCCtrs,
  getHostname,
  setSessionHostname
} from "./capture";
export {
  setLinkDelay,
  setLinkJitter,
  setLinkLoss,
  setLinkRate,
  setLinkCorruption
} from "./impairments";
export {
  getEdgesharkInstallCmd,
  getEdgesharkUninstallCmd,
  EDGESHARK_INSTALL_CMD,
  EDGESHARK_UNINSTALL_CMD,
  installEdgeshark,
  uninstallEdgeshark
} from "./edgeshark";

// Workspace and file management commands
export { openLabFile } from "./openLabFile";
export { addLabFolderToWorkspace } from "./addToWorkspace";
export { openFolderInNewWindow } from "./openFolderInNewWindow";
export {
  copyLabPath,
  copyContainerIPv4Address,
  copyContainerIPv6Address,
  copyContainerName,
  copyContainerID,
  copyContainerKind,
  copyContainerImage,
  copyMACAddress
} from "./copy";
export { deleteLab } from "./deleteLab";
export { toggleFavorite } from "./favorite";

// External tool and repo commands
export {
  graphDrawIOHorizontal,
  graphDrawIOVertical,
  graphDrawIOInteractive,
  graphTopoviewer,
  getCurrentTopoViewer,
  notifyCurrentTopoViewerOfCommandSuccess,
  notifyCurrentTopoViewerOfCommandFailure
} from "./graph";
export { inspectAllLabs, inspectOneLab } from "./inspect";
export { openBrowser } from "./openBrowser";
export { cloneRepo } from "./cloneRepo";
export { cloneRepoFromUrl } from "./cloneRepoCore";
export { deployPopularLab } from "./deployPopular";
export { clonePopularRepo } from "./clonePopularRepo";
export { openLink } from "./openLink";
export {
  fcliBgpPeers,
  fcliBgpRib,
  fcliIpv4Rib,
  fcliLldp,
  fcliMac,
  fcliNi,
  fcliSubif,
  fcliSysInfo,
  fcliCustom
} from "./fcli";
