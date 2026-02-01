/**
 * TopologyHost command queue.
 *
 * Serializes host command execution to keep baseRevision aligned.
 */

let hostCommandQueue: Promise<unknown> = Promise.resolve();

export function enqueueHostCommand<T>(task: () => Promise<T>): Promise<T> {
  const queued = hostCommandQueue.then(task, task);
  hostCommandQueue = queued.catch(() => undefined);
  return queued;
}
