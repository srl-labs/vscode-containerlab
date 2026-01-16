import type { LinkData } from "../../../hooks/useAppState";

export interface NetemState {
  delay?: string;
  jitter?: string;
  loss?: string;
  rate?: string;
  corruption?: string;
}

export interface EndpointNetemData {
  node: string;
  interface: string;
  netem: NetemState;
}

export type LinkImpairmentData = LinkData & {
  endpointA?: EndpointNetemData;
  endpointB?: EndpointNetemData;
  extraData?: {
    clabSourceNetem?: NetemState;
    clabTargetNetem?: NetemState;
    [key: string]: unknown;
  };
};

export interface LinkImpairmentPanelProps {
  isVisible: boolean;
  linkData: LinkImpairmentData | null;
  onClose: () => void;
}
