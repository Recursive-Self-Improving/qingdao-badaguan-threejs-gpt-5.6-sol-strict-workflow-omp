export interface ContextToken { readonly generation: number }
export interface ContextRecoveryCallbacks {
  onLost(token: ContextToken): void;
  onRestoreRequested(token: ContextToken): void;
  onRestoreTimeout(token: ContextToken): void;
}

type RecoveryPhase = 'idle' | 'waiting' | 'rebuilding' | 'terminal';

export class ContextRecovery {
  private generation = 0;
  private phase: RecoveryPhase = 'idle';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: ContextRecoveryCallbacks,
    private readonly timeoutMs: number,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Context recovery timeout must be positive.');
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  complete(token: ContextToken): void {
    if (!this.current(token) || this.phase !== 'rebuilding') return;
    this.clearTimer();
    this.phase = 'terminal';
  }

  fail(token: ContextToken): void {
    if (!this.current(token) || this.phase === 'terminal') return;
    this.clearTimer();
    this.phase = 'terminal';
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.phase = 'terminal';
    this.clearTimer();
    if (this.started) {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    }
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.disposed || this.phase === 'waiting') return;
    const token = Object.freeze({ generation: ++this.generation });
    this.phase = 'waiting';
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (!this.current(token) || this.phase === 'terminal') return;
      this.phase = 'terminal';
      this.callbacks.onRestoreTimeout(token);
    }, this.timeoutMs);
    this.callbacks.onLost(token);
  };

  private readonly onContextRestored = (): void => {
    if (this.disposed || this.phase !== 'waiting') return;
    const token = Object.freeze({ generation: this.generation });
    this.phase = 'rebuilding';
    this.callbacks.onRestoreRequested(token);
  };

  private current(token: ContextToken): boolean {
    return !this.disposed && token.generation === this.generation;
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
