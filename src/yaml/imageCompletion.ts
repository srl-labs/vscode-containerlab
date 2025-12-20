import * as vscode from 'vscode';

import * as utils from '../utils/index';

function lineContainsInlineImage(line: string, cursor: number): boolean {
  const beforeCursor = line.slice(0, cursor);
  const beforeNoComment = beforeCursor.split('#')[0];
  const idx = beforeNoComment.toLowerCase().lastIndexOf('image:');
  if (idx === -1) {
    return false;
  }
  const pre = beforeNoComment.slice(0, idx).trim();
  return pre === '' || pre === '-';
}

function getIndent(line: string): number {
  const match = /^[ \t]*/.exec(line);
  return match ? match[0].length : 0;
}

function hasPreviousLineEndingWithImage(
  document: vscode.TextDocument,
  fromLine: number,
  currIndent: number
): boolean {
  for (let l = fromLine - 1; l >= 0 && l >= fromLine - 10; l--) {
    const text = document
      .lineAt(l)
      .text.split('#')[0]
      .trimEnd();
    if (text.toLowerCase().endsWith('image:')) {
      const prevIndent = ( /^[- \t]*/.exec(text) || [''])[0].length;
      return currIndent > prevIndent;
    }
  }
  return false;
}

function isCompletingImageValue(
  document: vscode.TextDocument,
  position: vscode.Position
): boolean {
  const line = document.lineAt(position.line).text;
  if (lineContainsInlineImage(line, position.character)) {
    return true;
  }
  const currIndent = getIndent(line);
  return hasPreviousLineEndingWithImage(document, position.line, currIndent);
}

function extractKeyFromLine(trimmedLine: string): string | undefined {
  const colonIndex = trimmedLine.indexOf(':');
  if (colonIndex === -1) {
    return undefined;
  }
  const key = trimmedLine.slice(0, colonIndex).trim();
  return key.length > 0 ? key : undefined;
}

function getAncestorPath(document: vscode.TextDocument, lineIndex: number): string[] {
  const path: string[] = [];
  let currentIndent = getIndent(document.lineAt(lineIndex).text);
  for (let i = lineIndex - 1; i >= 0; i--) {
    const raw = document.lineAt(i).text;
    const trimmed = raw.split('#')[0].trimEnd();
    if (!trimmed.trim()) {
      continue;
    }
    const indent = getIndent(raw);
    if (indent >= currentIndent) {
      continue;
    }
    const key = extractKeyFromLine(trimmed);
    if (key) {
      path.unshift(key);
      currentIndent = indent;
    } else {
      currentIndent = indent;
    }
  }
  return path;
}

function isNodesContext(path: string[]): boolean {
  const nodesIndex = path.lastIndexOf('nodes');
  if (nodesIndex === -1 || nodesIndex >= path.length - 1) {
    return false;
  }
  return nodesIndex === 0 || path[nodesIndex - 1] === 'topology';
}

function isDefaultsContext(path: string[]): boolean {
  const defaultsIndex = path.lastIndexOf('defaults');
  if (defaultsIndex === -1) {
    return false;
  }
  return (
    (defaultsIndex === 0 && path.length === 1) ||
    (defaultsIndex === 1 && path[0] === 'topology')
  );
}

function isScopedContext(path: string[], section: string): boolean {
  const sectionIndex = path.lastIndexOf(section);
  if (sectionIndex === -1 || sectionIndex >= path.length - 1) {
    return false;
  }
  return (
    (sectionIndex === 0 && path.length > 1) ||
    (sectionIndex === 1 && path[0] === 'topology')
  );
}

function isAllowedImageSection(document: vscode.TextDocument, position: vscode.Position): boolean {
  const path = getAncestorPath(document, position.line).map(key => key.toLowerCase());
  if (path.length === 0) {
    return false;
  }

  return (
    isNodesContext(path) ||
    isDefaultsContext(path) ||
    isScopedContext(path, 'kinds') ||
    isScopedContext(path, 'groups')
  );
}

function shouldProvideImageCompletion(document: vscode.TextDocument, position: vscode.Position): boolean {
  return (
    utils.isClabYamlFile(document.uri.fsPath) &&
    isCompletingImageValue(document, position) &&
    isAllowedImageSection(document, position)
  );
}

function getInlineImageFilter(document: vscode.TextDocument, position: vscode.Position): string {
  const line = document.lineAt(position.line).text;
  const portion = line.slice(0, position.character);
  const before = portion.split('#')[0];
  const idx = before.toLowerCase().lastIndexOf('image:');
  if (idx === -1) {
    return '';
  }
  const afterImage = before.slice(idx + 'image:'.length).trimStart();
  return afterImage.toLowerCase();
}

/**
 * Registers YAML completion for the `image:` directive in clab.yml/clab.yaml files.
 * Suggests local Docker images cached in-memory for the current VS Code session.
 */
function buildCompletionItems(images: string[]): vscode.CompletionList | undefined {
  if (images.length === 0) {
    return undefined;
  }
  const items: vscode.CompletionItem[] = images.map((img, index) => {
    const ci = new vscode.CompletionItem(img, vscode.CompletionItemKind.Value);
    ci.insertText = img;
    ci.detail = 'Docker image';
    ci.sortText = index.toString().padStart(6, '0');
    return ci;
  });
  return new vscode.CompletionList(items, true);
}

function filterImages(images: string[], filterText: string): string[] {
  if (!filterText) {
    return images;
  }
  const lowerFilter = filterText.toLowerCase();
  return images.filter(img => img.toLowerCase().includes(lowerFilter));
}

async function provideImageCompletions(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.CompletionList | undefined> {
  if (!shouldProvideImageCompletion(document, position)) {
    return undefined;
  }

  const images = utils.getDockerImages();
  if (images.length === 0) {
    return undefined;
  }

  const filtered = filterImages(images, getInlineImageFilter(document, position));
  return buildCompletionItems(filtered);
}

function registerCompletionProvider(context: vscode.ExtensionContext): void {
  const provider: vscode.CompletionItemProvider = {
    provideCompletionItems(document, position) {
      return provideImageCompletions(document, position);
    }
  };

  const disposable = vscode.languages.registerCompletionItemProvider(
    { language: 'yaml', scheme: 'file' },
    provider,
    ':', ' ', '"', '\'', '/'
  );
  context.subscriptions.push(disposable);
}

function registerAutoTrigger(context: vscode.ExtensionContext): void {
  const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== event.document) {
      return;
    }
    if (event.contentChanges.length === 0) {
      return;
    }

    const position = editor.selection.active;
    if (!shouldProvideImageCompletion(event.document, position)) {
      return;
    }

    const lastChange = event.contentChanges[event.contentChanges.length - 1];
    if (!lastChange || lastChange.text.length === 0) {
      return;
    }

    const inserted = lastChange.text;
    const lastChar = inserted[inserted.length - 1];
    const lineText = event.document.lineAt(position.line).text;
    const currentFilter = getInlineImageFilter(event.document, position);
    const images = utils.getDockerImages();
    const isExactMatch =
      images.length > 0 &&
      images.some(img => img.toLowerCase() === currentFilter && lineText.trimEnd().endsWith(img));

    const shouldTrigger =
      !isExactMatch && (/\S/.test(lastChar) || inserted.includes('\n'));
    if (!shouldTrigger) {
      return;
    }

    void vscode.commands.executeCommand('editor.action.triggerSuggest');
  });

  context.subscriptions.push(changeListener);
}

export function registerClabImageCompletion(context: vscode.ExtensionContext) {
  registerCompletionProvider(context);
  registerAutoTrigger(context);
}
