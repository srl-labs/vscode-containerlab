/**
 * Commands barrel file - re-exports from sub-barrels
 */

// Base command classes and utilities
export { Command, execCommandInTerminal, execCommandInOutput, ClabCommand } from "./base";
export type {
  SpinnerOptions,
  TerminalOptions,
  CmdOptions,
  SpinnerMsg,
  CommandFailureHandler,
} from "./base";

// Lifecycle commands (deploy, destroy, redeploy, save)
export {
  deploy,
  deployCleanup,
  deploySpecificFile,
  destroy,
  destroyCleanup,
  redeploy,
  redeployCleanup,
  saveLab,
  saveNode,
  runClabAction,
} from "./lifecycle";

// Node-related commands
export {
  startNode,
  stopNode,
  pauseNode,
  unpauseNode,
  attachShell,
  telnetToNode,
  sshToNode,
  sshToLab,
  manageNodeImpairments,
  showLogs,
  sshxAttach,
  sshxDetach,
  sshxReattach,
  sshxCopyLink,
  gottyAttach,
  gottyDetach,
  gottyReattach,
  gottyCopyLink,
} from "./node";

// Network and interface commands
export {
  captureInterface,
  captureInterfaceWithPacketflix,
  captureEdgesharkVNC,
  killAllWiresharkVNCCtrs,
  getHostname,
  setSessionHostname,
  setLinkDelay,
  setLinkJitter,
  setLinkLoss,
  setLinkRate,
  setLinkCorruption,
  setImpairment,
  getEdgesharkInstallCmd,
  getEdgesharkUninstallCmd,
  EDGESHARK_INSTALL_CMD,
  EDGESHARK_UNINSTALL_CMD,
  installEdgeshark,
  uninstallEdgeshark,
} from "./network";

// Workspace and file management commands
export {
  openLabFile,
  addLabFolderToWorkspace,
  openFolderInNewWindow,
  copyLabPath,
  copyContainerIPv4Address,
  copyContainerIPv6Address,
  copyContainerName,
  copyContainerID,
  copyContainerKind,
  copyContainerImage,
  copyMACAddress,
  deleteLab,
  toggleFavorite,
} from "./workspace";

// External tool and repo commands
export {
  graphDrawIOHorizontal,
  graphDrawIOVertical,
  graphDrawIOInteractive,
  graphTopoviewer,
  getCurrentTopoViewer,
  notifyCurrentTopoViewerOfCommandSuccess,
  notifyCurrentTopoViewerOfCommandFailure,
  inspectAllLabs,
  inspectOneLab,
  openBrowser,
  cloneRepo,
  cloneRepoFromUrl,
  deployPopularLab,
  clonePopularRepo,
  openLink,
  fcliBgpPeers,
  fcliBgpRib,
  fcliIpv4Rib,
  fcliLldp,
  fcliMac,
  fcliNi,
  fcliSubif,
  fcliSysInfo,
  fcliCustom,
} from "./external";
