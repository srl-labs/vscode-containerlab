/**
 * Network and interface commands - capture, impairments, edgeshark
 */

export {
  captureInterface,
  captureInterfaceWithPacketflix,
  captureEdgesharkVNC,
  killAllWiresharkVNCCtrs,
  getHostname,
  setSessionHostname
} from "../capture";
export {
  setLinkDelay,
  setLinkJitter,
  setLinkLoss,
  setLinkRate,
  setLinkCorruption,
  setImpairment
} from "../impairments";
export {
  getEdgesharkInstallCmd,
  getEdgesharkUninstallCmd,
  EDGESHARK_INSTALL_CMD,
  EDGESHARK_UNINSTALL_CMD,
  installEdgeshark,
  uninstallEdgeshark
} from "../edgeshark";
