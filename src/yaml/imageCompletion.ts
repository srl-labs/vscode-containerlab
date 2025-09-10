import * as vscode from 'vscode';
import { DOCKER_IMAGES_STATE_KEY, refreshDockerImages } from '../extension';

function isClabYamlFile(document: vscode.TextDocument): boolean {
  const file = document.uri.fsPath.toLowerCase();
  return file.endsWith('.clab.yml') || file.endsWith('.clab.yaml');
}

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

async function getCachedImages(context: vscode.ExtensionContext): Promise<string[]> {
  const cached = context.globalState.get<string[]>(DOCKER_IMAGES_STATE_KEY) || [];
  if (cached.length === 0) {
    await refreshDockerImages(context).catch(() => undefined);
  }
  return context.globalState.get<string[]>(DOCKER_IMAGES_STATE_KEY) || [];
}

/**
 * Registers YAML completion for the `image:` directive in clab.yml/clab.yaml files.
 * Suggests local Docker images cached in the extension's global state.
 */
export function registerClabImageCompletion(context: vscode.ExtensionContext) {
  const provider: vscode.CompletionItemProvider = {
    async provideCompletionItems(document, position) {
      try {
        if (!isClabYamlFile(document) || !isCompletingImageValue(document, position)) {
          return undefined;
        }

        const images = await getCachedImages(context);
        if (images.length === 0) {
          return undefined;
        }

        const items: vscode.CompletionItem[] = images.map((img) => {
          const ci = new vscode.CompletionItem(img, vscode.CompletionItemKind.Value);
          ci.insertText = img;
          ci.detail = 'Local container image';
          ci.sortText = '1_' + img; // keep a stable, predictable order
          return ci;
        });

        return new vscode.CompletionList(items, true);
      } catch {
        return undefined;
      }
    }
  };

  const disposable = vscode.languages.registerCompletionItemProvider(
    { language: 'yaml', scheme: 'file' },
    provider,
    ':', ' ', '"', '\'', '/'
  );
  context.subscriptions.push(disposable);
}
