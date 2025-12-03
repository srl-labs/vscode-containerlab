/* eslint-env mocha */
import { describe, it } from 'mocha';
import { expect } from 'chai';
import cytoscape from 'cytoscape';
import { ManagerGroupManagement } from '../../../src/topoViewer/webview/features/groups/GroupManager';
import { ManagerGroupStyle } from '../../../src/topoViewer/webview/features/groups/GroupStyleManager';

// ensure window is available for global assignments
(globalThis as any).window = globalThis;

describe('ManagerGroupManagement remember style', () => {
  it('applies last used style to new groups', () => {
    const cy = cytoscape({ headless: true });
    const messageSender = { sendMessageToVscodeEndpointPost: async () => ({}) } as any;
    const styleManager = new ManagerGroupStyle(cy, messageSender);
    const mgr = new ManagerGroupManagement(cy, styleManager, 'edit');

    const firstId = mgr.createNewParent();
    styleManager.updateGroupStyle(firstId, {
      id: firstId,
      backgroundColor: '#ff0000',
      backgroundOpacity: 50,
      borderColor: '#00ff00',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: 5,
      color: '#123456',
      labelPosition: 'bottom-left'
    });

    const secondId = mgr.createNewParent();
    const secondStyle = styleManager.getStyle(secondId);
    expect(secondStyle).to.include({
      backgroundColor: '#ff0000',
      backgroundOpacity: 50,
      borderColor: '#00ff00',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: 5,
      color: '#123456',
      labelPosition: 'bottom-left'
    });
  });
});
