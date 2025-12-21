/**
 * App helper hooks - extracted from App.tsx to reduce file size
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';

import type { CustomNodeTemplate, CustomTemplateEditorData } from '../../../shared/types/editors';
import {
  createNewTemplateEditorData,
  convertTemplateToEditorData
} from '../../../shared/utilities/customNodeConversions';
import {
  ensureCytoscapeLayersRegistered,
  getCytoscapeLayers,
  configureLayerNode,
  type IHTMLLayer
} from '../shared/cytoscapeLayers';
import { log } from '../../utils/logger';
import { sendDeleteCustomNode, sendSetDefaultCustomNode, sendCommandToExtension } from '../../utils/extensionMessaging';

/**
 * Custom node template UI commands interface
 */
export interface CustomNodeCommands {
  onNewCustomNode: () => void;
  onEditCustomNode: (nodeName: string) => void;
  onDeleteCustomNode: (nodeName: string) => void;
  onSetDefaultCustomNode: (nodeName: string) => void;
}

/**
 * Hook for custom node template UI commands
 */
export function useCustomNodeCommands(
  customNodes: CustomNodeTemplate[],
  editCustomTemplate: (data: CustomTemplateEditorData | null) => void
): CustomNodeCommands {
  const onNewCustomNode = React.useCallback(() => {
    const templateData = createNewTemplateEditorData();
    editCustomTemplate(templateData);
  }, [editCustomTemplate]);

  const onEditCustomNode = React.useCallback((nodeName: string) => {
    const template = customNodes.find(n => n.name === nodeName);
    if (!template) return;
    const templateData = convertTemplateToEditorData(template);
    editCustomTemplate(templateData);
  }, [customNodes, editCustomTemplate]);

  const onDeleteCustomNode = React.useCallback((nodeName: string) => {
    sendDeleteCustomNode(nodeName);
  }, []);

  const onSetDefaultCustomNode = React.useCallback((nodeName: string) => {
    sendSetDefaultCustomNode(nodeName);
  }, []);

  return {
    onNewCustomNode,
    onEditCustomNode,
    onDeleteCustomNode,
    onSetDefaultCustomNode
  };
}

/**
 * Navbar commands interface
 */
export interface NavbarCommands {
  onLayoutToggle: () => void;
  onToggleSplit: () => void;
}

/**
 * Hook for navbar UI commands
 */
export function useNavbarCommands(): NavbarCommands {
  const onLayoutToggle = React.useCallback(() => {
    sendCommandToExtension('nav-layout-toggle');
  }, []);

  const onToggleSplit = React.useCallback(() => {
    sendCommandToExtension('topo-toggle-split-view');
  }, []);

  return {
    onLayoutToggle,
    onToggleSplit
  };
}

/**
 * Return type for useShapeLayer hook
 */
export interface UseShapeLayerReturn {
  shapeLayerNode: HTMLElement | null;
  updateLayer: () => void;
}

/**
 * Hook to create and manage a Cytoscape layer for shape annotations.
 * Uses cytoscape-layers to render shapes BELOW the node layer but above the grid.
 */
export function useShapeLayer(cy: CyCore | null): UseShapeLayerReturn {
  const layerRef = React.useRef<IHTMLLayer | null>(null);
  const [shapeLayerNode, setShapeLayerNode] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!cy) return;

    ensureCytoscapeLayersRegistered();

    try {
      const layers = getCytoscapeLayers(cy);
      log.info('[ShapeLayer] Creating shape layer below nodes');

      // Create layer BELOW the node layer
      const shapeLayer = layers.nodeLayer.insertBefore('html');
      layerRef.current = shapeLayer;

      // Configure the layer node
      configureLayerNode(shapeLayer.node, 'auto', 'shape-layer-container');

      log.info('[ShapeLayer] Shape layer created');
      setShapeLayerNode(shapeLayer.node);
    } catch (err) {
      log.error(`[ShapeLayer] Failed to create layer: ${err}`);
    }

    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
      setShapeLayerNode(null);
    };
  }, [cy]);

  const updateLayer = () => {
    layerRef.current?.update();
  };

  return { shapeLayerNode, updateLayer };
}
