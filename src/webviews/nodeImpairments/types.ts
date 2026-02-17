export interface NetemFields {
  delay: string;
  jitter: string;
  loss: string;
  rate: string;
  corruption: string;
}

export type NetemDataMap = Record<string, NetemFields>;

export interface NodeImpairmentsInitialData {
  nodeName: string;
  interfacesData: NetemDataMap;
}
