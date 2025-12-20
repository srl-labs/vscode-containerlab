/**
 * Common endpoint result type for service handlers
 */
export interface EndpointResult {
  result: unknown;
  error: string | null;
}
