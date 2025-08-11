/* eslint-env mocha */
/* global describe, it */
import { expect } from 'chai';
import { generateEncodedSVG, NodeType } from '../../../src/topoViewer/common/webview-ui/managerSvgGenerator';

describe('generateEncodedSVG', () => {
  const nodeTypes: NodeType[] = [
    'pe',
    'dcgw',
    'leaf',
    'switch',
    'spine',
    'super-spine',
    'server',
    'pon',
    'controller',
    'rgw',
    'ue',
    'cloud',
    'client',
    'bridge'
  ];

  it('returns encoded data URI containing color for all node types', () => {
    for (const type of nodeTypes) {
      const color = '#123456';
      const uri = generateEncodedSVG(type, color);
      expect(uri.startsWith('data:image/svg+xml;utf8,')).to.be.true;
      const decoded = decodeURIComponent(uri.replace('data:image/svg+xml;utf8,', ''));
      expect(decoded).to.contain(color);
    }
  });

  it('falls back to pe icon for unknown node type', () => {
    const color = '#abcdef';
    const unknown = generateEncodedSVG('unknown' as NodeType, color);
    const pe = generateEncodedSVG('pe', color);
    expect(unknown).to.equal(pe);
  });
});
