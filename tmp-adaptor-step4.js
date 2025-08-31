const { TopoViewerAdaptorClab } = require('./out/src/topoViewer/core/topoViewerAdaptorClab.js');

async function run(yaml, label){
  const adaptor = new TopoViewerAdaptorClab();
  const els = await adaptor.clabYamlToCytoscapeElementsEditor(yaml);
  const clouds = els.filter(e=>e.group==='nodes' && e.classes.includes('special-endpoint'));
  const edges = els.filter(e=>e.group==='edges');
  const cloudIds = clouds.map(c=>c.data.id).sort();
  const dummyClouds = cloudIds.filter(id=>String(id).startsWith('dummy:'));
  const out = {
    label,
    cloudCount: clouds.length,
    dummyClouds,
    edgeCount: edges.length,
    firstEdge: edges[0]?.data,
    classes: edges[0]?.classes || ''
  };
  console.log(JSON.stringify(out, null, 2));
}

(async () => {
  const yamlShort = [
    'name: a',
    'topology:',
    '  nodes:',
    '    n1: {}',
    '  links:',
    '    - endpoints: [ "dummy:eth0", "n1:eth1" ]',
    ''
  ].join('\n');

  const yamlExtended = [
    'name: a',
    'topology:',
    '  nodes:',
    '    n1: {}',
    '  links:',
    '    - type: dummy',
    '      endpoint:',
    '        node: n1',
    '        interface: eth1',
    '      mtu: 1600',
    ''
  ].join('\n');

  await run(yamlShort, 'short');
  await run(yamlExtended, 'extended');
})();
