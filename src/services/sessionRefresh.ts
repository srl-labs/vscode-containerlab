/**
 * Session refresh functions for SSHX and GoTTY.
 * Separated to avoid circular dependencies with extension.ts
 */
import { runCommand } from '../utils/utils';
import { containerlabBinaryPath, outputChannel, sshxSessions, gottySessions } from '../globals';

/**
 * Interface for SSHX session data returned by containerlab tools sshx list -f json
 */
interface SshxSession {
  name?: string;
  network?: string;
  link?: string;
}

/**
 * Interface for GoTTY session data returned by containerlab tools gotty list -f json
 */
interface GottySession {
  name?: string;
  network?: string;
  port?: number | string;
}

/**
 * Type guard to check if a value is an array of session objects
 */
function isSessionArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value);
}

/**
 * Type guard to check if a session has the expected structure
 */
function hasSessionProperties(session: unknown): session is { name?: unknown; network?: unknown } {
  return typeof session === 'object' && session !== null;
}

function extractLabName(session: SshxSession | GottySession, prefix: string): string | undefined {
  if (typeof session.network === 'string' && session.network.startsWith('clab-')) {
    return session.network.slice(5);
  }
  if (typeof session.name !== 'string') {
    return undefined;
  }
  const name = session.name;
  if (name.startsWith(`${prefix}-`)) {
    return name.slice(prefix.length + 1);
  }
  if (name.startsWith('clab-') && name.endsWith(`-${prefix}`)) {
    return name.slice(5, -(prefix.length + 1));
  }
  return undefined;
}

export async function refreshSshxSessions() {
  try {
    const out = await runCommand(
      `${containerlabBinaryPath} tools sshx list -f json`,
      'List SSHX sessions',
      outputChannel,
      true,
      false
    );
    sshxSessions.clear();
    if (out && typeof out === 'string') {
      const parsed: unknown = JSON.parse(out);
      if (!isSessionArray(parsed)) {
        return;
      }
      parsed.forEach((sessionData) => {
        if (!hasSessionProperties(sessionData)) {
          return;
        }
        const session = sessionData as SshxSession;
        if (!session.link || session.link === 'N/A') {
          return;
        }
        const lab = extractLabName(session, 'sshx');
        if (lab) {
          sshxSessions.set(lab, session.link);
        }
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    outputChannel.error(`Failed to refresh SSHX sessions: ${errorMessage}`);
  }
}

export async function refreshGottySessions() {
  try {
    const out = await runCommand(
      `${containerlabBinaryPath} tools gotty list -f json`,
      'List GoTTY sessions',
      outputChannel,
      true,
      false
    );
    gottySessions.clear();
    if (out && typeof out === 'string') {
      const parsed: unknown = JSON.parse(out);
      if (!isSessionArray(parsed)) {
        return;
      }
      // Dynamic import to avoid circular dependency
      const { getHostname } = await import('../commands/capture');
      const hostname = await getHostname();

      parsed.forEach((sessionData) => {
        if (!hasSessionProperties(sessionData)) {
          return;
        }
        const session = sessionData as GottySession;
        if (!session.port || !hostname) {
          return;
        }
        const lab = extractLabName(session, 'gotty');
        if (lab) {
          // Construct the URL using hostname and port
          const bracketed = hostname.includes(":") ? `[${hostname}]` : hostname;
          const url = `http://${bracketed}:${session.port}`;
          gottySessions.set(lab, url);
        }
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    outputChannel.error(`Failed to refresh GoTTY sessions: ${errorMessage}`);
  }
}
