const { TopoViewerAdaptorClab } = require('./out/src/topoViewer/core/topoViewerAdaptorClab.js');

(async () => {
  const adaptor = new TopoViewerAdaptorClab();
  const yaml = [
    'name: a',
    'topology:',
    '  nodes:',
    '    n1: {}',
    '  links:',
    '    - endpoints: [ "dummy:eth0", "n1:eth1" ]',
    ''
  ].join('\n');
  const els = await adaptor.clabYamlToCytoscapeElementsEditor(yaml);
  const edge = els.find(e => e.group === 'edges');
  const node = els.find(e => e.group === 'nodes' && String(e.data.id || '').startsWith('dummy:'));
  const out = {
    edgeSource: edge?.data?.source,
    edgeTarget: edge?.data?.target,
    sourceEndpoint: edge?.data?.sourceEndpoint,
    targetEndpoint: edge?.data?.targetEndpoint,
    hasStubClass: (edge?.classes || '').includes('stub-link'),
    specialNodeId: node?.data?.id,
    edgeClass: edge?.classes,
  };
  console.log(JSON.stringify(out, null, 2));
})();
