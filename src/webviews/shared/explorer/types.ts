export type ExplorerSectionId = "runningLabs" | "localLabs" | "helpFeedback";

export const EXPLORER_SECTION_ORDER: ExplorerSectionId[] = [
  "runningLabs",
  "localLabs",
  "helpFeedback"
];

export const EXPLORER_SECTION_LABELS: Record<ExplorerSectionId, string> = {
  runningLabs: "Running Labs",
  localLabs: "Undeployed Local Labs",
  helpFeedback: "Help & Feedback"
};

export interface ExplorerAction {
  id: string;
  actionRef: string;
  label: string;
  commandId: string;
  destructive?: boolean;
}

export interface ExplorerNode {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  statusIndicator?: "green" | "red" | "yellow" | "blue" | "gray";
  statusDescription?: string;
  primaryAction?: ExplorerAction;
  actions: ExplorerAction[];
  children: ExplorerNode[];
}

export interface ExplorerSectionSnapshot {
  id: ExplorerSectionId;
  label: string;
  count: number;
  nodes: ExplorerNode[];
  toolbarActions: ExplorerAction[];
}

export interface ExplorerUiState {
  sectionOrder?: ExplorerSectionId[];
  collapsedBySection?: Partial<Record<ExplorerSectionId, boolean>>;
  expandedBySection?: Partial<Record<ExplorerSectionId, string[]>>;
}

export interface ExplorerSnapshotMessage {
  command: "snapshot";
  filterText: string;
  sections: ExplorerSectionSnapshot[];
}

export interface ExplorerFilterStateMessage {
  command: "filterState";
  filterText: string;
}

export interface ExplorerUiStateMessage {
  command: "uiState";
  state: ExplorerUiState;
}

export interface ExplorerErrorMessage {
  command: "error";
  message: string;
}

export type ExplorerIncomingMessage =
  | ExplorerSnapshotMessage
  | ExplorerFilterStateMessage
  | ExplorerUiStateMessage
  | ExplorerErrorMessage;

export interface ExplorerReadyMessage {
  command: "ready";
}

export interface ExplorerSetFilterMessage {
  command: "setFilter";
  value: string;
}

export interface ExplorerInvokeActionMessage {
  command: "invokeAction";
  actionRef: string;
}

export interface ExplorerRequestRefreshMessage {
  command: "requestRefresh";
}

export interface ExplorerPersistUiStateMessage {
  command: "persistUiState";
  state: ExplorerUiState;
}

export type ExplorerOutgoingMessage =
  | ExplorerReadyMessage
  | ExplorerSetFilterMessage
  | ExplorerInvokeActionMessage
  | ExplorerRequestRefreshMessage
  | ExplorerPersistUiStateMessage;
