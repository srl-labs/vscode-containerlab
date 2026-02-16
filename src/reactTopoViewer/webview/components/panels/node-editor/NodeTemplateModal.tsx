// Modal for creating and editing custom node templates.
import React, { useCallback, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";

import { useTopoViewerStore } from "../../../stores/topoViewerStore";
import { useCustomTemplateEditor } from "../../../hooks/editor/useCustomTemplateEditor";
import { DialogCancelSaveActions, DialogTitleWithClose } from "../../ui/dialog/DialogChrome";
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
      <DialogTitleWithClose title={title} onClose={handlers.handleClose} />
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
      <DialogCancelSaveActions
        onCancel={handlers.handleClose}
        onSave={() => footerRef.current?.handleSave()}
      />
    </Dialog>
  );
};
