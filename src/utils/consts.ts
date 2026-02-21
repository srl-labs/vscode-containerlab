export const WIRESHARK_VNC_CTR_NAME_PREFIX = "clab_vsc_ws";
export const DEFAULT_WIRESHARK_VNC_DOCKER_PULL_POLICY = ImagePullPolicy.Always;
export const DEFAULT_WIRESHARK_VNC_DOCKER_IMAGE = "ghcr.io/kaelemc/wireshark-vnc-docker:latest";
export const DEFAULT_ATTACH_SHELL_CMD = "sh";
export const DEFAULT_ATTACH_TELNET_PORT = 5000;

export const enum ImagePullPolicy {
  Never = "never",
  Missing = "missing",
  Always = "always",
}

export const enum ContainerAction {
  Start = "start",
  Stop = "stop",
  Pause = "pause",
  Unpause = "unpause",
}
