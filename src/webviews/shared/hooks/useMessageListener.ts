import { useEffect, useRef } from "react";

interface WebviewMessage {
  command: string;
}

export function useMessageListener<T extends WebviewMessage>(
  handler: (message: T) => void
): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const listener = (event: MessageEvent<T>) => {
      handlerRef.current(event.data);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);
}
