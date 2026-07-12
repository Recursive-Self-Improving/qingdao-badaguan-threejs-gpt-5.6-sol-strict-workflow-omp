import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Object3D, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';

import { APP_CONFIG } from '../../src/app/config';
import { AppController, installPageHideHandler } from '../../src/app/AppController';
import {
  ThreeRuntime,
  type ThreeRuntimeDependencies,
} from '../../src/render/ThreeRuntime';
import type { DisposableResource } from '../../src/render/ResourceRegistry';

interface RendererDouble {
  outputColorSpace: unknown;
  toneMapping: unknown;
  toneMappingExposure: number;
  readonly setAnimationLoop: Mock<(callback: FrameRequestCallback | null) => void>;
  readonly render: Mock<(...args: unknown[]) => void>;
  readonly dispose: Mock<() => void>;
}

interface ViewportDouble {
  readonly measurement: null;
  readonly start: Mock<() => void>;
  readonly dispose: Mock<() => void>;
}

function createRenderer(): RendererDouble {
  return {
    outputColorSpace: null,
    toneMapping: null,
    toneMappingExposure: 0,
    setAnimationLoop: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
}

function createViewport(): ViewportDouble {
  return { measurement: null, start: vi.fn(), dispose: vi.fn() };
}

function disposable(dispose: () => void = vi.fn()): DisposableResource {
  return { dispose };
}

function dependencies(
  renderer: RendererDouble,
  viewport: ViewportDouble,
  buildNeutralScene: ThreeRuntimeDependencies['buildNeutralScene'],
): Partial<ThreeRuntimeDependencies> {
  return {
    createRenderer: () => renderer as unknown as WebGLRenderer,
    createScene: () => new Scene(),
    createCamera: () => new PerspectiveCamera(
      APP_CONFIG.camera.fov,
      1,
      APP_CONFIG.camera.near,
      APP_CONFIG.camera.far,
    ),
    createViewport: () => viewport,
    buildNeutralScene,
  };
}

describe('ThreeRuntime lifecycle safety', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    const documentTarget = new EventTarget() as Document;
    Object.defineProperty(documentTarget, 'hidden', { configurable: true, value: false });
    vi.stubGlobal('document', documentTarget);
    canvas = { dataset: {} } as HTMLCanvasElement;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unwinds a running loop and installed listener after a late initialization failure', () => {
    const renderer = createRenderer();
    const viewport = createViewport();
    const resourceDispose = vi.fn();
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const injected = dependencies(renderer, viewport, (resources, group) => {
      resources.register(disposable(resourceDispose), group);
      return new Object3D();
    });

    expect(() => new ThreeRuntime(canvas, {}, {
      ...injected,
      completeInitialization: () => { throw new Error('late initialization failed'); },
    })).toThrow('late initialization failed');

    expect(viewport.start).toHaveBeenCalledTimes(1);
    expect(renderer.setAnimationLoop).toHaveBeenNthCalledWith(1, expect.any(Function));
    expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(viewport.dispose).toHaveBeenCalledTimes(1);
    expect(resourceDispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('rolls back a failed rebuild without replacing the live scene or leaking registry ownership', () => {
    const renderer = createRenderer();
    const viewport = createViewport();
    const initialDispose = vi.fn();
    const stagedDispose = vi.fn();
    let builds = 0;
    const runtime = new ThreeRuntime(canvas, {}, dependencies(renderer, viewport, (resources, group) => {
      builds += 1;
      if (builds === 1) {
        resources.register(disposable(initialDispose), group);
        return new Object3D();
      }
      resources.register(disposable(stagedDispose), group);
      throw new Error('rebuild failed');
    }));
    const liveChild = runtime.scene.children[0];

    expect(() => runtime.rebuildScene()).toThrow('rebuild failed');

    expect(runtime.scene.children).toEqual([liveChild]);
    expect(runtime.metrics.resources).toMatchObject({ resources: 1, references: 1, groups: 1 });
    expect(stagedDispose).toHaveBeenCalledTimes(1);
    expect(initialDispose).not.toHaveBeenCalled();
    expect(runtime.metrics.runtime.rebuilds).toBe(0);
    runtime.dispose();
  });

  it('restores the prior scene and ownership when the rebuild commit throws', () => {
    const renderer = createRenderer();
    const viewport = createViewport();
    const disposals = [vi.fn(), vi.fn()];
    let builds = 0;
    const runtime = new ThreeRuntime(canvas, {}, dependencies(renderer, viewport, (resources, group) => {
      const index = builds;
      builds += 1;
      resources.register(disposable(disposals[index]), group);
      return new Object3D();
    }));
    const liveChild = runtime.scene.children[0];
    vi.spyOn(runtime.scene, 'add').mockImplementationOnce(() => {
      throw new Error('scene add failed');
    });

    expect(() => runtime.rebuildScene()).toThrow('scene add failed');

    expect(runtime.scene.children).toEqual([liveChild]);
    expect(runtime.metrics.resources).toMatchObject({ resources: 1, references: 1, groups: 1 });
    expect(disposals[1]).toHaveBeenCalledTimes(1);
    expect(disposals[0]).not.toHaveBeenCalled();
    expect(runtime.metrics.runtime.rebuilds).toBe(0);
    runtime.dispose();
  });

  it('reaches renderer disposal and finalization when resource cleanup throws', () => {
    const renderer = createRenderer();
    const viewport = createViewport();
    const resourceFailure = new Error('resource cleanup failed');
    canvas.dataset.threeRuntimeMetrics = 'published';
    const runtime = new ThreeRuntime(canvas, {}, dependencies(renderer, viewport, (resources, group) => {
      resources.register(disposable(() => { throw resourceFailure; }), group);
      return new Object3D();
    }));

    expect(() => runtime.dispose()).toThrow(AggregateError);

    expect(viewport.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(canvas.dataset.threeRuntimeMetrics).toBeUndefined();
    expect(runtime.metrics.runtime.disposed).toBeGreaterThan(0);
    expect(() => runtime.dispose()).not.toThrow();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes a healthy runtime exactly once', () => {
    const renderer = createRenderer();
    const viewport = createViewport();
    const resourceDispose = vi.fn();
    const injected = (({ createCamera: _createCamera, ...rest }) => rest)(dependencies(
      renderer,
      viewport,
      (resources, group) => {
        resources.register(disposable(resourceDispose), group);
        return new Object3D();
      },
    ));
    const runtime = new ThreeRuntime(canvas, {}, injected);

    expect(APP_CONFIG.camera).toEqual({
      fov: 65,
      near: 0.08,
      far: 550,
      eyeHeight: 1.68,
      neutralZ: 5,
      worldUp: [0, 1, 0],
      roll: 0,
    });
    expect(runtime.camera.fov).toBe(65);
    expect(runtime.camera.near).toBe(0.08);
    expect(runtime.camera.far).toBe(550);
    expect(runtime.camera.position.toArray()).toEqual([0, 1.68, 5]);
    expect(runtime.camera.up.toArray()).toEqual([0, 1, 0]);
    expect(runtime.camera.rotation.z).toBe(0);

    runtime.dispose();
    runtime.dispose();

    expect(resourceDispose).toHaveBeenCalledTimes(1);
    expect(viewport.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps BFCache pagehide wiring live but destroys a real unload', () => {
    const destroy = vi.fn();
    const controller = { handlePageHide: AppController.prototype.handlePageHide, destroy };
    const target = new EventTarget() as Window;
    const removePageHideHandler = installPageHideHandler(controller, target);
    const dispatchPageHide = (persisted: boolean): void => {
      const event = new Event('pagehide');
      Object.defineProperty(event, 'persisted', { value: persisted });
      target.dispatchEvent(event);
    };

    dispatchPageHide(true);
    expect(destroy).not.toHaveBeenCalled();

    dispatchPageHide(false);
    expect(destroy).toHaveBeenCalledTimes(1);

    removePageHideHandler();
    dispatchPageHide(false);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
