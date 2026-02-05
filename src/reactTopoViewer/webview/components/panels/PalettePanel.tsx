/**
 * PalettePanel - Drawer for adding nodes, text/shapes, and groups
 * Based on React Flow drag-and-drop example
 */
import React, { type ReactNode, useCallback, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import MuiIconButton from "@mui/material/IconButton";
import Drawer from "@mui/material/Drawer";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Tooltip from "@mui/material/Tooltip";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import StarIcon from "@mui/icons-material/Star";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DnsIcon from "@mui/icons-material/Dns";
import LanIcon from "@mui/icons-material/Lan";
import HubIcon from "@mui/icons-material/Hub";
import DeviceHubIcon from "@mui/icons-material/DeviceHub";
import CableIcon from "@mui/icons-material/Cable";
import PowerIcon from "@mui/icons-material/Power";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import RemoveIcon from "@mui/icons-material/Remove";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import InfoIcon from "@mui/icons-material/Info";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import CloudIcon from "@mui/icons-material/Cloud";

import type { CustomNodeTemplate } from "../../../shared/types/editors";
import { ROLE_SVG_MAP, DEFAULT_ICON_COLOR } from "../../../shared/types/graph";
import { generateEncodedSVG, type NodeType } from "../../icons/SvgGenerator";
import { useCustomNodes, useTopoViewerStore } from "../../stores/topoViewerStore";

interface PalettePanelProps {
  isVisible: boolean;
  onClose: () => void;
  /** Edit a custom node template */
  onEditCustomNode?: (nodeName: string) => void;
  /** Delete a custom node template */
  onDeleteCustomNode?: (nodeName: string) => void;
  /** Set a custom node as default */
  onSetDefaultCustomNode?: (nodeName: string) => void;
}

/** Network type definitions for the palette */
interface NetworkTypeDefinition {
  readonly type: string;
  readonly label: string;
  readonly icon: React.ReactNode;
}

const NETWORK_TYPE_DEFINITIONS: readonly NetworkTypeDefinition[] = [
  { type: "host", label: "Host", icon: <DnsIcon fontSize="small" /> },
  { type: "mgmt-net", label: "Mgmt Net", icon: <LanIcon fontSize="small" /> },
  { type: "macvlan", label: "Macvlan", icon: <CableIcon fontSize="small" /> },
  { type: "vxlan", label: "VXLAN", icon: <DeviceHubIcon fontSize="small" /> },
  { type: "vxlan-stitch", label: "VXLAN Stitch", icon: <CableIcon fontSize="small" /> },
  { type: "dummy", label: "Dummy", icon: <PowerIcon fontSize="small" /> },
  { type: "bridge", label: "Bridge", icon: <AccountTreeIcon fontSize="small" /> },
  { type: "ovs-bridge", label: "OVS Bridge", icon: <HubIcon fontSize="small" /> }
];

/** Map role to SVG node type */
function getRoleSvgType(role: string): NodeType {
  const mapped = ROLE_SVG_MAP[role];
  if (mapped) return mapped as NodeType;
  return "pe"; // Default to PE router icon
}

/** Get the SVG icon URL for a template */
function getTemplateIconUrl(template: CustomNodeTemplate): string {
  const role = template.icon || "pe";
  const color = template.iconColor || DEFAULT_ICON_COLOR;
  const svgType = getRoleSvgType(role);
  return generateEncodedSVG(svgType, color);
}

/** Icon size for palette items */
const PALETTE_ICON_SIZE = 28;

const REACTFLOW_NODE_MIME_TYPE = "application/reactflow-node";

type AnnotationPayload = {
  annotationType: "text" | "shape" | "group";
  shapeType?: string;
};

/** Draggable node item component */
interface DraggableNodeProps {
  template: CustomNodeTemplate;
  isDefault?: boolean;
  onEdit?: (name: string) => void;
  onDelete?: (name: string) => void;
  onSetDefault?: (name: string) => void;
}

const DraggableNode: React.FC<DraggableNodeProps> = ({
  template,
  isDefault,
  onEdit,
  onDelete,
  onSetDefault
}) => {
  const onDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData(
        REACTFLOW_NODE_MIME_TYPE,
        JSON.stringify({
          type: "node",
          templateName: template.name
        })
      );
      event.dataTransfer.effectAllowed = "move";
    },
    [template.name]
  );

  const iconUrl = useMemo(() => getTemplateIconUrl(template), [template]);

  return (
    <Card
      variant="outlined"
      draggable
      onDragStart={onDragStart}
      title={`Drag to add ${template.name}`}
      sx={{
        p: 1,
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        gap: 1,
        "&:hover": { bgcolor: "action.hover" },
        "&:active": { cursor: "grabbing" }
      }}
    >
      <Box
        sx={{
          width: PALETTE_ICON_SIZE,
          height: PALETTE_ICON_SIZE,
          backgroundImage: `url(${iconUrl})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          borderRadius: template.iconCornerRadius ? `${template.iconCornerRadius}px` : 0,
          flexShrink: 0
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap fontWeight={500}>
          {template.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {template.kind}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 0.25 }}>
        <Tooltip title={isDefault ? "Default node" : "Set as default"}>
          <MuiIconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              if (!isDefault) onSetDefault?.(template.name);
            }}
            sx={{ color: isDefault ? "warning.main" : "text.secondary" }}
          >
            {isDefault ? <StarIcon fontSize="small" /> : <StarOutlineIcon fontSize="small" />}
          </MuiIconButton>
        </Tooltip>
        <Tooltip title="Edit">
          <MuiIconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(template.name);
            }}
          >
            <EditIcon fontSize="small" />
          </MuiIconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <MuiIconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(template.name);
            }}
            sx={{ "&:hover": { color: "error.main" } }}
          >
            <DeleteIcon fontSize="small" />
          </MuiIconButton>
        </Tooltip>
      </Box>
    </Card>
  );
};

/** Draggable network item component */
const DraggableNetwork: React.FC<{ network: NetworkTypeDefinition }> = ({ network }) => {
  const onDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData(
        REACTFLOW_NODE_MIME_TYPE,
        JSON.stringify({
          type: "network",
          networkType: network.type
        })
      );
      event.dataTransfer.effectAllowed = "move";
    },
    [network.type]
  );

  return (
    <Card
      variant="outlined"
      draggable
      onDragStart={onDragStart}
      title={`Drag to add ${network.label}`}
      sx={{
        p: 1,
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        gap: 1,
        "&:hover": { bgcolor: "action.hover" },
        "&:active": { cursor: "grabbing" }
      }}
    >
      <Box sx={{ color: "text.secondary" }}>{network.icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap fontWeight={500}>
          {network.label}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {network.type}
        </Typography>
      </Box>
    </Card>
  );
};

interface DraggableAnnotationProps {
  label: string;
  kind: string;
  icon: React.ReactNode;
  payload: AnnotationPayload;
}

const DraggableAnnotation: React.FC<DraggableAnnotationProps> = ({
  label,
  kind,
  icon,
  payload
}) => {
  const onDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData(
        REACTFLOW_NODE_MIME_TYPE,
        JSON.stringify({ type: "annotation", ...payload })
      );
      event.dataTransfer.effectAllowed = "move";
    },
    [payload]
  );

  return (
    <Card
      variant="outlined"
      draggable
      onDragStart={onDragStart}
      title="Drag onto the canvas"
      sx={{
        p: 1,
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        gap: 1,
        "&:hover": { bgcolor: "action.hover" },
        "&:active": { cursor: "grabbing" }
      }}
    >
      <Box sx={{ color: "text.secondary" }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap fontWeight={500}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {kind}
        </Typography>
      </Box>
    </Card>
  );
};

const DRAG_INSTRUCTION_TEXT = "Drag items onto the canvas to add them";

export const PalettePanel: React.FC<PalettePanelProps> = ({
  isVisible,
  onClose,
  onEditCustomNode,
  onDeleteCustomNode,
  onSetDefaultCustomNode
}) => {
  const customNodes = useCustomNodes();
  const defaultNode = useTopoViewerStore((state) => state.defaultNode);
  const [filter, setFilter] = useState("");
  const [activeTab, setActiveTab] = useState(0);

  // Filter nodes and networks based on search
  const filteredNodes = useMemo(() => {
    if (!filter) return customNodes;
    const search = filter.toLowerCase();
    return customNodes.filter(
      (node) =>
        node.name.toLowerCase().includes(search) ||
        node.kind.toLowerCase().includes(search) ||
        (node.icon && node.icon.toLowerCase().includes(search))
    );
  }, [customNodes, filter]);

  const filteredNetworks = useMemo(() => {
    if (!filter) return NETWORK_TYPE_DEFINITIONS;
    const search = filter.toLowerCase();
    return NETWORK_TYPE_DEFINITIONS.filter(
      (net) => net.label.toLowerCase().includes(search) || net.type.toLowerCase().includes(search)
    );
  }, [filter]);

  const handleAddNewNode = useCallback(() => {
    // This triggers the "new custom node" flow
    onEditCustomNode?.("__new__");
  }, [onEditCustomNode]);

  return (
    <PaletteDrawer isOpen={isVisible} onClose={onClose} title="Palette">
      <Tabs
        value={activeTab}
        onChange={(_e, v) => setActiveTab(v)}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 2, px: 2 }}
      >
        <Tab label="Nodes" />
        <Tab label="Annotations" />
      </Tabs>

      <Box sx={{ px: 2, pb: 2 }}>
        {activeTab === 0 && (
          <Box>
            {/* Search/Filter */}
            <TextField
              fullWidth
              size="small"
              placeholder="Search nodes..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: filter && (
                  <InputAdornment position="end">
                    <MuiIconButton size="small" onClick={() => setFilter("")} title="Clear search">
                      <ClearIcon fontSize="small" />
                    </MuiIconButton>
                  </InputAdornment>
                )
              }}
              sx={{ mb: 2 }}
            />

            {/* Custom Nodes Section */}
            <Typography variant="subtitle2" sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
              <ViewInArIcon fontSize="small" />
              Node Templates
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {filteredNodes.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  {filter ? "No matching templates" : "No node templates defined"}
                </Typography>
              )}
              {filteredNodes.map((template) => (
                <DraggableNode
                  key={template.name}
                  template={template}
                  isDefault={template.name === defaultNode || template.setDefault}
                  onEdit={onEditCustomNode}
                  onDelete={onDeleteCustomNode}
                  onSetDefault={onSetDefaultCustomNode}
                />
              ))}
            </Box>
            {/* New custom node button */}
            {!filter && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon />}
                onClick={handleAddNewNode}
                sx={{ mt: 1, mb: 2, textTransform: "none" }}
              >
                New custom node
              </Button>
            )}

            {/* Networks Section */}
            <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, display: "flex", alignItems: "center", gap: 1 }}>
              <CloudIcon fontSize="small" />
              Networks
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {filteredNetworks.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  No matching networks
                </Typography>
              ) : (
                filteredNetworks.map((network) => (
                  <DraggableNetwork key={network.type} network={network} />
                ))
              )}
            </Box>

            {/* Instructions */}
            <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 2 }}>
              <InfoIcon sx={{ fontSize: 14 }} />
              {DRAG_INSTRUCTION_TEXT}
            </Typography>
          </Box>
        )}

        {activeTab === 1 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
              <TextFieldsIcon fontSize="small" />
              Text
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <DraggableAnnotation
                label="Text"
                kind="annotation"
                icon={<TextFieldsIcon fontSize="small" />}
                payload={{ annotationType: "text" }}
              />
            </Box>

            <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, display: "flex", alignItems: "center", gap: 1 }}>
              <CropSquareIcon fontSize="small" />
              Shapes
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <DraggableAnnotation
                label="Rectangle"
                kind="shape"
                icon={<CropSquareIcon fontSize="small" />}
                payload={{ annotationType: "shape", shapeType: "rectangle" }}
              />
              <DraggableAnnotation
                label="Circle"
                kind="shape"
                icon={<CircleOutlinedIcon fontSize="small" />}
                payload={{ annotationType: "shape", shapeType: "circle" }}
              />
              <DraggableAnnotation
                label="Line"
                kind="shape"
                icon={<RemoveIcon fontSize="small" />}
                payload={{ annotationType: "shape", shapeType: "line" }}
              />
            </Box>

            <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, display: "flex", alignItems: "center", gap: 1 }}>
              <SelectAllIcon fontSize="small" />
              Groups
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <DraggableAnnotation
                label="Group"
                kind="annotation"
                icon={<SelectAllIcon fontSize="small" />}
                payload={{ annotationType: "group" }}
              />
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 2 }}>
              <InfoIcon sx={{ fontSize: 14 }} />
              {DRAG_INSTRUCTION_TEXT}
            </Typography>
          </Box>
        )}
      </Box>
    </PaletteDrawer>
  );
};

interface PaletteDrawerProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

const PaletteDrawer: React.FC<PaletteDrawerProps> = ({ title, isOpen, onClose, children }) => (
  <Drawer
    anchor="left"
    open={isOpen}
    onClose={onClose}
    variant="persistent"
    data-testid="node-palette-drawer"
    sx={{
      "& .MuiDrawer-paper": {
        width: 280,
        top: 48,
        height: "calc(100% - 48px)",
        bgcolor: "var(--vscode-sideBar-background)",
        borderRight: 1,
        borderColor: "divider"
      }
    }}
  >
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 2,
        py: 1,
        borderBottom: 1,
        borderColor: "divider"
      }}
    >
      <Typography variant="subtitle2" fontWeight={600}>
        {title}
      </Typography>
      <MuiIconButton size="small" onClick={onClose} aria-label="Close" title="Close">
        <CloseIcon fontSize="small" />
      </MuiIconButton>
    </Box>
    <Box sx={{ overflowY: "auto", flex: 1 }}>{children}</Box>
  </Drawer>
);
