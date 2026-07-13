import { APP_CONFIG } from '../app/config';

export const DEFAULT_MAX_FRAME_DELTA_SECONDS = APP_CONFIG.controls.maxDeltaSeconds;

export interface FrameClockOptions {
  /** Maximum simulation time a single rendered frame may consume. */
  readonly maxDeltaSeconds?: number;
}

export interface FrameClockTick {
  /** Clamped simulation delta for this frame, in seconds. */
  readonly deltaSeconds: number;
  /** Sum of all accepted, clamped deltas since the last reset. */
  readonly elapsedSeconds: number;
}

const ZERO_TICK: FrameClockTick = Object.freeze({
  deltaSeconds: 0,
  elapsedSeconds: 0,
});

/**
 * Converts animation-frame timestamps into bounded simulation time.
 *
 * The first valid timestamp establishes a baseline. Pausing discards the current
 * baseline so resuming cannot turn hidden wall time into simulation catch-up.
 */
export class FrameClock {
  readonly maxDeltaSeconds: number;

  private previousTimestampMs: number | null = null;
  private elapsed = 0;
  private paused = false;
  private disposed = false;

  constructor(options: FrameClockOptions = {}) {
    const maxDeltaSeconds = options.maxDeltaSeconds ?? DEFAULT_MAX_FRAME_DELTA_SECONDS;
    if (!Number.isFinite(maxDeltaSeconds) || maxDeltaSeconds <= 0) {
      throw new RangeError('maxDeltaSeconds must be a finite number greater than zero');
    }
    this.maxDeltaSeconds = maxDeltaSeconds;
  }

  get elapsedSeconds(): number {
    return this.elapsed;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  tick(timestampMs: number): FrameClockTick {
    if (this.disposed || this.paused || !Number.isFinite(timestampMs)) {
      return this.currentZeroTick();
    }

    if (this.previousTimestampMs === null) {
      this.previousTimestampMs = timestampMs;
      return this.currentZeroTick();
    }

    // Animation timestamps should be monotonic. Ignore a bad sample without
    // moving the baseline backwards, allowing a later valid sample to recover.
    if (timestampMs <= this.previousTimestampMs) {
      return this.currentZeroTick();
    }

    const rawDeltaSeconds = (timestampMs - this.previousTimestampMs) / 1_000;
    this.previousTimestampMs = timestampMs;
    const deltaSeconds = Math.min(rawDeltaSeconds, this.maxDeltaSeconds);
    this.elapsed += deltaSeconds;

    return { deltaSeconds, elapsedSeconds: this.elapsed };
  }

  /** Pauses or resumes sampling. Resuming always requires a fresh baseline. */
  setPaused(paused: boolean): void {
    if (this.disposed || paused === this.paused) return;
    this.paused = paused;
    this.previousTimestampMs = null;
  }

  /** Clears accumulated time and requires the next valid tick to establish a baseline. */
  reset(): void {
    this.previousTimestampMs = null;
    this.elapsed = 0;
  }

  /** Permanently stops the clock. Safe to call repeatedly. */
  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.paused = true;
    this.disposed = true;
  }

  private currentZeroTick(): FrameClockTick {
    return this.elapsed === 0 ? ZERO_TICK : { deltaSeconds: 0, elapsedSeconds: this.elapsed };
  }
}
