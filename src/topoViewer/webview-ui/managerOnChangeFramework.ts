// file: managerOnChangeFramework.ts

// ## Overview
//
// This code sets up a small framework to monitor changes in "lab data" and update the UI (e.g., Cytoscape edges) accordingly. It revolves around these main pieces:
//
// 1. **Use‐Case Configuration (`monitorConfigs`)**
//    Each "use case" specifies:
//    - A unique name (e.g. `"interfaceState"`)
//    - A **mapping** function (e.g. `onChangeRuleInterfaceOperState`) that examines the raw data and derives a state mapping (key → value).
//    - A **handler** function (e.g. `onChangeHandlerInterfaceOperState`) that reacts to state changes and updates the UI or performs other logic.
//
// 2. **State Monitor Engine (`stateMonitorEngine`)**
//    - Receives the raw lab data and each use‐case configuration.
//    - Calls the mapping function to get the current "state map."
//    - Compares that map to the previously cached state.
//    - When changes (or removals) are found, calls the corresponding handler.
//
// 3. **Message Listener**
//    - Listens for `postMessage` events containing lab data.
//    - Invokes `stateMonitorEngine` with fresh data and the array of use‐case configs.
//
// 4. **Global Storage**
//    - `window.previousStateByUseCase` caches previous states so we can detect changes.
//    - `window.dynamicCytoStyles` can hold dynamic styles for Cytoscape.
//
// In short, the flow is: **message event** → **stateMonitorEngine** → **mapping** → compare to **previous state** → if changed, **handler** executes.

// Global type declarations for external dependencies
// cy is accessed via globalThis.cy

// Import logger for webview
import { log } from './logger';

// Extending window interface for global variables
/* eslint-disable no-unused-vars */
declare global {
  interface Window {
    dynamicCytoStyles: Map<string, string | number>;
    previousStateByUseCase: Record<string, StateMapping>;
    cachedEndpointStates: Record<string, any>;
  }
}
/* eslint-enable no-unused-vars */

// Core type definitions
export interface StateMapping {
  [key: string]: string | number | boolean;
}

export interface UpdateMessage {
  nodeName: string;
  monitoredObject: string;
  state?: string | number | boolean;
  removed?: boolean;
}

export interface MonitorConfig<TState = any> {
  useCase: string;
  mapping: MappingFunction<TState>;
  handler: HandlerFunction;
}

/* eslint-disable no-unused-vars */
export type MappingFunction<_TState = any> = (_labData: LabData) => StateMapping;
export type HandlerFunction = (_updateMessage: UpdateMessage) => void;
/* eslint-enable no-unused-vars */

// Lab data structure types
export interface LabData {
  [labPath: string]: Lab;
}

export interface Lab {
  name: string;
  containers: Container[];
}

export interface Container {
  label: string;
  name_short: string;
  interfaces: Interface[];
}

export interface Interface {
  label: string;
  description?: string;
}

// Cytoscape edge and node types
/* eslint-disable no-unused-vars */
export interface CytoscapeEdge {
  id(): string;
  length: number;
  forEach(_callback: (_edge: CytoscapeEdge) => void): void;
}

export interface CytoscapeCollection {
  length: number;
  [index: number]: { id(): string };
  forEach(_callback: (_element: any) => void): void;
}
/* eslint-enable no-unused-vars */

// Interface state types
export type InterfaceState = 'Up' | 'Down';

// Cache of interface states keyed by "node::endpoint"
const interfaceStateCache = new Map<string, InterfaceState>();

/**
 * Global toggle for enabling/disabling dynamic style updates.
 * When true, the message event listener will be bound; when false, it will be unbound.
 */
export let globalToggleOnChangeCytoStyle: boolean = true;

/**
 * Initialize global storage for dynamic Cytoscape style updates and state caching.
 */
export function initializeGlobalStorage(): void {
  if (typeof window !== 'undefined') {
    window.dynamicCytoStyles = new Map<string, string | number>();
    window.previousStateByUseCase = {};
    window.cachedEndpointStates = {};
  }
}

// Initialize global storage
initializeGlobalStorage();

// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Safely escapes a string for use in Cytoscape selectors.
 * Custom escape function for handling special characters in endpoint names.
 */
export function customEscape(str: string): string {
  return str.replace(/["\\[\]]/g, '\\$&');
}

/**
 * Updates the dynamic style for an edge and caches the update.
 *
 * @param edgeId - The unique ID of the edge
 * @param styleProp - The style property to update (e.g. "line-color")
 * @param value - The new value for the style property
 */
export function updateEdgeDynamicStyle(
  edgeId: string,
  styleProp: string,
  value: string | number
): void {
  if (typeof globalThis.cy === 'undefined') {
    log.warn('Cytoscape (cy) is not available');
    return;
  }

  const edge = globalThis.cy.$(`#${edgeId}`);
  if (edge.length > 0) {
    edge.style(styleProp, value);
    const cacheKey = `edge:${edgeId}:${styleProp}`;
    window.dynamicCytoStyles.set(cacheKey, value);
  }
}

// -----------------------------------------------------------------------------
// USE-CASE SPECIFIC MAPPING FUNCTIONS (RULES)
// -----------------------------------------------------------------------------

/**
 * Monitors interface operational state.
 * Iterates through labData and returns a mapping from "nodeName-endpoint" to "Up" or "Down".
 *
 * @param labData - Raw lab data
 * @returns Mapping of keys (e.g. "router1::e1-1") to state ("Up" or "Down")
 */
export function onChangeRuleInterfaceOperState(labData: LabData): StateMapping {
  const stateMap: StateMapping = {};

  for (const labPath in labData) {
    try {
      const lab = labData[labPath];

      log.debug(`Processing lab: ${lab.name}`);

      if (!lab || !Array.isArray(lab.containers)) continue;

      lab.containers.forEach((container: Container) => {
        if (typeof container.label !== 'string') return;

        const nodeClabNameShort = container.name_short;
        const nodeName = nodeClabNameShort;

        log.debug(`Processing node: ${nodeName}`);

        if (!Array.isArray(container.interfaces)) return;

        container.interfaces.forEach((iface: Interface) => {
          if (!iface || typeof iface.label !== 'string') return;

          const description = iface.description || '';
          const state: InterfaceState = description.toUpperCase().includes('UP') ? 'Up' : 'Down';
          const endpoint = iface.label;

          const key = `${nodeName}::${endpoint}`;
          stateMap[key] = state;

          log.debug(`Interface state for ${key}: ${state}`);
        });
      });
    } catch (err) {
      log.error(`Error processing labPath '${labPath}' in interface state detection: ${err}`);
    }
  }

  log.debug(`Interface state mapping generated with ${Object.keys(stateMap).length} entries`);
  return stateMap;
}

// -----------------------------------------------------------------------------
// UPDATE HANDLERS (USE-CASE SPECIFIC)
// -----------------------------------------------------------------------------

/**
 * Handler for interface operational state changes.
 * Updates the dynamic style of matching edges accordingly.
 *
 * @param updateMessage - The update message containing nodeName, endpoint, state, and optional removed flag
 */
export function onChangeHandlerInterfaceOperState(updateMessage: UpdateMessage): void {
  log.info(`Interface state change: ${updateMessage.nodeName}::${updateMessage.monitoredObject} -> ${updateMessage.state}`);

  const { nodeName, monitoredObject, state, removed } = updateMessage;

  // Safe escaping for CSS selectors
  const safeNodeName = typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(nodeName)
    : nodeName;
  const safeEndpoint = customEscape(monitoredObject);

  const edgeSelector = `edge[source="${safeNodeName}"][sourceEndpoint="${safeEndpoint}"], edge[target="${safeNodeName}"][targetEndpoint="${safeEndpoint}"]`;

  if (typeof globalThis.cy === 'undefined') {
    log.warn('Cytoscape (cy) is not available');
    return;
  }

  const key = `${nodeName}::${monitoredObject}`;
  if (removed) {
    interfaceStateCache.delete(key);
  } else {
    interfaceStateCache.set(key, state === 'Up' ? 'Up' : 'Down');
  }

  const edges: CytoscapeCollection = globalThis.cy.$(edgeSelector);
  log.debug(`Edge selector: ${edgeSelector}, found ${edges.length} edges, removed: ${removed}`);

  edges.forEach((edge: any) => {
    const sourceKey = `${edge.data('source')}::${edge.data('sourceEndpoint')}`;
    const targetKey = `${edge.data('target')}::${edge.data('targetEndpoint')}`;
    const sourceState = interfaceStateCache.get(sourceKey);
    const targetState = interfaceStateCache.get(targetKey);
    const newColor = sourceState === 'Up' && targetState === 'Up' ? '#00df2b' : '#df2b00';
    updateEdgeDynamicStyle(edge.id(), 'line-color', newColor);
    log.info(`Edge ${edge.id()} colored ${newColor}`);
  });

  if (edges.length === 0) {
    log.warn(`No edge found matching selector: ${edgeSelector}`);
  }
}

// -----------------------------------------------------------------------------
// GLOBAL MONITOR CONFIGURATIONS
// -----------------------------------------------------------------------------

/**
 * Global monitor configurations.
 * This array defines use-case specific mapping functions (rules) and their corresponding handlers.
 * To add new use cases, simply add another object with:
 *   - useCase: Unique identifier (e.g. "interfaceState").
 *   - mapping: Function that takes labData and returns a mapping (key → value).
 *   - handler: Function that handles update messages when a change is detected.
 */
export const monitorConfigs: MonitorConfig[] = [
  {
    useCase: 'interfaceState',
    mapping: onChangeRuleInterfaceOperState,
    handler: onChangeHandlerInterfaceOperState
  }
  // Additional use-case configurations can be added here.
  // Example:
  // {
  //   useCase: 'interfaceSpeed',
  //   mapping: onChangeRuleInterfaceSpeed,
  //   handler: onChangeHandlerInterfaceSpeed
  // }
];

// -----------------------------------------------------------------------------
// GENERIC STATE MONITOR ENGINE
// -----------------------------------------------------------------------------

/**
 * Generic state monitor engine that processes raw lab data for each use-case defined in monitorConfigs.
 * It compares the current state mapping (from the mapping function) with the cached state.
 * If differences are found, the corresponding handler is called with an update message.
 *
 * @param labData - Raw lab data from the backend
 * @param configs - Array of configuration objects, each with useCase, mapping, and handler
 */
export function stateMonitorEngine(labData: LabData, configs: MonitorConfig[]): void {
  configs.forEach((config) => {
    const { useCase, mapping, handler } = config;
    let currentState: StateMapping = {};

    // Step 1: Generate current mapping.
    try {
      currentState = mapping(labData);
    } catch (err) {
      log.error(`Error in mapping for useCase '${useCase}': ${err}`);
      return; // Skip this use-case if mapping fails.
    }

    // Retrieve previous state for this use-case.
    const prevState: StateMapping = window.previousStateByUseCase[useCase] || {};

    // Step 2: Compare current state with previous state.
    for (const key in currentState) {
      if (prevState[key] !== currentState[key]) {
        const [nodeName, monitoredObject] = key.split('::');
        const updateMessage: UpdateMessage = {
          nodeName,
          monitoredObject,
          state: currentState[key]
        };
        log.info(`State change detected for ${useCase}: ${updateMessage.nodeName}::${updateMessage.monitoredObject}`);

        // Step 3: Call the use-case specific handler.
        handler(updateMessage);
      }
    }

    // Also check for keys that were present before but are now missing.
    for (const key in prevState) {
      if (!(key in currentState)) {
        const [nodeName, monitoredObject] = key.split('::');
        const updateMessage: UpdateMessage = {
          nodeName,
          monitoredObject,
          removed: true
        };
        log.info(`State removal detected for ${useCase}: ${updateMessage.nodeName}::${updateMessage.monitoredObject}`);
        handler(updateMessage);
      }
    }

    // Step 4: Update the cached state.
    window.previousStateByUseCase[useCase] = currentState;
  });
}

// -----------------------------------------------------------------------------
// MESSAGE EVENT LISTENER SETUP
// -----------------------------------------------------------------------------

/* eslint-disable-next-line no-unused-vars */
let messageEventListener: ((event: MessageEvent) => void) | null = null;

/**
 * Sets up a postMessage listener for monitoring lab data changes.
 * Listens for messages from the extension backend and invokes the
 * stateMonitorEngine when data is received.
 */
export function setupMessageEventListener(): void {
  if (messageEventListener) {
    window.removeEventListener('message', messageEventListener);
  }

  messageEventListener = (event: MessageEvent) => {
    const message = event.data;
    if (message && message.type === 'clab-tree-provider-data-native-vscode-message-stream') {
      if (globalToggleOnChangeCytoStyle) {
        stateMonitorEngine(message.data, monitorConfigs);
      }
    }
  };

  window.addEventListener('message', messageEventListener);
}

// -----------------------------------------------------------------------------
// PUBLIC API
// -----------------------------------------------------------------------------

/**
 * Enables the onChange monitoring framework.
 */
export function enableOnChangeMonitoring(): void {
  globalToggleOnChangeCytoStyle = true;
  setupMessageEventListener();
}

/**
 * Disables the onChange monitoring framework.
 */
export function disableOnChangeMonitoring(): void {
  globalToggleOnChangeCytoStyle = false;
  if (messageEventListener) {
    window.removeEventListener('message', messageEventListener);
  }
}

/**
 * Gets the current state of the monitoring framework.
 */
export function isMonitoringEnabled(): boolean {
  return globalToggleOnChangeCytoStyle;
}

/**
 * Manually trigger the state monitor engine with provided lab data.
 * Useful for testing or manual updates.
 */
export function triggerStateMonitoring(labData: LabData): void {
  stateMonitorEngine(labData, monitorConfigs);
}

/**
 * Add a new monitor configuration to the active configs.
 */
export function addMonitorConfig(config: MonitorConfig): void {
  monitorConfigs.push(config);
}

/**
 * Remove a monitor configuration by use case name.
 */
export function removeMonitorConfig(useCase: string): void {
  const index = monitorConfigs.findIndex(config => config.useCase === useCase);
  if (index !== -1) {
    monitorConfigs.splice(index, 1);
  }
}

/**
 * Clear all cached states for fresh monitoring.
 */
export function clearCachedStates(): void {
  if (typeof window !== 'undefined') {
    window.previousStateByUseCase = {};
    window.cachedEndpointStates = {};
  }
}

// Initialize the message event listener when this module is loaded
if (typeof window !== 'undefined') {
  setupMessageEventListener();
}

// Export for backward compatibility and external usage
// Removed duplicate exports - variables are already exported where they are declared
