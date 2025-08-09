import * as fs from 'fs';
import * as YAML from 'yaml';
import { log } from '../../common/backend/logger';

/**
 * Save only the viewport positions and group information to the YAML file.
 * This is used in view mode to update graph-* labels without modifying the topology structure.
 *
 * @param yamlFilePath - Path to the YAML file to update
 * @param payload - JSON string containing the updated node positions
 */
export async function saveViewportPositions(
  yamlFilePath: string,
  payload: string
): Promise<void> {
  const payloadParsed: any[] = JSON.parse(payload);

  // Read the existing YAML file
  const yamlContent = await fs.promises.readFile(yamlFilePath, 'utf8');
  const doc = YAML.parseDocument(yamlContent);

  if (!doc) {
    throw new Error('Failed to parse YAML document');
  }

  // Get the nodes section
  const nodesMaybe = doc.getIn(['topology', 'nodes'], true);
  if (!YAML.isMap(nodesMaybe)) {
    throw new Error('YAML topology nodes is not a map');
  }
  const yamlNodes: YAML.YAMLMap = nodesMaybe;

  // Process only node positions and groups
  payloadParsed
    .filter(el => el.group === 'nodes' && el.data.topoViewerRole !== 'group')
    .forEach(element => {
      const nodeId: string = element.data.id;
      const nodeYaml = yamlNodes.get(nodeId, true) as YAML.YAMLMap | undefined;

      if (!nodeYaml) {
        // Node doesn't exist in YAML, skip it
        log.warn(`Node ${nodeId} not found in YAML, skipping`);
        return;
      }

      // Get or create labels section
      let labels = nodeYaml.get('labels', true) as YAML.YAMLMap | undefined;
      if (!labels || !YAML.isMap(labels)) {
        labels = new YAML.YAMLMap();
        nodeYaml.set('labels', labels);
      }

      // Update only graph-related labels
      const x = element.position?.x || 0;
      const y = element.position?.y || 0;

      // Update position
      labels.set('graph-posX', doc.createNode(Math.round(x).toString()));
      labels.set('graph-posY', doc.createNode(Math.round(y).toString()));

      // Update icon if provided
      if (element.data.topoViewerRole) {
        labels.set('graph-icon', doc.createNode(element.data.topoViewerRole));
      }

      // Update group information
      const parent = element.parent;
      if (parent) {
        const parts = parent.split(':');
        if (parts.length >= 2) {
          labels.set('graph-group', doc.createNode(parts[0]));
          labels.set('graph-level', doc.createNode(parts[1]));
        }
      } else {
        // Remove group labels if node is not in a group
        labels.delete('graph-group');
        labels.delete('graph-level');
      }

      // Update group label position
      const groupLabelPos = element.data.groupLabelPos;
      if (groupLabelPos) {
        labels.set('graph-groupLabelPos', doc.createNode(groupLabelPos));
      }
    });

  // Write the updated YAML back to file
  const updatedYamlString = doc.toString();
  await fs.promises.writeFile(yamlFilePath, updatedYamlString, 'utf8');

  log.info('Saved viewport positions and groups successfully');
  log.info(`Updated file: ${yamlFilePath}`);
}