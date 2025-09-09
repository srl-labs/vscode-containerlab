import * as vscode from 'vscode';
import { DOCKER_IMAGES_STATE_KEY, refreshDockerImages } from '../extension';

function isClabYamlFile(document: vscode.TextDocument): boolean {
  const file = document.uri.fsPath.toLowerCase();
  return file.endsWith('.clab.yml') || file.endsWith('.clab.yaml');
}

function isCompletingImageValue(
  document: vscode.TextDocument,
  position: vscode.Position
): boolean {
  const line = document.lineAt(position.line).text;
  const beforeCursor = line.slice(0, position.character);
  if (/(^|\s|-)image\s*:\s*[^#]*/.test(beforeCursor)) {
    return true;
  }

  for (let l = position.line - 1; l >= 0 && l >= position.line - 10; l--) {
    const text = document.lineAt(l).text;
    if (text.trim() === '') continue;
    const match = text.match(/^(\s*-?\s*)image\s*:\s*$/);
    if (match) {
      const currIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      const prevIndent = match[1].length;
      return currIndent > prevIndent;
    }
  }
  return false;
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
