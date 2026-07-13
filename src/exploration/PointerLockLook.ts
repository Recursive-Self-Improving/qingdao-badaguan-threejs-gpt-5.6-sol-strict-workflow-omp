import type { LookDelta } from './types';

export type PointerLockOutcome = 'locked' | 'unlocked' | 'denied' | 'error';

export interface PointerLockTarget extends EventTarget {
  requestPointerLock(options?: PointerLockOptions): Promise<void> | void;
}

export interface PointerLockDocument extends EventTarget {
  readonly pointerLockElement: EventTarget | null;
  exitPointerLock(): Promise<void> | void;
}

export interface PointerLockLookOptions {
  readonly target: PointerLockTarget;
  readonly document?: PointerLockDocument;
  readonly sensitivityRadiansPerPixel: number;
  readonly onLook: (delta: LookDelta) => void;
  readonly onOutcome: (outcome: PointerLockOutcome) => void;
}

interface PointerMovementEvent extends Event {
  readonly movementX: number;
  readonly movementY: number;
}

function isPointerMovementEvent(event: Event): event is PointerMovementEvent {
  return 'movementX' in event && typeof event.movementX === 'number'
    && 'movementY' in event && typeof event.movementY === 'number';
}

function errorName(error: unknown): string | null {
  return error instanceof DOMException
    ? error.name
    : error !== null && typeof error === 'object' && 'name' in error && typeof error.name === 'string'
      ? error.name
      : null;
}

export class PointerLockLook {
  private readonly target: PointerLockTarget;
  private readonly documentRoot: PointerLockDocument;
  private readonly sensitivity: number;
  private readonly onLookCallback: (delta: LookDelta) => void;
  private readonly onOutcomeCallback: (outcome: PointerLockOutcome) => void;
  private enabled = false;
  private started = false;
  private disposed = false;
  private owned = false;
  private rawUnsupported = false;
  private generation = 0;
  private terminalGeneration = 0;
  private pendingErrorTimer: ReturnType<typeof setTimeout> | null = null;
  private attemptPending = false;

  private readonly onPointerLockChange = (): void => {
    const nowOwned = this.documentRoot.pointerLockElement === this.target;
    if (this.disposed) {
      if (nowOwned) {
        this.exitOwnedLock();
        if (this.documentRoot.pointerLockElement !== this.target) this.detachListeners();
      } else {
        this.attemptPending = false;
        this.detachListeners();
      }
      return;
    }
    if (nowOwned && !this.enabled) {
      this.clearPendingError();
      this.attemptPending = false;
      this.releaseLock();
      return;
    }
    if (nowOwned) {
      if (!this.owned) {
        this.clearPendingError();
        this.attemptPending = false;
        this.owned = true;
        this.terminalGeneration = this.generation;
        this.onOutcomeCallback('locked');
      }
      return;
    }
    if (this.owned) {
      this.owned = false;
      this.attemptPending = false;
      this.terminalGeneration = this.generation;
      this.onOutcomeCallback('unlocked');
    }
  };

  private readonly onPointerLockError = (): void => {
    if (this.disposed) {
      this.attemptPending = false;
      this.detachListeners();
      return;
    }
    if (this.generation === 0) return;
    if (!this.enabled) {
      this.attemptPending = false;
      this.clearPendingError();
      return;
    }
    const generation = this.generation;
    this.clearPendingError();
    this.pendingErrorTimer = setTimeout(() => {
      this.pendingErrorTimer = null;
      if (!this.disposed
        && this.enabled
        && this.generation === generation
        && this.terminalGeneration !== generation) {
        this.attemptPending = false;
        this.terminalGeneration = generation;
        this.onOutcomeCallback('error');
      }
    }, 0);
  };

  private readonly onMouseMove = (event: Event): void => {
    if (!isPointerMovementEvent(event) || this.disposed || !this.enabled || !this.owned) return;
    const movementX = event.movementX;
    const movementY = event.movementY;
    if ((!Number.isFinite(movementX) || !Number.isFinite(movementY)) || (movementX === 0 && movementY === 0)) return;
    this.onLookCallback({
      yaw: -movementX * this.sensitivity,
      pitch: -movementY * this.sensitivity,
    });
  };

  constructor(options: PointerLockLookOptions) {
    if (!Number.isFinite(options.sensitivityRadiansPerPixel) || options.sensitivityRadiansPerPixel <= 0) {
      throw new RangeError('Pointer-lock look sensitivity must be a finite positive number.');
    }
    this.target = options.target;
    this.documentRoot = options.document ?? document;
    this.sensitivity = options.sensitivityRadiansPerPixel;
    this.onLookCallback = options.onLook;
    this.onOutcomeCallback = options.onOutcome;
  }

  get isLocked(): boolean {
    return !this.disposed && this.documentRoot.pointerLockElement === this.target;
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.documentRoot.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.documentRoot.addEventListener('pointerlockerror', this.onPointerLockError);
    this.documentRoot.addEventListener('mousemove', this.onMouseMove);
    this.onPointerLockChange();
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.generation += 1;
      this.terminalGeneration = this.generation;
      this.clearPendingError();
    }
  }

  requestLock(): void {
    if (this.disposed || !this.enabled) return;
    if (this.documentRoot.pointerLockElement === this.target) {
      this.onPointerLockChange();
      return;
    }
    const generation = ++this.generation;
    this.attemptPending = true;
    this.terminalGeneration = 0;
    this.request(generation, !this.rawUnsupported);
  }

  releaseLock(): void {
    if (this.disposed || this.documentRoot.pointerLockElement !== this.target) return;
    this.exitOwnedLock();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    this.generation += 1;
    this.clearPendingError();
    this.documentRoot.removeEventListener('mousemove', this.onMouseMove);
    if (this.documentRoot.pointerLockElement === this.target) {
      this.attemptPending = true;
      this.exitOwnedLock();
      if (this.documentRoot.pointerLockElement !== this.target) this.detachListeners();
    } else if (!this.attemptPending) {
      this.detachListeners();
    }
    this.owned = false;
  }

  private request(generation: number, raw: boolean): void {
    try {
      const result = raw
        ? this.target.requestPointerLock({ unadjustedMovement: true })
        : this.target.requestPointerLock();
      if (result instanceof Promise) {
        void result.catch((error: unknown) => this.handleRequestFailure(generation, raw, error));
      }
    } catch (error) {
      this.handleRequestFailure(generation, raw, error);
    }
  }

  private handleRequestFailure(generation: number, raw: boolean, error: unknown): void {
    if (this.disposed) {
      this.attemptPending = false;
      this.detachListeners();
      return;
    }
    if (this.generation !== generation || this.terminalGeneration === generation) {
      if (!this.enabled) this.attemptPending = false;
      return;
    }
    this.clearPendingError();
    const name = errorName(error);
    if (raw && name === 'NotSupportedError') {
      this.rawUnsupported = true;
      this.request(generation, false);
      return;
    }
    this.attemptPending = false;
    this.terminalGeneration = generation;
    this.onOutcomeCallback(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
  }

  private clearPendingError(): void {
    if (this.pendingErrorTimer === null) return;
    clearTimeout(this.pendingErrorTimer);
    this.pendingErrorTimer = null;
  }

  private exitOwnedLock(): void {
    try {
      const result = this.documentRoot.exitPointerLock();
      if (result instanceof Promise) {
        void result.catch(() => {
          if (this.disposed) this.detachListeners();
        });
      }
    } catch {
      if (this.disposed) this.detachListeners();
    }
  }

  private detachListeners(): void {
    if (!this.started) return;
    this.documentRoot.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.documentRoot.removeEventListener('pointerlockerror', this.onPointerLockError);
    this.documentRoot.removeEventListener('mousemove', this.onMouseMove);
    this.started = false;
  }
}
