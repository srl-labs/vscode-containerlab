/**
 * EditorPanels - Renders all editor panels (node, link, network, annotations, etc.)
 *
 * Uses React.ComponentProps to match actual component prop types.
 */
import React from 'react';

import {
  NodeEditorPanel,
  NetworkEditorPanel,
  LinkEditorPanel,
  BulkLinkPanel,
  FreeTextEditorPanel,
  FreeShapeEditorPanel,
  GroupEditorPanel,
  LabSettingsPanel
} from './panels';

/** Props passed directly to each panel */
type NodeEditorProps = React.ComponentProps<typeof NodeEditorPanel>;
type NetworkEditorProps = React.ComponentProps<typeof NetworkEditorPanel>;
type LinkEditorProps = React.ComponentProps<typeof LinkEditorPanel>;
type BulkLinkProps = React.ComponentProps<typeof BulkLinkPanel>;
type FreeTextEditorProps = React.ComponentProps<typeof FreeTextEditorPanel>;
type FreeShapeEditorProps = React.ComponentProps<typeof FreeShapeEditorPanel>;
type GroupEditorProps = React.ComponentProps<typeof GroupEditorPanel>;
type LabSettingsProps = React.ComponentProps<typeof LabSettingsPanel>;

export interface EditorPanelsProps {
  nodeEditor: NodeEditorProps;
  networkEditor: NetworkEditorProps;
  customTemplateEditor: NodeEditorProps;
  linkEditor: LinkEditorProps;
  bulkLink: BulkLinkProps;
  freeTextEditor: FreeTextEditorProps;
  freeShapeEditor: FreeShapeEditorProps;
  groupEditor: GroupEditorProps;
  labSettings: LabSettingsProps;
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
  groupEditor,
  labSettings
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
      <LabSettingsPanel {...labSettings} />
    </>
  );
};
