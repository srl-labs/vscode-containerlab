import { useCallback } from "react";

import { getVSCodeApi } from "./useVsCodeApi";

export function usePostMessage<T = unknown>(): (message: T) => void {
  return useCallback((message: T) => {
    getVSCodeApi().postMessage(message);
  }, []);
}
