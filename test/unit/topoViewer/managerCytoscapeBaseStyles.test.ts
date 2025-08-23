/* eslint-env mocha */
/* global describe, it, before, beforeEach, after, global */
import { expect } from 'chai';
import { getCytoscapeStyles, extractNodeIcons } from '../../../src/topoViewer/webview-ui/managerCytoscapeBaseStyles';

describe('managerCytoscapeBaseStyles', () => {
  let originalWindow: any;
  let originalDocument: any;

  before(() => {
    // Save original values
    originalWindow = (global as any).window;
    originalDocument = (global as any).document;
  });

  beforeEach(() => {
    // Set up mocks before each test
    (global as any).window = {
      getComputedStyle: () => ({
        getPropertyValue: (prop: string) => {
          const values: Record<string, string> = {
            '--vscode-focusBorder': '#007acc',
            '--vscode-list-focusBackground': '#073655',
          };
          return values[prop] || '';
        },
      }),
    };

    (global as any).document = {
      documentElement: {},
    };
  });

  after(() => {
    // Restore original values
    (global as any).window = originalWindow;
    (global as any).document = originalDocument;
  });

  it('applies group styling based on theme', () => {
    const light = getCytoscapeStyles('light');
    const dark = getCytoscapeStyles('dark');
    const lightGroup = light.find((s: any) => s.selector === 'node[topoViewerRole="group"]');
    const darkGroup = dark.find((s: any) => s.selector === 'node[topoViewerRole="group"]');
    expect(lightGroup?.style['background-color']).to.equal('#a6a6a6');
    expect(lightGroup?.style['background-opacity']).to.equal('0.4');
    expect(darkGroup?.style['background-color']).to.equal('#d9d9d9');
    expect(darkGroup?.style['background-opacity']).to.equal('0.2');
  });

  it('extracts node icons excluding special roles', () => {
    const icons = extractNodeIcons();
    expect(icons).to.include('router');
    expect(icons).to.include('pe');
    expect(icons).to.not.include('group');
  });
});
