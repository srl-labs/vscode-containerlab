/**
 * LatencySimulator - Simulate network latency in dev mode
 *
 * Provides configurable delays to simulate realistic extension
 * response times for testing loading states, spinners, etc.
 */

// ============================================================================
// Types
// ============================================================================

export type LatencyProfile = 'instant' | 'fast' | 'normal' | 'slow';

export type OperationType =
  | 'request'      // POST/RESPONSE async requests
  | 'command'      // Fire-and-forget commands
  | 'lifecycle'    // Deploy/destroy operations
  | 'editor'       // Node/link editor saves
  | 'annotation';  // Annotation saves

interface LatencyConfig {
  request: number;
  command: number;
  lifecycle: number;
  editor: number;
  annotation: number;
}

const LATENCY_PROFILES: Record<LatencyProfile, LatencyConfig> = {
  instant: {
    request: 0,
    command: 0,
    lifecycle: 0,
    editor: 0,
    annotation: 0
  },
  fast: {
    request: 50,
    command: 50,
    lifecycle: 500,
    editor: 100,
    annotation: 50
  },
  normal: {
    request: 200,
    command: 150,
    lifecycle: 1500,
    editor: 300,
    annotation: 150
  },
  slow: {
    request: 500,
    command: 300,
    lifecycle: 3000,
    editor: 800,
    annotation: 400
  }
};

export interface LatencySimulatorConfig {
  /** Which latency profile to use */
  profile?: LatencyProfile;
  /** Add random jitter (0-1, where 0.2 = +/- 20%) */
  jitter?: number;
  /** Enable logging of delays */
  verbose?: boolean;
}

// ============================================================================
// LatencySimulator Class
// ============================================================================

export class LatencySimulator {
  private profile: LatencyProfile;
  private jitter: number;
  private verbose: boolean;
  private listeners: Set<(profile: LatencyProfile) => void> = new Set();

  constructor(config: LatencySimulatorConfig = {}) {
    this.profile = config.profile ?? 'fast';
    this.jitter = config.jitter ?? 0.2;
    this.verbose = config.verbose ?? false;
  }

  // --------------------------------------------------------------------------
  // Profile Management
  // --------------------------------------------------------------------------

  /** Get current profile */
  getProfile(): LatencyProfile {
    return this.profile;
  }

  /** Set latency profile */
  setProfile(profile: LatencyProfile): void {
    this.profile = profile;
    this.notifyListeners();
    if (this.verbose) {
      console.log(`%c[Latency] Profile set to: ${profile}`, 'color: #9C27B0;');
    }
  }

  /** Subscribe to profile changes */
  onProfileChange(listener: (profile: LatencyProfile) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.profile);
    }
  }

  // --------------------------------------------------------------------------
  // Delay Calculation
  // --------------------------------------------------------------------------

  /** Get delay for an operation type */
  getDelay(operation: OperationType): number {
    const baseDelay = LATENCY_PROFILES[this.profile][operation];

    if (this.jitter === 0) {
      return baseDelay;
    }

    // Add random jitter
    const jitterAmount = baseDelay * this.jitter;
    const jitterOffset = (Math.random() * 2 - 1) * jitterAmount;
    return Math.max(0, Math.round(baseDelay + jitterOffset));
  }

  // --------------------------------------------------------------------------
  // Simulation
  // --------------------------------------------------------------------------

  /**
   * Simulate delay for an operation
   * Returns a promise that resolves after the delay
   */
  async delay(operation: OperationType): Promise<void> {
    const ms = this.getDelay(operation);
    if (ms === 0) return;

    if (this.verbose) {
      console.log(
        `%c[Latency] Simulating ${ms}ms delay for: ${operation}`,
        'color: #9C27B0;'
      );
    }

    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wrap a function with simulated latency
   */
  async simulate<T>(
    operation: OperationType,
    fn: () => T | Promise<T>
  ): Promise<T> {
    await this.delay(operation);
    return fn();
  }

  /**
   * Wrap a callback with simulated latency
   * Useful for setTimeout-style patterns
   */
  simulateCallback(
    operation: OperationType,
    callback: () => void
  ): void {
    const delay = this.getDelay(operation);
    setTimeout(callback, delay);
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  /** Set jitter amount (0-1) */
  setJitter(jitter: number): void {
    this.jitter = Math.max(0, Math.min(1, jitter));
  }

  /** Enable/disable verbose logging */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /** Get all profile names */
  static getProfiles(): LatencyProfile[] {
    return ['instant', 'fast', 'normal', 'slow'];
  }

  /** Get config for a profile */
  static getProfileConfig(profile: LatencyProfile): LatencyConfig {
    return { ...LATENCY_PROFILES[profile] };
  }
}

// ============================================================================
// Singleton Instance (Optional)
// ============================================================================

let defaultInstance: LatencySimulator | null = null;

/**
 * Get the default LatencySimulator instance
 */
export function getLatencySimulator(): LatencySimulator {
  if (!defaultInstance) {
    defaultInstance = new LatencySimulator();
  }
  return defaultInstance;
}

/**
 * Set the default LatencySimulator instance
 */
export function setLatencySimulator(simulator: LatencySimulator): void {
  defaultInstance = simulator;
}
