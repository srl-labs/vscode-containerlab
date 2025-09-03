import * as vscode from 'vscode';
import { DOCKER_IMAGES_STATE_KEY, refreshDockerImages } from '../extension';

/**
 * Registers YAML completion for the `image:` directive in clab.yml/clab.yaml files.
 * Suggests local Docker images cached in the extension's global state.
 */
export function registerClabImageCompletion(context: vscode.ExtensionContext) {
  const provider: vscode.CompletionItemProvider = {
    async provideCompletionItems(document, position) {
      try {
        // Only apply to files with .clab.yml or .clab.yaml extensions
        const file = document.uri.fsPath.toLowerCase();
        if (!(file.endsWith('.clab.yml') || file.endsWith('.clab.yaml'))) {
          return undefined;
        }

        // Heuristic to detect if we are completing an image value at any hierarchy depth
        // 1) Current line contains `image:` (any indent, possibly after a dash)
        const line = document.lineAt(position.line).text;
        const beforeCursor = line.slice(0, position.character);
        const imageThisLine = /(^|\s|-)image\s*:\s*[^#]*/.test(beforeCursor);

        // 2) Or a recent previous non-empty line ends with `image:` and the current line is indented further
        let imagePreviousLine = false;
        if (!imageThisLine) {
          for (let l = position.line - 1; l >= 0 && l >= position.line - 10; l--) {
            const t = document.lineAt(l).text;
            if (t.trim() === '') continue;
            const m = t.match(/^(\s*-?\s*)image\s*:\s*$/);
            if (m) {
              const currIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
              const prevIndent = m[1].length;
              imagePreviousLine = currIndent > prevIndent;
              break;
            }
          }
        }

        if (!imageThisLine && !imagePreviousLine) {
          return undefined;
        }

        // Ensure we have a recent cache (fail silently on error)
        const cached = context.globalState.get<string[]>(DOCKER_IMAGES_STATE_KEY) || [];
        if (!cached || cached.length === 0) {
          await refreshDockerImages(context).catch(() => undefined);
        }
        const images = context.globalState.get<string[]>(DOCKER_IMAGES_STATE_KEY) || [];
        if (!images || images.length === 0) return undefined;

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
