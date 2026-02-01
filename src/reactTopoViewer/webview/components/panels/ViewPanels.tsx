/**
 * ViewPanels - Renders view-mode panels (info panels, shortcuts, about, find, export)
 *
 * Uses React.ComponentProps to match actual component prop types.
 */
import React from "react";

import { NodeInfoPanel } from "./NodeInfoPanel";
import { LinkInfoPanel } from "./LinkInfoPanel";
import { ShortcutsPanel } from "./ShortcutsPanel";
import { AboutPanel } from "./AboutPanel";
import { FindNodePanel } from "./FindNodePanel";
import { SvgExportPanel } from "./SvgExportPanel";
import { LinkImpairmentPanel } from "./link-impairment/LinkImpairmentPanel";

/** Props passed directly to each panel */
type NodeInfoProps = React.ComponentProps<typeof NodeInfoPanel>;
type LinkInfoProps = React.ComponentProps<typeof LinkInfoPanel>;
type LinkImpairmentProps = React.ComponentProps<typeof LinkImpairmentPanel>;
type ShortcutsProps = React.ComponentProps<typeof ShortcutsPanel>;
type AboutProps = React.ComponentProps<typeof AboutPanel>;
type FindNodeProps = React.ComponentProps<typeof FindNodePanel>;
type SvgExportProps = React.ComponentProps<typeof SvgExportPanel>;

export interface ViewPanelsProps {
  nodeInfo: NodeInfoProps;
  linkInfo: LinkInfoProps;
  linkImpairment: LinkImpairmentProps;
  shortcuts: ShortcutsProps;
  about: AboutProps;
  findNode: FindNodeProps;
  svgExport: SvgExportProps;
}

/**
 * Renders view-mode info panels and utility panels
 */
export const ViewPanels: React.FC<ViewPanelsProps> = ({
  nodeInfo,
  linkInfo,
  linkImpairment,
  shortcuts,
  about,
  findNode,
  svgExport
}) => {
  return (
    <>
      <NodeInfoPanel {...nodeInfo} />
      <LinkInfoPanel {...linkInfo} />
      <LinkImpairmentPanel {...linkImpairment} />
      <ShortcutsPanel {...shortcuts} />
      <AboutPanel {...about} />
      <FindNodePanel {...findNode} />
      <SvgExportPanel {...svgExport} />
    </>
  );
};
