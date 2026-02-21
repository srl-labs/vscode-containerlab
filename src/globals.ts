/**
 * Global state module - contains shared state variables used across the extension.
 * This module is intentionally kept free of internal imports to avoid circular dependencies.
 *
 * Provider types use a minimal interface to avoid importing from treeView modules.
 */
import * as vscode from "vscode";
import type Docker from "dockerode";
import { getRecordUnknown } from "./reactTopoViewer/shared/utilities/typeHelpers";

/**
 * Minimal interfaces for providers to avoid circular imports.
 * Consumers should use these interfaces or cast to the actual type when needed.
 */
export interface LocalLabsProviderInterface {
  forceRefresh(): void;
  setTreeFilter(filter: string): void;
  clearTreeFilter(): void;
}

export interface RunningLabsProviderInterface {
  refresh(): Promise<void>;
  softRefresh(): Promise<void>;
  refreshContainer(containerShortId: string, newState: string): Promise<void>;
  refreshWithoutDiscovery(): void;
  setTreeFilter(filter: string): void;
  clearTreeFilter(): void;
  discoverInspectLabs(): Promise<Record<string, unknown> | undefined>;
}

// HelpFeedbackProvider doesn't need specific methods exposed in globals

/** Our global output channel */
export let outputChannel: vscode.LogOutputChannel;
export let username: string;
export let hideNonOwnedLabsState: boolean = false;
export let favoriteLabs: Set<string> = new Set();
export let extensionContext: vscode.ExtensionContext;
// Provider types use minimal interfaces to avoid circular imports
export let localLabsProvider: LocalLabsProviderInterface;
export let runningLabsProvider: RunningLabsProviderInterface;
export let helpFeedbackProvider: unknown;
export let sshxSessions: Map<string, string> = new Map();
export let gottySessions: Map<string, string> = new Map();

function resolveExtensionVersion(): string | undefined {
  const pkg =
    getRecordUnknown(vscode.extensions.getExtension("srl-labs.vscode-containerlab")?.packageJSON) ??
    {};
  const version = pkg.version;
  return typeof version === "string" ? version : undefined;
}

export const extensionVersion = resolveExtensionVersion();

export let containerlabBinaryPath: string = "containerlab";
export let dockerClient: Docker;

// JSON config mappings
import * as execCmdJson from "../resources/exec_cmd.json";
import * as sshUserJson from "../resources/ssh_users.json";
export const execCmdMapping = execCmdJson;
export const sshUserMapping = sshUserJson;

// Setter functions for globals that need to be modified from extension.ts
export function setOutputChannel(channel: vscode.LogOutputChannel) {
  outputChannel = channel;
}

export function setUsername(name: string) {
  username = name;
}

export function setDockerClient(client: Docker) {
  dockerClient = client;
}

export function setContainerlabBinaryPath(path: string) {
  containerlabBinaryPath = path;
}

export function setExtensionContext(context: vscode.ExtensionContext) {
  extensionContext = context;
}

export function setFavoriteLabs(labs: Set<string>) {
  favoriteLabs = labs;
}

export function setLocalLabsProvider(provider: LocalLabsProviderInterface) {
  localLabsProvider = provider;
}

export function setRunningLabsProvider(provider: RunningLabsProviderInterface) {
  runningLabsProvider = provider;
}

export function setHelpFeedbackProvider(provider: unknown) {
  helpFeedbackProvider = provider;
}

export function setHideNonOwnedLabsState(hide: boolean) {
  hideNonOwnedLabsState = hide;
}
