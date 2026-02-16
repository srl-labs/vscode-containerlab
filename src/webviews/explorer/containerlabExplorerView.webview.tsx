import {
  AccountTree as AccountTreeIcon,
  ArticleOutlined as ArticleOutlinedIcon,
  Build as BuildIcon,
  ChevronRight as ChevronRightIcon,
  ContentCopy as ContentCopyIcon,
  DescriptionOutlined as DescriptionOutlinedIcon,
  DeleteOutline as DeleteOutlineIcon,
  ExpandMore as ExpandMoreIcon,
  FilterAlt as FilterAltIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
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
  type DragEvent,
  type MouseEvent,
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
const COLOR_PRIMARY_MAIN = "primary.main";
const COLOR_DIVIDER = "divider";
const COLOR_TEXT_DISABLED = "text.disabled";
const FILTER_UPDATE_DEBOUNCE_MS = 250;
const UI_STATE_UPDATE_DEBOUNCE_MS = 160;
const DEFAULT_EXPANDED_SECTIONS = new Set<ExplorerSectionId>(["runningLabs", "localLabs"]);

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
  border: "1px solid",
  borderColor: COLOR_DIVIDER,
  color: COLOR_TEXT_PRIMARY,
  bgcolor: (theme: Theme) => theme.alpha(theme.palette.background.default, 0.45),
  "&:hover": {
    borderColor: COLOR_PRIMARY_MAIN,
    bgcolor: (theme: Theme) => theme.alpha(theme.palette.primary.main, 0.14)
  }
} as const;

interface ExplorerNodeLabelProps {
  node: ExplorerNode;
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
  | "other";

type ExplorerNodeKind = "lab" | "container" | "interface" | "link" | "other";

interface ExplorerActionGroup {
  id: ActionGroupId;
  label: string;
  actions: ExplorerAction[];
}

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
  "other"
];

const ACTION_GROUP_ORDER_BY_NODE_KIND: Record<ExplorerNodeKind, ActionGroupId[]> = {
  lab: [
    "topology",
    "graph",
    "lifecycle",
    "save",
    "access",
    "sharing",
    "inspect",
    "tools",
    "copy",
    "view",
    "network",
    "other"
  ],
  container: [
    "access",
    "inspect",
    "lifecycle",
    "save",
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

function statusColor(indicator: string | undefined): string {
  if (!indicator) {
    return COLOR_TEXT_DISABLED;
  }
  return STATUS_COLOR_MAP[indicator] || COLOR_TEXT_DISABLED;
}

function formatSectionTitle(section: ExplorerSectionSnapshot): string {
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
  if (contextValue === "containerlabContainer") {
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

function actionIcon(action: ExplorerAction): SvgIconComponent {
  const command = action.commandId.toLowerCase();
  const byCommandId: Record<string, SvgIconComponent> = {
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

  const commandIcon = byCommandId[command];
  if (commandIcon) {
    return commandIcon;
  }

  if (command.includes("copy")) {
    return ContentCopyIcon;
  }
  if (command.includes("destroy") || command.includes("delete") || command.includes("detach")) {
    return DeleteOutlineIcon;
  }
  if (command.includes("refresh") || command.includes("redeploy")) {
    return RefreshIcon;
  }
  if (command.includes("stop")) {
    return StopIcon;
  }
  if (command.includes("unpause")) {
    return PlayCircleOutlineIcon;
  }
  if (command.includes("pause")) {
    return PauseCircleOutlineIcon;
  }
  if (command.includes("ssh") || command.includes("shell") || command.includes("telnet")) {
    return TerminalIcon;
  }
  if (command.includes("filter")) {
    return FilterAltIcon;
  }
  if (command.includes(".save")) {
    return SaveOutlinedIcon;
  }
  if (command.includes("showlogs") || command.includes("logs")) {
    return ArticleOutlinedIcon;
  }
  if (command.startsWith("containerlab.lab.fcli.")) {
    return BuildIcon;
  }
  if (command.includes(".gotty.")) {
    return OpenInBrowserIcon;
  }
  if (command.startsWith("containerlab.lab.graph.")) {
    return AccountTreeIcon;
  }
  if (command.includes("open") || command.includes("graph") || command.includes("inspect")) {
    return OpenInNewIcon;
  }
  if (command.includes("folder")) {
    return FolderOpenIcon;
  }
  if (command.includes("capture") || command.includes("impairment")) {
    return SettingsEthernetIcon;
  }
  if (
    command.includes("delay") ||
    command.includes("jitter") ||
    command.includes("loss") ||
    command.includes("rate") ||
    command.includes("corruption")
  ) {
    return TuneIcon;
  }
  if (command.includes("deploy") || command.includes("start") || command.includes("run")) {
    return PlayArrowIcon;
  }
  if (command.includes("link")) {
    return LinkIcon;
  }
  return BuildIcon;
}

function actionGroupId(action: ExplorerAction): ActionGroupId {
  const command = action.commandId.toLowerCase();

  if (command.startsWith("containerlab.lab.graph.")) {
    return "graph";
  }
  if (command.includes(".save")) {
    return "save";
  }
  if (command.startsWith("containerlab.lab.fcli.")) {
    return "tools";
  }
  if (command.startsWith("containerlab.interface.") || command.includes("impairment")) {
    return "network";
  }
  if (command.includes(".sshx.") || command.includes(".gotty.")) {
    return "sharing";
  }
  if (command.includes("copy")) {
    return "copy";
  }
  if (command.includes("inspect") || command.includes("showlogs")) {
    return "inspect";
  }
  if (command.includes("ssh") || command.includes("shell") || command.includes("telnet") || command.includes("openbrowser")) {
    return "access";
  }
  if (
    command.includes("deploy") ||
    command.includes("destroy") ||
    command.includes("redeploy") ||
    command.includes("start") ||
    command.includes("stop") ||
    command.includes("pause") ||
    command.includes("unpause")
  ) {
    return "lifecycle";
  }
  if (
    command.includes("openfile") ||
    command.includes("topoviewer") ||
    command.includes("openfolder") ||
    command.includes("addtoworkspace") ||
    command.includes("togglefavorite") ||
    command.includes("delete") ||
    command.includes("clonerepo")
  ) {
    return "topology";
  }
  if (
    command.includes("filter") ||
    command.includes("hide") ||
    command.includes("show") ||
    command.includes("refresh")
  ) {
    return "view";
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
    commandId === "containerlab.interface.setloss"
  );
}

function actionGroupSection(groupId: ActionGroupId, nodeKind: ExplorerNodeKind): number {
  if (nodeKind === "lab") {
    if (groupId === "topology" || groupId === "graph") {
      return 1;
    }
    if (groupId === "lifecycle" || groupId === "save") {
      return 2;
    }
    if (
      groupId === "access" ||
      groupId === "sharing" ||
      groupId === "inspect" ||
      groupId === "tools"
    ) {
      return 3;
    }
    return 4;
  }

  if (nodeKind === "container") {
    if (groupId === "access" || groupId === "inspect") {
      return 1;
    }
    if (groupId === "lifecycle" || groupId === "save" || groupId === "network") {
      return 2;
    }
    return 3;
  }

  if (nodeKind === "link") {
    if (groupId === "sharing" || groupId === "copy") {
      return 1;
    }
    return 2;
  }

  return 1;
}

function withSectionDividers(
  groups: ExplorerActionGroup[],
  nodeKind: ExplorerNodeKind,
  renderGroup: (group: ExplorerActionGroup) => ContextMenuItem
): ContextMenuItem[] {
  if (groups.length === 0) {
    return [];
  }

  const items: ContextMenuItem[] = [];
  let previousSection: number | null = null;
  for (const group of groups) {
    const section = actionGroupSection(group.id, nodeKind);
    if (items.length > 0 && previousSection !== null && section !== previousSection) {
      items.push({ id: `divider:${nodeKind}:${group.id}:${items.length}`, label: "", divider: true });
    }
    items.push(renderGroup(group));
    previousSection = section;
  }
  return items;
}

function nodeLeadingIcon(node: ExplorerNode): { Icon: SvgIconComponent; color: string } | undefined {
  const context = node.contextValue;
  if (context === "containerlabInterfaceUp") {
    return { Icon: SettingsEthernetIcon, color: "success.main" };
  }
  if (context === "containerlabInterfaceDown") {
    return { Icon: LinkOffIcon, color: "error.main" };
  }
  if (context === "containerlabFolder") {
    return { Icon: FolderIcon, color: "text.secondary" };
  }
  if (typeof context === "string" && context.includes("containerlabLabUndeployed")) {
    return { Icon: DescriptionOutlinedIcon, color: "text.secondary" };
  }
  return undefined;
}

function ExplorerNodeLabel({ node, onInvokeAction }: Readonly<ExplorerNodeLabelProps>) {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [menuOpenToLeft, setMenuOpenToLeft] = useState(false);
  const hasEntryTooltip = Boolean(node.tooltip);
  const leadingIcon = nodeLeadingIcon(node);
  const nodeKind = nodeKindFromContext(node.contextValue);
  const menuActions = useMemo(() => {
    if (nodeKind === "lab") {
      return node.actions.filter(
        (action) => action.commandId.toLowerCase() !== "containerlab.lab.graph.topoviewer"
      );
    }
    return node.actions;
  }, [node.actions, nodeKind]);
  const hasActions = menuActions.length > 0;
  const contextMenuItems = useMemo<ContextMenuItem[]>(
    () => {
      const toMenuItem = (action: ExplorerAction): ContextMenuItem => {
        const ActionIcon = actionIcon(action);
        return {
          id: action.id,
          label: action.label,
          icon: <ActionIcon fontSize="small" />,
          danger: Boolean(action.destructive),
          onClick: () => onInvokeAction(action)
        };
      };

      if (nodeKind === "interface") {
        const interfaceItems: ContextMenuItem[] = [];
        let inTimingGroup = false;
        for (const action of menuActions) {
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

          interfaceItems.push(toMenuItem(action));
          inTimingGroup = isTimingAction;
        }
        return interfaceItems;
      }

      const groupedActions = groupActions(menuActions, nodeKind);
      return withSectionDividers(groupedActions, nodeKind, (group) => {
        if (group.actions.length === 1) {
          return toMenuItem(group.actions[0]);
        }

        let children = group.actions.map((action) => toMenuItem(action));
        if (group.id === "sharing") {
          const sharingChildren: ContextMenuItem[] = [];
          let previousBucket: "sshx" | "gotty" | "other" | null = null;
          for (let i = 0; i < group.actions.length; i += 1) {
            const action = group.actions[i];
            const command = action.commandId.toLowerCase();
            let bucket: "sshx" | "gotty" | "other" = "other";
            if (command.includes(".sshx.")) {
              bucket = "sshx";
            } else if (command.includes(".gotty.")) {
              bucket = "gotty";
            }
            if (
              sharingChildren.length > 0 &&
              previousBucket !== null &&
              bucket !== previousBucket
            ) {
              sharingChildren.push({
                id: `group:${group.id}:divider:${action.id}`,
                label: "",
                divider: true
              });
            }
            sharingChildren.push(toMenuItem(action));
            previousBucket = bucket;
          }
          children = sharingChildren;
        }

        const GroupIcon = actionGroupIcon(group.id);
        return {
          id: `group:${group.id}`,
          label: group.label,
          icon: <GroupIcon fontSize="small" />,
          children
        };
      });
    },
    [menuActions, nodeKind, onInvokeAction]
  );
  const secondaryText = node.description || node.statusDescription;
  const isContainer = node.contextValue === "containerlabContainer";
  const isInterface =
    node.contextValue === "containerlabInterfaceUp" || node.contextValue === "containerlabInterfaceDown";
  const inlineContainerStatus = isContainer ? secondaryText?.trim() : undefined;
  const showSecondaryLine = Boolean(secondaryText) && !isContainer && !isInterface;
  const showStatusDot = Boolean(node.statusIndicator) && !isInterface;

  const openMenuFromElement = useCallback((element: HTMLElement, openToLeft = true) => {
    const rect = element.getBoundingClientRect();
    setMenuOpenToLeft(openToLeft);
    setMenuPosition({ x: Math.round(rect.right), y: Math.round(rect.bottom + 2) });
  }, []);

  const handleMenuOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!hasActions) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openMenuFromElement(event.currentTarget, true);
  }, [hasActions, openMenuFromElement]);

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

  const handlePrimaryAction = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!node.primaryAction) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onInvokeAction(node.primaryAction);
    },
    [node.primaryAction, onInvokeAction]
  );

  const menuOpen = Boolean(menuPosition) && contextMenuItems.length > 0;

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      onContextMenu={handleRowContextMenu}
      sx={{ width: "100%" }}
    >
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
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            {leadingIcon && (
              <leadingIcon.Icon
                fontSize="inherit"
                sx={{ fontSize: 14, color: leadingIcon.color, flex: "0 0 auto" }}
              />
            )}
            {showStatusDot && (
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
            <Typography variant="body2" noWrap sx={{ fontWeight: node.primaryAction ? 600 : 500 }}>
              {node.label}
            </Typography>
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

      {hasActions && (
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
            onBackdropContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenuPosition({ x: event.clientX + 2, y: event.clientY + 2 });
            }}
          />
        </>
      )}
    </Stack>
  );
}

interface SectionTreeNodeProps {
  node: ExplorerNode;
  depth: number;
  expandedItems: string[];
  onToggleExpanded: (nodeId: string) => void;
  onInvokeAction: (action: ExplorerAction) => void;
}

function SectionTreeNode({
  node,
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
        alignItems="flex-start"
        spacing={0.45}
        sx={{ minHeight: 24, pl: depth * 2.5 }}
      >
        <Box
          sx={{
            width: 16,
            flex: "0 0 16px",
            display: "flex",
            justifyContent: "center",
            pt: 0.05
          }}
        >
          {hasChildren && (
            <IconButton
              size="small"
              sx={{ width: 16, height: 16, p: 0, color: COLOR_TEXT_PRIMARY }}
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
          <ExplorerNodeLabel node={node} onInvokeAction={onInvokeAction} />
        </Box>
      </Stack>

      {hasChildren && isExpanded && (
        <Stack spacing={0.1}>
          {node.children.map((child) => (
            <SectionTreeNode
              key={child.id}
              node={child}
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

function getSectionPaperSx(isDropTarget: boolean) {
  return {
    flexShrink: 0,
    overflow: "hidden",
    borderColor: isDropTarget ? COLOR_PRIMARY_MAIN : COLOR_DIVIDER,
    transition: "border-color 0.12s ease, box-shadow 0.12s ease",
    boxShadow: isDropTarget
      ? (theme: Theme) => `inset 0 0 0 1px ${theme.alpha(theme.palette.primary.main, 0.35)}`
      : "none"
  };
}

function getSectionHeaderSx(isCollapsed: boolean, isBeingDragged: boolean) {
  return {
    px: 0.75,
    py: 0.45,
    display: "flex",
    alignItems: "center",
    gap: 0.35,
    borderBottom: isCollapsed ? "none" : "1px solid",
    borderColor: COLOR_DIVIDER,
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
  const allExpanded = useMemo(() => {
    const expandableIds = flattenExpandableNodeIds(section.nodes);
    return expandableIds.length > 0 && expandableIds.every((id) => expandedItems.includes(id));
  }, [expandedItems, section.nodes]);

  return (
    <Paper
      variant="outlined"
      ref={(element: HTMLDivElement | null) => {
        onSetSectionRef(section.id, element);
      }}
      sx={getSectionPaperSx(isDropTarget)}
    >
      <Box
        draggable
        onDragStart={onSectionDragStart(section.id)}
        onDragOver={onSectionDragOver(section.id)}
        onDrop={onSectionDrop(section.id)}
        onDragEnd={onSectionDragEnd}
        sx={getSectionHeaderSx(isCollapsed, isBeingDragged)}
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
          <Typography variant="body2" noWrap sx={{ fontSize: "0.8rem", fontWeight: 600, lineHeight: 1.2 }}>
            {formatSectionTitle(section)}
          </Typography>
        </Box>

        <SectionToolbarActions actions={section.toolbarActions} onInvokeAction={onInvokeAction} />

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
      </Box>

      {!isCollapsed && (
        <Box sx={{ p: 1 }}>
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
  const [uiStateHydrated, setUiStateHydrated] = useState(false);
  const sectionRefs = useRef<Partial<Record<ExplorerSectionId, HTMLDivElement | null>>>({});
  const pendingFilterSyncRef = useRef<string | null>(null);
  const filterTimeoutRef = useRef<number | null>(null);
  const uiStateTimeoutRef = useRef<number | null>(null);
  const expandedBeforeFilterRef = useRef<Partial<Record<ExplorerSectionId, string[]>> | null>(null);

  useReadySignal();

  useMessageListener<ExplorerIncomingMessage>(
    useCallback((message) => {
      if (message.command === "snapshot") {
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
            next[section.id] =
              current[section.id] ?? !DEFAULT_EXPANDED_SECTIONS.has(section.id);
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
        return;
      }

      if (message.command === "filterState") {
        const pending = pendingFilterSyncRef.current;
        if (pending !== null && message.filterText !== pending) {
          return;
        }
        if (pending !== null && message.filterText === pending) {
          pendingFilterSyncRef.current = null;
        }
        setFilterText(message.filterText);
        return;
      }

      if (message.command === "uiState") {
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
        setUiStateHydrated(true);
        return;
      }

      if (message.command === "error") {
        setErrorMessage(message.message);
      }
    }, [])
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

  const toggleSectionCollapsed = useCallback((sectionId: ExplorerSectionId) => {
    setCollapsedBySection((current) => ({ ...current, [sectionId]: !(current[sectionId] ?? false) }));
  }, []);

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
      expandedBySection
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
  }, [sectionOrder, collapsedBySection, expandedBySection, uiStateHydrated, postMessage]);

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        p: 1.5,
        gap: 1.5
      }}
    >
      {errorMessage && (
        <Alert severity="error" onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      <Stack direction="row" spacing={1} alignItems="center">
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
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: undefined
            }
          }}
        />
      </Stack>

      <Stack
        spacing={1}
        sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", pr: 0.2 }}
      >
        {orderedSections.length === 0 && (
          <Paper variant="outlined" sx={{ p: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Loading explorer...
            </Typography>
          </Paper>
        )}

        {orderedSections.map((section) => (
          <ExplorerSectionCard
            key={section.id}
            section={section}
            expandedItems={expandedBySection[section.id] ?? []}
            isCollapsed={collapsedBySection[section.id] ?? false}
            isDropTarget={dragOverSection === section.id && draggingSection !== section.id}
            isBeingDragged={draggingSection === section.id}
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
        ))}
      </Stack>
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
