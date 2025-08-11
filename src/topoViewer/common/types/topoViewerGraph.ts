export interface ContainerDockerExtraAttribute {
  state?: string;
  status?: string;
}

export interface NodeExtraData {
  kind?: string;
  image?: string;
  type?: string;
  longname?: string;
  mgmtIpv4Address?: string;
}

export interface NodeData {
  id: string;
  editor?: string;
  weight?: string;
  name?: string;
  parent?: string;
  topoViewerRole?: string;
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
