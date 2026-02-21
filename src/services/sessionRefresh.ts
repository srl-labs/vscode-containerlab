/**
 * Session refresh functions for SSHX and GoTTY.
 * Separated to avoid circular dependencies with extension.ts
 */
import { runCommand } from "../utils/utils";
import {
  containerlabBinaryPath,
  outputChannel,
  sshxSessions,
  gottySessions,
  runningLabsProvider
} from "../globals";

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
  return typeof session === "object" && session !== null;
}

function toSshxSession(sessionData: unknown): SshxSession | undefined {
  if (!hasSessionProperties(sessionData)) return undefined;
  const record = Object.fromEntries(Object.entries(sessionData));
  return {
    name: typeof record.name === "string" ? record.name : undefined,
    network: typeof record.network === "string" ? record.network : undefined,
    link: typeof record.link === "string" ? record.link : undefined
  };
}

function toGottySession(sessionData: unknown): GottySession | undefined {
  if (!hasSessionProperties(sessionData)) return undefined;
  const record = Object.fromEntries(Object.entries(sessionData));
  return {
    name: typeof record.name === "string" ? record.name : undefined,
    network: typeof record.network === "string" ? record.network : undefined,
    port:
      typeof record.port === "number" || typeof record.port === "string" ? record.port : undefined
  };
}

function extractLabName(session: SshxSession | GottySession, prefix: string): string | undefined {
  if (typeof session.network === "string" && session.network.startsWith("clab-")) {
    return session.network.slice(5);
  }
  if (typeof session.name !== "string") {
    return undefined;
  }
  const name = session.name;
  if (name.startsWith(`${prefix}-`)) {
    return name.slice(prefix.length + 1);
  }
  if (name.startsWith("clab-") && name.endsWith(`-${prefix}`)) {
    return name.slice(5, -(prefix.length + 1));
  }
  return undefined;
}

export async function refreshSshxSessions() {
  try {
    const out = await runCommand(
      `${containerlabBinaryPath} tools sshx list -f json`,
      "List SSHX sessions",
      outputChannel,
      true,
      false
    );
    sshxSessions.clear();
    if (typeof out === "string" && out.length > 0) {
      const parsed: unknown = JSON.parse(out);
      if (!isSessionArray(parsed)) {
        return;
      }
      parsed.forEach((sessionData) => {
        const session = toSshxSession(sessionData);
        if (session === undefined) {
          return;
        }
        if (session.link === undefined || session.link.length === 0 || session.link === "N/A") {
          return;
        }
        const lab = extractLabName(session, "sshx");
        if (lab !== undefined && lab.length > 0) {
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
      "List GoTTY sessions",
      outputChannel,
      true,
      false
    );
    gottySessions.clear();
    if (typeof out === "string" && out.length > 0) {
      const parsed: unknown = JSON.parse(out);
      if (!isSessionArray(parsed)) {
        return;
      }
      // Dynamic import to avoid circular dependency
      const { getHostname } = await import("../commands/capture");
      const hostname = await getHostname();

      parsed.forEach((sessionData) => {
        const session = toGottySession(sessionData);
        if (session === undefined) {
          return;
        }
        if (
          session.port === undefined ||
          hostname.length === 0
        ) {
          return;
        }
        const lab = extractLabName(session, "gotty");
        if (lab !== undefined && lab.length > 0) {
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

export async function refreshRunningLabsProvider(action: "attach" | "reattach"): Promise<void> {
  try {
    if (action === "attach") {
      await runningLabsProvider.softRefresh();
    } else {
      await runningLabsProvider.refresh();
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    outputChannel.warn(`Failed to refresh running labs provider after ${action}: ${errorMessage}`);
  }
}
