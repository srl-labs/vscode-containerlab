/**
 * ViewPanels - Renders view-mode panels (info panels, shortcuts, about, find, export)
 *
 * Uses React.ComponentProps to match actual component prop types.
 */
import React from "react";

import { NodeInfoPanel } from "./NodeInfoPanel";
import { LinkInfoPanel } from "./LinkInfoPanel";
import { SvgExportPanel } from "./SvgExportPanel";
import { LinkImpairmentPanel } from "./link-impairment/LinkImpairmentPanel";

/** Props passed directly to each panel */
type NodeInfoProps = React.ComponentProps<typeof NodeInfoPanel>;
type LinkInfoProps = React.ComponentProps<typeof LinkInfoPanel>;
type LinkImpairmentProps = React.ComponentProps<typeof LinkImpairmentPanel>;
type SvgExportProps = React.ComponentProps<typeof SvgExportPanel>;

export interface ViewPanelsProps {
  nodeInfo: NodeInfoProps;
  linkInfo: LinkInfoProps;
  linkImpairment: LinkImpairmentProps;
  svgExport: SvgExportProps;
}

/**
 * Renders view-mode info panels and utility panels
 */
export const ViewPanels: React.FC<ViewPanelsProps> = ({
  nodeInfo,
  linkInfo,
  linkImpairment,
  svgExport
}) => {
  return (
    <>
      <NodeInfoPanel {...nodeInfo} />
      <LinkInfoPanel {...linkInfo} />
      <LinkImpairmentPanel {...linkImpairment} />
      <SvgExportPanel {...svgExport} />
    </>
  );
};
