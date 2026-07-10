import type { ContainerlabBackend } from "./types";
import { backendHasCapability } from "./types";

export interface ClabUiHostCapabilitiesBootstrap {
  lifecycleActions: Record<
    | "deployLab"
    | "deployLabCleanup"
    | "destroyLab"
    | "destroyLabCleanup"
    | "redeployLab"
    | "redeployLabCleanup"
    | "applyLab"
    | "startLab"
    | "stopLab"
    | "restartLab",
    boolean
  >;
  nodeActions: Record<"ssh" | "shell" | "logs" | "start" | "stop" | "restart", boolean>;
  features: Record<"grafanaExport" | "interfaceCapture" | "linkImpairment" | "splitView", boolean>;
}

export function buildClabUiHostCapabilities(
  backend: ContainerlabBackend
): ClabUiHostCapabilitiesBootstrap {
  const lifecycle = backendHasCapability(backend, "lab-lifecycle");
  const runtimeActions = backendHasCapability(backend, "runtime-actions");
  return {
    lifecycleActions: {
      deployLab: lifecycle,
      deployLabCleanup: lifecycle,
      destroyLab: lifecycle,
      destroyLabCleanup: lifecycle,
      redeployLab: lifecycle,
      redeployLabCleanup: lifecycle,
      applyLab: lifecycle,
      startLab: lifecycle,
      stopLab: lifecycle,
      restartLab: lifecycle
    },
    nodeActions: {
      ssh: runtimeActions,
      shell: runtimeActions,
      logs: runtimeActions,
      start: runtimeActions,
      stop: runtimeActions,
      restart: runtimeActions
    },
    features: {
      grafanaExport: true,
      interfaceCapture: backendHasCapability(backend, "captures"),
      linkImpairment: backendHasCapability(backend, "netem"),
      splitView: true
    }
  };
}
