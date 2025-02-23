// ---

// ## Overview

// This code sets up a small framework to monitor changes in “lab data” and update the UI (e.g., Cytoscape edges) accordingly. It revolves around these main pieces:

// 1. **Use‐Case Configuration (`monitorConfigs`)**  
//    Each “use case” specifies:  
//    - A unique name (e.g. `"interfaceState"`)  
//    - A **mapping** function (e.g. `onChangeRuleInterfaceOperState`) that examines the raw data and derives a state mapping (key → value).  
//    - A **handler** function (e.g. `onChangeHandlerInterfaceOperState`) that reacts to state changes and updates the UI or performs other logic.

// 2. **State Monitor Engine (`stateMonitorEngine`)**  
//    - Receives the raw lab data and each use‐case configuration.  
//    - Calls the mapping function to get the current “state map.”  
//    - Compares that map to the previously cached state.  
//    - When changes (or removals) are found, calls the corresponding handler.

// 3. **Socket Event Listener**  
//    - Listens for updates on `"clab-tree-provider-data"`.  
//    - Invokes `stateMonitorEngine` with fresh data and the array of use‐case configs.

// 4. **Global Storage**  
//    - `window.previousStateByUseCase` caches previous states so we can detect changes.  
//    - `window.dynamicCytoStyles` can hold dynamic styles for Cytoscape.

// In short, the flow is: **socket event** → **stateMonitorEngine** → **mapping** → compare to **previous state** → if changed, **handler** executes.

// ---

// ##  Diagram

// Below is a textual illustration of how these pieces connect:

// ```
//    +---------------------------------------------------+
//    | Socket.io Feed: "clab-tree-provider-data"         |-----------+
//    |  (Extension Backend sends lab data via socket.io) |           |
//    +---------------------------------------------------+           |
//                                                                    |
//                                                                    |
//                                                                    |
//                                                                    |
// +----------------------------------------------------------+       |
// |               Config (monitorConfigs)                    |       |
// |  ------------------------------------------------------  |       |
// |  useCase: "interfaceState",                              |       |
// |  mapping: onChangeRuleInterfaceOperState,                |       |
// |  handler: onChangeHandlerInterfaceOperState              |       |
// +-----------------------------+----------------------------+       |
//                               |                                    |
//                               | (passed to)                        | (passed to)
//                               v                                    |
// +----------------------------------------------------------+       |
// |               stateMonitorEngine(labData, configs)       |       |
// |                                                          |<------+
// |    1) Call mapping() to produce current state map        |       
// |    2) Compare with previousStateByUseCase[useCase]       |       
// |    3) If different, call handler(updateMessage)          |       
// +---------+------------------------------------------+-----+       
//           |                                          |             
//           | calls                                    | calls       
//           v                                          v                        
// +-------------------------------------+   +-------------------------------------+  
// | mapping:                            |   | handler:                            |
// | onChangeRuleInterfaceOperState      |   | onChangeHandlerInterfaceOperState   |
// | (Derives Up/Down from raw lab data) |   | (Updates Cytoscape edges)           |
// +-------------------------------------+   +-------------------------------------+
// ```

// 1. **Config** (shown at top) defines which **mapping** and **handler** functions belong to this use case.  
// 2. When lab data arrives, **stateMonitorEngine** iterates over each config and calls the designated **mapping** function.  
// 3. The engine checks whether the newly computed state differs from the previously stored state.  
// 4. If a difference is found, the engine calls the **handler** to perform UI or other updates.

// ---

// ### Key Points

// - **Global Toggle (`globalToggleOnChangeCytoStyle`)**  
//   A simple boolean that can enable or disable the on‐change feature altogether.

// - **Global Maps & Caches**  
//   - `window.dynamicCytoStyles` can store style overrides for edges/nodes.  
//   - `window.previousStateByUseCase` keeps each use case’s prior key‐value map so we know when a value has changed or disappeared.

// - **Mapping Function** (`onChangeRuleInterfaceOperState`)  
//   Looks at each container’s interfaces and sets a “Up” or “Down” state based on the interface’s description.

// - **Handler Function** (`onChangeHandlerInterfaceOperState`)  
//   Locates edges in the Cytoscape graph that match the changed interface and updates their color based on “Up” (green) or “Down” (red). If an interface is removed, it reverts to a default style.

// ---



// Global toggle for enabling/disabling dynamic style updates.
// When true, the socket event handler will be bound; when false, it will be unbound.
var globalToggleOnChangeCytoStyle = true;

// Global storage for dynamic Cytoscape style updates.
window.dynamicCytoStyles = new Map();

// Global cache for previous state mappings per use-case.
// Each key (e.g. "interfaceState") maps to an object where keys are "nodeName-endpoint" and values are the monitored value.
window.previousStateByUseCase = {};

// (Optional) Global cache for last known state per endpoint.
window.cachedEndpointStates = {};


// -----------------------------------------------------------------------------
// USE-CASE SPECIFIC MAPPING FUNCTIONS (RULES)
// -----------------------------------------------------------------------------

/**
 * onChangeRuleInterfaceOperState(labData)
 *
 * Monitors interface operational state.
 * Iterates through labData and returns a mapping from "nodeName-endpoint" to "Up" or "Down".
 *
 * @param {object} labData - Raw lab data.
 * @returns {object} Mapping of keys (e.g. "router1-e1-1") to state ("Up" or "Down").
 */
function onChangeRuleInterfaceOperState(labData) {
    const stateMap = {};
    for (const labPath in labData) {
        try {
            const lab = labData[labPath];

            console.log("labName: ", lab.name);


            if (!lab || !Array.isArray(lab.containers)) continue;
            lab.containers.forEach(container => {
                if (typeof container.label !== "string") return;
                // Remove lab-specific prefix; adjust the regex as needed.
                //   const nodeName = container.label.replace(/^clab-.*?-/, '');
                const nodeClabName = container.label

                const getRouterName = (fullString, keyword) =>
                    fullString.split(keyword)[1].replace(/^-/, '');

                nodeName = getRouterName(nodeClabName, lab.name); // Outputs: router1


                console.log("nodeName: ", nodeName);

                if (!Array.isArray(container.interfaces)) return;
                container.interfaces.forEach(iface => {
                    // if (!iface || typeof iface.name !== "string") return;
                    // if (!iface || typeof iface.alias !== "string") return;
                    if (!iface || typeof iface.label !== "string") return; // aarafat-tag: intf.name is replaced with intf.label; why not intf.alias? intf.alias not available when default for interfaceName is used.

                    const description = iface.description || "";
                    const state = description.toUpperCase().includes("UP") ? "Up" : "Down";
                    // const endpoint = iface.name;
                    // const endpoint = iface.alias;
                    const endpoint = iface.label;

                    const key = `${nodeName}::${endpoint}`;
                    stateMap[key] = state;

                    console.log(`managerOnChangeFramework--rule -- Interface-state-for ${key}: ${state}`);

                });
            });
        } catch (err) {
            console.error(`Error processing labPath "${labPath}" in interface state detection:`, err);
        }
    }
    console.log("onChangeRuleInterfaceOperState mapping:", stateMap);
    return stateMap;
}


// -----------------------------------------------------------------------------
// UPDATE HANDLERS (USE-CASE SPECIFIC)
// -----------------------------------------------------------------------------

/**
 * onChangeHandlerInterfaceOperState(updateMessage)
 *
 * Handler for interface operational state changes.
 * Expects an updateMessage with:
 *   - nodeName: string
 *   - endpoint: string
 *   - state: "Up" or "Down"
 *   - [removed]: boolean (optional)
 *
 * It updates the dynamic style of matching edges accordingly.
 *
 * @param {object} updateMessage - The update message.
 */
function onChangeHandlerInterfaceOperState(updateMessage) {
    console.log("managerOnChangeFramework managerOnChangeFramework | handler | received updateMessage:", updateMessage);
    // Example output:
    // {
    //     "nodeName": "router1",
    //     "monitoredObject": "ethernet-1/1",
    //     "state": "Up"
    // }

    const { nodeName, monitoredObject, state, removed } = updateMessage;
    const safeNodeName = typeof CSS !== "undefined" ? CSS.escape(nodeName) : nodeName;
    // const safeEndpoint = typeof CSS !== "undefined" ? CSS.escape(monitoredObject) : monitoredObject;

    const safeEndpoint =
        typeof CSS !== "undefined"
            ? CSS.escape(monitoredObject).replace(/\\\//g, "/")
            : monitoredObject;


    const edgeSelector = `edge[source="${safeNodeName}"][sourceEndpoint="${safeEndpoint}"]`;
    const edges = cy.$(edgeSelector);
    console.log(`managerOnChangeFramework | handler | safeNodeName: ${safeNodeName} \n safeEndpoint: ${safeEndpoint} \n edgeSelector: ${edgeSelector} \n selectedEdges: ${edges}`);
    // Example output:
    // managerOnChangeFramework | handler | safeNodeName: router1 
    // safeEndpoint: ethernet-3\/1 
    // edgeSelector: edge[source="router1"][sourceEndpoint="ethernet-3\/1"] 
    // selectedEdges: 

    edgeCollection = edges
    // Check if any matching edge was found and retrieve its id
    if (edgeCollection.length > 0) {
        // If there's more than one matching edge, you'll need to decide how to handle them.
        const edgeId = edgeCollection[0].id(); // or edgeCollection[0].data('id')
        console.log("edgeId:", edgeId);
    } else {
        console.log(`managerOnChangeFramework | handler | No edge found with source ${safeNodeName} and sourceEndpoint ${safeEndpoint}`);
    }

    if (edges.length > 0) {
        if (removed) {
            edges.forEach(edge => {
                // updateEdgeDynamicStyle(edge.id(), "text-background-color", "#CACBCC");
                // updateEdgeDynamicStyle(edge.id(), "text-background-opacity", "0.7");

                updateEdgeDynamicStyle(edge.id(), "line-color", "#969799");

            });
            console.log(`managerOnChangeFramework | handler | Reverted styles for removed edge(s) matching: ${edgeSelector}`);
        } else {
            const newColor = state === "Up" ? '#00df2b' : '#df2b00';
            edges.forEach(edge => {
                // updateEdgeDynamicStyle(edge.id(), "text-background-color", newColor);
                // updateEdgeDynamicStyle(edge.id(), "text-background-opacity", "0.9");

                updateEdgeDynamicStyle(edge.id(), "line-color", newColor);
            });
            console.log(`managerOnChangeFramework | handler | Updated edge(s) matching ${edgeSelector} with color: ${newColor}`);
        }
    } else {
        console.warn(`managerOnChangeFramework | handler | No edge found matching: ${edgeSelector}`);
    }
}

// -----------------------------------------------------------------------------
// GLOBAL MONITOR CONFIGURATIONS (DRY)
// -----------------------------------------------------------------------------

/**
 * Global monitor configurations.
 * This array defines use-case specific mapping functions (rules) and their corresponding handlers.
 * To add new use cases, simply add another object with:
 *   - useCase: Unique identifier (e.g. "interfaceState").
 *   - mapping: Function that takes labData and returns a mapping (key → value).
 *   - handler: Function that handles update messages when a change is detected.
 *
 * @type {Array<{useCase: string, mapping: function, handler: function}>}
 */
const monitorConfigs = [
    {
        useCase: "interfaceState",
        mapping: onChangeRuleInterfaceOperState,
        handler: onChangeHandlerInterfaceOperState
    }
    // ,
    // {
    //     useCase: "interfaceSpeed",
    //     mapping: onChangeRuleInterfaceSpeed,
    //     handler: onChangeHandlerInterfaceSpeed
    // }
    // Additional use-case configurations can be added here.
];

// -----------------------------------------------------------------------------
// SOCKET.IO EVENT LISTENER (ENTRY POINT)
// -----------------------------------------------------------------------------

/**
 * Listens for raw lab data from the backend on the "clab-tree-provider-data" event.
 * When received, the stateMonitorEngine is invoked with the global monitorConfigs.
 */


// -----------------------------------------------------------------------------
// GENERIC STATE MONITOR ENGINE
// -----------------------------------------------------------------------------

/**
 * stateMonitorEngine(labData, monitorConfigs)
 *
 * Processes raw lab data for each use-case defined in monitorConfigs.
 * It compares the current state mapping (from the mapping function) with the cached state.
 * If differences are found, the corresponding handler is called with an update message.
 *
 * @param {object} labData - Raw lab data from the backend.
 * @param {Array} monitorConfigs - Array of configuration objects, each with:
 *    - useCase {string}: Unique identifier (e.g. "interfaceState").
 *    - mapping {function(labData: object): object}: Returns a mapping from "nodeName-endpoint" to monitored value.
 *    - handler {function(updateMessage: object): void}: Called when a change is detected.
 */
function stateMonitorEngine(labData, monitorConfigs) {
    monitorConfigs.forEach(config => {
        const { useCase, mapping, handler } = config;
        let currentState = {};
        // Step 1: Generate current mapping.
        try {
            currentState = mapping(labData);
        } catch (err) {
            console.error(`Error in mapping for useCase "${useCase}":`, err);
            return; // Skip this use-case if mapping fails.
        }
        // Retrieve previous state for this use-case.
        const prevState = window.previousStateByUseCase[useCase] || {};

        // Step 2: Compare current state with previous state.
        for (const key in currentState) {
            if (prevState[key] !== currentState[key]) {
                const [nodeName, monitoredObject] = key.split("::");
                const updateMessage = { nodeName, monitoredObject, state: currentState[key] };
                console.log(`Detected change for use case "${useCase}":`, updateMessage);
                // Step 3: Call the use-case specific handler.
                handler(updateMessage);
            }
        }
        // Also check for keys that were present before but are now missing.
        for (const key in prevState) {
            if (!(key in currentState)) {
                const [nodeName, monitoredObject] = key.split("::");
                const updateMessage = { nodeName, monitoredObject, removed: true };
                console.log(`Detected removal for use case "${useCase}":`, updateMessage);
                handler(updateMessage);
            }
        }
        // Step 4: Update the cached state.
        window.previousStateByUseCase[useCase] = currentState;
    });
}