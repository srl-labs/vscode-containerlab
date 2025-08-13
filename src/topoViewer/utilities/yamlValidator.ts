import * as vscode from 'vscode';
import * as YAML from 'yaml';

import { log } from '../logging/logger';

export async function validateYamlContent(_context: vscode.ExtensionContext, yamlContent: string): Promise<boolean> {
  try {
    // Parse YAML first to check basic syntax
    const yamlObj = YAML.parse(yamlContent);

    // Basic structure validation - only check for essential fields
    if (!yamlObj || typeof yamlObj !== 'object') {
      vscode.window.showErrorMessage('Invalid YAML: Content must be an object');
      log.error('Invalid YAML: Content must be an object');
      return false;
    }

    // Only require 'name' field to exist
    if (!yamlObj.name || typeof yamlObj.name !== 'string' || yamlObj.name.trim() === '') {
      vscode.window.showErrorMessage('Invalid Containerlab YAML: "name" field is required and cannot be empty');
      log.error('Invalid Containerlab YAML: "name" field is required and cannot be empty');
      return false;
    }

    // Topology section is optional, but if present, should be an object
    if (yamlObj.topology && typeof yamlObj.topology !== 'object') {
      vscode.window.showErrorMessage('Invalid Containerlab YAML: "topology" must be an object if present');
      log.error('Invalid Containerlab YAML: "topology" must be an object if present');
      return false;
    }

    // Nodes section is optional within topology - can be empty object or missing
    if (yamlObj.topology?.nodes !== undefined &&
        (yamlObj.topology.nodes === null ||
         (typeof yamlObj.topology.nodes !== 'object') ||
         Array.isArray(yamlObj.topology.nodes))) {
      vscode.window.showErrorMessage('Invalid Containerlab YAML: "topology.nodes" must be an object if present');
      log.error('Invalid Containerlab YAML: "topology.nodes" must be an object if present');
      return false;
    }

    // Links section is optional within topology - allow missing or empty
    if (yamlObj.topology?.links && !Array.isArray(yamlObj.topology.links)) {
      vscode.window.showErrorMessage('Invalid Containerlab YAML: "topology.links" must be an array if present');
      log.error('Invalid Containerlab YAML: "topology.links" must be an array if present');
      return false;
    }

    // Validate individual nodes if they exist - be flexible about missing fields
    if (yamlObj.topology?.nodes && Object.keys(yamlObj.topology.nodes).length > 0) {
      for (const [nodeName, nodeData] of Object.entries(yamlObj.topology.nodes)) {
        if (nodeData !== null && typeof nodeData !== 'object') {
          log.warn(`Node "${nodeName}" should be an object, but found ${typeof nodeData}. Treating as minimal node.`);
        }
        // Allow completely empty nodes or nodes with only some fields
        // No validation of kind, type, image, etc. - all are optional
      }
    }

    // Only check link references if both nodes and links exist and are not empty
    if (yamlObj.topology?.nodes && yamlObj.topology?.links &&
        Object.keys(yamlObj.topology.nodes).length > 0 &&
        yamlObj.topology.links.length > 0) {
      const linkError = checkLinkReferences(yamlObj);
      if (linkError) {
        // Make link reference errors warnings instead of failures
        log.warn(`Link reference warning: ${linkError}`);
        // Don't fail validation for link reference issues
      }
    }

    return true;
  } catch (err) {
    if (err instanceof YAML.YAMLParseError) {
      vscode.window.showErrorMessage(`YAML syntax error: ${err.message}`);
      log.error(`YAML syntax error: ${err.message}`);
    } else {
      vscode.window.showErrorMessage(`Error validating YAML: ${err}`);
      log.error(`Error validating YAML: ${String(err)}`);
    }
    return false;
  }
}

function checkLinkReferences(yamlObj: any): string | null {
  const nodes = new Set(Object.keys(yamlObj?.topology?.nodes ?? {}));
  const invalidNodes = new Set<string>();

  if (Array.isArray(yamlObj?.topology?.links)) {
    for (const link of yamlObj.topology.links) {
      if (!Array.isArray(link?.endpoints)) {
        continue;
      }
      for (const ep of link.endpoints) {
        if (typeof ep !== 'string') {
          continue;
        }
        const nodeName = ep.split(':')[0];
        if (nodeName && !nodes.has(nodeName)) {
          invalidNodes.add(nodeName);
        }
      }
    }
  }

  if (invalidNodes.size > 0) {
    return `Undefined node reference(s): ${Array.from(invalidNodes).join(', ')}`;
  }
  return null;
}

