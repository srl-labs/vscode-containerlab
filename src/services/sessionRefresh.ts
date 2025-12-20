/**
 * Session refresh functions for SSHX and GoTTY.
 * Separated to avoid circular dependencies with extension.ts
 */
import { runCommand } from '../utils/utils';
import { containerlabBinaryPath, outputChannel, sshxSessions, gottySessions } from '../globals';

function extractLabName(session: any, prefix: string): string | undefined {
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
    ) as string;
    sshxSessions.clear();
    if (out) {
      const parsed = JSON.parse(out);
      parsed.forEach((s: any) => {
        if (!s.link || s.link === 'N/A') {
          return;
        }
        const lab = extractLabName(s, 'sshx');
        if (lab) {
          sshxSessions.set(lab, s.link);
        }
      });
    }
  } catch (err: any) {
    outputChannel.error(`Failed to refresh SSHX sessions: ${err.message || err}`);
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
    ) as string;
    gottySessions.clear();
    if (out) {
      const parsed = JSON.parse(out);
      // Dynamic import to avoid circular dependency
      const { getHostname } = await import('../commands/capture');
      const hostname = await getHostname();

      parsed.forEach((s: any) => {
        if (!s.port || !hostname) {
          return;
        }
        const lab = extractLabName(s, 'gotty');
        if (lab) {
          // Construct the URL using hostname and port
          const bracketed = hostname.includes(":") ? `[${hostname}]` : hostname;
          const url = `http://${bracketed}:${s.port}`;
          gottySessions.set(lab, url);
        }
      });
    }
  } catch (err: any) {
    outputChannel.error(`Failed to refresh GoTTY sessions: ${err.message || err}`);
  }
}
