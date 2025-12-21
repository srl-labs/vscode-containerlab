/**
 * Production Services Factory
 *
 * Factory function to create all production service adapters
 */

import type * as vscode from 'vscode';

import type { TopologyIO, AnnotationsIO } from '../../../shared/io';
import type { CyElement } from '../../../shared/types/topology';

import { MessagingServiceAdapter } from './MessagingServiceAdapter';
import { PersistenceServiceAdapter } from './PersistenceServiceAdapter';
import { AnnotationsServiceAdapter } from './AnnotationsServiceAdapter';
import { NodeCommandServiceAdapter } from './NodeCommandServiceAdapter';
import { LifecycleServiceAdapter } from './LifecycleServiceAdapter';
import { CustomNodeServiceAdapter } from './CustomNodeServiceAdapter';
import { SplitViewServiceAdapter } from './SplitViewServiceAdapter';
import { LabSettingsServiceAdapter } from './LabSettingsServiceAdapter';
import { MessageRouterContextAdapter } from './MessageRouterContextAdapter';
import { extensionLogger } from './loggerAdapter';

/**
 * Create all production service adapters
 * @param options Configuration including custom service instances
 */
export function createProductionServices(options: {
  panel: vscode.WebviewPanel;
  extensionContext: vscode.ExtensionContext;
  yamlFilePath: string;
  isViewMode: boolean;
  lastTopologyElements: CyElement[];
  loadTopologyData: () => Promise<unknown>;
  // Required TopologyIO instance (needs per-file initialization)
  topologyIO: TopologyIO;
  // Optional custom AnnotationsIO instance (defaults to extension singleton)
  annotationsIO?: AnnotationsIO;
}) {
  const context = new MessageRouterContextAdapter({
    yamlFilePath: options.yamlFilePath,
    isViewMode: options.isViewMode,
    lastTopologyElements: options.lastTopologyElements,
    loadTopologyData: options.loadTopologyData,
  });

  return {
    messaging: new MessagingServiceAdapter(options.panel),
    persistence: new PersistenceServiceAdapter(options.topologyIO),
    annotations: new AnnotationsServiceAdapter(options.annotationsIO),
    nodeCommands: new NodeCommandServiceAdapter(options.yamlFilePath),
    lifecycle: new LifecycleServiceAdapter(),
    customNodes: new CustomNodeServiceAdapter(),
    splitView: new SplitViewServiceAdapter(options.panel),
    labSettings: new LabSettingsServiceAdapter(),
    context,
    logger: extensionLogger,
  };
}
