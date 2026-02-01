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
  const src = sourceEndpoint ? `${source}:${sourceEndpoint}` : source;
  const dst = targetEndpoint ? `${target}:${targetEndpoint}` : target;
  const time = timestamp ?? Date.now();
  return `${src}--${dst}-${time}`;
}
