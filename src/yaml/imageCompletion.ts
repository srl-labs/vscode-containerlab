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
  const beforeNoComment = beforeCursor.split('#')[0];

  // Check if the current line contains an inline image: key
  const idx = beforeNoComment.toLowerCase().lastIndexOf('image:');
  if (idx !== -1) {
    const pre = beforeNoComment.slice(0, idx).trim();
    // allow optional dash for list items
    if (pre === '' || pre === '-' || pre === '- ')
      return true;
  }

  // Look up to 10 lines back for a line ending with 'image:' at a lower indent
  // to support values on the following line
  const currIndent = (() => {
    let i = 0;
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
    return i;
  })();

  for (let l = position.line - 1; l >= 0 && l >= position.line - 10; l--) {
    const text = document.lineAt(l).text;
    const noComment = text.split('#')[0];
    let trimmed = noComment;
    while (trimmed.length && (trimmed.endsWith(' ') || trimmed.endsWith('\t'))) {
      trimmed = trimmed.slice(0, -1);
    }
    const lower = trimmed.toLowerCase();
    if (lower.endsWith('image:')) {
      let j = 0;
      while (j < trimmed.length && (trimmed[j] === ' ' || trimmed[j] === '\t' || trimmed[j] === '-')) j++;
      const prevIndent = j;
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
