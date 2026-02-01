import type { NetemState as _NetemState } from "../../../../shared/parsing";
import type { LinkData } from "../../../hooks/ui";

export type NetemState = _NetemState;

export interface EndpointWithNetem {
  node?: string;
  iface?: string;
  netem?: NetemState;
}

export type LinkImpairmentTabId = "source" | "target";

export type LinkImpairmentData = LinkData & {
  sourceNetem?: NetemState;
  targetNetem?: NetemState;
  extraData?: {
    clabSourceNetem?: NetemState;
    clabSourceLongName?: string;
    clabTargetNetem?: NetemState;
    clabTargetLongName?: string;
    [key: string]: unknown;
  };
};
