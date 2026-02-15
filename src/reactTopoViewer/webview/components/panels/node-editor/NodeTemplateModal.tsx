// Modal for creating and editing custom node templates.
import React, { useCallback, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

import { useTopoViewerStore } from "../../../stores/topoViewerStore";
import { useCustomTemplateEditor } from "../../../hooks/editor/useCustomTemplateEditor";
import { NodeEditorView } from "../context-panel/views/NodeEditorView";
import type { NodeEditorFooterRef } from "../context-panel/views/NodeEditorView";

export const NodeTemplateModal: React.FC = () => {
  const editingCustomTemplate = useTopoViewerStore((s) => s.editingCustomTemplate);
  const editCustomTemplate = useTopoViewerStore((s) => s.editCustomTemplate);
  const { editorData, handlers } = useCustomTemplateEditor(
    editingCustomTemplate,
    editCustomTemplate
  );
  const footerRef = useRef<NodeEditorFooterRef | null>(null);
  const [, forceUpdate] = useState(0);

  const setFooterRef = useCallback((ref: NodeEditorFooterRef | null) => {
    footerRef.current = ref;
    forceUpdate((n) => n + 1);
  }, []);

  const isOpen = !!editingCustomTemplate;
  const isNew = editingCustomTemplate?.id !== "edit-custom-node";
  const title = isNew ? "Create Node Template" : "Edit Node Template";

  return (
    <Dialog
      open={isOpen}
      onClose={handlers.handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { height: "80vh", maxHeight: "80vh" } } }}
    >
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5 }}
      >
        {title}
        <IconButton size="small" onClick={handlers.handleClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, overflow: "hidden" }}>
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <NodeEditorView
            nodeData={editorData}
            onSave={handlers.handleSave}
            onApply={handlers.handleApply}
            onFooterRef={setFooterRef}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="text" size="small" onClick={handlers.handleClose}>
          Cancel
        </Button>
        <Button size="small" onClick={() => footerRef.current?.handleSave()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
