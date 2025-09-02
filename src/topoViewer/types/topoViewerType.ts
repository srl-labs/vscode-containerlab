// file: src/types/topoViewerType.ts


/**
 * Represents a Containerlab node definition as specified in the YAML configuration.
 */
export interface ClabNode {
    kind?: string;
    image?: string;
    type?: string;
    group?: string;
    labels?: Record<string, any>;
}

/**
 * Represents a Containerlab link definition as specified in the YAML configuration.
 */
export interface ClabLinkEndpointMap {
    node: string;
    interface?: string;
    mac?: string;
}

export interface ClabLink {
    // Short format
    endpoints?: (string | ClabLinkEndpointMap)[];
    // Extended single-endpoint
    endpoint?: ClabLinkEndpointMap;
    // Extended common
    type?: 'veth' | 'host' | 'mgmt-net' | 'macvlan' | 'dummy' | 'vxlan' | 'vxlan-stitch' | string;
    mtu?: number | string;
    vars?: any;
    labels?: any;
    // Per-type fields
    'host-interface'?: string;
    mode?: string;
    remote?: string;
    vni?: number | string;
    'udp-port'?: number | string;
}

/**
 * Represents the main Containerlab topology structure as defined in the YAML configuration.
 */
export interface ClabTopology {
    name?: string
    prefix?: string;
    topology?: {
        defaults?: ClabNode;
        kinds?: Record<string, ClabNode>;
        groups?: Record<string, ClabNode>;
        nodes?: Record<string, ClabNode>;
        links?: ClabLink[];
    };
}

/**
 * Represents a single Cytoscape element, either a node or an edge.
 */
export interface CyElement {
    group: 'nodes' | 'edges';
    data: Record<string, any>;
    position?: { x: number; y: number };
    removed?: boolean;
    selected?: boolean;
    selectable?: boolean;
    locked?: boolean;
    grabbed?: boolean;
    grabbable?: boolean;
    classes?: string;
}

/**
 * Represents the overall Cytoscape topology as an array of elements.
 */
export type CytoTopology = CyElement[];

/**
 * Represents the structure of the environment.json configuration file.
 */
export interface EnvironmentJson {
    workingDirectory: string;
    clabPrefix: string;
    clabName: string;
    clabServerAddress: string;
    clabAllowedHostname: string;
    clabAllowedHostname01: string;
    clabServerPort: string;
    deploymentType: string;
    topoviewerVersion: string;
    topviewerPresetLayout: string
    envCyTopoJsonBytes: CytoTopology | '';
}


// /**
//  * Represents CytoPosition for preset layout
//  */
// export interface CytoViewportSaveItem {
//     data: { id: string };
//     position: { x: number; y: number };
//   }
