type LifecycleCommandType = "deploy" | "destroy" | "redeploy" | "start" | "stop" | "restart";

export async function notifyCurrentTopoViewerOfCommandSuccess(
  _commandType: LifecycleCommandType
) {
  // no-op stub
}

export async function notifyCurrentTopoViewerOfCommandFailure(
  _commandType: LifecycleCommandType,
  _error?: Error
) {
  // no-op stub
}

export async function notifyCurrentTopoViewerOfCommandLog(
  _commandType: LifecycleCommandType,
  _line: string,
  _stream: "stdout" | "stderr"
) {
  // no-op stub
}

export function createTopoViewerLifecycleHandlers(commandType: LifecycleCommandType) {
  return {
    onSuccess: async () => {
      await notifyCurrentTopoViewerOfCommandSuccess(commandType);
    },
    onFailure: async (error: Error) => {
      await notifyCurrentTopoViewerOfCommandFailure(commandType, error);
    },
    onOutputLine: (line: string, stream: "stdout" | "stderr") => {
      void notifyCurrentTopoViewerOfCommandLog(commandType, line, stream);
    }
  };
}
