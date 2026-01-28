/**
 * ViewPanels - Renders view-mode panels (info panels, shortcuts, about, find, export)
 *
 * Uses React.ComponentProps to match actual component prop types.
 */
import React from "react";

import {
  NodeInfoPanel,
  LinkInfoPanel,
  ShortcutsPanel,
  AboutPanel,
  FindNodePanel,
  SvgExportPanel
} from "./panels";

/** Props passed directly to each panel */
type NodeInfoProps = React.ComponentProps<typeof NodeInfoPanel>;
type LinkInfoProps = React.ComponentProps<typeof LinkInfoPanel>;
type ShortcutsProps = React.ComponentProps<typeof ShortcutsPanel>;
type AboutProps = React.ComponentProps<typeof AboutPanel>;
type FindNodeProps = React.ComponentProps<typeof FindNodePanel>;
type SvgExportProps = React.ComponentProps<typeof SvgExportPanel>;

export interface ViewPanelsProps {
  nodeInfo: NodeInfoProps;
  linkInfo: LinkInfoProps;
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
  shortcuts,
  about,
  findNode,
  svgExport
}) => {
  return (
    <>
      <NodeInfoPanel {...nodeInfo} />
      <LinkInfoPanel {...linkInfo} />
      <ShortcutsPanel {...shortcuts} />
      <AboutPanel {...about} />
      <FindNodePanel {...findNode} />
      <SvgExportPanel {...svgExport} />
    </>
  );
};
