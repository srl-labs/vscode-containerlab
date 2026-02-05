/**
 * EditorPanels - Renders all editor panels (node, link, network, annotations, etc.)
 *
 * Uses React.ComponentProps to match actual component prop types.
 */
import React from "react";

import { NodeEditorPanel } from "./node-editor";
import { NetworkEditorPanel } from "./network-editor";
import { LinkEditorPanel } from "./link-editor";
import { BulkLinkPanel } from "./bulk-link";
import { FreeTextEditorPanel } from "./free-text-editor";
import { FreeShapeEditorPanel } from "./free-shape-editor";
import { GroupEditorPanel } from "./group-editor";

/** Props passed directly to each panel */
type NodeEditorProps = React.ComponentProps<typeof NodeEditorPanel>;
type NetworkEditorProps = React.ComponentProps<typeof NetworkEditorPanel>;
type LinkEditorProps = React.ComponentProps<typeof LinkEditorPanel>;
type BulkLinkProps = React.ComponentProps<typeof BulkLinkPanel>;
type FreeTextEditorProps = React.ComponentProps<typeof FreeTextEditorPanel>;
type FreeShapeEditorProps = React.ComponentProps<typeof FreeShapeEditorPanel>;
type GroupEditorProps = React.ComponentProps<typeof GroupEditorPanel>;

export interface EditorPanelsProps {
  nodeEditor: NodeEditorProps;
  networkEditor: NetworkEditorProps;
  customTemplateEditor: NodeEditorProps;
  linkEditor: LinkEditorProps;
  bulkLink: BulkLinkProps;
  freeTextEditor: FreeTextEditorProps;
  freeShapeEditor: FreeShapeEditorProps;
  groupEditor: GroupEditorProps;
}

/**
 * Renders all editor panels
 */
export const EditorPanels: React.FC<EditorPanelsProps> = ({
  nodeEditor,
  networkEditor,
  customTemplateEditor,
  linkEditor,
  bulkLink,
  freeTextEditor,
  freeShapeEditor,
  groupEditor
}) => {
  return (
    <>
      <NodeEditorPanel {...nodeEditor} />
      <NetworkEditorPanel {...networkEditor} />
      <NodeEditorPanel {...customTemplateEditor} />
      <LinkEditorPanel {...linkEditor} />
      <BulkLinkPanel {...bulkLink} />
      <FreeTextEditorPanel {...freeTextEditor} />
      <FreeShapeEditorPanel {...freeShapeEditor} />
      <GroupEditorPanel {...groupEditor} />
    </>
  );
};
