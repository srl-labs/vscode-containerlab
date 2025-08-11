import * as vscode from 'vscode';
import * as YAML from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { log } from '../logging/extensionLogger';

export async function validateYamlContent(context: vscode.ExtensionContext, yamlContent: string): Promise<boolean> {
  try {
    const schemaUri = vscode.Uri.joinPath(
      context.extensionUri,
      'schema',
      'clab.schema.json'
    );
    const schemaBytes = await vscode.workspace.fs.readFile(schemaUri);
    const schema = JSON.parse(Buffer.from(schemaBytes).toString('utf8'));

    const ajv = new Ajv({
      strict: false,
      allErrors: true,
      verbose: true,
    });
    addFormats(ajv);
    ajv.addKeyword({
      keyword: 'markdownDescription',
      schemaType: 'string',
      compile: () => () => true,
    });
    const validate = ajv.compile(schema);
    const yamlObj = YAML.parse(yamlContent);
    const valid = validate(yamlObj);
    if (!valid) {
      const errors = ajv.errorsText(validate.errors);
      vscode.window.showErrorMessage(`Invalid Containerlab YAML: ${errors}`);
      log.error(`Invalid Containerlab YAML: ${errors}`);
      return false;
    }

    const linkError = checkLinkReferences(yamlObj);
    if (linkError) {
      vscode.window.showErrorMessage(`Invalid Containerlab YAML: ${linkError}`);
      log.error(`Invalid Containerlab YAML: ${linkError}`);
      return false;
    }

    return true;
  } catch (err) {
    vscode.window.showErrorMessage(`Error validating YAML: ${err}`);
    log.error(`Error validating YAML: ${String(err)}`);
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

