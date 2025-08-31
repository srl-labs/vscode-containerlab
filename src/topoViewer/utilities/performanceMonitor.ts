/**
 * Performance monitoring utility for TopoViewer
 * Tracks load times and provides metrics for optimization
 */

import { log } from '../logging/logger';

// Use Date.now() for Node.js compatibility, performance is browser-only
// eslint-disable-next-line no-undef
const getTime = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

export class PerformanceMonitor {
  private static marks: Map<string, number> = new Map();
  private static measures: Map<string, number> = new Map();

  /**
   * Start timing a specific operation
   */
  static mark(name: string): void {
    this.marks.set(name, getTime());
    log.debug(`Performance mark: ${name}`);
  }

  /**
   * Measure time between two marks or from a mark to now
   */
  static measure(name: string, startMark: string, endMark?: string): number {
    const startTime = this.marks.get(startMark);
    if (!startTime) {
      log.warn(`Start mark not found: ${startMark}`);
      return 0;
    }

    const endTime = endMark ? this.marks.get(endMark) : getTime();
    if (endMark && !endTime) {
      log.warn(`End mark not found: ${endMark}`);
      return 0;
    }

    const duration = (endTime || getTime()) - startTime;
    this.measures.set(name, duration);

    // Log performance metrics
    if (duration > 1000) {
      log.warn(`Slow operation - ${name}: ${duration.toFixed(2)}ms`);
    } else if (duration > 100) {
      log.info(`Performance - ${name}: ${duration.toFixed(2)}ms`);
    } else {
      log.debug(`Performance - ${name}: ${duration.toFixed(2)}ms`);
    }

    return duration;
  }

  /**
   * Get all recorded measures
   */
  static getMeasures(): Record<string, number> {
    const result: Record<string, number> = {};
    this.measures.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Clear all marks and measures
   */
  static clear(): void {
    this.marks.clear();
    this.measures.clear();
  }

  /**
   * Log a performance summary
   */
  static logSummary(): void {
    const measures = this.getMeasures();
    const total = Object.values(measures).reduce((sum, val) => sum + val, 0);

    log.info('=== Performance Summary ===');
    Object.entries(measures)
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, duration]) => {
        const percentage = ((duration / total) * 100).toFixed(1);
        log.info(`  ${name}: ${duration.toFixed(2)}ms (${percentage}%)`);
      });
    log.info(`Total: ${total.toFixed(2)}ms`);
    log.info('========================');
  }
}

// Export convenience functions
export const perfMark = (name: string) => PerformanceMonitor.mark(name);
export const perfMeasure = (name: string, startMark: string, endMark?: string) =>
  PerformanceMonitor.measure(name, startMark, endMark);
export const perfSummary = () => PerformanceMonitor.logSummary();