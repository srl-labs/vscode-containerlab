export interface ContainerDockerExtraAttribute {
  state?: string;
  status?: string;
}

export interface NodeExtraData {
  // Basic properties
  kind?: string;
  image?: string;
  type?: string;
  longname?: string;
  mgmtIpv4Address?: string;
  networkInterface?: string;
  interfacePattern?: string;
  fromCustomTemplate?: boolean;
  editingCustomNodeName?: string;

  // Configuration properties
  license?: string;
  'startup-config'?: string;
  'enforce-startup-config'?: boolean;
  'suppress-startup-config'?: boolean;
  binds?: string[];
  env?: Record<string, string>;
  'env-files'?: string[];
  labels?: Record<string, string>;

  // Runtime properties
  user?: string;
  entrypoint?: string;
  cmd?: string;
  exec?: string[];
  'restart-policy'?: 'no' | 'on-failure' | 'always' | 'unless-stopped';
  'auto-remove'?: boolean;
  'startup-delay'?: number;

  // Network properties
  'mgmt-ipv4'?: string;
  'mgmt-ipv6'?: string;
  'network-mode'?: string;
  ports?: string[];
  dns?: {
    servers?: string[];
    search?: string[];
    options?: string[];
  };
  aliases?: string[];
  extHostInterface?: string;
  extRemote?: string;
  extVni?: number;
  extUdpPort?: number;

  // Advanced properties
  memory?: string;
  cpu?: number;
  'cpu-set'?: string;
  'shm-size'?: string;
  'cap-add'?: string[];
  sysctls?: Record<string, string | number>;
  devices?: string[];
  certificate?: {
    issue?: boolean;
    'key-size'?: number;
    'validity-duration'?: string;
    sans?: string[];
  };
  healthcheck?: {
    test?: string[];
    'start-period'?: number;
    interval?: number;
    timeout?: number;
    retries?: number;
  };
  'image-pull-policy'?: 'IfNotPresent' | 'Never' | 'Always';
  runtime?: 'docker' | 'podman' | 'ignite';

  // Stages (for dependencies)
  stages?: {
    [key: string]: {
      'wait-for'?: Array<{
        node: string;
        stage: string;
      }>;
      exec?: Array<{
        command: string;
        target?: 'container' | 'host';
        phase?: 'on-enter' | 'on-exit';
      }>;
    };
  };
}

export interface NodeData {
  id: string;
  editor?: string;
  weight?: string;
  name?: string;
  parent?: string;
  topoViewerRole?: string;
  iconColor?: string;
  iconCornerRadius?: number;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  containerDockerExtraAttribute?: ContainerDockerExtraAttribute;
  extraData?: NodeExtraData;
}

export interface ParentNodeExtraData extends NodeExtraData {
  clabServerUsername: string;
  weight: string;
  name: string;
  topoViewerGroup: string;
  topoViewerGroupLevel: string;
}

export interface ParentNodeData extends NodeData {
  name: string;
  weight: string;
  topoViewerRole: string;
  extraData: ParentNodeExtraData;
  parent?: string;
}

export interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  editor?: string;
}

export interface FreeTextAnnotation {
  id: string;
  text: string;
  position: {
    x: number;
    y: number;
  };
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  fontFamily?: string;
  width?: number;
  height?: number;
  zIndex?: number;
}

export interface GroupStyleAnnotation {
  id: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dotted' | 'dashed' | 'double';
  borderRadius?: number;
  color?: string;
  labelPosition?: string;
}

export interface CloudNodeAnnotation {
  id: string;
  type: 'host' | 'mgmt-net' | 'macvlan';
  label: string;
  position: {
    x: number;
    y: number;
  };
  group?: string;
  level?: string;
}

export interface NodeAnnotation {
  id: string;
  // Display label for the node (used by alias visuals)
  label?: string;
  // Provenance for copy/paste: the source node/annotation id this node was copied from (one-hop)
  // Does not affect wiring or edge rewrites
  copyFrom?: string;
  // If this is a visual alias node, yamlNodeId links back to the underlying YAML node id (e.g., 'bridge1').
  yamlNodeId?: string;
  // If this is a visual alias node, yamlInterface is the interface on the YAML node (e.g., 'eth1').
  yamlInterface?: string;
  position?: {
    x: number;
    y: number;
  };
  geoCoordinates?: {
    lat: number;
    lng: number;
  };
  icon?: string;
  iconColor?: string;
  iconCornerRadius?: number;
  groupLabelPos?: string;
  group?: string;
  level?: string;
}

export interface TopologyAnnotations {
  freeTextAnnotations?: FreeTextAnnotation[];
  groupStyleAnnotations?: GroupStyleAnnotation[];
  cloudNodeAnnotations?: CloudNodeAnnotation[];
  nodeAnnotations?: NodeAnnotation[];
  // Mapping from YAML node + interface to a visual alias node id
  aliasEndpointAnnotations?: AliasEndpointAnnotation[];
  // Optional viewer-level settings persisted alongside annotations
  viewerSettings?: {
    gridLineWidth?: number;
  };
}

export interface AliasEndpointAnnotation {
  yamlNodeId: string;
  interface: string;
  aliasNodeId: string;
}
