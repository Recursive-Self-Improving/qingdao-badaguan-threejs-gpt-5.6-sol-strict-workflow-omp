import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Group, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';

import { APP_CONFIG } from '../../src/app/config';
import { AppController, installPageHideHandler } from '../../src/app/AppController';
import {
  ThreeRuntime,
  type ThreeRuntimeDependencies,
} from '../../src/render/ThreeRuntime';
import type { DisposableResource } from '../../src/render/ResourceRegistry';
import { DISTRICT_DATA } from '../../src/world/districtData';
import type { RouteAnchor, WorldBuildResult } from '../../src/world/types';
import { sampleGroundHeight } from '../../src/world/terrain/createTerrain';
import { resolveNavigation } from '../../src/exploration/navigation';

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
function worldBuild(): WorldBuildResult {
  const root = new Group();
  let visible = false;
  let currentAnchorId: string | null = null;
  let currentView: 'grid' | 'public-green' | 'sightlines' | null = null;
  return {
    root,
    data: DISTRICT_DATA,
    debug: {
      root: new Group(),
      get visible() { return visible; },
      get currentAnchorId() { return currentAnchorId; },
      get currentView() { return currentView; },
      roadLabelCount: 10,
      sightlineCount: DISTRICT_DATA.sightlines.length,
      get publicGreenVisible() { return visible; },
      setVisible(nextVisible: boolean) { visible = nextVisible; },
      setView(nextView) { currentView = nextView; },
      visitAnchor(anchorId: string): RouteAnchor | null {
        const anchor = DISTRICT_DATA.routeAnchors.find((candidate) => candidate.id === anchorId) ?? null;
        currentAnchorId = anchor?.id ?? null;
        return anchor;
      },
    },
    navigation: {
      resolve: resolveNavigation,
      sampleGroundHeight,
      bounds: DISTRICT_DATA.navigableBounds,
      spawn: DISTRICT_DATA.spawn,
      reset: DISTRICT_DATA.reset,
    },
    recipe: { id: 'badaguan-district-procedural', version: 1 },
    degradationNotices: [],
  };
}


function dependencies(
  renderer: RendererDouble,
  viewport: ViewportDouble,
  buildWorld: ThreeRuntimeDependencies['buildWorld'],
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
    buildWorld,
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
      return worldBuild();
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
        return worldBuild();
      }
      resources.register(disposable(stagedDispose), group);
      throw new Error('rebuild failed');
    }));
    const liveChild = runtime.scene.children[0];
    const liveWorld = runtime.worldBuildResult;

    expect(() => runtime.rebuildScene()).toThrow('rebuild failed');

    expect(runtime.scene.children).toEqual([liveChild]);
    expect(runtime.worldBuildResult).toBe(liveWorld);
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
      return worldBuild();
    }));
    const liveChild = runtime.scene.children[0];
    const liveWorld = runtime.worldBuildResult;
    vi.spyOn(runtime.scene, 'add').mockImplementationOnce(() => {
      throw new Error('scene add failed');
    });

    expect(() => runtime.rebuildScene()).toThrow('scene add failed');

    expect(runtime.scene.children).toEqual([liveChild]);
    expect(runtime.worldBuildResult).toBe(liveWorld);
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
      return worldBuild();
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

  it('retains world builds transactionally and exposes DEV debug navigation commands', () => {
    const renderer = createRenderer();
    const viewport = createViewport();
    const builds = [worldBuild(), worldBuild()];
    let buildIndex = 0;
    const runtime = new ThreeRuntime(canvas, {}, dependencies(renderer, viewport, () => {
      const nextBuild = builds[buildIndex];
      expect(nextBuild).toBeDefined();
      if (nextBuild === undefined) {
        throw new Error(`Missing queued world build at index ${buildIndex}`);
      }
      buildIndex += 1;
      return nextBuild;
    }));

    expect(runtime.worldBuildResult).toBe(builds[0]);
    expect(runtime.camera.rotation.y).toBeCloseTo(DISTRICT_DATA.spawnYaw);
    expect(runtime.metrics.world.debug.visible).toBe(false);
    expect(runtime.metrics.world.roads.centerlines.filter(({ via }) => via.length > 0).map(({ id, via }) => ({ id, via }))).toEqual([
      { id: 'ningwuguan', via: [{ x: -70, z: -212 }, { x: 70, z: -218 }] },
      { id: 'zhengyangguan', via: [{ x: -60, z: -129 }, { x: 70, z: -122 }] },
      { id: 'juyongguan', via: [{ x: -80, z: -32 }, { x: 80, z: -38 }] },
      { id: 'wushengguan', via: [{ x: -117, z: -70 }, { x: -123, z: -180 }] },
      { id: 'shanhaiguan', via: [{ x: 124, z: -80 }, { x: 117, z: -200 }] },
    ]);
    for (const road of runtime.metrics.world.roads.centerlines) {
      expect(road.from).toEqual(road.orientation === 'east-west'
        ? { x: -200, z: road.from.z }
        : { x: road.from.x, z: 38 });
      expect(road.to).toEqual(road.orientation === 'east-west'
        ? { x: 200, z: road.to.z }
        : { x: road.to.x, z: -290 });
      for (const point of road.via) {
        const turnOffset = road.orientation === 'east-west'
          ? Math.abs(point.z - road.from.z)
          : Math.abs(point.x - road.from.x);
        expect(turnOffset).toBeGreaterThan(0);
        expect(turnOffset).toBeLessThanOrEqual(4);
      }
    }
    expect(runtime.metrics.world.parcels).toMatchObject([
      {
        id: 'west-garden-parcel',
        bounds: { minX: -190, maxX: -135, minZ: -201, maxZ: -184 },
        setback: 5,
        gates: [{ id: 'west-garden-gate', position: { x: -162, z: -201 }, width: 4, facesRoadId: 'ningwuguan' }],
      },
      {
        id: 'central-garden-parcel',
        bounds: { minX: 18, maxX: 92, minZ: -111, maxZ: -94 },
        setback: 5,
        gates: [{ id: 'central-garden-gate', position: { x: 55, z: -111 }, width: 5, facesRoadId: 'zhengyangguan' }],
      },
      {
        id: 'east-garden-parcel',
        bounds: { minX: 135, maxX: 190, minZ: -201, maxZ: -184 },
        setback: 5,
        gates: [{ id: 'east-garden-gate', position: { x: 162, z: -201 }, width: 4, facesRoadId: 'ningwuguan' }],
      },
    ]);
    for (const parcel of runtime.metrics.world.parcels) {
      expect(parcel.wallSegments).toHaveLength(4);
      for (const segment of parcel.wallSegments) {
        for (const point of [segment.from, segment.to]) {
          const onBoundary = point.x === parcel.bounds.minX || point.x === parcel.bounds.maxX ||
            point.z === parcel.bounds.minZ || point.z === parcel.bounds.maxZ;
          expect(onBoundary).toBe(true);
        }
      }
    }
    expect(runtime.metrics.world.coast).toEqual({
      edgeZ: 38,
      seaBounds: { minX: -210, maxX: 210, minZ: 38, maxZ: 60 },
      collidable: false,
      screen: {
        z: 36,
        height: 2.6,
        openings: [
          { id: 'wushengguan-coast-opening', minX: -127, maxX: -113, alignedRoadId: 'wushengguan' },
          { id: 'hangu-pass-coast-opening', minX: -7, maxX: 7, alignedRoadId: 'hangu-pass' },
          { id: 'shanhaiguan-coast-opening', minX: 113, maxX: 127, alignedRoadId: 'shanhaiguan' },
        ],
      },
    });
    expect(runtime.metrics.world.coast.screen.height).toBeGreaterThan(APP_CONFIG.camera.eyeHeight);
    expect(runtime.metrics.world.coast.screen.openings).toHaveLength(3);

    runtime.setWorldDebugVisible(true);
    const publicGreenAnchor = DISTRICT_DATA.routeAnchors.find((candidate) => candidate.kind === 'public-green');
    expect(publicGreenAnchor).toBeDefined();
    const anchor = runtime.visitWorldAnchor(publicGreenAnchor?.id ?? '');
    expect(anchor).toBe(publicGreenAnchor);
    expect(runtime.camera.position.x).toBe(anchor?.position.x);
    expect(runtime.camera.position.z).toBe(anchor?.position.z);
    expect(runtime.camera.position.y).toBeCloseTo(sampleGroundHeight(anchor?.position.x ?? 0, anchor?.position.z ?? 0) + APP_CONFIG.camera.eyeHeight);
    expect(runtime.camera.rotation.z).toBe(0);

    const probe = runtime.probeWorldNavigation({ x: 999, z: -999 });
    expect(probe).toMatchObject({ clamped: true, requested: { x: 999, z: -999 } });
    expect(runtime.metrics.world.debug).toMatchObject({
      visible: true,
      currentAnchorId: publicGreenAnchor?.id,
      roadLabelCount: 10,
      publicGreenVisible: true,
      lastProbe: probe,
    });
    expect(runtime.camera.position).toMatchObject({ x: probe?.position.x, z: probe?.position.z });
    expect(runtime.camera.position.y).toBeCloseTo((probe?.groundHeight ?? 0) + APP_CONFIG.camera.eyeHeight);

    const worldCenterX = (DISTRICT_DATA.worldBounds.minX + DISTRICT_DATA.worldBounds.maxX) / 2;
    const worldCenterZ = (DISTRICT_DATA.worldBounds.minZ + DISTRICT_DATA.worldBounds.maxZ) / 2;
    runtime.frameWorldDebugView('grid');
    expect(runtime.metrics.world.debug).toMatchObject({ visible: true, activeView: 'grid' });
    expect(runtime.camera.position).toMatchObject({
      x: worldCenterX,
      y: sampleGroundHeight(worldCenterX, worldCenterZ) + 430,
      z: worldCenterZ,
    });

    const publicGreenCenterX = (DISTRICT_DATA.publicGreen.bounds.minX + DISTRICT_DATA.publicGreen.bounds.maxX) / 2;
    const publicGreenCenterZ = (DISTRICT_DATA.publicGreen.bounds.minZ + DISTRICT_DATA.publicGreen.bounds.maxZ) / 2;
    runtime.frameWorldDebugView('public-green');
    expect(runtime.metrics.world.debug).toMatchObject({ visible: true, activeView: 'public-green' });
    expect(runtime.camera.position).toMatchObject({
      x: publicGreenCenterX,
      y: sampleGroundHeight(publicGreenCenterX, publicGreenCenterZ) + 125,
      z: publicGreenCenterZ,
    });

    const sightlineNorthZ = DISTRICT_DATA.worldBounds.minZ - 35;
    runtime.frameWorldDebugView('sightlines');
    expect(runtime.metrics.world.debug).toMatchObject({ visible: true, activeView: 'sightlines' });
    expect(runtime.camera.position).toMatchObject({
      x: worldCenterX,
      y: sampleGroundHeight(worldCenterX, sightlineNorthZ) + 240,
      z: sightlineNorthZ,
    });
    expect(runtime.camera.rotation.z).toBe(0);
    expect(renderer.render).toHaveBeenCalledWith(runtime.scene, runtime.camera);

    runtime.rebuildScene();
    expect(runtime.worldBuildResult).toBe(builds[1]);
    expect(runtime.metrics.world.debug).toMatchObject({
      visible: false,
      currentAnchorId: null,
      lastProbe: null,
      activeView: null,
    });
    runtime.dispose();
    expect(runtime.worldBuildResult).toBeNull();
    expect(runtime.scene.children).toEqual([]);
    expect(runtime.metrics.world.roads.count).toBe(10);
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
        return worldBuild();
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
