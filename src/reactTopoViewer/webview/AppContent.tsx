/**
 * App content - UI composition for the React TopoViewer.
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { ReactFlowCanvasRef } from "./components/canvas";
import { ReactFlowCanvas } from "./components/canvas";
import { Navbar } from "./components/navbar/Navbar";
import { ShortcutDisplay } from "./components/ui/ShortcutDisplay";
import {
  FloatingActionPanel,
  type FloatingActionPanelHandle,
  EditorPanels,
  ViewPanels
} from "./components/panels";
import { ToastContainer } from "./components/ui/Toast";
import { EasterEggRenderer } from "./easter-eggs";
import { useAppContentViewModel } from "./hooks/app";
import type { useLayoutControls } from "./hooks/ui";

type LayoutControls = ReturnType<typeof useLayoutControls>;

export interface AppContentProps {
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>;
  rfInstance: ReactFlowInstance | null;
  layoutControls: LayoutControls;
  onInit: (instance: ReactFlowInstance) => void;
  onLockedAction?: () => void;
}

export const AppContent: React.FC<AppContentProps> = ({
  floatingPanelRef,
  reactFlowRef,
  rfInstance,
  layoutControls,
  onInit,
  onLockedAction
}) => {
  const {
    state,
    annotations,
    undoRedo,
    toasts,
    dismissToast,
    navbarCommands,
    floatingPanelCommands,
    customNodeCommands,
    menuHandlers,
    graphCreation,
    selectionData,
    nodeEditorHandlers,
    linkEditorHandlers,
    networkEditorHandlers,
    customTemplateEditorData,
    customTemplateHandlers,
    filteredNodes,
    filteredEdges,
    annotationMode,
    canvasAnnotationHandlers,
    shortcutDisplay,
    panelVisibility,
    easterEgg,
    handleZoomToFit,
    handleEdgeCreated,
    handleDeleteNode,
    handleDeleteLink
  } = useAppContentViewModel({
    floatingPanelRef,
    rfInstance,
    layoutControls,
    onLockedAction
  });

  const handleNetworkSave = React.useCallback(
    (data: Parameters<typeof networkEditorHandlers.handleSave>[0]) => {
      networkEditorHandlers.handleSave(data).catch((err) => {
        console.error("[TopoViewer] Network editor save failed", err);
      });
    },
    [networkEditorHandlers]
  );

  const handleNetworkApply = React.useCallback(
    (data: Parameters<typeof networkEditorHandlers.handleApply>[0]) => {
      networkEditorHandlers.handleApply(data).catch((err) => {
        console.error("[TopoViewer] Network editor apply failed", err);
      });
    },
    [networkEditorHandlers]
  );

  return (
    <div className="topoviewer-app" data-testid="topoviewer-app">
      <Navbar
        onZoomToFit={handleZoomToFit}
        onToggleLayout={navbarCommands.onLayoutToggle}
        layout={layoutControls.layout}
        onLayoutChange={layoutControls.setLayout}
        gridLineWidth={layoutControls.gridLineWidth}
        onGridLineWidthChange={layoutControls.setGridLineWidth}
        geoMode={layoutControls.geoMode}
        onGeoModeChange={layoutControls.setGeoMode}
        isGeoLayout={layoutControls.isGeoLayout}
        onLabSettings={panelVisibility.handleShowLabSettings}
        onToggleSplit={navbarCommands.onToggleSplit}
        onFindNode={panelVisibility.handleShowFindNode}
        onCaptureViewport={panelVisibility.handleShowSvgExport}
        onShowShortcuts={panelVisibility.handleShowShortcuts}
        onShowAbout={panelVisibility.handleShowAbout}
        shortcutDisplayEnabled={shortcutDisplay.isEnabled}
        onToggleShortcutDisplay={shortcutDisplay.toggle}
        canUndo={undoRedo.canUndo}
        canRedo={undoRedo.canRedo}
        onUndo={undoRedo.undo}
        onRedo={undoRedo.redo}
        onLogoClick={easterEgg.handleLogoClick}
        logoClickProgress={easterEgg.state.progress}
        isPartyMode={easterEgg.state.isPartyMode}
      />
      <main className="topoviewer-main">
        <ReactFlowCanvas
          ref={reactFlowRef}
          nodes={filteredNodes}
          edges={filteredEdges}
          annotationMode={annotationMode}
          annotationHandlers={canvasAnnotationHandlers}
          linkLabelMode={state.linkLabelMode}
          onInit={onInit}
          onEdgeCreated={handleEdgeCreated}
          onShiftClickCreate={graphCreation.createNodeAtPosition}
          onNodeDelete={handleDeleteNode}
          onEdgeDelete={handleDeleteLink}
        />
        <ViewPanels
          nodeInfo={{
            isVisible: !!state.selectedNode && state.mode === "view",
            nodeData: selectionData.selectedNodeData,
            onClose: menuHandlers.handleCloseNodePanel
          }}
          linkInfo={{
            isVisible: !!state.selectedEdge && state.mode === "view",
            linkData: selectionData.selectedLinkData,
            onClose: menuHandlers.handleCloseLinkPanel
          }}
          shortcuts={{
            isVisible: panelVisibility.showShortcutsPanel,
            onClose: panelVisibility.handleCloseShortcuts
          }}
          about={{
            isVisible: panelVisibility.showAboutPanel,
            onClose: panelVisibility.handleCloseAbout
          }}
          findNode={{
            isVisible: panelVisibility.showFindNodePanel,
            onClose: panelVisibility.handleCloseFindNode,
            rfInstance
          }}
          svgExport={{
            isVisible: panelVisibility.showSvgExportPanel,
            onClose: panelVisibility.handleCloseSvgExport,
            textAnnotations: annotations.textAnnotations,
            shapeAnnotations: annotations.shapeAnnotations,
            groups: annotations.groups
          }}
        />
        <EditorPanels
          nodeEditor={{
            isVisible: !!state.editingNode,
            nodeData: selectionData.editingNodeData,
            inheritedProps: selectionData.editingNodeInheritedProps,
            onClose: nodeEditorHandlers.handleClose,
            onSave: nodeEditorHandlers.handleSave,
            onApply: nodeEditorHandlers.handleApply
          }}
          networkEditor={{
            isVisible: !!state.editingNetwork,
            nodeData: selectionData.editingNetworkData,
            onClose: networkEditorHandlers.handleClose,
            onSave: handleNetworkSave,
            onApply: handleNetworkApply
          }}
          customTemplateEditor={{
            isVisible: !!state.editingCustomTemplate,
            nodeData: customTemplateEditorData,
            onClose: customTemplateHandlers.handleClose,
            onSave: customTemplateHandlers.handleSave,
            onApply: customTemplateHandlers.handleApply
          }}
          linkEditor={{
            isVisible: !!state.editingEdge,
            linkData: selectionData.editingLinkData,
            onClose: linkEditorHandlers.handleClose,
            onSave: linkEditorHandlers.handleSave,
            onApply: linkEditorHandlers.handleApply,
            onAutoApplyOffset: linkEditorHandlers.handleAutoApplyOffset
          }}
          bulkLink={{
            isVisible: panelVisibility.showBulkLinkPanel,
            mode: state.mode,
            isLocked: state.isLocked,
            onClose: panelVisibility.handleCloseBulkLink
          }}
          freeTextEditor={{
            isVisible: !!annotations.editingTextAnnotation,
            annotation: annotations.editingTextAnnotation,
            onSave: annotations.saveTextAnnotation,
            onClose: annotations.closeTextEditor,
            onDelete: annotations.deleteTextAnnotation
          }}
          freeShapeEditor={{
            isVisible: !!annotations.editingShapeAnnotation,
            annotation: annotations.editingShapeAnnotation,
            onSave: annotations.saveShapeAnnotation,
            onClose: annotations.closeShapeEditor,
            onDelete: annotations.deleteShapeAnnotation
          }}
          groupEditor={{
            isVisible: !!annotations.editingGroup,
            groupData: annotations.editingGroup,
            onSave: annotations.saveGroup,
            onClose: annotations.closeGroupEditor,
            onDelete: annotations.deleteGroup,
            onStyleChange: annotations.updateGroup
          }}
          labSettings={{
            isVisible: panelVisibility.showLabSettingsPanel,
            mode: state.mode,
            isLocked: state.isLocked,
            labSettings: state.labSettings ?? { name: state.labName },
            onClose: panelVisibility.handleCloseLabSettings
          }}
        />
        <FloatingActionPanel
          ref={floatingPanelRef}
          onDeploy={floatingPanelCommands.onDeploy}
          onDestroy={floatingPanelCommands.onDestroy}
          onDeployCleanup={floatingPanelCommands.onDeployCleanup}
          onDestroyCleanup={floatingPanelCommands.onDestroyCleanup}
          onRedeploy={floatingPanelCommands.onRedeploy}
          onRedeployCleanup={floatingPanelCommands.onRedeployCleanup}
          onAddNode={graphCreation.handleAddNodeFromPanel}
          onAddNetwork={graphCreation.handleAddNetworkFromPanel}
          onAddGroup={annotations.handleAddGroup}
          onAddText={annotations.handleAddText}
          onAddShapes={annotations.handleAddShapes}
          onAddBulkLink={panelVisibility.handleShowBulkLink}
          onEditCustomNode={customNodeCommands.onEditCustomNode}
          onDeleteCustomNode={customNodeCommands.onDeleteCustomNode}
          onSetDefaultCustomNode={customNodeCommands.onSetDefaultCustomNode}
          isAddTextMode={annotations.isAddTextMode}
          isAddShapeMode={annotations.isAddShapeMode}
        />
        <ShortcutDisplay shortcuts={shortcutDisplay.shortcuts} />
        <EasterEggRenderer easterEgg={easterEgg} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </main>
    </div>
  );
};
