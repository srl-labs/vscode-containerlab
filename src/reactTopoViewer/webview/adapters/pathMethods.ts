/**
 * Shared path utility methods for FileSystemAdapter implementations
 *
 * These methods delegate to pathUtils and are used by adapter implementations
 * to satisfy the FileSystemAdapter interface.
 */
import * as pathUtils from './pathUtils';

/**
 * Returns an object with the three path utility methods required by FileSystemAdapter.
 * This eliminates code duplication across adapter implementations.
 */
export function createPathMethods() {
  return {
    dirname(filePath: string): string {
      return pathUtils.dirname(filePath);
    },

    basename(filePath: string): string {
      return pathUtils.basename(filePath);
    },

    join(...segments: string[]): string {
      return pathUtils.join(...segments);
    },
  };
}
