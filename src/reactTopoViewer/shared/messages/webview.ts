/**
 * Messages that applies to webview.
 */

/** Message type for topology data updates sent to webview */
export const MSG_TOPOLOGY_DATA = "topology-data";

/** Message type for incremental edge stats updates */
export const MSG_EDGE_STATS_UPDATE = "edge-stats-update";

/** Message type for external file change */
export const MSG_EXTERNAL_FILE_CHANGE = "external-file-change";

/** Message type for view/edit mode change */
export const MSG_TOPO_MODE_CHANGE = "topo-mode-changed";

/** Message type to update node name in place after change */
export const MSG_NODE_RENAMED = "node-renamed";

/** Message type for updating node data */
export const MSG_NODE_DATA_UPDATED = "node-data-updated";

export const MSG_PANEL_ACTION = "panel-action";

export const MSG_CUSTOM_NODE_UPDATED = "custom-nodes-updated";

export const MSG_CUSTOM_NODE_ERROR = "custom-node-error";

export const MSG_ICON_LIST_RESPONSE = "icon-list-response";

export const MSG_LAB_LIFECYCLE_STATUS = "lab-lifecycle-status";

export type WebviewMessageType =
  | typeof MSG_TOPOLOGY_DATA
  | typeof MSG_EDGE_STATS_UPDATE
  | typeof MSG_EXTERNAL_FILE_CHANGE
  | typeof MSG_TOPO_MODE_CHANGE
  | typeof MSG_NODE_RENAMED
  | typeof MSG_NODE_DATA_UPDATED
  | typeof MSG_PANEL_ACTION
  | typeof MSG_CUSTOM_NODE_UPDATED
  | typeof MSG_CUSTOM_NODE_ERROR
  | typeof MSG_ICON_LIST_RESPONSE
  | typeof MSG_LAB_LIFECYCLE_STATUS;
