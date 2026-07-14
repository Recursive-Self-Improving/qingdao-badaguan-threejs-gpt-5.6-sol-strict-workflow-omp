import type { LookDelta } from './types';
import type { DragLookTarget } from './DragLook';

export interface TouchLookOptions {
  readonly target: DragLookTarget;
  readonly sensitivityRadiansPerPixel: number;
  readonly maxDeltaPixels?: number;
  readonly onLook: (delta: LookDelta) => void;
}

interface TouchPointerEvent extends Event {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly clientX: number;
  readonly clientY: number;
}

function isTouchPointerEvent(event: Event): event is TouchPointerEvent {
  return 'pointerId' in event && typeof event.pointerId === 'number'
    && 'pointerType' in event && event.pointerType === 'touch';
}

export class TouchLook {
  readonly #target: DragLookTarget;
  readonly #sensitivity: number;
  readonly #maxDelta: number;
  readonly #onLook: (delta: LookDelta) => void;
  #pointerId: number | null = null;
  #lastX = 0;
  #lastY = 0;
  #enabled = false;
  #started = false;
  #disposed = false;

  constructor(options: TouchLookOptions) {
    this.#target = options.target;
    this.#sensitivity = options.sensitivityRadiansPerPixel;
    this.#maxDelta = options.maxDeltaPixels ?? 120;
    this.#onLook = options.onLook;
  }

  get activePointerId(): number | null { return this.#pointerId; }

  start(): void {
    if (this.#started || this.#disposed) return;
    this.#started = true;
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
      this.#target.addEventListener(type, this.#handlePointer);
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.#disposed || enabled === this.#enabled) return;
    this.#enabled = enabled;
    if (!enabled) this.cancel();
  }

  cancel(): void {
    const pointerId = this.#pointerId;
    this.#pointerId = null;
    if (pointerId === null) return;
    try {
      if (this.#target.hasPointerCapture?.(pointerId) !== false) this.#target.releasePointerCapture(pointerId);
    } catch { /* capture may already be gone */ }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.cancel();
    this.#enabled = false;
    this.#disposed = true;
    if (!this.#started) return;
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
      this.#target.removeEventListener(type, this.#handlePointer);
    }
  }

  readonly #handlePointer = (event: Event): void => {
    if (!isTouchPointerEvent(event)) return;
    if (event.type === 'pointerdown') {
      if (!this.#enabled || this.#pointerId !== null) return;
      this.#pointerId = event.pointerId;
      this.#lastX = event.clientX;
      this.#lastY = event.clientY;
      try { this.#target.setPointerCapture(event.pointerId); } catch { /* cancellation still works */ }
      event.preventDefault();
      return;
    }
    if (event.pointerId !== this.#pointerId) return;
    if (event.type !== 'pointermove') {
      this.cancel();
      return;
    }
    const dx = event.clientX - this.#lastX;
    const dy = event.clientY - this.#lastY;
    this.#lastX = event.clientX;
    this.#lastY = event.clientY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return;
    const clampedX = Math.max(-this.#maxDelta, Math.min(this.#maxDelta, dx));
    const clampedY = Math.max(-this.#maxDelta, Math.min(this.#maxDelta, dy));
    this.#onLook({ yaw: -clampedX * this.#sensitivity, pitch: -clampedY * this.#sensitivity });
    event.preventDefault();
  };
}
