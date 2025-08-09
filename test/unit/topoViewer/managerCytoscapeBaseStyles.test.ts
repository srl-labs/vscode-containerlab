/* eslint-env mocha */
/* global describe, it */
import { expect } from 'chai';
import { getCytoscapeStyles, extractNodeIcons } from '../../../src/topoViewer/common/webview-ui/managerCytoscapeBaseStyles';

describe('managerCytoscapeBaseStyles', () => {
  it('applies group styling based on theme', () => {
    const light = getCytoscapeStyles('light');
    const dark = getCytoscapeStyles('dark');
    const lightGroup = light.find(s => s.selector === 'node[topoViewerRole="group"]');
    const darkGroup = dark.find(s => s.selector === 'node[topoViewerRole="group"]');
    expect(lightGroup?.style['background-color']).to.equal('#a6a6a6');
    expect(lightGroup?.style['background-opacity']).to.equal('0.4');
    expect(darkGroup?.style['background-color']).to.equal('#d9d9d9');
    expect(darkGroup?.style['background-opacity']).to.equal('0.2');
  });

  it('extracts node icons excluding special roles', () => {
    const icons = extractNodeIcons();
    expect(icons).to.include('router');
    expect(icons).to.include('pe');
    expect(icons).to.not.include('dummyChild');
    expect(icons).to.not.include('group');
  });
});
