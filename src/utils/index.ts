/**
 * Utils barrel file
 */

// Async utilities
export { delay } from "./async";

// Constants
export {
  WIRESHARK_VNC_CTR_NAME_PREFIX,
  DEFAULT_WIRESHARK_VNC_DOCKER_PULL_POLICY,
  DEFAULT_WIRESHARK_VNC_DOCKER_IMAGE,
  DEFAULT_ATTACH_SHELL_CMD,
  DEFAULT_ATTACH_TELNET_PORT,
  ImagePullPolicy,
  ContainerAction,
} from "./consts";

// Docker utilities
export {
  checkAndPullDockerImage,
  runContainerAction,
  startContainer,
  stopContainer,
  pauseContainer,
  unpauseContainer,
} from "./docker/docker";

export {
  onDockerImagesUpdated,
  getDockerImages,
  refreshDockerImages,
  startDockerImageEventMonitor,
} from "./docker/images";

// Note: packetflix is not exported from index to avoid circular dependency
// Import directly from './packetflix' if needed

// Webview utilities
export { tryPostMessage, isHttpEndpointReady } from "./webview";

// General utilities
export {
  stripAnsi,
  stripFileName,
  getRelativeFolderPath,
  getRelLabFolderPath,
  normalizeLabPath,
  titleCase,
  getUserInfo,
  isOrbstack,
  getFreePort,
  getConfig,
  runCommand,
  installContainerlab,
  checkAndUpdateClabIfNeeded,
  getSelectedLabNode,
  sanitize,
} from "./utils";

// Clab utilities
export { isClabYamlFile } from "./clab";
