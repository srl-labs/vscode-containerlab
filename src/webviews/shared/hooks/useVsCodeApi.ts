interface VsCodeApiLike {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}
type WindowVsCodeWithState = {
  postMessage(message: unknown): void;
  getState?: () => unknown;
  setState?: (state: unknown) => void;
};

let vscodeApi: VsCodeApiLike | undefined;
let fallbackState: unknown;

function hasVsCodeApi(value: unknown): value is VsCodeApiLike {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybeApi = value as Partial<VsCodeApiLike>;
  return (
    typeof maybeApi.postMessage === "function" &&
    typeof maybeApi.getState === "function" &&
    typeof maybeApi.setState === "function"
  );
}

function fromAcquire(): VsCodeApiLike | undefined {
  const maybeAcquire = (
    globalThis as typeof globalThis & {
      acquireVsCodeApi?: () => unknown;
    }
  ).acquireVsCodeApi;

  if (typeof maybeAcquire !== "function") {
    return undefined;
  }

  try {
    const api = maybeAcquire();
    return hasVsCodeApi(api) ? api : undefined;
  } catch {
    return undefined;
  }
}

function fromWindow(): VsCodeApiLike | undefined {
  if (typeof window === "undefined" || !window.vscode) {
    return undefined;
  }

  const vscode = window.vscode as WindowVsCodeWithState;

  return {
    postMessage: (message: unknown) => vscode.postMessage(message),
    getState: () => {
      const getter = vscode.getState;
      if (typeof getter === "function") {
        return getter();
      }
      return fallbackState;
    },
    setState: (state: unknown) => {
      const setter = vscode.setState;
      fallbackState = state;
      if (typeof setter === "function") {
        setter(state);
      }
    },
  };
}

export function getVSCodeApi(): VsCodeApiLike {
  // Prefer an already-acquired API instance if present.
  // Some webviews bootstrap window.vscode up-front, and a second
  // acquireVsCodeApi() call can throw.
  vscodeApi ??= fromWindow() ?? fromAcquire();

  if (!vscodeApi) {
    throw new Error("VS Code API is unavailable in this webview context.");
  }

  return vscodeApi;
}
