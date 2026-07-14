import { describe, expect, it, vi } from 'vitest';
import { computeInteractionViewport, InteractionViewportObserver } from '../../src/platform/viewport';

describe('computeInteractionViewport', () => {
  it('intersects the visual viewport in experience-local coordinates', () => {
    expect(computeInteractionViewport(
      { left: 10, top: 20, width: 300, height: 200 },
      { width: 800, height: 600 },
      { offsetLeft: 40, offsetTop: 50, width: 200, height: 100 },
    )).toEqual({
      viewportLeft: 40, viewportTop: 50, viewportWidth: 200, viewportHeight: 100,
      visibleLeft: 30, visibleTop: 30, visibleRight: 230, visibleBottom: 130,
      visibleWidth: 200, visibleHeight: 100, orientation: 'landscape',
    });
  });

  it('falls back to layout viewport and classifies portrait', () => {
    const result = computeInteractionViewport({ left: 0, top: 0, width: 320, height: 568 }, { width: 320, height: 568 });
    expect(result.orientation).toBe('portrait');
    expect(result.visibleWidth).toBe(320);
    expect(result.visibleHeight).toBe(568);
  });
});

describe('InteractionViewportObserver', () => {
  it('interrupts repeated events even when geometry is unchanged', () => {
    const target = Object.assign(new EventTarget(), { innerWidth: 320, innerHeight: 568, visualViewport: null });
    const container = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 568 }) } as HTMLElement;
    const onChange = vi.fn();
    const onInterrupt = vi.fn();
    const observer = new InteractionViewportObserver(container, { window: target, onChange, onInterrupt });
    observer.start();
    target.dispatchEvent(new Event('resize'));
    target.dispatchEvent(new Event('resize'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onInterrupt).toHaveBeenCalledTimes(2);
    observer.dispose();
  });
});
