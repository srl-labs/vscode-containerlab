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
 * Convert any value into a string suitable for logging.
 *
 * @param msg Value to format.
 * @returns String representation of the value.
 */
function formatMessage(msg: any): string {
  if (typeof msg === 'string') {
    return msg;
  }
  if (typeof msg === 'object' && msg !== null) {
    try {
      return JSON.stringify(msg);
    } catch {
      return String(msg);
    }
  }
  return String(msg);
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
    const formatted = formatMessage(message);
    const timestamp = new Date().toISOString();
    vscodeApi?.postMessage({
      command: 'topoViewerLog',
      level,
      message: formatted,
      fileLine,
      timestamp,
    });
  }

  logger = {
    debug(msg: any) { send('debug', msg); },
    info(msg: any) { send('info', msg); },
    warn(msg: any) { send('warn', msg); },
    error(msg: any) { send('error', msg); },
  };
} else {
  let vscodeModule: typeof import('vscode') | undefined;
  try {
    vscodeModule = eval('require')('vscode') as typeof import('vscode');
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
    const formatted = formatMessage(message);
    const timestamp = new Date().toISOString();
    const logLine = `time=${timestamp} level=${level} msg=${formatted} file=${fileLine}`;

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
