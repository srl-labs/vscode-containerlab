/**
 * PaletteSection - Node and annotation palette for the Lab Drawer
 * Uses MUI components with drag-and-drop functionality
 */
import React, { useCallback, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Tooltip from "@mui/material/Tooltip";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
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

import type { CustomNodeTemplate } from "../../../../shared/types/editors";
import { ROLE_SVG_MAP, DEFAULT_ICON_COLOR } from "../../../../shared/types/graph";
import { generateEncodedSVG, type NodeType } from "../../../icons/SvgGenerator";
import { useCustomNodes, useTopoViewerStore } from "../../../stores/topoViewerStore";

interface PaletteSectionProps {
  onEditCustomNode?: (nodeName: string) => void;
  onDeleteCustomNode?: (nodeName: string) => void;
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
  return "pe";
}

/** Get the SVG icon URL for a template */
function getTemplateIconUrl(template: CustomNodeTemplate): string {
  const role = template.icon || "pe";
  const color = template.iconColor || DEFAULT_ICON_COLOR;
  const svgType = getRoleSvgType(role);
  return generateEncodedSVG(svgType, color);
}

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
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              if (!isDefault) onSetDefault?.(template.name);
            }}
            sx={{ color: isDefault ? "warning.main" : "text.secondary" }}
          >
            {isDefault ? <StarIcon fontSize="small" /> : <StarOutlineIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Edit">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(template.name);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(template.name);
            }}
            sx={{ "&:hover": { color: "error.main" } }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
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

/** Draggable annotation item */
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

export const PaletteSection: React.FC<PaletteSectionProps> = ({
  onEditCustomNode,
  onDeleteCustomNode,
  onSetDefaultCustomNode
}) => {
  const customNodes = useCustomNodes();
  const defaultNode = useTopoViewerStore((state) => state.defaultNode);
  const [filter, setFilter] = useState("");
  const [activeTab, setActiveTab] = useState(0);

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
    onEditCustomNode?.("__new__");
  }, [onEditCustomNode]);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Palette
      </Typography>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_e, v) => setActiveTab(v)}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
      >
        <Tab label="Nodes" />
        <Tab label="Annotations" />
      </Tabs>

      {/* Nodes Tab */}
      {activeTab === 0 && (
        <Box>
          {/* Search */}
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
                  <IconButton size="small" onClick={() => setFilter("")}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              )
            }}
            sx={{ mb: 2 }}
          />

          {/* Node Templates */}
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
          {!filter && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleAddNewNode}
              sx={{ mt: 1, mb: 2 }}
            >
              New custom node
            </Button>
          )}

          {/* Networks */}
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

          <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 2 }}>
            <InfoIcon sx={{ fontSize: 14 }} />
            Drag items onto the canvas to add them
          </Typography>
        </Box>
      )}

      {/* Annotations Tab */}
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
            Drag items onto the canvas to add them
          </Typography>
        </Box>
      )}
    </Box>
  );
};
