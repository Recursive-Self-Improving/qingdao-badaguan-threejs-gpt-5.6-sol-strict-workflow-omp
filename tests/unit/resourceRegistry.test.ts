import { describe, expect, it, vi } from 'vitest';

import { ResourceRegistry, type DisposableResource } from '../../src/render/ResourceRegistry';

function disposable(): DisposableResource {
  return { dispose: vi.fn() };
}

describe('ResourceRegistry', () => {
  it('disposes a shared resource exactly once after its final owner releases it', () => {
    const registry = new ResourceRegistry();
    const resource = disposable();

    registry.register(resource, 'scene-a');
    registry.acquire(resource, 'scene-b');

    expect(registry.release(resource, 'scene-a')).toBe(true);
    expect(resource.dispose).not.toHaveBeenCalled();
    expect(registry.getCounts()).toEqual({
      resources: 1,
      references: 1,
      groups: 1,
      disposed: 0,
    });

    expect(registry.release(resource, 'scene-b')).toBe(true);
    expect(resource.dispose).toHaveBeenCalledTimes(1);
    expect(registry.release(resource, 'scene-b')).toBe(false);
    expect(registry.getCounts()).toEqual({
      resources: 0,
      references: 0,
      groups: 0,
      disposed: 1,
    });
  });

  it('releases every ownership in a rebuild group without disposing resources still shared', () => {
    const registry = new ResourceRegistry();
    const shared = disposable();
    const sceneOnly = disposable();

    registry.register(shared, 'persistent');
    registry.acquire(shared, 'scene');
    registry.register(sceneOnly, 'scene');
    registry.acquire(sceneOnly, 'scene');

    expect(registry.disposeGroup('scene')).toBe(1);
    expect(shared.dispose).not.toHaveBeenCalled();
    expect(sceneOnly.dispose).toHaveBeenCalledTimes(1);
    expect(registry.getSnapshot()).toEqual({
      resources: 1,
      references: 1,
      groups: 1,
      disposed: 1,
      entries: [
        {
          references: 1,
          groups: [{ group: 'persistent', references: 1 }],
        },
      ],
    });
  });

  it('disposeAll clears ownership, disposes once, and remains idempotent', () => {
    const registry = new ResourceRegistry();
    const first = disposable();
    const second = disposable();

    registry.register(first, 'scene');
    registry.acquire(first, 'shared');
    registry.register(second, 'scene');

    expect(registry.disposeAll()).toBe(2);
    expect(registry.disposeAll()).toBe(0);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(registry.getCounts()).toEqual({
      resources: 0,
      references: 0,
      groups: 0,
      disposed: 2,
    });
    expect(() => registry.register(first, 'rebuilt')).toThrow(/already disposed/);
  });

  it('clears all tracking even when a resource dispose method throws', () => {
    const registry = new ResourceRegistry();
    const failure = new Error('dispose failed');
    const broken: DisposableResource = { dispose: vi.fn(() => { throw failure; }) };
    const healthy = disposable();

    registry.register(broken, 'scene');
    registry.register(healthy, 'scene');

    expect(() => registry.disposeAll()).toThrow(AggregateError);
    expect(broken.dispose).toHaveBeenCalledTimes(1);
    expect(healthy.dispose).toHaveBeenCalledTimes(1);
    expect(registry.getCounts()).toEqual({
      resources: 0,
      references: 0,
      groups: 0,
      disposed: 2,
    });
  });
});
