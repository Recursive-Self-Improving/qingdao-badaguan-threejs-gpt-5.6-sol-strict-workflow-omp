import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssetCoordinator, type LoadProgress } from '../../src/loading/AssetCoordinator';
import { parseRouteGuide, ROUTE_GUIDE_ASSET_ID, ROUTE_GUIDE_URL } from '../../src/loading/routeGuide';

const validGuide = JSON.stringify({ version: 1, recipeId: 'badaguan-district-procedural', stops: [{ anchorId: 'spawn', title: 'Start', summary: 'Begin the route.' }] });
const request = { id: ROUTE_GUIDE_ASSET_ID, label: 'Route guide', url: ROUTE_GUIDE_URL, kind: 'optional' as const, timeoutMs: 100, parse: parseRouteGuide };

afterEach(() => vi.useRealTimers());

describe('AssetCoordinator', () => {
  it('publishes indeterminate then registered item progress and validates the real schema', async () => {
    const progress: LoadProgress[] = [];
    const coordinator = new AssetCoordinator({ fetch: vi.fn(async () => new Response(validGuide)), onProgress: (_generation, value) => progress.push(value) });
    const outcome = await coordinator.beginAttempt().loadOptional(request);
    expect(outcome.kind).toBe('ready');
    expect(progress[0]).toMatchObject({ kind: 'indeterminate', phase: 'preparing' });
    expect(progress).toContainEqual({ kind: 'items', phase: 'assets', loaded: 0, total: 1, currentLabel: 'Route guide' });
    expect(progress.every((value) => !JSON.stringify(value).match(/byte|percent/i))).toBe(true);
    coordinator.dispose();
  });

  it('classifies HTTP, malformed, network, timeout, and essential runtime failures', async () => {
    const cases = [
      [vi.fn(async () => new Response('', { status: 404 })), 'http'],
      [vi.fn(async () => new Response('{bad')), 'malformed'],
      [vi.fn(async () => { throw new TypeError('network'); }), 'network'],
    ] as const;
    for (const [fetcher, kind] of cases) {
      const coordinator = new AssetCoordinator({ fetch: fetcher });
      const outcome = await coordinator.beginAttempt().loadOptional(request);
      expect(outcome).toMatchObject({ kind: 'degraded', failures: [{ kind }] });
      coordinator.dispose();
    }
    const coordinator = new AssetCoordinator({ fetch: vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))) });
    vi.useFakeTimers();
    const timeout = coordinator.beginAttempt().loadOptional({ ...request, timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(11);
    expect(await timeout).toMatchObject({ kind: 'degraded', failures: [{ kind: 'timeout' }] });
    coordinator.dispose();
    const essentialCoordinator = new AssetCoordinator();
    expect(await essentialCoordinator.beginAttempt().runEssential(() => { throw new Error('build'); })).toMatchObject({ kind: 'failed', failure: { kind: 'runtime' } });
    essentialCoordinator.dispose();
  });

  it('cancels synchronously and suppresses late callbacks across retry generations', async () => {
    const deferred: { resolve: ((response: Response) => void) | null } = { resolve: null };
    const progress: number[] = [];
    const coordinator = new AssetCoordinator({
      fetch: vi.fn(() => new Promise<Response>((resolve) => { deferred.resolve = resolve; })),
      onProgress: (generation) => progress.push(generation),
    });
    const first = coordinator.beginAttempt();
    const old = first.loadOptional(request);
    expect(first.cancel()).toBe(true);
    const second = coordinator.retry();
    deferred.resolve?.(new Response(validGuide));
    expect(await old).toEqual({ kind: 'cancelled' });
    expect(progress.at(-1)).toBe(second.generation);
    expect(first.cancel()).toBe(false);
    coordinator.dispose();
  });
});
