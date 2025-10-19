export interface ClabInterfaceSnapshotEntry {
    name: string;
    type: string;
    state: string;
    alias: string;
    mac: string;
    mtu: number;
    ifindex: number;
}

export interface ClabInterfaceSnapshot {
    name: string;
    interfaces: ClabInterfaceSnapshotEntry[];
}

