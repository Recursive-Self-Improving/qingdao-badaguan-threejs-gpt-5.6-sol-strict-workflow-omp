import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextRecovery, type ContextToken } from '../../src/render/contextRecovery';

afterEach(() => vi.useRealTimers());

function canvasDouble(): HTMLCanvasElement {
  return new EventTarget() as HTMLCanvasElement;
}

describe('ContextRecovery', () => {
  it('prevents loss default, coalesces restore, and completes only the active token', () => {
    const canvas = canvasDouble();
    const lost: ContextToken[] = [];
    const requested: ContextToken[] = [];
    const bridge = new ContextRecovery(canvas, { onLost: (token) => lost.push(token), onRestoreRequested: (token) => requested.push(token), onRestoreTimeout: vi.fn() }, 100);
    bridge.start();
    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(event.defaultPrevented).toBe(true);
    expect(lost).toHaveLength(1);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(requested).toEqual(lost);
    bridge.complete(lost[0]!);
    bridge.dispose();
  });

  it('times out once and ignores restore or DOM events after disposal', async () => {
    vi.useFakeTimers();
    const canvas = canvasDouble();
    const timeout = vi.fn();
    const requested = vi.fn();
    const bridge = new ContextRecovery(canvas, { onLost: vi.fn(), onRestoreRequested: requested, onRestoreTimeout: timeout }, 20);
    bridge.start();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(21);
    expect(timeout).toHaveBeenCalledOnce();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(requested).not.toHaveBeenCalled();
    bridge.dispose();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(timeout).toHaveBeenCalledOnce();
  });

  it('invalidates an in-flight restore when a second loss occurs', () => {
    const canvas = canvasDouble();
    const lost: ContextToken[] = [];
    const requested: ContextToken[] = [];
    const bridge = new ContextRecovery(canvas, { onLost: (token) => lost.push(token), onRestoreRequested: (token) => requested.push(token), onRestoreTimeout: vi.fn() }, 100);
    bridge.start();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(lost).toHaveLength(2);
    expect(lost[1]!.generation).toBeGreaterThan(lost[0]!.generation);
    bridge.complete(requested[0]!);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(requested.at(-1)).toEqual(lost[1]);
    bridge.dispose();
  });
});
