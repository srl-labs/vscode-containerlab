/**
 * Edge ID helper for locally-created links.
 */
export function buildEdgeId(
  source: string,
  target: string,
  sourceEndpoint?: string,
  targetEndpoint?: string,
  timestamp?: number
): string {
  const hasSourceEndpoint = sourceEndpoint !== undefined && sourceEndpoint.length > 0;
  const hasTargetEndpoint = targetEndpoint !== undefined && targetEndpoint.length > 0;
  const src = hasSourceEndpoint ? `${source}:${sourceEndpoint}` : source;
  const dst = hasTargetEndpoint ? `${target}:${targetEndpoint}` : target;
  const time = timestamp ?? Date.now();
  return `${src}--${dst}-${time}`;
}
