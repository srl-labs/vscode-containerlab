export interface ClabInterfaceSnapshotEntry {
  name: string;
  type: string;
  state: string;
  alias: string;
  mac: string;
  mtu: number;
  ifindex: number;
  rxBps?: number;
  rxPps?: number;
  rxBytes?: number;
  rxPackets?: number;
  txBps?: number;
  txPps?: number;
  txBytes?: number;
  txPackets?: number;
  statsIntervalSeconds?: number;
}

export type ClabInterfaceStats = Pick<
  ClabInterfaceSnapshotEntry,
  | "rxBps"
  | "rxPps"
  | "rxBytes"
  | "rxPackets"
  | "txBps"
  | "txPps"
  | "txBytes"
  | "txPackets"
  | "statsIntervalSeconds"
>;

export interface ClabInterfaceSnapshot {
  name: string;
  interfaces: ClabInterfaceSnapshotEntry[];
}
