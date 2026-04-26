declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.gif" {
  const src: string;
  export default src;
}

interface Window {
  __INITIAL_DATA__?: unknown;
  vscode?: {
    postMessage(message: unknown): void;
    getState?(): unknown;
    setState?(state: unknown): void;
  };
}
