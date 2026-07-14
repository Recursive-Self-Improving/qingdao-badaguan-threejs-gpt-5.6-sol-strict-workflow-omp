import type { LookDelta } from './types';

export interface DragLookTarget extends EventTarget {
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
  hasPointerCapture?(pointerId: number): boolean;
  focus?(options?: FocusOptions): void;
}

export interface DragLookOptions {
  readonly target: DragLookTarget;
  readonly lifecycleTarget?: EventTarget;
  readonly sensitivityRadiansPerPixel: number;
  readonly maxDeltaPixels?: number;
  readonly onLook: (delta: LookDelta) => void;
}

interface PointerEventLike extends Event {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly button: number;
  readonly isPrimary: boolean;
  readonly clientX: number;
  readonly clientY: number;
}

function isPointerEventLike(event: Event): event is PointerEventLike {
  return 'pointerId' in event && typeof event.pointerId === 'number'
    && 'pointerType' in event && typeof event.pointerType === 'string';
}

export class DragLook {
  readonly #target: DragLookTarget;
  readonly #lifecycleTarget: EventTarget;
  readonly #sensitivity: number;
  readonly #maxDelta: number;
  readonly #onLook: (delta: LookDelta) => void;
  #pointerId: number | null = null;
  #lastX = 0;
  #lastY = 0;
  #enabled = false;
  #started = false;
  #disposed = false;

  constructor(options: DragLookOptions) {
    this.#target = options.target;
    this.#lifecycleTarget = options.lifecycleTarget ?? window;
    this.#sensitivity = options.sensitivityRadiansPerPixel;
    this.#maxDelta = options.maxDeltaPixels ?? 120;
    this.#onLook = options.onLook;
  }

  get isDragging(): boolean { return this.#pointerId !== null; }

  start(): void {
    if (this.#started || this.#disposed) return;
    this.#started = true;
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
      this.#target.addEventListener(type, this.#handlePointer);
    }
    this.#lifecycleTarget.addEventListener('pointerup', this.#handlePointer);
    this.#lifecycleTarget.addEventListener('pointercancel', this.#handlePointer);
    this.#lifecycleTarget.addEventListener('blur', this.#handleBlur);
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
    this.#lifecycleTarget.removeEventListener('pointerup', this.#handlePointer);
    this.#lifecycleTarget.removeEventListener('pointercancel', this.#handlePointer);
    this.#lifecycleTarget.removeEventListener('blur', this.#handleBlur);
  }

  readonly #handleBlur = (): void => this.cancel();

  readonly #handlePointer = (event: Event): void => {
    if (!isPointerEventLike(event)) return;
    if (event.type === 'pointerdown') {
      if (!this.#enabled || this.#pointerId !== null || event.pointerType === 'touch'
        || event.button !== 0 || event.isPrimary === false) return;
      this.#pointerId = event.pointerId;
      this.#lastX = event.clientX;
      this.#lastY = event.clientY;
      this.#target.focus?.({ preventScroll: true });
      try { this.#target.setPointerCapture(event.pointerId); } catch { /* lifecycle fallback remains */ }
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
