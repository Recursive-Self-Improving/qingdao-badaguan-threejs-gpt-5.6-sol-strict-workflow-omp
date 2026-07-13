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
import type {
  ArchitectureBuildResult,
  LandscapeBuildResult,
  LandscapeSettings,
  RouteAnchor,
  WorldBuildResult,
} from '../../src/world/types';
import { sampleGroundHeight } from '../../src/world/terrain/createTerrain';
import { resolveNavigation } from '../../src/exploration/navigation';

interface RendererDouble {
  outputColorSpace: unknown;
  toneMapping: unknown;
  toneMappingExposure: number;
  readonly shadowMap: { enabled: boolean; type: unknown; autoUpdate: boolean; needsUpdate: boolean };
  readonly setAnimationLoop: Mock<(callback: FrameRequestCallback | null) => void>;
  readonly render: Mock<(...args: unknown[]) => void>;
  readonly dispose: Mock<() => void>;
  readonly info: { readonly render: { calls: number; triangles: number } };
}

interface ViewportDouble {
  readonly measurement: null;
  readonly start: Mock<() => void>;
  readonly dispose: Mock<() => void>;
}

function createRenderer(): RendererDouble {
  const info = { render: { calls: 0, triangles: 0 } };
  return {
    outputColorSpace: null,
    toneMapping: null,
    toneMappingExposure: 0,
    shadowMap: { enabled: false, type: null, autoUpdate: true, needsUpdate: false },
    setAnimationLoop: vi.fn(),
    render: vi.fn(() => {
      info.render.calls = 1;
      info.render.triangles = 120;
    }),
    info,
    dispose: vi.fn(),
  };
}

function createViewport(): ViewportDouble {
  return { measurement: null, start: vi.fn(), dispose: vi.fn() };
}

function disposable(dispose: () => void = vi.fn()): DisposableResource {
  return { dispose };
}
function architectureBuild(): ArchitectureBuildResult {
  const cameraViews = Object.fromEntries(DISTRICT_DATA.architectureSites.map((site) => [site.id, site.cameraViews])) as ArchitectureBuildResult['cameraViews'];
  return Object.freeze({
    root: new Group(),
    subjects: Object.freeze(DISTRICT_DATA.architectureSites.map((site) => Object.freeze({
      subjectId: site.id,
      style: site.style,
      stories: site.stories,
      motifIds: Object.freeze(site.motifs.map((motif) => motif.id)),
      siteBounds: site.siteBounds,
      visibleBounds: site.visibleBounds,
      collisionBounds: site.collisionBounds,
      componentCount: 1,
      instanceCount: 0,
    }))),
    cameraViews: Object.freeze(cameraViews),
    reuse: Object.freeze({
      sharedGeometryCount: 4,
      sharedMaterialCount: 6,
      instanceBatchCount: 3,
      instanceCount: 24,
      estimatedInstancedDrawCalls: 3,
      naiveRepeatedDrawCalls: 24,
    }),
    labelsVisible: false,
  });
}

function landscapeBuild(
  settings: LandscapeSettings = Object.freeze({ density: 'high', motion: 'standard' }),
): LandscapeBuildResult {
  const densityCounts = Object.freeze({
    high: Object.freeze({ vegetationInstances: 100, identityInstances: 10, detailInstances: 40, drawCalls: 8, triangles: 1_000 }),
    medium: Object.freeze({ vegetationInstances: 60, identityInstances: 10, detailInstances: 24, drawCalls: 7, triangles: 700 }),
    low: Object.freeze({ vegetationInstances: 10, identityInstances: 10, detailInstances: 8, drawCalls: 5, triangles: 300 }),
  });
  const active = densityCounts[settings.density];
  return {
    root: new Group(),
    settings,
    metrics: Object.freeze({
      settings,
      densityCounts,
      active,
      identities: Object.freeze(DISTRICT_DATA.roadPlantingCues.map(({ roadId, species }) => Object.freeze({ roadId, speciesId: species }))),
      lodBands: Object.freeze([
        Object.freeze({ id: 'near' as const, maximumDistance: 60, canopySegments: 8 }),
        Object.freeze({ id: 'mid' as const, maximumDistance: 140, canopySegments: 6 }),
        Object.freeze({ id: 'far' as const, maximumDistance: 280, canopySegments: 4 }),
      ]),
      reuse: Object.freeze({
        sharedGeometryCount: 6,
        sharedMaterialCount: 8,
        instanceBatchCount: 8,
        instanceCount: active.vegetationInstances + active.detailInstances,
        estimatedInstancedDrawCalls: active.drawCalls,
        naiveRepeatedDrawCalls: active.vegetationInstances + active.detailInstances,
      }),
      motion: Object.freeze({ time: 0, amplitude: settings.motion === 'reduced' ? 0 : 0.025, transformChecksum: 1234 }),
      clearanceIntersections: 0,
      transparentObjects: 0,
      depthWriteDisabled: 0,
    }),
    debugLayout: Object.freeze({
      markers: Object.freeze(DISTRICT_DATA.roadPlantingCues.map((cue, index) => Object.freeze({
        roadId: cue.roadId,
        speciesId: cue.species,
        position: Object.freeze({ x: index, z: -index }),
      }))),
      zones: DISTRICT_DATA.plantingZones,
    }),
    cameraViews: DISTRICT_DATA.landscapeCameraViews,
    clearanceBounds: Object.freeze([]),
    update: vi.fn(),
    reset: vi.fn(),
    setCaptureTime: vi.fn(),
  };
}

function worldBuild(settings: LandscapeSettings = Object.freeze({ density: 'high', motion: 'standard' })): WorldBuildResult {
  const root = new Group();
  let visible = false;
  let currentAnchorId: string | null = null;
  let currentView: 'grid' | 'public-green' | 'sightlines' | 'planting' | null = null;
  return {
    root,
    data: DISTRICT_DATA,
    architecture: architectureBuild(),
    landscape: landscapeBuild(settings),
    environment: {
      root: new Group(),
      config: {} as never,
      metrics: Object.freeze({ quality: settings.density, motion: settings.motion, sunDirection: Object.freeze([1, -1, 0] as const), fogNear: 105, fogFar: 430, exposure: 1.08, shadowMapSize: 2048, shadowBias: -0.00016, shadowNormalBias: 0.028, contactGrounding: true }),
      cameraViews: Object.freeze([{ id: 'spawn' as const, position: Object.freeze([0, 4, 5] as const), target: Object.freeze([0, 4, -40] as const) }]),
      backgroundColor: 0xd8c7aa,
      fogColor: 0xb9c0bb,
      backgroundTexture: null as never,
      fogNear: 105,
      fogFar: 430,
      update: vi.fn(),
      reset: vi.fn(),
      setCaptureTime: vi.fn(),
    },
    coast: {
      root: new Group(),
      config: {} as never,
      metrics: Object.freeze({ quality: settings.density, motion: settings.motion, waterMotionAmplitude: settings.motion === 'reduced' ? 0 : 0.018, waterTransformChecksum: 1, waterSegments: 8, beachLayers: 1, horizonLayers: 1, openingCount: 3, clearanceIntersections: 0, collidable: false }),
      update: vi.fn(),
      reset: vi.fn(),
      setCaptureTime: vi.fn(),
    },
    debug: {
      root: new Group(),
      get visible() { return visible; },
      get currentAnchorId() { return currentAnchorId; },
      get currentView() { return currentView; },
      roadLabelCount: 10,
      plantingLabelCount: 10,
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

  it('preserves the original initial world-build error without requesting absent world metrics', () => {
    const renderer = createRenderer();
    const viewport = createViewport();
    const resourceDispose = vi.fn();
    const failure = new Error('initial world failed');
    let thrown: unknown;
    try {
      new ThreeRuntime(canvas, {}, dependencies(renderer, viewport, (resources, group) => {
        resources.register(disposable(resourceDispose), group);
        throw failure;
      }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(failure);
    expect(viewport.start).not.toHaveBeenCalled();
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
    const publishedMetrics = canvas.dataset.threeRuntimeMetrics;
    const renders = runtime.metrics.runtime.renders;
    const rendererCalls = renderer.render.mock.calls.length;


    expect(() => runtime.rebuildScene()).toThrow('rebuild failed');

    expect(runtime.scene.children).toEqual([liveChild]);
    expect(runtime.worldBuildResult).toBe(liveWorld);
    expect(runtime.metrics.resources).toMatchObject({ resources: 1, references: 1, groups: 1 });
    expect(stagedDispose).toHaveBeenCalledTimes(1);
    expect(initialDispose).not.toHaveBeenCalled();
    expect(runtime.metrics.runtime.rebuilds).toBe(0);
    expect(runtime.metrics.runtime.renders).toBe(renders);
    expect(renderer.render).toHaveBeenCalledTimes(rendererCalls);
    expect(canvas.dataset.threeRuntimeMetrics).toBe(publishedMetrics);
    runtime.dispose();
  });

  it('restores the prior scene and ownership when the rebuild commit throws', () => {
    const renderer = createRenderer();
    const viewport = createViewport();
    const disposals = [vi.fn(), vi.fn()];
    const worlds = [
      worldBuild(Object.freeze({ density: 'high', motion: 'standard' })),
      worldBuild(Object.freeze({ density: 'low', motion: 'reduced' })),
    ];
    let builds = 0;
    const runtime = new ThreeRuntime(canvas, {}, dependencies(renderer, viewport, (resources, group) => {
      const index = builds;
      builds += 1;
      resources.register(disposable(disposals[index]), group);
      const world = worlds[index];
      if (world === undefined) throw new Error('Missing queued world build');
      return world;
    }));
    const liveChild = runtime.scene.children[0];
    const liveWorld = runtime.worldBuildResult;
    const publishedMetrics = canvas.dataset.threeRuntimeMetrics;
    const renders = runtime.metrics.runtime.renders;
    const rendererCalls = renderer.render.mock.calls.length;
    vi.spyOn(runtime.scene, 'add').mockImplementationOnce(() => {
      throw new Error('scene add failed');
    });

    expect(() => runtime.rebuildScene(Object.freeze({ density: 'low', motion: 'reduced' }))).toThrow('scene add failed');

    expect(runtime.scene.children).toEqual([liveChild]);
    expect(runtime.worldBuildResult).toBe(liveWorld);
    expect(runtime.metrics.resources).toMatchObject({ resources: 1, references: 1, groups: 1 });
    expect(disposals[1]).toHaveBeenCalledTimes(1);
    expect(disposals[0]).not.toHaveBeenCalled();
    expect(runtime.metrics.runtime.rebuilds).toBe(0);
    expect(runtime.metrics.world.landscape?.settings).toEqual({ density: 'high', motion: 'standard' });
    expect(runtime.metrics.runtime.renders).toBe(renders);
    expect(renderer.render).toHaveBeenCalledTimes(rendererCalls);
    expect(canvas.dataset.threeRuntimeMetrics).toBe(publishedMetrics);
    runtime.dispose();
  });

  it('renders a committed rebuild generation before publishing its distinct renderer stats', () => {
    const renderer = createRenderer();
    const viewport = createViewport();
    const initial = worldBuild();
    const rebuilt = worldBuild(Object.freeze({ density: 'low', motion: 'standard' }));
    const builds = [initial, rebuilt];
    let buildIndex = 0;
    let runtime: ThreeRuntime;
    const renderObservations: Array<{
      readonly child: Group | undefined;
      readonly committedWorld: WorldBuildResult | null;
      readonly publishedMetrics: string | undefined;
    }> = [];
    renderer.render.mockImplementation((scene) => {
      const renderedScene = scene as Scene;
      renderObservations.push({
        child: renderedScene.children[0] as Group | undefined,
        committedWorld: runtime.worldBuildResult,
        publishedMetrics: canvas.dataset.threeRuntimeMetrics,
      });
      renderer.info.render.calls = 2;
      renderer.info.render.triangles = 345;
    });
    runtime = new ThreeRuntime(canvas, {}, dependencies(renderer, viewport, () => {
      const build = builds[buildIndex];
      buildIndex += 1;
      if (build === undefined) throw new Error('Missing queued world build');
      return build;
    }));
    const publishedBeforeRebuild = canvas.dataset.threeRuntimeMetrics;
    const rendersBeforeRebuild = runtime.metrics.runtime.renders;

    runtime.rebuildScene(Object.freeze({ density: 'low', motion: 'standard' }));

    expect(renderObservations).toEqual([{
      child: rebuilt.root,
      committedWorld: rebuilt,
      publishedMetrics: publishedBeforeRebuild,
    }]);
    expect(runtime.metrics.runtime.renders).toBe(rendersBeforeRebuild + 1);
    expect(runtime.metrics.world.architecture?.renderInfo).toEqual({ calls: 2, triangles: 345 });
    expect(runtime.metrics.world.landscape?.renderInfo).toEqual({ calls: 2, triangles: 345 });
    expect(JSON.parse(canvas.dataset.threeRuntimeMetrics ?? '{}')).toMatchObject({
      runtime: { renders: rendersBeforeRebuild + 1 },
      world: {
        architecture: { renderInfo: { calls: 2, triangles: 345 } },
        landscape: {
          settings: { density: 'low', motion: 'standard' },
          renderInfo: { calls: 2, triangles: 345 },
        },
      },
    });
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

    expect(runtime.metrics.world.architecture).toMatchObject({
      subjects: expect.arrayContaining([
        expect.objectContaining({ subjectId: 'villa-west-neoclassical', style: 'german-neoclassical', stories: 2 }),
        expect.objectContaining({ subjectId: 'princess-inspired-landmark', style: 'princess-nordic', stories: 2 }),
      ]),
      reuse: {
        sharedGeometryCount: 4,
        sharedMaterialCount: 6,
        instanceBatchCount: 3,
        instanceCount: 24,
        estimatedInstancedDrawCalls: 3,
        naiveRepeatedDrawCalls: 24,
      },
      labelsVisible: false,
      renderInfo: { calls: 0, triangles: 0 },
    });
    const rendersBeforeInvalidFrame = renderer.render.mock.calls.length;
    expect(runtime.frameArchitecture('not-a-subject', 'front')).toBeNull();
    expect(renderer.render).toHaveBeenCalledTimes(rendersBeforeInvalidFrame);
    const cameraBeforeInvalidView = runtime.camera.position.toArray();
    const rendersBeforeInvalidView = renderer.render.mock.calls.length;
    expect(runtime.frameArchitecture('villa-west-neoclassical', 'invalid' as never)).toBeNull();
    expect(renderer.render).toHaveBeenCalledTimes(rendersBeforeInvalidView);
    expect(runtime.camera.position.toArray()).toEqual(cameraBeforeInvalidView);
    expect(runtime.metrics.world.architecture?.activeFrame).toBeNull();
    runtime.setWorldDebugVisible(true);
    const architectureView = DISTRICT_DATA.architectureSites[0]?.cameraViews['three-quarter'];
    expect(architectureView).toBeDefined();
    const architectureFrame = runtime.frameArchitecture('villa-west-neoclassical', 'three-quarter');
    expect(architectureFrame).toEqual({
      subjectId: 'villa-west-neoclassical',
      view: 'three-quarter',
      rendererCalls: 1,
      rendererTriangles: 120,
    });
    expect(runtime.metrics.world.debug.visible).toBe(false);
    expect(runtime.metrics.world.architecture?.activeFrame).toEqual(architectureFrame);
    expect(runtime.metrics.world.architecture?.renderInfo).toEqual({ calls: 1, triangles: 120 });
    expect(architectureView?.ySemantics).toBe('site-ground-relative');
    const viewGroundHeight = sampleGroundHeight(
      architectureView?.target[0] ?? 0,
      architectureView?.target[2] ?? 0,
    );
    expect(runtime.camera.position.toArray()).toEqual([
      architectureView?.position[0],
      viewGroundHeight + (architectureView?.position[1] ?? 0),
      architectureView?.position[2],
    ]);
    runtime.setWorldDebugVisible(true);
    expect(runtime.metrics.world.debug.visible).toBe(true);
    expect(runtime.metrics.world.architecture?.activeFrame).toBeNull();
    expect(runtime.frameArchitecture('villa-west-neoclassical', 'front')).not.toBeNull();
    expect(runtime.metrics.world.architecture?.activeFrame).not.toBeNull();
    runtime.setWorldDebugVisible(false);
    expect(runtime.metrics.world.debug.visible).toBe(false);
    expect(runtime.metrics.world.architecture?.activeFrame).toBeNull();
    runtime.setWorldDebugVisible(true);
    const publicGreenAnchor = DISTRICT_DATA.routeAnchors.find((candidate) => candidate.kind === 'public-green');
    expect(publicGreenAnchor).toBeDefined();
    const anchor = runtime.visitWorldAnchor(publicGreenAnchor?.id ?? '');
    expect(anchor).toBe(publicGreenAnchor);
    expect(runtime.camera.position.x).toBe(anchor?.position.x);
    expect(runtime.camera.position.z).toBe(anchor?.position.z);
    expect(runtime.metrics.world.architecture?.activeFrame).toBeNull();
    expect(runtime.camera.position.y).toBeCloseTo(sampleGroundHeight(anchor?.position.x ?? 0, anchor?.position.z ?? 0) + APP_CONFIG.camera.eyeHeight);
    expect(runtime.camera.rotation.z).toBe(0);

    const probeStart = { x: runtime.camera.position.x, z: runtime.camera.position.z };
    const probe = runtime.probeWorldNavigation({ x: 999, z: -999 });
    expect(probe).toMatchObject({ start: probeStart, clamped: true, requested: { x: 999, z: -999 } });
    expect(runtime.metrics.world.debug).toMatchObject({
      visible: true,
      currentAnchorId: publicGreenAnchor?.id,
      roadLabelCount: 10,
      publicGreenVisible: true,
      lastProbe: probe,
    });
    expect(runtime.camera.position).toMatchObject({ x: probe?.position.x, z: probe?.position.z });
    expect(runtime.metrics.world.architecture?.activeFrame).toBeNull();
    expect(runtime.camera.position.y).toBeCloseTo((probe?.groundHeight ?? 0) + APP_CONFIG.camera.eyeHeight);

    const clearStart = { x: DISTRICT_DATA.spawn.x, z: DISTRICT_DATA.spawn.z };
    const clearProbe = runtime.probeWorldNavigation(clearStart, undefined, clearStart);
    expect(clearProbe).toMatchObject({ start: clearStart, position: clearStart, collided: false, clamped: false });

    const collisionBounds = DISTRICT_DATA.architectureSites[0]?.collisionBounds;
    expect(collisionBounds).toBeDefined();
    const collisionZ = ((collisionBounds?.minZ ?? 0) + (collisionBounds?.maxZ ?? 0)) / 2;
    const collisionStart = { x: (collisionBounds?.minX ?? 0) - 1, z: collisionZ };
    const collisionTarget = { x: (collisionBounds?.minX ?? 0) + 1, z: collisionZ };
    const collisionProbe = runtime.probeWorldNavigation(collisionTarget, undefined, collisionStart);
    expect(collisionProbe).toMatchObject({ start: collisionStart, collided: true });

    const cameraBeforeInvalidFrom = { x: runtime.camera.position.x, z: runtime.camera.position.z };
    const invalidFromProbe = runtime.probeWorldNavigation(
      cameraBeforeInvalidFrom,
      undefined,
      { x: Number.NaN, z: 0 },
    );
    expect(invalidFromProbe?.start).toEqual(cameraBeforeInvalidFrom);

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

    const environmentFrame = runtime.frameEnvironment('spawn');
    expect(environmentFrame?.forward[0]).toBeCloseTo(0);
    expect(environmentFrame?.forward[1]).toBeCloseTo(0);
    expect(environmentFrame?.forward[2]).toBeCloseTo(-1);
    runtime.rebuildScene();
    expect(runtime.worldBuildResult).toBe(builds[1]);
    expect(runtime.metrics.world.debug).toMatchObject({
      visible: false,
      currentAnchorId: null,
      lastProbe: null,
      activeView: null,
    });
    runtime.dispose();
    expect(runtime.metrics.world.architecture?.activeFrame).toBeNull();
    expect(runtime.worldBuildResult).toBeNull();
    expect(runtime.scene.children).toEqual([]);
    expect(runtime.metrics.world.roads.count).toBe(10);
  });

  it('threads startup settings and updates landscape between onUpdate and onRender', () => {
    const renderer = createRenderer();
    const viewport = createViewport();
    const order: string[] = [];
    let builtSettings: LandscapeSettings | null = null;
    const baseWorld = worldBuild(Object.freeze({ density: 'high', motion: 'reduced' }));
    const view = baseWorld.landscape.cameraViews[0];
    if (view === undefined) throw new Error('Missing landscape camera view');
    const [cameraX, , cameraZ] = view.position;
    const overlapBounds = Object.freeze({
      minX: cameraX - 0.1,
      maxX: cameraX + 0.1,
      minZ: cameraZ - 0.1,
      maxZ: cameraZ + 0.1,
    });
    const world: WorldBuildResult = {
      ...baseWorld,
      landscape: {
        ...baseWorld.landscape,
        clearanceBounds: Object.freeze([
          Object.freeze({ id: 'camera-probe-tree', roadId: view.roadIds[0] ?? null, kind: 'vegetation' as const, bounds: overlapBounds }),
          Object.freeze({ id: 'camera-probe-detail', roadId: null, kind: 'detail' as const, bounds: overlapBounds }),
          Object.freeze({ id: 'authored-camera-clearance', roadId: null, kind: 'camera' as const, bounds: overlapBounds }),
          Object.freeze({
            id: 'far-tree',
            roadId: null,
            kind: 'vegetation' as const,
            bounds: Object.freeze({ minX: cameraX + 10, maxX: cameraX + 11, minZ: cameraZ + 10, maxZ: cameraZ + 11 }),
          }),
        ]),
      },
    };
    vi.mocked(world.landscape.update).mockImplementation(() => order.push('landscape'));
    renderer.render.mockImplementation(() => { order.push('renderer'); });
    const runtime = new ThreeRuntime(canvas, {
      landscapeSettings: Object.freeze({ density: 'high', motion: 'reduced' }),
      onUpdate: () => order.push('update'),
      onRender: () => order.push('render-seam'),
    }, dependencies(renderer, viewport, (_resources, _group, settings) => {
      builtSettings = settings;
      return world;
    }));

    const callback = renderer.setAnimationLoop.mock.calls[0]?.[0];
    expect(callback).toEqual(expect.any(Function));
    callback?.(1_000);

    expect(builtSettings).toEqual({ density: 'high', motion: 'reduced' });
    expect(order).toEqual(['update', 'landscape', 'render-seam', 'renderer']);
    expect(runtime.metrics.world.landscape).toMatchObject({
      settings: { density: 'high', motion: 'reduced' },
      active: { vegetationInstances: 100, identityInstances: 10 },
      motion: { amplitude: 0 },
      clearanceIntersections: 0,
    });
    expect(runtime.metrics.world.landscape?.currentCameraClearanceIntersections).toBe(0);
    const activeFrame = runtime.frameLandscape(view?.id ?? 'missing');
    expect(activeFrame).toMatchObject({
      viewId: view?.id,
      roadIds: view?.roadIds,
      clearanceIntersections: 0,
    });
    expect(runtime.camera.position.toArray()).toEqual(view?.position);
    expect(runtime.metrics.world.landscape?.activeFrame).toEqual(activeFrame);
    expect(runtime.metrics.world.landscape?.currentCameraClearanceIntersections).toBe(2);
    expect(JSON.parse(canvas.dataset.threeRuntimeMetrics ?? '{}')).toMatchObject({
      world: { landscape: { currentCameraClearanceIntersections: 2 } },
    });
    expect(runtime.metrics.world.debug.plantingLabelCount).toBe(10);
    runtime.dispose();
  });

  it('suppresses landscape updates while hidden and resets capture state without resetting the clock', () => {
    const renderer = createRenderer();
    const viewport = createViewport();
    const world = worldBuild();
    const runtime = new ThreeRuntime(canvas, {}, dependencies(renderer, viewport, () => world));
    const callback = renderer.setAnimationLoop.mock.calls[0]?.[0];
    callback?.(1_000);
    const elapsedBeforeReset = runtime.metrics.frame.elapsedSeconds;

    runtime.setLandscapeCaptureTime(7);
    runtime.resetLandscape();
    expect(world.landscape.setCaptureTime).toHaveBeenCalledWith(7);
    expect(world.landscape.reset).toHaveBeenCalledTimes(1);
    expect(runtime.metrics.frame.elapsedSeconds).toBe(elapsedBeforeReset);

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    callback?.(2_000);
    expect(world.landscape.update).toHaveBeenCalledTimes(1);
    runtime.dispose();
    expect(world.landscape.reset).toHaveBeenCalledTimes(2);
  });

  it('rebuilds settings transactionally while preserving the camera and rolling back failures', () => {
    const renderer = createRenderer();
    const viewport = createViewport();
    const initial = worldBuild();
    const low = worldBuild(Object.freeze({ density: 'low', motion: 'standard' }));
    let buildCount = 0;
    const runtime = new ThreeRuntime(canvas, {}, dependencies(renderer, viewport, (_resources, _group, settings) => {
      buildCount += 1;
      if (buildCount === 1) return initial;
      if (buildCount === 2) {
        expect(settings).toEqual({ density: 'low', motion: 'standard' });
        return low;
      }
      throw new Error('settings rebuild failed');
    }));
    runtime.camera.position.set(12, 34, 56);

    runtime.rebuildScene(Object.freeze({ density: 'low', motion: 'standard' }));
    expect(runtime.camera.position.toArray()).toEqual([12, 34, 56]);
    expect(runtime.worldBuildResult).toBe(low);
    expect(runtime.metrics.world.landscape?.settings).toEqual({ density: 'low', motion: 'standard' });

    expect(() => runtime.rebuildScene(Object.freeze({ density: 'medium', motion: 'reduced' }))).toThrow('settings rebuild failed');
    expect(runtime.camera.position.toArray()).toEqual([12, 34, 56]);
    expect(runtime.worldBuildResult).toBe(low);
    expect(runtime.metrics.world.landscape?.settings).toEqual({ density: 'low', motion: 'standard' });
    runtime.dispose();
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
      near: 0.15,
      far: 550,
      eyeHeight: 1.68,
      neutralZ: 5,
      worldUp: [0, 1, 0],
      roll: 0,
    });
    expect(runtime.camera.fov).toBe(65);
    expect(runtime.camera.near).toBe(0.15);
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
