/* eslint-env node */
// vscodeHtmlTemplate.ts - Tailwind CSS version

import { log } from '../../../backend/logger';
import * as fs from 'fs';
import * as path from 'path';
declare const __dirname: string;

const templatePath = path.join(__dirname, 'vscodeHtmlTemplate.html');
const partialsDir = path.join(__dirname, 'partials');

function loadPartials(): Record<string, string> {
  if (!fs.existsSync(partialsDir)) {
    return {};
  }
  const partials: Record<string, string> = {};
  for (const file of fs.readdirSync(partialsDir)) {
    if (file.endsWith('.html')) {
      const key = path.basename(file, '.html').replace(/-/g, '_').toUpperCase();
      const content = fs.readFileSync(path.join(partialsDir, file), 'utf8');
      partials[key] = content;
    }
  }
  return partials;
}

export function getHTMLTemplate(
  cssUri: string,
  jsUri: string,
  schemaUri: string,
  imagesUri: string,
  jsonFileUrlDataCytoMarshall: string,
  jsonFileUrlDataEnvironment: string,
  isVscodeDeployment: boolean,
  jsOutDir: string,
  allowedHostname: string,
  deploymentState: 'deployed' | 'undeployed' | 'unknown' = 'unknown',
  viewerMode: 'viewer' | 'editor' | 'unified' = 'unified',
  topologyName = 'Unknown Topology'
): string {
  log.info(`allowedHostname in vscodeHtmlTemplate.ts: ${allowedHostname}`);
  log.info(`Smart detection - deploymentState: ${deploymentState}, viewerMode: ${viewerMode}`);

  let template = fs.readFileSync(templatePath, 'utf8');
  const partials = loadPartials();
  for (const [key, value] of Object.entries(partials)) {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  const replacements: Record<string, string> = {
    cssUri,
    jsUri,
    schemaUri,
    imagesUri,
    jsonFileUrlDataCytoMarshall,
    jsonFileUrlDataEnvironment,
    isVscodeDeployment: String(isVscodeDeployment),
    jsOutDir,
    allowedHostname,
    deploymentState,
    viewerMode,
    topologyName,
  };

  for (const [key, value] of Object.entries(replacements)) {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  return template;
}
