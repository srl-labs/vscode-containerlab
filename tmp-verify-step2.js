const fs = require('fs');
const YAML = require('./node_modules/yaml');
const { saveViewport } = require('./out/src/topoViewer/utilities/saveViewport.js');

function simpleCanonicalFromYamlLink(map) {
  const type = map.get('type', true);
  if (!type) {
    const eps = map.get('endpoints', true);
    if (YAML.isSeq(eps) && eps.items.length >= 2) {
      const epA = String((eps.items[0].value ?? eps.items[0]));
      const epB = String((eps.items[1].value ?? eps.items[1]));
      const [a, b] = [epA, epB];
      const aIsSpecial = a.startsWith('host:')||a.startsWith('mgmt-net:')||a.startsWith('macvlan:')||a.startsWith('vxlan:')||a.startsWith('vxlan-stitch:')||a.startsWith('dummy:')||a.startsWith('bridge:')||a.startsWith('ovs-bridge:');
      const bIsSpecial = b.startsWith('host:')||b.startsWith('mgmt-net:')||b.startsWith('macvlan:')||b.startsWith('vxlan:')||b.startsWith('vxlan-stitch:')||b.startsWith('dummy:')||b.startsWith('bridge:')||b.startsWith('ovs-bridge:');
      if (aIsSpecial !== bIsSpecial) {
        const special = aIsSpecial ? a : b;
        const nonSpecial = aIsSpecial ? b : a;
        let t = 'unknown';
        if (special === 'host') t = 'host';
        else if (special === 'mgmt-net') t = 'mgmt-net';
        else if (special.startsWith('macvlan:')) t = 'macvlan';
        else if (special.startsWith('vxlan-stitch:')) t = 'vxlan-stitch';
        else if (special.startsWith('vxlan:')) t = 'vxlan';
        else if (special === 'dummy' || special.startsWith('dummy:')) t = 'dummy';
        return `${t}|${nonSpecial}`;
      }
      const [first, second] = a < b ? [a, b] : [b, a];
      return `veth|${first}|${second}`;
    }
  }
  return 'unparsed';
}

(async () => {
  const yamlPath = 'tmp-step2.yml';
  const yamlContent = [
    'name: step2',
    'topology:',
    '  nodes:',
    '    leaf1: {}',
    '  links: []',
    ''
  ].join('\n');
  fs.writeFileSync(yamlPath, yamlContent, 'utf8');

  const payload = JSON.stringify([
    { group: 'nodes', data: { id: 'leaf1', name: 'leaf1' } },
    { group: 'edges', data: { source: 'dummy:eth0', target: 'leaf1', targetEndpoint: 'eth1' } }
  ]);

  const doc = YAML.parseDocument(fs.readFileSync(yamlPath, 'utf8'));
  const adaptor = { currentClabDoc: doc };

  await saveViewport({ mode: 'edit', yamlFilePath: yamlPath, payload, adaptor });

  const updated = fs.readFileSync(yamlPath, 'utf8');
  console.log('--- Updated YAML ---');
  console.log(updated);
  const parsed = YAML.parseDocument(updated);
  const links = parsed.getIn(['topology','links'], true);
  const first = links.items[0];
  const key = simpleCanonicalFromYamlLink(first);
  console.log('canonical key:', key);
})();
