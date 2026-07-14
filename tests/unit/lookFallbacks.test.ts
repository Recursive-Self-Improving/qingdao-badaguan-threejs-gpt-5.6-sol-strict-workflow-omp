import { describe, expect, it } from 'vitest';
import { DragLook, type DragLookTarget } from '../../src/exploration/DragLook';
import { TouchLook } from '../../src/exploration/TouchLook';

class PointerTarget extends EventTarget implements DragLookTarget {
  captured: number | null = null;
  setPointerCapture(id: number): void { this.captured = id; }
  releasePointerCapture(id: number): void { if (this.captured === id) this.captured = null; }
  hasPointerCapture(id: number): boolean { return this.captured === id; }
  focus(): void {}
}

class PointerDouble extends Event {
  constructor(type: string, readonly pointerId: number, readonly pointerType: string, readonly clientX: number, readonly clientY: number, readonly button = 0, readonly isPrimary = true) {
    super(type, { cancelable: true });
  }
}

describe('DragLook', () => {
  it('captures primary drag, clamps look, ignores touch, and ends outside', () => {
    const target = new PointerTarget();
    const lifecycle = new EventTarget();
    const looks: { yaw: number; pitch: number }[] = [];
    const drag = new DragLook({ target, lifecycleTarget: lifecycle, sensitivityRadiansPerPixel: 0.01, onLook: (delta) => looks.push(delta) });
    drag.start(); drag.setEnabled(true);
    target.dispatchEvent(new PointerDouble('pointerdown', 1, 'touch', 0, 0));
    expect(drag.isDragging).toBe(false);
    target.dispatchEvent(new PointerDouble('pointerdown', 2, 'mouse', 10, 20));
    target.dispatchEvent(new PointerDouble('pointermove', 2, 'mouse', 1010, -980));
    expect(looks).toEqual([{ yaw: -1.2, pitch: 1.2 }]);
    lifecycle.dispatchEvent(new PointerDouble('pointerup', 2, 'mouse', 1010, -980));
    expect(drag.isDragging).toBe(false);
    target.dispatchEvent(new PointerDouble('pointermove', 2, 'mouse', 20, 20));
    expect(looks).toHaveLength(1);
    drag.dispose();
  });
});

describe('TouchLook', () => {
  it('keeps first-touch ownership without transfer and clears cancellation', () => {
    const target = new PointerTarget();
    const looks: { yaw: number; pitch: number }[] = [];
    const touch = new TouchLook({ target, sensitivityRadiansPerPixel: 0.01, onLook: (delta) => looks.push(delta) });
    touch.start(); touch.setEnabled(true);
    target.dispatchEvent(new PointerDouble('pointerdown', 1, 'touch', 0, 0));
    target.dispatchEvent(new PointerDouble('pointerdown', 2, 'touch', 100, 100));
    target.dispatchEvent(new PointerDouble('pointermove', 2, 'touch', 200, 200));
    expect(looks).toHaveLength(0);
    target.dispatchEvent(new PointerDouble('pointercancel', 1, 'touch', 0, 0));
    target.dispatchEvent(new PointerDouble('pointermove', 2, 'touch', 210, 210));
    expect(touch.activePointerId).toBeNull();
    expect(looks).toHaveLength(0);
    target.dispatchEvent(new PointerDouble('pointerdown', 3, 'touch', 5, 5));
    target.dispatchEvent(new PointerDouble('pointermove', 3, 'touch', 15, 0));
    expect(looks).toEqual([{ yaw: -0.1, pitch: 0.05 }]);
    touch.dispose();
  });
});
