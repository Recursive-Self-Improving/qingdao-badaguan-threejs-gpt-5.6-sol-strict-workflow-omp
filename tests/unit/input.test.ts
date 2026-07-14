import { describe, expect, it, vi } from 'vitest';

import { InputController } from '../../src/exploration/InputController';
import {
  PointerLockLook,
  type PointerLockDocument,
  type PointerLockTarget,
} from '../../src/exploration/PointerLockLook';

class KeyEventDouble extends Event {
  readonly code: string;
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;

  constructor(type: 'keydown' | 'keyup', options: {
    readonly code?: string;
    readonly key?: string;
    readonly metaKey?: boolean;
    readonly ctrlKey?: boolean;
    readonly altKey?: boolean;
  }) {
    super(type, { cancelable: true });
    this.code = options.code ?? '';
    this.key = options.key ?? '';
    this.metaKey = options.metaKey ?? false;
    this.ctrlKey = options.ctrlKey ?? false;
    this.altKey = options.altKey ?? false;
  }
}

class MovementEventDouble extends Event {
  constructor(readonly movementX: number, readonly movementY: number) {
    super('mousemove');
  }
}

class DocumentDouble extends EventTarget implements PointerLockDocument {
  hidden = false;
  activeElement: EventTarget | null;
  readonly body: EventTarget;
  pointerLockElement: EventTarget | null = null;
  readonly exitPointerLock = vi.fn(() => undefined);

  constructor(body: EventTarget) {
    super();
    this.body = body;
    this.activeElement = body;
  }
}

class PointerTargetDouble extends EventTarget implements PointerLockTarget {
  readonly requests: (PointerLockOptions | undefined)[] = [];
  implementation: (options?: PointerLockOptions) => Promise<void> | void = () => undefined;

  requestPointerLock(options?: PointerLockOptions): Promise<void> | void {
    this.requests.push(options);
    return this.implementation(options);
  }
}

function movement(controller: InputController): { forward: number; right: number } {
  return controller.readMovement({ forward: 0, right: 0 });
}

describe('InputController', () => {
  it('maps physical WASD and semantic arrows with alias retention, cancellation, and normalized diagonals', () => {
    const keyboard = new EventTarget();
    const canvas = new EventTarget();
    const documentRoot = new DocumentDouble(keyboard);
    const controller = new InputController({ canvas, keyboardTarget: keyboard, lifecycleTarget: keyboard, document: documentRoot });
    controller.start();
    controller.setEnabled(true);

    keyboard.dispatchEvent(new KeyEventDouble('keydown', { code: 'KeyW', key: 'z' }));
    keyboard.dispatchEvent(new KeyEventDouble('keydown', { code: 'Unknown', key: 'ArrowUp' }));
    expect(movement(controller)).toEqual({ forward: 1, right: 0 });
    keyboard.dispatchEvent(new KeyEventDouble('keyup', { code: 'KeyW', key: 'z' }));
    expect(movement(controller).forward).toBe(1);

    keyboard.dispatchEvent(new KeyEventDouble('keydown', { code: 'KeyS', key: 's' }));
    expect(movement(controller).forward).toBe(0);
    keyboard.dispatchEvent(new KeyEventDouble('keyup', { code: 'KeyS', key: 's' }));
    keyboard.dispatchEvent(new KeyEventDouble('keydown', { code: 'KeyD', key: 'd' }));
    const diagonal = movement(controller);
    expect(Math.hypot(diagonal.forward, diagonal.right)).toBeCloseTo(1, 12);

    controller.dispose();
  });

  it('latches reset once, avoids interactive targets, and prevents only intentional exploration keys', () => {
    const keyboard = new EventTarget();
    const canvas = new EventTarget();
    const interactive = new EventTarget();
    const documentRoot = new DocumentDouble(keyboard);
    const onReset = vi.fn();
    const controller = new InputController({ canvas, keyboardTarget: keyboard, lifecycleTarget: keyboard, document: documentRoot, onReset });
    controller.start();
    controller.setEnabled(true);

    const reset = new KeyEventDouble('keydown', { code: 'KeyR', key: 'r' });
    keyboard.dispatchEvent(reset);
    expect(reset.defaultPrevented).toBe(true);
    expect(controller.consumeReset()).toBe(true);
    expect(controller.consumeReset()).toBe(false);
    expect(onReset).toHaveBeenCalledTimes(1);
    keyboard.dispatchEvent(new KeyEventDouble('keydown', { code: 'KeyR', key: 'r' }));
    expect(controller.consumeReset()).toBe(false);
    expect(onReset).toHaveBeenCalledTimes(1);
    keyboard.dispatchEvent(new KeyEventDouble('keyup', { code: 'KeyR', key: 'r' }));
    keyboard.dispatchEvent(new KeyEventDouble('keydown', { code: 'KeyR', key: 'r' }));
    expect(controller.consumeReset()).toBe(true);
    expect(onReset).toHaveBeenCalledTimes(2);

    documentRoot.activeElement = interactive;
    const ignored = new KeyEventDouble('keydown', { key: 'ArrowLeft' });
    keyboard.dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(false);
    expect(movement(controller).right).toBe(0);
    documentRoot.activeElement = keyboard;
    const shortcut = new KeyEventDouble('keydown', { code: 'KeyW', ctrlKey: true });
    keyboard.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(false);

    keyboard.dispatchEvent(new KeyEventDouble('keydown', { code: 'KeyW' }));
    expect(movement(controller).forward).toBe(1);
    documentRoot.activeElement = interactive;
    documentRoot.dispatchEvent(new Event('focusin'));
    expect(movement(controller).forward).toBe(0);

    controller.dispose();
  });

  it.each([
    ['blur', 'blur'],
    ['focus', 'focus'],
    ['orientationchange', 'orientation'],
  ] as const)('clears held input on %s', (eventName, reason) => {
    const keyboard = new EventTarget();
    const documentRoot = new DocumentDouble(keyboard);
    const cleared: string[] = [];
    const controller = new InputController({
      canvas: new EventTarget(),
      keyboardTarget: keyboard,
      lifecycleTarget: keyboard,
      document: documentRoot,
      onClear: (value) => cleared.push(value),
    });
    controller.start();
    controller.setEnabled(true);
    keyboard.dispatchEvent(new KeyEventDouble('keydown', { code: 'KeyW' }));
    keyboard.dispatchEvent(new Event(eventName));
    expect(movement(controller)).toEqual({ forward: 0, right: 0 });
    expect(cleared).toContain(reason);
    controller.dispose();
  });

  it('clears only when visibility becomes hidden and when disabled', () => {
    const keyboard = new EventTarget();
    const documentRoot = new DocumentDouble(keyboard);
    const controller = new InputController({
      canvas: new EventTarget(),
      keyboardTarget: keyboard,
      lifecycleTarget: keyboard,
      document: documentRoot,
    });
    controller.start();
    controller.setEnabled(true);
    keyboard.dispatchEvent(new KeyEventDouble('keydown', { code: 'KeyW' }));
    documentRoot.dispatchEvent(new Event('visibilitychange'));
    expect(movement(controller).forward).toBe(1);
    documentRoot.hidden = true;
    documentRoot.dispatchEvent(new Event('visibilitychange'));
    expect(movement(controller).forward).toBe(0);
    controller.setEnabled(false);
    const arrow = new KeyEventDouble('keydown', { key: 'ArrowUp' });
    keyboard.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(false);
    controller.dispose();
  });

  it('merges keyboard and external holds without cross-source release', () => {
    const keyboard = new EventTarget();
    const canvas = new EventTarget();
    const documentRoot = new DocumentDouble(keyboard);
    const controller = new InputController({ canvas, keyboardTarget: keyboard, lifecycleTarget: keyboard, document: documentRoot });
    controller.start();
    controller.setEnabled(true);
    keyboard.dispatchEvent(new KeyEventDouble('keydown', { code: 'KeyW' }));
    controller.setAction('move-forward', true);
    controller.setAction('move-right', true);
    expect(Math.hypot(movement(controller).forward, movement(controller).right)).toBeCloseTo(1, 12);
    controller.setAction('move-forward', false);
    expect(movement(controller).forward).toBeGreaterThan(0);
    keyboard.dispatchEvent(new KeyEventDouble('keyup', { code: 'KeyW' }));
    expect(movement(controller)).toEqual({ forward: 0, right: 1 });
    controller.clear('viewport');
    expect(movement(controller)).toEqual({ forward: 0, right: 0 });
    controller.dispose();
  });
});

describe('PointerLockLook', () => {
  it('uses document-authoritative confirmation, emits look only while enabled and owned, and reports exit once', async () => {
    const target = new PointerTargetDouble();
    const documentRoot = new DocumentDouble(new EventTarget());
    const outcomes: string[] = [];
    const looks: { yaw: number; pitch: number }[] = [];
    target.implementation = () => Promise.resolve();
    const look = new PointerLockLook({
      target,
      document: documentRoot,
      sensitivityRadiansPerPixel: 0.002,
      onLook: (delta) => looks.push(delta),
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    look.start();
    look.setEnabled(true);
    look.requestLock();
    await Promise.resolve();
    expect(target.requests).toEqual([{ unadjustedMovement: true }]);
    expect(outcomes).toEqual([]);

    documentRoot.pointerLockElement = target;
    documentRoot.dispatchEvent(new Event('pointerlockchange'));
    expect(outcomes).toEqual(['locked']);
    documentRoot.dispatchEvent(new MovementEventDouble(10, -5));
    expect(looks).toEqual([{ yaw: -0.02, pitch: 0.01 }]);
    look.setEnabled(false);
    documentRoot.dispatchEvent(new MovementEventDouble(10, 10));
    expect(looks).toHaveLength(1);

    documentRoot.pointerLockElement = null;
    documentRoot.dispatchEvent(new Event('pointerlockchange'));
    documentRoot.dispatchEvent(new Event('pointerlockchange'));
    expect(outcomes).toEqual(['locked', 'unlocked']);
    look.dispose();
  });

  it('retries raw input exactly once only for NotSupportedError and caches the capability', async () => {
    const target = new PointerTargetDouble();
    const documentRoot = new DocumentDouble(new EventTarget());
    let calls = 0;
    target.implementation = () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new DOMException('raw unsupported', 'NotSupportedError'))
        : Promise.resolve();
    };
    const look = new PointerLockLook({
      target,
      document: documentRoot,
      sensitivityRadiansPerPixel: 0.002,
      onLook: vi.fn(),
      onOutcome: vi.fn(),
    });
    look.start();
    look.setEnabled(true);
    look.requestLock();
    await Promise.resolve();
    await Promise.resolve();
    expect(target.requests).toEqual([{ unadjustedMovement: true }, undefined]);

    look.requestLock();
    expect(target.requests).toEqual([{ unadjustedMovement: true }, undefined, undefined]);
    look.dispose();
  });

  it('lets a classified raw rejection win over its generic document error event', async () => {
    const target = new PointerTargetDouble();
    const documentRoot = new DocumentDouble(new EventTarget());
    const outcomes: string[] = [];
    let rejectRaw: (error: unknown) => void = () => { throw new Error('Raw request was not started.'); };
    target.implementation = (options) => options?.unadjustedMovement === true
      ? new Promise<void>((_resolve, reject) => { rejectRaw = reject; })
      : Promise.resolve();
    const look = new PointerLockLook({
      target,
      document: documentRoot,
      sensitivityRadiansPerPixel: 0.002,
      onLook: vi.fn(),
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    look.start();
    look.setEnabled(true);
    look.requestLock();
    documentRoot.dispatchEvent(new Event('pointerlockerror'));
    rejectRaw(new DOMException('raw unsupported', 'NotSupportedError'));
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(target.requests).toEqual([{ unadjustedMovement: true }, undefined]);
    expect(outcomes).toEqual([]);
    look.dispose();
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['AbortError', 'error'],
  ] as const)('maps %s without retry or automatic re-request', async (name, expected) => {
    const target = new PointerTargetDouble();
    const documentRoot = new DocumentDouble(new EventTarget());
    const outcomes: string[] = [];
    target.implementation = () => Promise.reject(new DOMException(name, name));
    const look = new PointerLockLook({
      target,
      document: documentRoot,
      sensitivityRadiansPerPixel: 0.002,
      onLook: vi.fn(),
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    look.start();
    look.setEnabled(true);
    look.requestLock();
    await Promise.resolve();
    expect(outcomes).toEqual([expected]);
    expect(target.requests).toHaveLength(1);
    look.dispose();
  });

  it('invalidates pending requests while disabled and rejects a late disabled confirmation', async () => {
    const target = new PointerTargetDouble();
    const documentRoot = new DocumentDouble(new EventTarget());
    const outcomes: string[] = [];
    let rejectRaw: (error: unknown) => void = () => { throw new Error('Raw request was not started.'); };
    target.implementation = () => new Promise<void>((_resolve, reject) => { rejectRaw = reject; });
    const look = new PointerLockLook({
      target,
      document: documentRoot,
      sensitivityRadiansPerPixel: 0.002,
      onLook: vi.fn(),
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    look.start();
    look.setEnabled(true);
    look.requestLock();
    look.setEnabled(false);
    rejectRaw(new DOMException('raw unsupported', 'NotSupportedError'));
    await Promise.resolve();
    expect(target.requests).toEqual([{ unadjustedMovement: true }]);
    expect(outcomes).toEqual([]);

    documentRoot.pointerLockElement = target;
    documentRoot.dispatchEvent(new Event('pointerlockchange'));
    expect(documentRoot.exitPointerLock).toHaveBeenCalledOnce();
    expect(outcomes).toEqual([]);
    look.dispose();
  });

  it('releases a late confirmation after disposal and detaches once authority settles', () => {
    const target = new PointerTargetDouble();
    const documentRoot = new DocumentDouble(new EventTarget());
    const outcomes: string[] = [];
    target.implementation = () => Promise.resolve();
    const look = new PointerLockLook({
      target,
      document: documentRoot,
      sensitivityRadiansPerPixel: 0.002,
      onLook: vi.fn(),
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    look.start();
    look.setEnabled(true);
    look.requestLock();
    look.dispose();

    documentRoot.pointerLockElement = target;
    documentRoot.dispatchEvent(new Event('pointerlockchange'));
    expect(documentRoot.exitPointerLock).toHaveBeenCalledOnce();
    expect(outcomes).toEqual([]);
    documentRoot.pointerLockElement = null;
    documentRoot.dispatchEvent(new Event('pointerlockchange'));
    documentRoot.pointerLockElement = target;
    documentRoot.dispatchEvent(new Event('pointerlockchange'));
    expect(documentRoot.exitPointerLock).toHaveBeenCalledOnce();
  });

  it('detaches after a pending raw request rejects following disposal without retrying', async () => {
    const target = new PointerTargetDouble();
    const documentRoot = new DocumentDouble(new EventTarget());
    const outcomes: string[] = [];
    let rejectRaw: (error: unknown) => void = () => { throw new Error('Raw request was not started.'); };
    target.implementation = () => new Promise<void>((_resolve, reject) => { rejectRaw = reject; });
    const look = new PointerLockLook({
      target,
      document: documentRoot,
      sensitivityRadiansPerPixel: 0.002,
      onLook: vi.fn(),
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    look.start();
    look.setEnabled(true);
    look.requestLock();
    look.dispose();
    rejectRaw(new DOMException('raw unsupported', 'NotSupportedError'));
    await Promise.resolve();
    expect(target.requests).toEqual([{ unadjustedMovement: true }]);
    expect(outcomes).toEqual([]);

    documentRoot.pointerLockElement = target;
    documentRoot.dispatchEvent(new Event('pointerlockchange'));
    expect(documentRoot.exitPointerLock).not.toHaveBeenCalled();
  });

  it('releases only an owned lock and keeps unlock document-authoritative', () => {
    const target = new PointerTargetDouble();
    const documentRoot = new DocumentDouble(new EventTarget());
    const outcomes: string[] = [];
    const look = new PointerLockLook({
      target,
      document: documentRoot,
      sensitivityRadiansPerPixel: 0.002,
      onLook: vi.fn(),
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    look.start();
    look.releaseLock();
    expect(documentRoot.exitPointerLock).not.toHaveBeenCalled();
    look.setEnabled(true);
    documentRoot.pointerLockElement = target;
    documentRoot.dispatchEvent(new Event('pointerlockchange'));
    look.releaseLock();
    expect(documentRoot.exitPointerLock).toHaveBeenCalledOnce();
    expect(outcomes).toEqual(['locked']);
    look.dispose();
  });
});
