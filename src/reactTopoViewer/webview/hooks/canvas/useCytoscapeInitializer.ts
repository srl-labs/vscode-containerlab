/**
 * Hook for initializing Cytoscape instance
 */
import React, { useCallback } from 'react';
import cytoscape, { Core } from 'cytoscape';
import type { CyElement } from '../../../shared/types/messages';
import { log } from '../../utils/logger';
import {
  ensureGridGuideRegistered,
  hasPresetPositions,
  createCytoscapeConfig,
  handleCytoscapeReady
} from '../../components/canvas/init';
import { setupEventHandlers, attachCustomWheelZoom } from '../../components/canvas/events';

type SelectCallback = (id: string | null) => void;

export interface CytoscapeInitOptions {
  editNode?: SelectCallback;
  editEdge?: SelectCallback;
  getMode?: () => 'edit' | 'view';
  getIsLocked?: () => boolean;
}

/**
 * Hook that returns a function to initialize Cytoscape
 */
export function useCytoscapeInitializer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  cyRef: React.RefObject<Core | null>,
  selectNode: SelectCallback,
  selectEdge: SelectCallback,
  options?: CytoscapeInitOptions
) {
  return useCallback((initialElements: CyElement[]) => {
    const container = containerRef.current;
    if (!container) return null;
    ensureGridGuideRegistered();

    const rect = container.getBoundingClientRect();
    log.info(`[CytoscapeCanvas] Container size: ${rect.width}x${rect.height}`);
    log.info(`[CytoscapeCanvas] Initializing with ${initialElements.length} elements`);

    if (rect.width === 0 || rect.height === 0) {
      log.warn('[CytoscapeCanvas] Container has zero dimensions, skipping init');
      return null;
    }

    const usePresetLayout = hasPresetPositions(initialElements);
    log.info(`[CytoscapeCanvas] Preset positions detected: ${usePresetLayout}`);

    const cy = cytoscape(createCytoscapeConfig(container, initialElements));

    cyRef.current = cy;
    cy.userZoomingEnabled(false);
    const detachWheel = attachCustomWheelZoom(cyRef, container);

    setupEventHandlers(cy, selectNode, selectEdge, {
      editNode: options?.editNode,
      editEdge: options?.editEdge,
      getMode: options?.getMode,
      getIsLocked: options?.getIsLocked
    });

    cy.ready(() => handleCytoscapeReady(cy, usePresetLayout));

    return () => {
      detachWheel();
      cy.destroy();
      cyRef.current = null;
    };
  }, [selectNode, selectEdge, containerRef, cyRef, options?.editNode, options?.editEdge, options?.getMode, options?.getIsLocked]);
}
