import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_FRAME_DELTA_SECONDS,
  FrameClock,
} from '../../src/render/frameClock';

describe('FrameClock', () => {
  it('uses the first finite frame only as a baseline', () => {
    const clock = new FrameClock();

    expect(clock.tick(1_000)).toEqual({ deltaSeconds: 0, elapsedSeconds: 0 });
    expect(clock.elapsedSeconds).toBe(0);
  });

  it('accumulates normal monotonic frame cadence in seconds', () => {
    const clock = new FrameClock();

    clock.tick(500);
    expect(clock.tick(516)).toEqual({ deltaSeconds: 0.016, elapsedSeconds: 0.016 });
    expect(clock.tick(549)).toEqual({ deltaSeconds: 0.033, elapsedSeconds: 0.049 });
  });

  it('clamps a long stall and advances elapsed time by only the catch-up budget', () => {
    const clock = new FrameClock({ maxDeltaSeconds: 0.05 });

    clock.tick(0);
    expect(clock.tick(10_000)).toEqual({ deltaSeconds: 0.05, elapsedSeconds: 0.05 });
    expect(clock.tick(10_010)).toEqual({ deltaSeconds: 0.01, elapsedSeconds: 0.060000000000000005 });
  });

  it('drops hidden time and requires a fresh baseline after visibility resumes', () => {
    const clock = new FrameClock();

    clock.tick(100);
    expect(clock.tick(120).deltaSeconds).toBeCloseTo(0.02);

    clock.setPaused(true);
    expect(clock.isPaused).toBe(true);
    expect(clock.tick(20_000)).toEqual({ deltaSeconds: 0, elapsedSeconds: 0.02 });

    clock.setPaused(false);
    expect(clock.tick(30_000)).toEqual({ deltaSeconds: 0, elapsedSeconds: 0.02 });
    expect(clock.tick(30_016)).toEqual({ deltaSeconds: 0.016, elapsedSeconds: 0.036000000000000004 });
  });

  it('ignores backward, duplicate, and nonfinite samples without corrupting the baseline', () => {
    const clock = new FrameClock({ maxDeltaSeconds: 1 });

    clock.tick(100);
    expect(clock.tick(90).deltaSeconds).toBe(0);
    expect(clock.tick(100).deltaSeconds).toBe(0);
    expect(clock.tick(Number.NaN).deltaSeconds).toBe(0);
    expect(clock.tick(Number.POSITIVE_INFINITY).deltaSeconds).toBe(0);
    expect(clock.tick(125)).toEqual({ deltaSeconds: 0.025, elapsedSeconds: 0.025 });
  });

  it('reset clears elapsed time and the timestamp baseline without changing pause state', () => {
    const clock = new FrameClock();

    clock.tick(0);
    clock.tick(25);
    clock.reset();

    expect(clock.elapsedSeconds).toBe(0);
    expect(clock.isPaused).toBe(false);
    expect(clock.tick(9_000)).toEqual({ deltaSeconds: 0, elapsedSeconds: 0 });
    expect(clock.tick(9_010)).toEqual({ deltaSeconds: 0.01, elapsedSeconds: 0.01 });
  });

  it('applies the maximum inclusively and preserves sub-millisecond precision', () => {
    const clock = new FrameClock({ maxDeltaSeconds: 0.02 });

    clock.tick(10);
    expect(clock.tick(30)).toEqual({ deltaSeconds: 0.02, elapsedSeconds: 0.02 });
    expect(clock.tick(30.5)).toEqual({ deltaSeconds: 0.0005, elapsedSeconds: 0.0205 });
    expect(DEFAULT_MAX_FRAME_DELTA_SECONDS).toBe(0.1);
  });

  it('rejects invalid catch-up budgets', () => {
    for (const maxDeltaSeconds of [0, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new FrameClock({ maxDeltaSeconds })).toThrow(RangeError);
    }
  });

  it('disposes idempotently, clears timing state, and cannot be resumed', () => {
    const clock = new FrameClock();
    clock.tick(0);
    clock.tick(16);

    clock.dispose();
    clock.dispose();
    clock.setPaused(false);

    expect(clock.isDisposed).toBe(true);
    expect(clock.isPaused).toBe(true);
    expect(clock.elapsedSeconds).toBe(0);
    expect(clock.tick(1_000)).toEqual({ deltaSeconds: 0, elapsedSeconds: 0 });
  });
});
