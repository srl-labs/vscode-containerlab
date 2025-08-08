/* eslint-env node */
// vscodeHtmlTemplate.ts - Tailwind CSS version

import { log } from '../../../view/backend/logger';
import * as fs from 'fs';
import * as path from 'path';
declare const __dirname: string;

let templatePath = path.join(__dirname, 'vscodeHtmlTemplate.html');
let partialsDir = path.join(__dirname, 'partials');

function resolveTemplatePaths(): void {
  const distTemplate = path.join(__dirname, 'editorHtmlTemplate.html');
  const distPartials = path.join(__dirname, 'editor-partials');
  if (fs.existsSync(distTemplate)) {
    templatePath = distTemplate;
    partialsDir = distPartials;
    return;
  }

  if (fs.existsSync(templatePath) && fs.existsSync(partialsDir)) {
    return;
  }

  const srcDir = path.resolve(__dirname, '../../../../../src/topoViewerEditor/webview-ui/template');
  templatePath = path.join(srcDir, 'vscodeHtmlTemplate.html');
  partialsDir = path.join(srcDir, 'partials');
}

resolveTemplatePaths();

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
  imageMapping: Record<string, string>,
  ifacePatternMapping: Record<string, string>,
  defaultKind: string,
  defaultType: string,
  topologyName = 'Unknown Topology',
  isDarkTheme = true,
): string {
  log.info(`allowedHostname in vscodeHtmlTemplate.ts: ${allowedHostname}`);

  let template = fs.readFileSync(templatePath, 'utf8');
  const partials = loadPartials();
  partials.WIRESHARK_MODAL = partials.WIRESHARK_MODAL ?? '';
  for (const [key, value] of Object.entries(partials)) {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  const logoFile = isDarkTheme ? 'containerlab.svg' : 'containerlab-dark.svg';

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
    imageMapping: JSON.stringify(imageMapping),
    ifacePatternMapping: JSON.stringify(ifacePatternMapping),
    defaultKind,
    defaultType,
    topologyName,
    logoFile,
  };

  for (const [key, value] of Object.entries(replacements)) {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  return template;
}
