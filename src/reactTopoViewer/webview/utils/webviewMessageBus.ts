/**
 * webviewMessageBus - Single window.message listener with fan-out subscriptions.
 *
 * The webview previously registered multiple `window.addEventListener('message', ...)` listeners
 * across hooks and services. This module centralizes the listener and allows scoped subscriptions.
 */

export type WebviewMessagePredicate = (event: MessageEvent) => boolean;
export type WebviewMessageHandler = (event: MessageEvent) => void;

interface Subscriber {
  handler: WebviewMessageHandler;
  predicate?: WebviewMessagePredicate;
}

let started = false;
let windowListener: ((event: MessageEvent) => void) | null = null;
const subscribers = new Set<Subscriber>();

function ensureStarted(): void {
  if (started) return;
  windowListener = (event: MessageEvent) => {
    for (const sub of Array.from(subscribers)) {
      if (!sub.predicate || sub.predicate(event)) {
        sub.handler(event);
      }
    }
  };

  window.addEventListener('message', windowListener);
  started = true;
}

function maybeStop(): void {
  if (!started) return;
  if (subscribers.size > 0) return;
  if (!windowListener) return;
  window.removeEventListener('message', windowListener);
  windowListener = null;
  started = false;
}

export function subscribeToWebviewMessages(
  handler: WebviewMessageHandler,
  predicate?: WebviewMessagePredicate
): () => void {
  ensureStarted();
  const sub: Subscriber = { handler, predicate };
  subscribers.add(sub);
  return () => {
    subscribers.delete(sub);
    maybeStop();
  };
}

