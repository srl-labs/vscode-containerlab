import {
  ChevronRight as ChevronRightIcon,
  ContentCopy as ContentCopyIcon,
  DeleteOutline as DeleteOutlineIcon,
  ExpandMore as ExpandMoreIcon,
  FilterAlt as FilterAltIcon,
  FolderOpen as FolderOpenIcon,
  Link as LinkIcon,
  MoreVert as MoreVertIcon,
  OpenInNew as OpenInNewIcon,
  PlayArrow as PlayArrowIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  SettingsEthernet as SettingsEthernetIcon,
  Terminal as TerminalIcon,
  type SvgIconComponent
} from "@mui/icons-material";
import {
  Alert,
  Box,
  IconButton,
  InputAdornment,
  ListItemIcon,
  Menu,
  MenuItem,
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

function actionIcon(action: ExplorerAction): SvgIconComponent {
  const command = action.commandId.toLowerCase();

  if (command.includes("copy")) {
    return ContentCopyIcon;
  }
  if (command.includes("destroy") || command.includes("delete") || command.includes("detach")) {
    return DeleteOutlineIcon;
  }
  if (command.includes("refresh") || command.includes("redeploy")) {
    return RefreshIcon;
  }
  if (command.includes("ssh") || command.includes("shell") || command.includes("telnet")) {
    return TerminalIcon;
  }
  if (command.includes("filter")) {
    return FilterAltIcon;
  }
  if (command.includes("open") || command.includes("graph") || command.includes("inspect")) {
    return OpenInNewIcon;
  }
  if (command.includes("folder")) {
    return FolderOpenIcon;
  }
  if (command.includes("capture") || command.includes("impairment") || command.includes("delay")) {
    return SettingsEthernetIcon;
  }
  if (command.includes("deploy") || command.includes("start") || command.includes("run")) {
    return PlayArrowIcon;
  }
  if (command.includes("link")) {
    return LinkIcon;
  }
  return MoreVertIcon;
}

function ExplorerNodeLabel({ node, onInvokeAction }: Readonly<ExplorerNodeLabelProps>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const hasActions = node.actions.length > 0;
  const hasEntryTooltip = Boolean(node.tooltip) && node.children.length === 0;

  const handleMenuOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setMenuPosition(null);
  }, []);

  const handleRowContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!hasActions) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setAnchorEl(null);
      setMenuPosition({ top: event.clientY + 2, left: event.clientX + 2 });
    },
    [hasActions]
  );

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
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

  const menuOpen = Boolean(anchorEl || menuPosition);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeMenuOnBlur = () => {
      handleMenuClose();
    };

    window.addEventListener("blur", closeMenuOnBlur);
    return () => window.removeEventListener("blur", closeMenuOnBlur);
  }, [menuOpen, handleMenuClose]);

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
            {node.statusIndicator && (
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
          </Stack>
        </Tooltip>
        {(node.description || node.statusDescription) && (
          <Typography variant="caption" color="text.secondary" noWrap>
            {node.description || node.statusDescription}
          </Typography>
        )}
      </Box>

      {hasActions && (
        <>
          <IconButton
            size="small"
            onClick={handleMenuOpen}
            aria-label={`Actions for ${node.label}`}
            sx={{ width: 22, height: 22, p: 0.25, color: COLOR_TEXT_PRIMARY }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            anchorReference={menuPosition ? "anchorPosition" : "anchorEl"}
            anchorPosition={menuPosition ?? undefined}
            open={menuOpen}
            onClose={handleMenuClose}
            onClick={handleMenuClose}
            slotProps={{
              list: { dense: true },
              paper: {
                sx: {
                  minWidth: 230,
                  border: "1px solid",
                  borderColor: COLOR_DIVIDER,
                  "& .MuiMenuItem-root": { minHeight: 30, py: 0.25 }
                }
              }
            }}
          >
            {node.actions.map((action) => {
              const IconComponent = actionIcon(action);
              const isDestructive = Boolean(action.destructive);
              return (
                <MenuItem
                  key={action.id}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onInvokeAction(action);
                  }}
                  sx={isDestructive ? { color: COLOR_ERROR_MAIN } : undefined}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 24,
                      color: isDestructive ? COLOR_ERROR_MAIN : COLOR_TEXT_PRIMARY
                    }}
                  >
                    <IconComponent fontSize="small" />
                  </ListItemIcon>
                  <Typography variant="body2">{action.label}</Typography>
                </MenuItem>
              );
            })}
          </Menu>
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
      <Stack direction="row" alignItems="flex-start" spacing={0.45} sx={{ minHeight: 24 }}>
        <Box
          sx={{
            width: 16,
            flex: "0 0 16px",
            display: "flex",
            justifyContent: "center",
            pt: 0.05,
            ml: depth * 1.2
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
