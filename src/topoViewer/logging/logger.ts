/**
 * Unified logger for TopoViewer extension and webview.
 *
 * In the extension host it writes to VS Code's LogOutputChannel
 * using native log methods. When executed inside a webview it
 * forwards log messages to the extension host via postMessage.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Extract file name and line number from the current call stack.
 *
 * @returns The file name and line number in the format "file:line".
 */
function getCallerFileLine(): string {
  const obj: { stack?: string } = {};
  Error.captureStackTrace?.(obj, getCallerFileLine);

  const stack = obj.stack;
  if (!stack) return 'unknown:0';

  const lines = stack.split('\n');
  const callSite = lines[3] || lines[4] || '';

  const match = callSite.match(/\((.*?):(\d+):\d+\)/) || callSite.match(/at (.*?):(\d+):\d+/);
  if (!match) return 'unknown:0';

  const fileName = match[1].split(/[\\/]/).pop() ?? 'unknown';
  const lineNum = match[2];
  return `${fileName}:${lineNum}`;
}

/**
 * Safely stringify objects for logging.
 * Converts Error instances to plain objects and protects against circular references.
 */
function safeFormat(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  const seen = new WeakSet();
  const replacer = (_key: string, val: unknown): unknown => {
    if (val instanceof Error) {
      return {
        name: val.name,
        message: val.message,
        stack: val.stack,
        code: (val as any).code,
        cause: (val as Error & { cause?: unknown }).cause,
      };
    }
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val as object)) {
        return '[Circular]';
      }
      seen.add(val as object);
    }
    return val;
  };

  try {
    return JSON.stringify(value, replacer, 2);
  } catch {
    try {
      return String(value);
    } catch {
      return '[Unserializable]';
    }
  }
}

const isWebview = typeof window !== 'undefined' && typeof (window as any).vscode !== 'undefined';

/* eslint-disable no-unused-vars */
interface Logger {
  debug(msg: any): void;
  info(msg: any): void;
  warn(msg: any): void;
  error(msg: any): void;
}
/* eslint-enable no-unused-vars */

let logger: Logger;

if (isWebview) {
  const vscodeApi = (window as any).vscode;

  /**
   * Send log message to the extension host from the webview.
   */
  function send(level: LogLevel, message: any): void {
    const fileLine = getCallerFileLine();
    const formatted = safeFormat(message);
    vscodeApi?.postMessage({
      command: 'topoViewerLog',
      level,
      message: formatted,
      fileLine,
    });
  }

  logger = {
    debug(msg: any) { send('debug', msg); },
    info(msg: any) { send('info', msg); },
    warn(msg: any) { send('warn', msg); },
    error(msg: any) { send('error', msg); },
  };
} else {
  // Access Node's require function without triggering bundler warnings
  // eslint-disable-next-line no-undef
  const nodeModule = typeof module !== 'undefined' ? (module as any) : undefined;
  const nodeRequire =
    nodeModule && typeof nodeModule.require === 'function'
      ? nodeModule.require.bind(nodeModule)
      : undefined;

  let vscodeModule: typeof import('vscode') | undefined;
  try {
    vscodeModule = nodeRequire ? (nodeRequire('vscode') as typeof import('vscode')) : undefined;
  } catch {
    vscodeModule = undefined;
  }

  const outputChannel: import('vscode').LogOutputChannel | undefined =
    vscodeModule?.window.createOutputChannel('TopoViewer Logs', { log: true });

  /**
   * Write the formatted log line either to VS Code's output channel or to the console.
   */
  function write(level: LogLevel, message: any): void {
    const fileLine = getCallerFileLine();
    const formatted = safeFormat(message);
    const logLine = `level=${level} msg=${formatted} file=${fileLine}`;

    if (outputChannel) {
      switch (level) {
        case 'debug':
          outputChannel.debug(logLine);
          break;
        case 'info':
          outputChannel.info(logLine);
          break;
        case 'warn':
          outputChannel.warn(logLine);
          break;
        case 'error':
          outputChannel.error(logLine);
          break;
      }
    } else {
      switch (level) {
        case 'debug':
          console.debug(logLine);
          break;
        case 'info':
          console.info(logLine);
          break;
        case 'warn':
          console.warn(logLine);
          break;
        case 'error':
          console.error(logLine);
          break;
      }
    }
  }

  logger = {
    debug(msg: any) { write('debug', msg); },
    info(msg: any) { write('info', msg); },
    warn(msg: any) { write('warn', msg); },
    error(msg: any) { write('error', msg); },
  };
}

export const log = logger;
export const logInfo = log.info;
export const logDebug = log.debug;
export const logWarn = log.warn;
export const logError = log.error;
