import type { Page } from '@playwright/test';

export const ROUTE_CYCLE_MS = 60_000;

export interface RoutePose {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export interface RouteDriveResult {
  readonly elapsedMs: number;
  readonly frameCount: number;
}

export async function driveInterpolatedRoute(
  page: Page,
  durationMs: number,
  views: readonly RoutePose[],
  offsetMs = 0,
): Promise<RouteDriveResult> {
  return page.evaluate(({ duration, cycle, offset, route }) => new Promise<RouteDriveResult>((resolve) => {
    let started: number | null = null;
    let frameCount = 0;
    const interpolate = (from: readonly number[], to: readonly number[], amount: number): [number, number, number] => [
      (from[0] ?? 0) + ((to[0] ?? 0) - (from[0] ?? 0)) * amount,
      (from[1] ?? 0) + ((to[1] ?? 0) - (from[1] ?? 0)) * amount,
      (from[2] ?? 0) + ((to[2] ?? 0) - (from[2] ?? 0)) * amount,
    ];
    const frame = (now: number): void => {
      started ??= now;
      const elapsedMs = now - started;
      if (elapsedMs >= duration) { resolve(Object.freeze({ elapsedMs, frameCount })); return; }
      const routeProgress = ((offset + elapsedMs) % cycle) / cycle * route.length;
      const fromIndex = Math.floor(routeProgress) % route.length;
      const toIndex = (fromIndex + 1) % route.length;
      const amount = routeProgress - Math.floor(routeProgress);
      const from = route[fromIndex]; const to = route[toIndex];
      if (from === undefined || to === undefined) throw new Error('Interpolated route requires at least one valid pose.');
      document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: {
        action: 'environment/set-camera-pose',
        position: interpolate(from.position, to.position, amount),
        target: interpolate(from.target, to.target, amount),
      } }));
      frameCount += 1;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), { duration: durationMs, cycle: ROUTE_CYCLE_MS, offset: offsetMs, route: views });
}
