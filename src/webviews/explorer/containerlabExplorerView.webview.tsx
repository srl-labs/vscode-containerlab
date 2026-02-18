import {
  AccountTree as AccountTreeIcon,
  ArticleOutlined as ArticleOutlinedIcon,
  Build as BuildIcon,
  ChevronRight as ChevronRightIcon,
  ContentCopy as ContentCopyIcon,
  DescriptionOutlined as DescriptionOutlinedIcon,
  DeleteOutline as DeleteOutlineIcon,
  DownloadOutlined as DownloadOutlinedIcon,
  ExpandMore as ExpandMoreIcon,
  FilterAlt as FilterAltIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  ForumOutlined as ForumOutlinedIcon,
  Link as LinkIcon,
  LinkOff as LinkOffIcon,
  ManageSearch as ManageSearchIcon,
  MoreVert as MoreVertIcon,
  NoteAdd as NoteAddIcon,
  OpenInBrowser as OpenInBrowserIcon,
  OpenInNew as OpenInNewIcon,
  PlayArrow as PlayArrowIcon,
  PlayCircleOutline as PlayCircleOutlineIcon,
  PauseCircleOutline as PauseCircleOutlineIcon,
  Refresh as RefreshIcon,
  SaveOutlined as SaveOutlinedIcon,
  Search as SearchIcon,
  SettingsEthernet as SettingsEthernetIcon,
  Source as SourceIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Stop as StopIcon,
  Terminal as TerminalIcon,
  Tune as TuneIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  type SvgIconComponent
} from "@mui/icons-material";
import {
  Alert,
  Box,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { createRoot } from "react-dom/client";
import {
  type Dispatch,
  type DragEvent,
  type MouseEvent,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { MuiThemeProvider } from "../../reactTopoViewer/webview/theme";
import {
  ContextMenu,
  type ContextMenuItem
} from "../../reactTopoViewer/webview/components/context-menu/ContextMenu";
import { useMessageListener, usePostMessage, useReadySignal } from "../shared/hooks";
import {
  EXPLORER_SECTION_ORDER,
  type ExplorerAction,
  type ExplorerIncomingMessage,
  type ExplorerNode,
  type ExplorerSectionId,
  type ExplorerSectionSnapshot,
  type ExplorerUiState
} from "../shared/explorer/types";

const COLOR_ERROR_MAIN = "error.main";
const COLOR_TEXT_PRIMARY = "text.primary";
const COLOR_TEXT_SECONDARY = "text.secondary";
const COLOR_TEXT_DISABLED = "text.disabled";
const FILTER_UPDATE_DEBOUNCE_MS = 250;
const UI_STATE_UPDATE_DEBOUNCE_MS = 160;
const DEFAULT_EXPANDED_SECTIONS = new Set<ExplorerSectionId>([
  "runningLabs",
  "localLabs",
  "helpFeedback"
]);
const TREE_DEPTH_INDENT = 1.6;
const TREE_DISCLOSURE_SLOT_PX = 14;
const TREE_ROW_GAP = 0.3;
const NODE_MARKER_SLOT_PX = 14;
const RESIZE_DIVIDER_HEIGHT_PX = 4;
const MIN_SECTION_BODY_HEIGHT_PX = 40;
const FIXED_HEIGHT_SECTIONS: ReadonlySet<ExplorerSectionId> = new Set(["helpFeedback"]);

const STATUS_COLOR_MAP: Record<string, string> = {
  green: "success.main",
  red: COLOR_ERROR_MAIN,
  yellow: "warning.main",
  blue: "info.main",
  gray: COLOR_TEXT_DISABLED
};

const TOOLBAR_ICON_BUTTON_SX = {
  width: 24,
  height: 24,
  borderRadius: 1,
  color: COLOR_TEXT_PRIMARY,
  "&:hover": {
    bgcolor: (theme: Theme) => theme.alpha(theme.palette.primary.main, 0.14)
  }
} as const;

interface ExplorerNodeLabelProps {
  node: ExplorerNode;
  sectionId: ExplorerSectionId;
  onInvokeAction: (action: ExplorerAction) => void;
}

type ActionGroupId =
  | "topology"
  | "graph"
  | "lifecycle"
  | "save"
  | "access"
  | "sharing"
  | "network"
  | "inspect"
  | "copy"
  | "tools"
  | "view"
  | "danger"
  | "other";

type ExplorerNodeKind = "lab" | "container" | "interface" | "link" | "other";

interface ExplorerActionGroup {
  id: ActionGroupId;
  label: string;
  actions: ExplorerAction[];
}

type CommandMatcher = (command: string) => boolean;

interface CommandIconRule {
  match: CommandMatcher;
  icon: SvgIconComponent;
}

interface CommandActionGroupRule {
  match: CommandMatcher;
  group: ActionGroupId;
}

type SharingBucket = "sshx" | "gotty" | "other";

const ACTION_GROUP_ORDER_DEFAULT: ActionGroupId[] = [
  "topology",
  "graph",
  "lifecycle",
  "save",
  "access",
  "sharing",
  "network",
  "inspect",
  "copy",
  "tools",
  "view",
  "other",
  "danger"
];

const ACTION_GROUP_ORDER_BY_NODE_KIND: Record<ExplorerNodeKind, ActionGroupId[]> = {
  lab: [
    "lifecycle",
    "save",
    "topology",
    "graph",
    "access",
    "sharing",
    "inspect",
    "tools",
    "copy",
    "view",
    "network",
    "other",
    "danger"
  ],
  container: [
    "lifecycle",
    "save",
    "access",
    "inspect",
    "network",
    "copy",
    "sharing",
    "tools",
    "view",
    "topology",
    "graph",
    "other"
  ],
  interface: ACTION_GROUP_ORDER_DEFAULT,
  link: ["sharing", "copy", "view", "topology", "graph", "lifecycle", "save", "network", "inspect", "tools", "other", "access"],
  other: ACTION_GROUP_ORDER_DEFAULT
};

const ACTION_ICON_BY_COMMAND: Record<string, SvgIconComponent> = {
  "containerlab.inspectall": ManageSearchIcon,
  "containerlab.treeview.runninglabs.hidenonownedlabs": VisibilityOffIcon,
  "containerlab.treeview.runninglabs.shownonownedlabs": VisibilityIcon,
  "containerlab.editor.topoviewereditor": NoteAddIcon,
  "containerlab.lab.clonerepo": SourceIcon,
  "containerlab.lab.togglefavorite": StarBorderIcon,
  "containerlab.lab.addtoworkspace": FolderOpenIcon,
  "containerlab.lab.save": SaveOutlinedIcon,
  "containerlab.node.save": SaveOutlinedIcon,
  "containerlab.node.showlogs": ArticleOutlinedIcon,
  "containerlab.node.stop": StopIcon,
  "containerlab.node.pause": PauseCircleOutlineIcon,
  "containerlab.node.unpause": PlayCircleOutlineIcon,
  "containerlab.interface.setdelay": TuneIcon,
  "containerlab.interface.setjitter": TuneIcon,
  "containerlab.interface.setloss": TuneIcon,
  "containerlab.interface.setrate": TuneIcon,
  "containerlab.interface.setcorruption": TuneIcon,
  "containerlab.lab.sshx.attach": LinkIcon,
  "containerlab.lab.sshx.detach": LinkOffIcon,
  "containerlab.lab.sshx.reattach": LinkIcon,
  "containerlab.lab.sshx.copylink": LinkIcon,
  "containerlab.lab.gotty.attach": OpenInBrowserIcon,
  "containerlab.lab.gotty.detach": OpenInBrowserIcon,
  "containerlab.lab.gotty.reattach": OpenInBrowserIcon,
  "containerlab.lab.gotty.copylink": OpenInBrowserIcon
};

const ACTION_ICON_RULES: ReadonlyArray<CommandIconRule> = [
  { match: (command) => command.includes("copy"), icon: ContentCopyIcon },
  {
    match: (command) =>
      command.includes("destroy") || command.includes("delete") || command.includes("detach"),
    icon: DeleteOutlineIcon
  },
  {
    match: (command) => command.includes("redeploy"),
    icon: RefreshIcon
  },
  { match: (command) => command.includes("stop"), icon: StopIcon },
  { match: (command) => command.includes("unpause"), icon: PlayCircleOutlineIcon },
  { match: (command) => command.includes("pause"), icon: PauseCircleOutlineIcon },
  {
    match: (command) =>
      command.includes("ssh") || command.includes("shell") || command.includes("telnet"),
    icon: TerminalIcon
  },
  { match: (command) => command.includes("filter"), icon: FilterAltIcon },
  { match: (command) => command.includes(".save"), icon: SaveOutlinedIcon },
  {
    match: (command) => command.includes("showlogs") || command.includes("logs"),
    icon: ArticleOutlinedIcon
  },
  { match: (command) => command.startsWith("containerlab.lab.fcli."), icon: BuildIcon },
  { match: (command) => command.includes(".gotty."), icon: OpenInBrowserIcon },
  { match: (command) => command.startsWith("containerlab.lab.graph."), icon: AccountTreeIcon },
  {
    match: (command) =>
      command.includes("open") || command.includes("graph") || command.includes("inspect"),
    icon: OpenInNewIcon
  },
  { match: (command) => command.includes("folder"), icon: FolderOpenIcon },
  {
    match: (command) => command.includes("capture") || command.includes("impairment"),
    icon: SettingsEthernetIcon
  },
  {
    match: (command) =>
      command.includes("delay") ||
      command.includes("jitter") ||
      command.includes("loss") ||
      command.includes("rate") ||
      command.includes("corruption"),
    icon: TuneIcon
  },
  {
    match: (command) =>
      command.includes("deploy") || command.includes("start") || command.includes("run"),
    icon: PlayArrowIcon
  },
  { match: (command) => command.includes("link"), icon: LinkIcon }
];

const ACTION_GROUP_RULES: ReadonlyArray<CommandActionGroupRule> = [
  { match: (command) => command.startsWith("containerlab.lab.graph."), group: "graph" },
  { match: (command) => command.includes(".save"), group: "save" },
  { match: (command) => command.startsWith("containerlab.lab.fcli."), group: "tools" },
  {
    match: (command) => command.startsWith("containerlab.interface.") || command.includes("impairment"),
    group: "network"
  },
  { match: (command) => command.includes(".sshx.") || command.includes(".gotty."), group: "sharing" },
  { match: (command) => command.includes("copy"), group: "copy" },
  { match: (command) => command.includes("inspect") || command.includes("showlogs"), group: "inspect" },
  {
    match: (command) =>
      command.includes("ssh") ||
      command.includes("shell") ||
      command.includes("telnet") ||
      command.includes("openbrowser"),
    group: "access"
  },
  {
    match: (command) =>
      command.includes("deploy") ||
      command.includes("destroy") ||
      command.includes("redeploy") ||
      command.includes("start") ||
      command.includes("stop") ||
      command.includes("pause") ||
      command.includes("unpause"),
    group: "lifecycle"
  },
  {
    match: (command) =>
      command.includes("openfile") ||
      command.includes("topoviewer") ||
      command.includes("openfolder") ||
      command.includes("addtoworkspace") ||
      command.includes("togglefavorite") ||
      command.includes("clonerepo"),
    group: "topology"
  },
  {
    match: (command) => command.includes("delete"),
    group: "danger"
  },
  {
    match: (command) =>
      command.includes("filter") ||
      command.includes("hide") ||
      command.includes("show"),
    group: "view"
  }
];

const ACTION_GROUP_SECTION_DEFAULT_BY_NODE_KIND: Record<ExplorerNodeKind, number> = {
  lab: 4,
  container: 3,
  interface: 1,
  link: 2,
  other: 1
};

const ACTION_GROUP_SECTION_BY_NODE_KIND: Partial<
  Record<ExplorerNodeKind, Partial<Record<ActionGroupId, number>>>
> = {
  lab: {
    lifecycle: 1,
    save: 1,
    topology: 2,
    graph: 2,
    access: 3,
    sharing: 3,
    inspect: 3,
    tools: 3,
    danger: 5
  },
  container: {
    lifecycle: 1,
    save: 1,
    access: 2,
    inspect: 2,
    network: 2
  },
  link: {
    sharing: 1,
    copy: 1
  }
};

interface SectionTreeProps {
  section: ExplorerSectionSnapshot;
  expandedItems: string[];
  onExpandedItemsChange: (itemIds: string[]) => void;
  onInvokeAction: (action: ExplorerAction) => void;
}

interface SectionToolbarProps {
  actions: ExplorerAction[];
  onInvokeAction: (action: ExplorerAction) => void;
}

interface ExplorerSectionCardProps {
  section: ExplorerSectionSnapshot;
  expandedItems: string[];
  isCollapsed: boolean;
  isDropTarget: boolean;
  isBeingDragged: boolean;
  flexStyle: string;
  onSetSectionRef: (sectionId: ExplorerSectionId, element: HTMLDivElement | null) => void;
  onSectionDragStart: (sectionId: ExplorerSectionId) => (event: DragEvent<HTMLDivElement>) => void;
  onSectionDragOver: (sectionId: ExplorerSectionId) => (event: DragEvent<HTMLDivElement>) => void;
  onSectionDrop: (sectionId: ExplorerSectionId) => (event: DragEvent<HTMLDivElement>) => void;
  onSectionDragEnd: () => void;
  onToggleSectionCollapsed: (sectionId: ExplorerSectionId) => void;
  onInvokeAction: (action: ExplorerAction) => void;
  onExpandedItemsChange: (sectionId: ExplorerSectionId, itemIds: string[]) => void;
  onExpandAllInSection: (sectionId: ExplorerSectionId, nodes: ExplorerNode[]) => void;
  onCollapseAllInSection: (sectionId: ExplorerSectionId) => void;
}

type SnapshotExplorerMessage = Extract<ExplorerIncomingMessage, { command: "snapshot" }>;
type FilterStateExplorerMessage = Extract<ExplorerIncomingMessage, { command: "filterState" }>;
type UiStateExplorerMessage = Extract<ExplorerIncomingMessage, { command: "uiState" }>;
type ErrorExplorerMessage = Extract<ExplorerIncomingMessage, { command: "error" }>;

function statusColor(indicator: string | undefined): string {
  if (!indicator) {
    return COLOR_TEXT_DISABLED;
  }
  return STATUS_COLOR_MAP[indicator] || COLOR_TEXT_DISABLED;
}

function formatSectionTitle(section: ExplorerSectionSnapshot): string {
  if (section.id === "helpFeedback") {
    return section.label;
  }
  return `${section.label} (${section.count})`;
}

function flattenNodeIds(nodes: ExplorerNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    ids.push(...flattenNodeIds(node.children));
  }
  return ids;
}

function flattenExpandableNodeIds(nodes: ExplorerNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children.length > 0) {
      ids.push(node.id);
      ids.push(...flattenExpandableNodeIds(node.children));
    }
  }
  return ids;
}

function mergeSectionOrder(
  currentOrder: ExplorerSectionId[],
  sections: ExplorerSectionSnapshot[]
): ExplorerSectionId[] {
  const visibleIds = sections.map((section) => section.id);
  const visibleSet = new Set(visibleIds);

  const nextOrder = currentOrder.filter((id) => visibleSet.has(id));
  for (const sectionId of visibleIds) {
    if (!nextOrder.includes(sectionId)) {
      nextOrder.push(sectionId);
    }
  }

  return nextOrder;
}

function reorderSections(
  currentOrder: ExplorerSectionId[],
  sourceId: ExplorerSectionId,
  targetId: ExplorerSectionId
): ExplorerSectionId[] {
  if (sourceId === targetId) {
    return currentOrder;
  }

  const nextOrder = currentOrder.filter((sectionId) => sectionId !== sourceId);
  const targetIndex = nextOrder.indexOf(targetId);
  if (targetIndex < 0) {
    return currentOrder;
  }

  nextOrder.splice(targetIndex, 0, sourceId);
  return nextOrder;
}

function isExplorerSectionId(value: string): value is ExplorerSectionId {
  return EXPLORER_SECTION_ORDER.includes(value as ExplorerSectionId);
}

function nodeKindFromContext(contextValue: string | undefined): ExplorerNodeKind {
  if (!contextValue) {
    return "other";
  }
  if (contextValue.includes("containerlabLab")) {
    return "lab";
  }
  if (contextValue === "containerlabContainer" || contextValue === "containerlabContainerGroup") {
    return "container";
  }
  if (contextValue === "containerlabInterfaceUp" || contextValue === "containerlabInterfaceDown") {
    return "interface";
  }
  if (contextValue === "containerlabSSHXLink" || contextValue === "containerlabGottyLink") {
    return "link";
  }
  return "other";
}

function isFavoriteLabNode(contextValue: string | undefined): boolean {
  return (
    typeof contextValue === "string" &&
    contextValue.includes("containerlabLab") &&
    contextValue.includes("Favorite")
  );
}

function isSharedLabNode(node: ExplorerNode): boolean {
  return Boolean(node.shareAction);
}

function actionIcon(action: ExplorerAction): SvgIconComponent {
  const command = action.commandId.toLowerCase();
  const commandIcon = ACTION_ICON_BY_COMMAND[command];
  if (commandIcon) {
    return commandIcon;
  }

  for (const rule of ACTION_ICON_RULES) {
    if (rule.match(command)) {
      return rule.icon;
    }
  }

  return BuildIcon;
}

function actionGroupId(action: ExplorerAction): ActionGroupId {
  const command = action.commandId.toLowerCase();

  for (const rule of ACTION_GROUP_RULES) {
    if (rule.match(command)) {
      return rule.group;
    }
  }

  return "other";
}

function actionGroupLabel(groupId: ActionGroupId): string {
  const labels: Record<ActionGroupId, string> = {
    topology: "Topology",
    graph: "Graph",
    lifecycle: "Lifecycle",
    save: "Save",
    access: "Access",
    sharing: "Sharing",
    network: "Network",
    inspect: "Inspect",
    copy: "Copy",
    tools: "Tools",
    view: "View",
    danger: "Danger",
    other: "Other"
  };
  return labels[groupId];
}

function actionGroupIcon(groupId: ActionGroupId): SvgIconComponent {
  const icons: Record<ActionGroupId, SvgIconComponent> = {
    topology: FolderOpenIcon,
    graph: AccountTreeIcon,
    lifecycle: PlayArrowIcon,
    save: SaveOutlinedIcon,
    access: TerminalIcon,
    sharing: LinkIcon,
    network: SettingsEthernetIcon,
    inspect: ManageSearchIcon,
    copy: ContentCopyIcon,
    tools: BuildIcon,
    view: FilterAltIcon,
    danger: DeleteOutlineIcon,
    other: BuildIcon
  };
  return icons[groupId];
}

function sortGroupActions(groupId: ActionGroupId, actions: ExplorerAction[]): ExplorerAction[] {
  if (groupId !== "graph") {
    return actions;
  }

  const graphCommandOrder = new Map<string, number>([
    ["containerlab.lab.graph.topoviewer", 1],
    ["containerlab.lab.graph.drawio.interactive", 2],
    ["containerlab.lab.graph.drawio.horizontal", 3],
    ["containerlab.lab.graph.drawio.vertical", 4]
  ]);

  return [...actions].sort((a, b) => {
    const aOrder = graphCommandOrder.get(a.commandId.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = graphCommandOrder.get(b.commandId.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.label.localeCompare(b.label);
  });
}

function groupActions(actions: ExplorerAction[], nodeKind: ExplorerNodeKind): ExplorerActionGroup[] {
  const grouped = new Map<ActionGroupId, ExplorerAction[]>();
  const order = ACTION_GROUP_ORDER_BY_NODE_KIND[nodeKind] ?? ACTION_GROUP_ORDER_DEFAULT;

  for (const action of actions) {
    const groupId = actionGroupId(action);
    const bucket = grouped.get(groupId) ?? [];
    bucket.push(action);
    grouped.set(groupId, bucket);
  }

  return order
    .map((groupId) => ({
      id: groupId,
      label: actionGroupLabel(groupId),
      actions: sortGroupActions(groupId, grouped.get(groupId) ?? [])
    }))
    .filter((group) => group.actions.length > 0);
}

function isInterfaceTimingAction(commandId: string): boolean {
  return (
    commandId === "containerlab.interface.setdelay" ||
    commandId === "containerlab.interface.setjitter" ||
    commandId === "containerlab.interface.setloss" ||
    commandId === "containerlab.interface.setrate" ||
    commandId === "containerlab.interface.setcorruption"
  );
}

function actionGroupSection(groupId: ActionGroupId, nodeKind: ExplorerNodeKind): number {
  const nodeKindSections = ACTION_GROUP_SECTION_BY_NODE_KIND[nodeKind];
  const section = nodeKindSections?.[groupId];
  if (section !== undefined) {
    return section;
  }
  return ACTION_GROUP_SECTION_DEFAULT_BY_NODE_KIND[nodeKind] ?? 1;
}

function withSectionDividers(
  groups: ExplorerActionGroup[],
  nodeKind: ExplorerNodeKind,
  renderGroup: (group: ExplorerActionGroup) => ContextMenuItem[]
): ContextMenuItem[] {
  if (groups.length === 0) {
    return [];
  }

  const items: ContextMenuItem[] = [];
  let previousSection: number | null = null;
  for (const group of groups) {
    const section = actionGroupSection(group.id, nodeKind);
    const rendered = renderGroup(group);
    if (rendered.length === 0) {
      continue;
    }
    if (items.length > 0 && previousSection !== null && section !== previousSection) {
      items.push({ id: `divider:${nodeKind}:${group.id}:${items.length}`, label: "", divider: true });
    }
    items.push(...rendered);
    previousSection = section;
  }
  return items;
}

function isHelpFeedbackLinkNode(node: ExplorerNode, sectionId: ExplorerSectionId): boolean {
  if (sectionId !== "helpFeedback") {
    return false;
  }
  return node.primaryAction?.commandId.toLowerCase() === "containerlab.openlink";
}

function helpFeedbackIconForNode(node: ExplorerNode): SvgIconComponent {
  const label = node.label.toLowerCase();
  if (label.includes("discord")) {
    return ForumOutlinedIcon;
  }
  if (label.includes("github")) {
    return SourceIcon;
  }
  if (label.includes("download")) {
    return DownloadOutlinedIcon;
  }
  if (label.includes("find")) {
    return SearchIcon;
  }
  if (label.includes("extension")) {
    return ArticleOutlinedIcon;
  }
  return DescriptionOutlinedIcon;
}

function nodeLeadingIcon(
  node: ExplorerNode,
  sectionId: ExplorerSectionId
): { Icon: SvgIconComponent; color: string } | undefined {
  if (isHelpFeedbackLinkNode(node, sectionId)) {
    return { Icon: helpFeedbackIconForNode(node), color: COLOR_TEXT_SECONDARY };
  }

  const context = node.contextValue;
  if (context === "containerlabInterfaceUp") {
    return { Icon: SettingsEthernetIcon, color: "success.main" };
  }
  if (context === "containerlabInterfaceDown") {
    return { Icon: LinkOffIcon, color: "error.main" };
  }
  if (context === "containerlabFolder") {
    return { Icon: FolderIcon, color: COLOR_TEXT_SECONDARY };
  }
  if (typeof context === "string" && context.includes("containerlabLabUndeployed")) {
    return { Icon: DescriptionOutlinedIcon, color: COLOR_TEXT_SECONDARY };
  }
  return undefined;
}

function toContextMenuItem(
  action: ExplorerAction,
  onInvokeAction: (action: ExplorerAction) => void
): ContextMenuItem {
  const ActionIcon = actionIcon(action);
  return {
    id: action.id,
    label: action.label,
    icon: <ActionIcon fontSize="small" />,
    danger: Boolean(action.destructive),
    onClick: () => onInvokeAction(action)
  };
}

function sharingBucketForCommand(commandId: string): SharingBucket {
  const command = commandId.toLowerCase();
  if (command.includes(".sshx.")) {
    return "sshx";
  }
  if (command.includes(".gotty.")) {
    return "gotty";
  }
  return "other";
}

function buildSharingGroupChildren(
  actions: ExplorerAction[],
  groupId: ActionGroupId,
  onInvokeAction: (action: ExplorerAction) => void
): ContextMenuItem[] {
  const sharingChildren: ContextMenuItem[] = [];
  let previousBucket: SharingBucket | null = null;

  for (const action of actions) {
    const bucket = sharingBucketForCommand(action.commandId);
    if (sharingChildren.length > 0 && previousBucket !== null && bucket !== previousBucket) {
      sharingChildren.push({
        id: `group:${groupId}:divider:${action.id}`,
        label: "",
        divider: true
      });
    }
    sharingChildren.push(toContextMenuItem(action, onInvokeAction));
    previousBucket = bucket;
  }

  return sharingChildren;
}

function toGroupMenuItem(
  group: ExplorerActionGroup,
  onInvokeAction: (action: ExplorerAction) => void
): ContextMenuItem {
  if (group.actions.length === 1) {
    return toContextMenuItem(group.actions[0], onInvokeAction);
  }

  const GroupIcon = actionGroupIcon(group.id);
  const children =
    group.id === "sharing"
      ? buildSharingGroupChildren(group.actions, group.id, onInvokeAction)
      : group.actions.map((action) => toContextMenuItem(action, onInvokeAction));

  return {
    id: `group:${group.id}`,
    label: group.label,
    icon: <GroupIcon fontSize="small" />,
    children
  };
}

function toGroupMenuItems(
  group: ExplorerActionGroup,
  onInvokeAction: (action: ExplorerAction) => void
): ContextMenuItem[] {
  if (group.id === "lifecycle") {
    return group.actions.map((action) => toContextMenuItem(action, onInvokeAction));
  }
  return [toGroupMenuItem(group, onInvokeAction)];
}

function buildInterfaceMenuItems(
  actions: ExplorerAction[],
  onInvokeAction: (action: ExplorerAction) => void
): ContextMenuItem[] {
  const interfaceItems: ContextMenuItem[] = [];
  let inTimingGroup = false;
  for (const action of actions) {
    const commandId = action.commandId.toLowerCase();
    const isTimingAction = isInterfaceTimingAction(commandId);

    if (isTimingAction && !inTimingGroup && interfaceItems.length > 0) {
      interfaceItems.push({
        id: `group:interface:timing-start:${action.id}`,
        label: "",
        divider: true
      });
    }
    if (!isTimingAction && inTimingGroup) {
      interfaceItems.push({
        id: `group:interface:timing-end:${action.id}`,
        label: "",
        divider: true
      });
    }

    interfaceItems.push(toContextMenuItem(action, onInvokeAction));
    inTimingGroup = isTimingAction;
  }

  return interfaceItems;
}

function buildNodeContextMenuItems(
  menuActions: ExplorerAction[],
  nodeKind: ExplorerNodeKind,
  onInvokeAction: (action: ExplorerAction) => void
): ContextMenuItem[] {
  if (nodeKind === "interface") {
    return buildInterfaceMenuItems(menuActions, onInvokeAction);
  }

  const groupedActions = groupActions(menuActions, nodeKind);
  return withSectionDividers(groupedActions, nodeKind, (group) =>
    toGroupMenuItems(group, onInvokeAction)
  );
}

function filterNodeMenuActions(nodeActions: ExplorerAction[], nodeKind: ExplorerNodeKind): ExplorerAction[] {
  if (nodeKind !== "lab") {
    return nodeActions;
  }
  return nodeActions.filter(
    (action) => action.commandId.toLowerCase() !== "containerlab.lab.graph.topoviewer"
  );
}

function useExplorerNodeMenu(params: {
  hasActions: boolean;
  hasContextMenuItems: boolean;
}) {
  const { hasActions, hasContextMenuItems } = params;
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [menuOpenToLeft, setMenuOpenToLeft] = useState(false);

  const openMenuFromElement = useCallback((element: HTMLElement, openToLeft = true) => {
    const rect = element.getBoundingClientRect();
    setMenuOpenToLeft(openToLeft);
    setMenuPosition({ x: Math.round(rect.right), y: Math.round(rect.bottom + 2) });
  }, []);

  const handleMenuOpen = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!hasActions) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openMenuFromElement(event.currentTarget, true);
    },
    [hasActions, openMenuFromElement]
  );

  const handleRowContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!hasActions) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const trigger = event.currentTarget.querySelector<HTMLElement>('[data-node-actions-trigger="true"]');
      openMenuFromElement(trigger ?? event.currentTarget, true);
    },
    [hasActions, openMenuFromElement]
  );

  const handleMenuClose = useCallback(() => {
    setMenuOpenToLeft(false);
    setMenuPosition(null);
  }, []);

  const handleBackdropContextMenu = useCallback((event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const relayTarget = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>('[data-explorer-node-row="true"]'))
      .find((element): element is HTMLElement => Boolean(element));
    if (!relayTarget) {
      return;
    }

    handleMenuClose();
    relayTarget.dispatchEvent(
      new window.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        button: 2,
        buttons: 2
      })
    );
  }, [handleMenuClose]);

  const menuOpen = Boolean(menuPosition) && hasContextMenuItems;

  return {
    menuPosition,
    menuOpenToLeft,
    menuOpen,
    handleMenuOpen,
    handleRowContextMenu,
    handleMenuClose,
    handleBackdropContextMenu
  };
}

function usePrimaryActionHandler(
  primaryAction: ExplorerNode["primaryAction"],
  onInvokeAction: (action: ExplorerAction) => void
) {
  return useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!primaryAction) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onInvokeAction(primaryAction);
    },
    [primaryAction, onInvokeAction]
  );
}

function useShareActionHandler(
  shareAction: ExplorerNode["shareAction"],
  onInvokeAction: (action: ExplorerAction) => void
) {
  return useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!shareAction) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onInvokeAction(shareAction);
    },
    [shareAction, onInvokeAction]
  );
}

interface ExplorerNodeTextBlockProps {
  node: ExplorerNode;
  hasEntryTooltip: boolean;
  leadingIcon: ReturnType<typeof nodeLeadingIcon>;
  showStatusDot: boolean;
  showFavoriteIcon: boolean;
  showSharedIcon: boolean;
  inlineContainerStatus: string | undefined;
  showSecondaryLine: boolean;
  secondaryText: string | undefined;
  handlePrimaryAction: (event: MouseEvent<HTMLElement>) => void;
  handleShareAction: (event: MouseEvent<HTMLElement>) => void;
}

function ExplorerNodeTextBlock({
  node,
  hasEntryTooltip,
  leadingIcon,
  showStatusDot,
  showFavoriteIcon,
  showSharedIcon,
  inlineContainerStatus,
  showSecondaryLine,
  secondaryText,
  handlePrimaryAction,
  handleShareAction
}: Readonly<ExplorerNodeTextBlockProps>) {
  return (
    <Box
      onClick={handlePrimaryAction}
      sx={{ minWidth: 0, flex: 1, cursor: node.primaryAction ? "pointer" : "default" }}
    >
      <Tooltip
        title={hasEntryTooltip ? node.tooltip : ""}
        placement="bottom"
        enterDelay={300}
        disableInteractive
        disableHoverListener={!hasEntryTooltip}
        disableFocusListener={!hasEntryTooltip}
        disableTouchListener={!hasEntryTooltip}
        slotProps={{
          tooltip: {
            sx: {
              maxWidth: "min(360px, calc(100vw - 24px))",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word"
            }
          }
        }}
      >
        <Stack direction="row" spacing={TREE_ROW_GAP} alignItems="center" sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: NODE_MARKER_SLOT_PX,
              flex: `0 0 ${NODE_MARKER_SLOT_PX}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {leadingIcon && (
              <leadingIcon.Icon
                fontSize="inherit"
                sx={{ fontSize: 13, color: leadingIcon.color, flex: "0 0 auto" }}
              />
            )}
            {!leadingIcon && showStatusDot && (
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flex: "0 0 auto",
                  bgcolor: statusColor(node.statusIndicator)
                }}
              />
            )}
          </Box>
          <Typography className="explorer-node-label" variant="body2" noWrap>
            {node.label}
          </Typography>
          {showFavoriteIcon && (
            <StarIcon
              fontSize="inherit"
              className="explorer-node-inline-icon explorer-node-inline-icon-favorite"
              aria-hidden="true"
            />
          )}
          {showSharedIcon && (
            <IconButton
              size="small"
              className="explorer-node-inline-icon-button"
              onClick={handleShareAction}
              aria-label={node.shareAction?.label ?? "Open shared session"}
            >
              <LinkIcon
                fontSize="inherit"
                className="explorer-node-inline-icon explorer-node-inline-icon-shared"
                aria-hidden="true"
              />
            </IconButton>
          )}
          {inlineContainerStatus && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {inlineContainerStatus}
            </Typography>
          )}
        </Stack>
      </Tooltip>
      {showSecondaryLine && (
        <Typography variant="caption" color="text.secondary" noWrap>
          {secondaryText}
        </Typography>
      )}
    </Box>
  );
}

interface ExplorerNodeActionsProps {
  hasActions: boolean;
  node: ExplorerNode;
  menuOpen: boolean;
  menuPosition: { x: number; y: number } | null;
  contextMenuItems: ContextMenuItem[];
  menuOpenToLeft: boolean;
  handleMenuOpen: (event: MouseEvent<HTMLElement>) => void;
  handleMenuClose: () => void;
  handleBackdropContextMenu: (event: MouseEvent) => void;
}

function ExplorerNodeActions({
  hasActions,
  node,
  menuOpen,
  menuPosition,
  contextMenuItems,
  menuOpenToLeft,
  handleMenuOpen,
  handleMenuClose,
  handleBackdropContextMenu
}: Readonly<ExplorerNodeActionsProps>) {
  if (!hasActions) {
    return null;
  }

  return (
    <>
      <IconButton
        size="small"
        onClick={handleMenuOpen}
        aria-label={`Actions for ${node.label}`}
        data-node-actions-trigger="true"
        sx={{ width: 22, height: 22, p: 0.25, color: COLOR_TEXT_PRIMARY }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <ContextMenu
        isVisible={menuOpen}
        position={menuPosition ?? { x: 0, y: 0 }}
        items={contextMenuItems}
        compact
        openToLeft={menuOpenToLeft}
        onClose={handleMenuClose}
        onBackdropContextMenu={handleBackdropContextMenu}
      />
    </>
  );
}

function ExplorerNodeLabel({ node, sectionId, onInvokeAction }: Readonly<ExplorerNodeLabelProps>) {
  const hasEntryTooltip = Boolean(node.tooltip);
  const leadingIcon = nodeLeadingIcon(node, sectionId);
  const nodeKind = nodeKindFromContext(node.contextValue);
  const menuActions = useMemo(() => filterNodeMenuActions(node.actions, nodeKind), [node.actions, nodeKind]);
  const hasActions = menuActions.length > 0;
  const contextMenuItems = useMemo<ContextMenuItem[]>(
    () => buildNodeContextMenuItems(menuActions, nodeKind, onInvokeAction),
    [menuActions, nodeKind, onInvokeAction]
  );
  const secondaryText = node.description || node.statusDescription;
  const isContainer = node.contextValue === "containerlabContainer" || node.contextValue === "containerlabContainerGroup";
  const isInterface =
    node.contextValue === "containerlabInterfaceUp" || node.contextValue === "containerlabInterfaceDown";
  const inlineContainerStatus = isContainer ? secondaryText?.trim() : undefined;
  const showSecondaryLine = Boolean(secondaryText) && !isContainer && !isInterface;
  const showStatusDot = Boolean(node.statusIndicator) && !isInterface;
  const showFavoriteIcon = isFavoriteLabNode(node.contextValue);
  const showSharedIcon = isSharedLabNode(node);
  const {
    menuPosition,
    menuOpenToLeft,
    menuOpen,
    handleMenuOpen,
    handleRowContextMenu,
    handleMenuClose,
    handleBackdropContextMenu
  } = useExplorerNodeMenu({
    hasActions,
    hasContextMenuItems: contextMenuItems.length > 0
  });
  const handlePrimaryAction = usePrimaryActionHandler(node.primaryAction, onInvokeAction);
  const handleShareAction = useShareActionHandler(node.shareAction, onInvokeAction);

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      onContextMenu={handleRowContextMenu}
      data-explorer-node-row="true"
      sx={{
        width: "100%",
        borderRadius: 0.5,
        ...(menuOpen && {
          bgcolor: (theme: Theme) => theme.alpha(theme.palette.primary.main, 0.12)
        })
      }}
    >
      <ExplorerNodeTextBlock
        node={node}
        hasEntryTooltip={hasEntryTooltip}
        leadingIcon={leadingIcon}
        showStatusDot={showStatusDot}
        showFavoriteIcon={showFavoriteIcon}
        showSharedIcon={showSharedIcon}
        inlineContainerStatus={inlineContainerStatus}
        showSecondaryLine={showSecondaryLine}
        secondaryText={secondaryText}
        handlePrimaryAction={handlePrimaryAction}
        handleShareAction={handleShareAction}
      />
      <ExplorerNodeActions
        hasActions={hasActions}
        node={node}
        menuOpen={menuOpen}
        menuPosition={menuPosition}
        contextMenuItems={contextMenuItems}
        menuOpenToLeft={menuOpenToLeft}
        handleMenuOpen={handleMenuOpen}
        handleMenuClose={handleMenuClose}
        handleBackdropContextMenu={handleBackdropContextMenu}
      />
    </Stack>
  );
}

interface SectionTreeNodeProps {
  node: ExplorerNode;
  sectionId: ExplorerSectionId;
  depth: number;
  expandedItems: string[];
  onToggleExpanded: (nodeId: string) => void;
  onInvokeAction: (action: ExplorerAction) => void;
}

function SectionTreeNode({
  node,
  sectionId,
  depth,
  expandedItems,
  onToggleExpanded,
  onInvokeAction
}: Readonly<SectionTreeNodeProps>) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedItems.includes(node.id);

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        spacing={TREE_ROW_GAP}
        sx={{ minHeight: 22, pl: depth * TREE_DEPTH_INDENT }}
      >
        <Box
          sx={{
            width: TREE_DISCLOSURE_SLOT_PX,
            flex: `0 0 ${TREE_DISCLOSURE_SLOT_PX}px`,
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          {hasChildren && (
            <IconButton
              size="small"
              sx={{
                width: TREE_DISCLOSURE_SLOT_PX,
                height: TREE_DISCLOSURE_SLOT_PX,
                p: 0,
                color: COLOR_TEXT_PRIMARY
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleExpanded(node.id);
              }}
              aria-label={isExpanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
            >
              {isExpanded ? <ExpandMoreIcon fontSize="inherit" /> : <ChevronRightIcon fontSize="inherit" />}
            </IconButton>
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <ExplorerNodeLabel node={node} sectionId={sectionId} onInvokeAction={onInvokeAction} />
        </Box>
      </Stack>

      {hasChildren && isExpanded && (
        <Stack spacing={0.1}>
          {node.children.map((child) => (
            <SectionTreeNode
              key={child.id}
              node={child}
              sectionId={sectionId}
              depth={depth + 1}
              expandedItems={expandedItems}
              onToggleExpanded={onToggleExpanded}
              onInvokeAction={onInvokeAction}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

function SectionTree({
  section,
  expandedItems,
  onExpandedItemsChange,
  onInvokeAction
}: Readonly<SectionTreeProps>) {
  const toggleExpanded = useCallback(
    (nodeId: string) => {
      if (expandedItems.includes(nodeId)) {
        onExpandedItemsChange(expandedItems.filter((id) => id !== nodeId));
        return;
      }
      onExpandedItemsChange([...expandedItems, nodeId]);
    },
    [expandedItems, onExpandedItemsChange]
  );

  if (section.nodes.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No items found.
      </Typography>
    );
  }

  return (
    <Stack spacing={0.15} sx={{ minHeight: 0 }}>
      {section.nodes.map((node) => (
        <SectionTreeNode
          key={node.id}
          node={node}
          sectionId={section.id}
          depth={0}
          expandedItems={expandedItems}
          onToggleExpanded={toggleExpanded}
          onInvokeAction={onInvokeAction}
        />
      ))}
    </Stack>
  );
}

function SectionToolbarActions({ actions, onInvokeAction }: Readonly<SectionToolbarProps>) {
  return (
    <Stack direction="row" spacing={0.25}>
      {actions.map((action) => {
        const IconComponent = actionIcon(action);
        return (
          <Tooltip key={action.id} title={action.label}>
            <IconButton
              size="small"
              aria-label={action.label}
              sx={TOOLBAR_ICON_BUTTON_SX}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onInvokeAction(action);
              }}
            >
              <IconComponent fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      })}
    </Stack>
  );
}

interface ResizeDividerProps {
  aboveId: ExplorerSectionId;
  belowId: ExplorerSectionId;
  onResizeStart: (aboveId: ExplorerSectionId, belowId: ExplorerSectionId, startY: number) => void;
}

function ResizeDivider({ aboveId, belowId, onResizeStart }: Readonly<ResizeDividerProps>) {
  return (
    <Box
      onMouseDown={(e) => {
        e.preventDefault();
        onResizeStart(aboveId, belowId, e.clientY);
      }}
      sx={{
        height: RESIZE_DIVIDER_HEIGHT_PX,
        flex: `0 0 ${RESIZE_DIVIDER_HEIGHT_PX}px`,
        cursor: "row-resize",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        "&:hover": {
          bgcolor: (theme: Theme) => theme.alpha(theme.palette.primary.main, 0.18)
        }
      }}
    />
  );
}

function usePaneResize(
  containerRef: RefObject<HTMLDivElement | null>,
  heightRatioBySection: Partial<Record<ExplorerSectionId, number>>,
  setHeightRatioBySection: Dispatch<SetStateAction<Partial<Record<ExplorerSectionId, number>>>>,
  collapsedBySection: Partial<Record<ExplorerSectionId, boolean>>,
  orderedSectionIds: ExplorerSectionId[]
) {
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);

  const handleResizeStart = useCallback(
    (aboveId: ExplorerSectionId, belowId: ExplorerSectionId, startY: number) => {
      const container = containerRef.current;
      if (!container) return;

      isResizingRef.current = true;
      setIsResizing(true);

      const expandedIds = orderedSectionIds.filter((id) => !collapsedBySection[id] && !FIXED_HEIGHT_SECTIONS.has(id));
      const headerHeight = 28;
      const dividerCount = Math.max(0, expandedIds.length - 1);
      const containerHeight = container.clientHeight;
      const availableBody = containerHeight - expandedIds.length * headerHeight - dividerCount * RESIZE_DIVIDER_HEIGHT_PX;

      const initialAboveRatio = heightRatioBySection[aboveId] ?? (1 / expandedIds.length);
      const initialBelowRatio = heightRatioBySection[belowId] ?? (1 / expandedIds.length);
      const combinedRatio = initialAboveRatio + initialBelowRatio;

      const onMouseMove = (ev: globalThis.MouseEvent) => {
        if (!isResizingRef.current) return;

        const deltaY = ev.clientY - startY;
        const ratioDelta = availableBody > 0 ? deltaY / availableBody : 0;

        const minRatio = availableBody > 0 ? MIN_SECTION_BODY_HEIGHT_PX / availableBody : 0;
        let newAboveRatio = initialAboveRatio + ratioDelta;
        let newBelowRatio = initialBelowRatio - ratioDelta;

        if (newAboveRatio < minRatio) {
          newAboveRatio = minRatio;
          newBelowRatio = combinedRatio - minRatio;
        }
        if (newBelowRatio < minRatio) {
          newBelowRatio = minRatio;
          newAboveRatio = combinedRatio - minRatio;
        }

        setHeightRatioBySection((current) => ({
          ...current,
          [aboveId]: newAboveRatio,
          [belowId]: newBelowRatio
        }));
      };

      const onMouseUp = () => {
        isResizingRef.current = false;
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [containerRef, heightRatioBySection, setHeightRatioBySection, collapsedBySection, orderedSectionIds]
  );

  return { isResizing, handleResizeStart };
}

function normalizeHeightRatios(
  currentRatios: Partial<Record<ExplorerSectionId, number>>,
  expandedIds: ExplorerSectionId[]
): Partial<Record<ExplorerSectionId, number>> {
  const n = expandedIds.length;
  if (n === 0) return currentRatios;

  const nextRatios: Partial<Record<ExplorerSectionId, number>> = { ...currentRatios };
  for (const id of expandedIds) {
    if (nextRatios[id] === undefined || nextRatios[id] === 0) {
      nextRatios[id] = 1 / n;
    }
  }
  const total = expandedIds.reduce((sum, id) => sum + (nextRatios[id] ?? 0), 0);
  if (total > 0) {
    for (const id of expandedIds) {
      nextRatios[id] = (nextRatios[id] ?? 0) / total;
    }
  }
  return nextRatios;
}

function getSectionPaperSx(isDropTarget: boolean, flexStyle: string) {
  return {
    flex: flexStyle,
    minHeight: 0,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    borderRadius: 0,
    border: "none",
    boxShadow: isDropTarget
      ? (theme: Theme) => `inset 0 0 0 1px ${theme.alpha(theme.palette.primary.main, 0.35)}`
      : "none"
  };
}

function getSectionHeaderSx(_isCollapsed: boolean, isBeingDragged: boolean) {
  return {
    px: 0.75,
    py: 0.2,
    height: 28,
    minHeight: 28,
    maxHeight: 28,
    display: "flex",
    alignItems: "center",
    gap: 0.35,
    cursor: isBeingDragged ? "grabbing" : "grab",
    userSelect: "none",
    bgcolor: (theme: Theme) =>
      isBeingDragged
        ? theme.alpha(theme.palette.primary.main, 0.1)
        : theme.alpha(theme.palette.background.default, 0.55)
  };
}

function ExplorerSectionCard({
  section,
  expandedItems,
  isCollapsed,
  isDropTarget,
  isBeingDragged,
  flexStyle,
  onSetSectionRef,
  onSectionDragStart,
  onSectionDragOver,
  onSectionDrop,
  onSectionDragEnd,
  onToggleSectionCollapsed,
  onInvokeAction,
  onExpandedItemsChange,
  onExpandAllInSection,
  onCollapseAllInSection
}: Readonly<ExplorerSectionCardProps>) {
  const expandableIds = useMemo(() => flattenExpandableNodeIds(section.nodes), [section.nodes]);

  const allExpanded = useMemo(() => {
    return expandableIds.length > 0 && expandableIds.every((id) => expandedItems.includes(id));
  }, [expandableIds, expandedItems]);

  const showExpandAllControl = section.id !== "helpFeedback" && expandableIds.length > 0;

  return (
    <Paper
      variant="outlined"
      ref={(element: HTMLDivElement | null) => {
        onSetSectionRef(section.id, element);
      }}
      sx={getSectionPaperSx(isDropTarget, flexStyle)}
      onDragOver={onSectionDragOver(section.id)}
      onDrop={onSectionDrop(section.id)}
    >
      <Box
        draggable
        onDragStart={onSectionDragStart(section.id)}
        onDragEnd={onSectionDragEnd}
        sx={{ ...getSectionHeaderSx(isCollapsed, isBeingDragged), flex: "0 0 auto" }}
      >
        <IconButton
          size="small"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleSectionCollapsed(section.id);
          }}
          aria-label={isCollapsed ? `Expand ${section.label}` : `Collapse ${section.label}`}
          sx={{ color: COLOR_TEXT_PRIMARY, p: 0.25 }}
        >
          {isCollapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>

        <Box
          onClick={() => onToggleSectionCollapsed(section.id)}
          sx={{ minWidth: 0, flex: 1, cursor: "pointer" }}
        >
          <Typography className="explorer-section-title" variant="body2" noWrap>
            {formatSectionTitle(section)}
          </Typography>
        </Box>

        <SectionToolbarActions actions={section.toolbarActions} onInvokeAction={onInvokeAction} />

        {showExpandAllControl && (
          <Tooltip title={allExpanded ? "Collapse All" : "Expand All"}>
            <IconButton
              size="small"
              sx={{ color: COLOR_TEXT_PRIMARY }}
              aria-label={allExpanded ? "Collapse all" : "Expand all"}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (allExpanded) {
                  onCollapseAllInSection(section.id);
                } else {
                  onExpandAllInSection(section.id, section.nodes);
                }
              }}
            >
              {allExpanded ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {!isCollapsed && (
        <Box sx={{ p: 1, flex: 1, minHeight: 0, overflowY: "auto" }}>
          <SectionTree
            section={section}
            expandedItems={expandedItems}
            onExpandedItemsChange={(itemIds) => onExpandedItemsChange(section.id, itemIds)}
            onInvokeAction={onInvokeAction}
          />
        </Box>
      )}
    </Paper>
  );
}

const EXPLORER_WEBVIEW_KIND = "containerlab-explorer";

export function ContainerlabExplorerView() {
  const postMessage = usePostMessage();
  const [sections, setSections] = useState<ExplorerSectionSnapshot[]>([]);
  const [sectionOrder, setSectionOrder] = useState<ExplorerSectionId[]>(EXPLORER_SECTION_ORDER);
  const [collapsedBySection, setCollapsedBySection] = useState<
    Partial<Record<ExplorerSectionId, boolean>>
  >({});
  const [expandedBySection, setExpandedBySection] = useState<
    Partial<Record<ExplorerSectionId, string[]>>
  >({
    runningLabs: [],
    localLabs: []
  });
  const [filterText, setFilterText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draggingSection, setDraggingSection] = useState<ExplorerSectionId | null>(null);
  const [dragOverSection, setDragOverSection] = useState<ExplorerSectionId | null>(null);
  const [heightRatioBySection, setHeightRatioBySection] = useState<
    Partial<Record<ExplorerSectionId, number>>
  >({});
  const [uiStateHydrated, setUiStateHydrated] = useState(false);
  const paneContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Partial<Record<ExplorerSectionId, HTMLDivElement | null>>>({});
  const pendingFilterSyncRef = useRef<string | null>(null);
  const filterTimeoutRef = useRef<number | null>(null);
  const uiStateTimeoutRef = useRef<number | null>(null);
  const expandedBeforeFilterRef = useRef<Partial<Record<ExplorerSectionId, string[]>> | null>(null);

  useReadySignal();

  const handleSnapshotMessage = useCallback((message: SnapshotExplorerMessage) => {
    const pending = pendingFilterSyncRef.current;
    if (pending !== null && message.filterText !== pending) {
      return;
    }
    if (pending !== null && message.filterText === pending) {
      pendingFilterSyncRef.current = null;
    }

    const filterActive = message.filterText.length > 0;
    setSections(message.sections);
    setSectionOrder((currentOrder) => mergeSectionOrder(currentOrder, message.sections));
    setCollapsedBySection((current) => {
      const next: Partial<Record<ExplorerSectionId, boolean>> = {};
      for (const section of message.sections) {
        next[section.id] = current[section.id] ?? !DEFAULT_EXPANDED_SECTIONS.has(section.id);
      }
      if (filterActive) {
        next.runningLabs = false;
        next.localLabs = false;
      }
      return next;
    });

    setExpandedBySection((current) => {
      if (filterActive) {
        if (!expandedBeforeFilterRef.current) {
          expandedBeforeFilterRef.current = current;
        }
        const next: Partial<Record<ExplorerSectionId, string[]>> = { ...current };
        for (const section of message.sections) {
          if (section.id === "runningLabs" || section.id === "localLabs") {
            next[section.id] = flattenExpandableNodeIds(section.nodes);
          }
        }
        return next;
      }

      if (expandedBeforeFilterRef.current) {
        const restored = expandedBeforeFilterRef.current;
        expandedBeforeFilterRef.current = null;
        return restored;
      }

      return current;
    });

    setFilterText(message.filterText);
  }, []);

  const handleFilterStateMessage = useCallback((message: FilterStateExplorerMessage) => {
    const pending = pendingFilterSyncRef.current;
    if (pending !== null && message.filterText !== pending) {
      return;
    }
    if (pending !== null && message.filterText === pending) {
      pendingFilterSyncRef.current = null;
    }
    setFilterText(message.filterText);
  }, []);

  const handleUiStateMessage = useCallback((message: UiStateExplorerMessage) => {
    const state = message.state || {};
    if (Array.isArray(state.sectionOrder) && state.sectionOrder.length > 0) {
      setSectionOrder(state.sectionOrder.filter((id) => isExplorerSectionId(id)));
    }
    if (state.collapsedBySection) {
      setCollapsedBySection(state.collapsedBySection);
    }
    if (state.expandedBySection) {
      setExpandedBySection(state.expandedBySection);
    }
    if (state.heightRatioBySection) {
      setHeightRatioBySection(state.heightRatioBySection);
    }
    setUiStateHydrated(true);
  }, []);

  const handleErrorMessage = useCallback((message: ErrorExplorerMessage) => {
    setErrorMessage(message.message);
  }, []);

  useMessageListener<ExplorerIncomingMessage>(
    useCallback((message) => {
      switch (message.command) {
        case "snapshot":
          handleSnapshotMessage(message);
          return;
        case "filterState":
          handleFilterStateMessage(message);
          return;
        case "uiState":
          handleUiStateMessage(message);
          return;
        case "error":
          handleErrorMessage(message);
          return;
        default:
          return;
      }
    }, [handleErrorMessage, handleFilterStateMessage, handleSnapshotMessage, handleUiStateMessage])
  );

  const invokeAction = useCallback(
    (action: ExplorerAction) => {
      postMessage({
        command: "invokeAction",
        actionRef: action.actionRef
      });
    },
    [postMessage]
  );

  const handleFilterChange = useCallback(
    (value: string) => {
      setFilterText(value);
      pendingFilterSyncRef.current = value.trim();

      if (filterTimeoutRef.current !== null) {
        window.clearTimeout(filterTimeoutRef.current);
        filterTimeoutRef.current = null;
      }

      if (value.trim().length === 0) {
        postMessage({ command: "setFilter", value: "" });
        return;
      }

      filterTimeoutRef.current = window.setTimeout(() => {
        filterTimeoutRef.current = null;
        postMessage({ command: "setFilter", value });
      }, FILTER_UPDATE_DEBOUNCE_MS);
    },
    [postMessage]
  );

  const handleExpandedItemsChange = useCallback((sectionId: ExplorerSectionId, itemIds: string[]) => {
    setExpandedBySection((current) => ({ ...current, [sectionId]: itemIds }));
  }, []);

  const expandAllInSection = useCallback((sectionId: ExplorerSectionId, nodes: ExplorerNode[]) => {
    setExpandedBySection((current) => ({ ...current, [sectionId]: flattenNodeIds(nodes) }));
  }, []);

  const collapseAllInSection = useCallback((sectionId: ExplorerSectionId) => {
    setExpandedBySection((current) => ({ ...current, [sectionId]: [] }));
  }, []);

  const sectionsById = useMemo(() => {
    const map = new Map<ExplorerSectionId, ExplorerSectionSnapshot>();
    for (const section of sections) {
      map.set(section.id, section);
    }
    return map;
  }, [sections]);

  const orderedSections = useMemo(() => {
    const visible: ExplorerSectionSnapshot[] = [];
    for (const sectionId of sectionOrder) {
      const section = sectionsById.get(sectionId);
      if (section) {
        visible.push(section);
      }
    }
    return visible;
  }, [sectionOrder, sectionsById]);

  const orderedSectionIds = useMemo(() => orderedSections.map((s) => s.id), [orderedSections]);

  const toggleSectionCollapsed = useCallback((sectionId: ExplorerSectionId) => {
    setCollapsedBySection((current) => {
      const wasCollapsed = current[sectionId] ?? false;
      const next = { ...current, [sectionId]: !wasCollapsed };

      const expandedAfter = orderedSectionIds.filter((id) => !next[id] && !FIXED_HEIGHT_SECTIONS.has(id));
      setHeightRatioBySection((currentRatios) => normalizeHeightRatios(currentRatios, expandedAfter));

      return next;
    });
  }, [orderedSectionIds]);

  const setSectionRef = useCallback((sectionId: ExplorerSectionId, element: HTMLDivElement | null) => {
    sectionRefs.current[sectionId] = element;
  }, []);

  const handleSectionDragStart = useCallback(
    (sectionId: ExplorerSectionId) => (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", sectionId);
      setDraggingSection(sectionId);
      setDragOverSection(sectionId);
    },
    []
  );

  const handleSectionDragOver = useCallback(
    (sectionId: ExplorerSectionId) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (draggingSection && draggingSection !== sectionId) {
        setDragOverSection(sectionId);
      }
    },
    [draggingSection]
  );

  const handleSectionDrop = useCallback(
    (targetId: ExplorerSectionId) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const sourceValue = event.dataTransfer.getData("text/plain");
      const sourceId = isExplorerSectionId(sourceValue) ? sourceValue : draggingSection;

      if (!sourceId || sourceId === targetId) {
        setDraggingSection(null);
        setDragOverSection(null);
        return;
      }

      setSectionOrder((currentOrder) => reorderSections(currentOrder, sourceId, targetId));
      setDraggingSection(null);
      setDragOverSection(null);
    },
    [draggingSection]
  );

  const handleSectionDragEnd = useCallback(() => {
    setDraggingSection(null);
    setDragOverSection(null);
  }, []);

  const { isResizing, handleResizeStart } = usePaneResize(
    paneContainerRef,
    heightRatioBySection,
    setHeightRatioBySection,
    collapsedBySection,
    orderedSectionIds
  );

  const sectionFlexStyles = useMemo(() => {
    const styles: Partial<Record<ExplorerSectionId, string>> = {};
    const expandedIds = orderedSectionIds.filter((id) => !collapsedBySection[id] && !FIXED_HEIGHT_SECTIONS.has(id));
    const n = expandedIds.length;
    for (const id of orderedSectionIds) {
      if (collapsedBySection[id] || FIXED_HEIGHT_SECTIONS.has(id)) {
        styles[id] = "0 0 auto";
      } else {
        const ratio = heightRatioBySection[id] ?? (n > 0 ? 1 / n : 1);
        styles[id] = `${ratio} 1 0px`;
      }
    }
    return styles;
  }, [orderedSectionIds, collapsedBySection, heightRatioBySection]);

  useEffect(
    () => () => {
      if (filterTimeoutRef.current !== null) {
        window.clearTimeout(filterTimeoutRef.current);
      }
      if (uiStateTimeoutRef.current !== null) {
        window.clearTimeout(uiStateTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!uiStateHydrated) {
      return;
    }

    const uiState: ExplorerUiState = {
      sectionOrder,
      collapsedBySection,
      expandedBySection,
      heightRatioBySection
    };

    if (uiStateTimeoutRef.current !== null) {
      window.clearTimeout(uiStateTimeoutRef.current);
    }
    uiStateTimeoutRef.current = window.setTimeout(() => {
      uiStateTimeoutRef.current = null;
      postMessage({
        command: "persistUiState",
        state: uiState
      });
    }, UI_STATE_UPDATE_DEBOUNCE_MS);
  }, [sectionOrder, collapsedBySection, expandedBySection, heightRatioBySection, uiStateHydrated, postMessage]);

  return (
    <Box
      className="containerlab-explorer-root"
      sx={{
        width: "100%",
        maxWidth: "100%",
        height: "100%",
        minHeight: 0,
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        pt: 1.5,
        px: 0,
        pb: 0,
        gap: 1.5
      }}
    >
      {errorMessage && (
        <Alert severity="error" onClose={() => setErrorMessage(null)} sx={{ mx: 1.5 }}>
          {errorMessage}
        </Alert>
      )}

      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{
          px: 1.5,
          py: 0.5,
          bgcolor: "background.paper"
        }}
      >
        <TextField
          size="small"
          fullWidth
          value={filterText}
          placeholder="Filter labs, nodes, interfaces"
          onChange={(event) => handleFilterChange(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <FilterAltIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: undefined
            }
          }}
        />
      </Stack>

      <Box
        ref={paneContainerRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          ...(isResizing && { cursor: "row-resize", userSelect: "none" })
        }}
      >
        {orderedSections.map((section, index) => {
          const isExpanded = !(collapsedBySection[section.id] ?? false);
          const prevExpandedId = (() => {
            for (let i = index - 1; i >= 0; i--) {
              if (!(collapsedBySection[orderedSections[i].id] ?? false)) {
                return orderedSections[i].id;
              }
            }
            return null;
          })();

          return (
            <Box key={section.id} sx={{ display: "contents" }}>
              {isExpanded && prevExpandedId && !FIXED_HEIGHT_SECTIONS.has(section.id) && !FIXED_HEIGHT_SECTIONS.has(prevExpandedId) && (
                <ResizeDivider
                  aboveId={prevExpandedId}
                  belowId={section.id}
                  onResizeStart={handleResizeStart}
                />
              )}
              <ExplorerSectionCard
                section={section}
                expandedItems={expandedBySection[section.id] ?? []}
                isCollapsed={collapsedBySection[section.id] ?? false}
                isDropTarget={dragOverSection === section.id && draggingSection !== section.id}
                isBeingDragged={draggingSection === section.id}
                flexStyle={sectionFlexStyles[section.id] ?? "0 0 auto"}
                onSetSectionRef={setSectionRef}
                onSectionDragStart={handleSectionDragStart}
                onSectionDragOver={handleSectionDragOver}
                onSectionDrop={handleSectionDrop}
                onSectionDragEnd={handleSectionDragEnd}
                onToggleSectionCollapsed={toggleSectionCollapsed}
                onInvokeAction={invokeAction}
                onExpandedItemsChange={handleExpandedItemsChange}
                onExpandAllInSection={expandAllInSection}
                onCollapseAllInSection={collapseAllInSection}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function mount(): void {
  const container = document.getElementById("root");
  if (!container) {
    return;
  }

  const root = createRoot(container);
  root.render(
    <MuiThemeProvider>
      <ContainerlabExplorerView />
    </MuiThemeProvider>
  );
}

if (document.body?.dataset.webviewKind === EXPLORER_WEBVIEW_KIND) {
  mount();
}
