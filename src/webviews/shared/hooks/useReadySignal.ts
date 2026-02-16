import { useEffect, useRef } from "react";

import { usePostMessage } from "./usePostMessage";

export function useReadySignal(): void {
  const postMessage = usePostMessage();
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) {
      return;
    }

    sentRef.current = true;
    postMessage({ command: "ready" });
  }, [postMessage]);
}
