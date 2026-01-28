/**
 * Edge ID helper for locally-created links.
 */
export function buildEdgeId(
  source: string,
  target: string,
  sourceEndpoint?: string,
  targetEndpoint?: string
): string {
  const src = sourceEndpoint ? `${source}:${sourceEndpoint}` : source;
  const dst = targetEndpoint ? `${target}:${targetEndpoint}` : target;
  return `${src}--${dst}-${Date.now()}`;
}
