import * as vscode from 'vscode';
import * as YAML from 'yaml';

import { log } from '../logging/logger';

export async function validateYamlContent(_context: vscode.ExtensionContext, yamlContent: string): Promise<boolean> {
  try {
    const yamlObj = YAML.parse(yamlContent);

    if (!isObject(yamlObj)) {
      return fail('Invalid YAML: Content must be an object');
    }

    if (!validateName(yamlObj)) {
      return false;
    }

    if (!validateTopology(yamlObj)) {
      return false;
    }

    checkLinkReferencesIfNeeded(yamlObj);
    return true;
  } catch (err) {
    handleError(err);
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message: string): false {
  vscode.window.showErrorMessage(message);
  log.error(message);
  return false;
}

function validateName(yamlObj: any): boolean {
  if (typeof yamlObj.name !== 'string' || yamlObj.name.trim() === '') {
    return fail('Invalid Containerlab YAML: "name" field is required and cannot be empty');
  }
  return true;
}

function validateTopology(yamlObj: any): boolean {
  const topology = yamlObj.topology;
  if (topology === undefined) {
    return true;
  }
  if (!isObject(topology)) {
    return fail('Invalid Containerlab YAML: "topology" must be an object if present');
  }
  if (topology.nodes !== undefined && !isObject(topology.nodes)) {
    return fail('Invalid Containerlab YAML: "topology.nodes" must be an object if present');
  }
  if (topology.links !== undefined && !Array.isArray(topology.links)) {
    return fail('Invalid Containerlab YAML: "topology.links" must be an array if present');
  }
  if (topology.nodes) {
    for (const [nodeName, nodeData] of Object.entries(topology.nodes)) {
      if (nodeData !== null && typeof nodeData !== 'object') {
        log.warn(`Node "${nodeName}" should be an object, but found ${typeof nodeData}. Treating as minimal node.`);
      }
    }
  }
  return true;
}

function checkLinkReferencesIfNeeded(yamlObj: any): void {
  const nodes = yamlObj.topology?.nodes;
  const links = yamlObj.topology?.links;
  if (isObject(nodes) && Array.isArray(links) && Object.keys(nodes).length > 0 && links.length > 0) {
    const linkError = checkLinkReferences(yamlObj);
    if (linkError) {
      log.warn(`Link reference warning: ${linkError}`);
    }
  }
}

function handleError(err: unknown): void {
  if (err instanceof YAML.YAMLParseError) {
    const message = `YAML syntax error: ${err.message}`;
    vscode.window.showErrorMessage(message);
    log.error(message);
  } else {
    const message = `Error validating YAML: ${err}`;
    vscode.window.showErrorMessage(message);
    log.error(message);
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

