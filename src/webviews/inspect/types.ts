export interface ContainerPort {
  port: string | number;
  protocol: string;
}

export interface ContainerLabels {
  containerlab?: string;
  "clab-topo-file"?: string;
  "clab-node-longname"?: string;
  "clab-node-kind"?: string;
  "clab-node-type"?: string;
  "clab-owner"?: string;
  [key: string]: string | undefined;
}

export interface ContainerNetworkSettings {
  IPv4addr?: string;
  IPv6addr?: string;
  ipv4_address?: string;
  ipv6_address?: string;
}

export interface InspectContainerData {
  "topo-file"?: string;
  name?: string;
  lab_name?: string;
  labPath?: string;
  state?: string;
  kind?: string;
  node_type?: string;
  image?: string;
  network_name?: string;
  status?: string;
  ipv4_address?: string;
  ipv6_address?: string;
  id?: string;
  container_id?: string;
  Ports?: ContainerPort[];
  Names?: string[];
  State?: string;
  Image?: string;
  NetworkName?: string;
  Status?: string;
  ID?: string;
  ShortID?: string;
  Pid?: number;
  Labels?: ContainerLabels;
  NetworkSettings?: ContainerNetworkSettings;
}

export interface InspectWebviewInitialData {
  containers: InspectContainerData[];
}
