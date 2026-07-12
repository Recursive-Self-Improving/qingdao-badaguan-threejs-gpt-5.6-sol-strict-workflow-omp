import {
  ACESFilmicToneMapping,
  Color,
  ColorManagement,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { APP_CONFIG } from '../app/config';
import { ViewportObserver, type ViewportMeasurement } from '../platform/viewport';
import { FrameClock } from './frameClock';
import { ResourceRegistry, type ResourceRegistryCounts } from './ResourceRegistry';
import { createWorld } from '../world/createWorld';
import type { Bounds2, NavigationResult, RouteAnchor, Vec2, WorldBuildResult, WorldDebugViewName } from '../world/types';

const WORLD_RESOURCE_GROUP_PREFIX = 'world';

export interface ThreeRuntimeFrame {
  readonly deltaSeconds: number;
  readonly elapsedSeconds: number;
}

export interface ThreeRuntimeOptions {
  readonly onUpdate?: (frame: ThreeRuntimeFrame) => void;
  readonly onRender?: (runtime: ThreeRuntime) => void;
}

export interface ThreeRuntimeMetrics {
  readonly viewport: ViewportMeasurement | null;
  readonly camera: {
    readonly aspect: number;
    readonly fov: number;
    readonly near: number;
    readonly far: number;
    readonly position: readonly [number, number, number];
    readonly up: readonly [number, number, number];
    readonly roll: number;
  };
  readonly frame: {
    readonly deltaSeconds: number;
    readonly elapsedSeconds: number;
    readonly frameCount: number;
    readonly running: boolean;
    readonly visible: boolean;
  };
  readonly resources: ResourceRegistryCounts;
  readonly runtime: {
    readonly created: number;
    readonly disposed: number;
    readonly rebuilds: number;
    readonly renders: number;
  };
  readonly world: WorldRuntimeMetrics;
}

export interface WorldRuntimeMetrics {
  readonly roads: {
    readonly count: number;
    readonly transverseCount: number;
    readonly longitudinalCount: number;
    readonly names: readonly string[];
    readonly centerlines: readonly {
      readonly id: string;
      readonly orientation: 'east-west' | 'north-south';
      readonly from: Vec2;
      readonly via: readonly Vec2[];
      readonly to: Vec2;
    }[];
  };
  readonly parcels: readonly {
    readonly id: string;
    readonly bounds: Bounds2;
    readonly setback: number;
    readonly wallSegments: readonly {
      readonly from: Vec2;
      readonly to: Vec2;
    }[];
    readonly gates: readonly {
      readonly id: string;
      readonly position: Vec2;
      readonly width: number;
      readonly facesRoadId: string;
    }[];
  }[];
  readonly coast: {
    readonly edgeZ: number;
    readonly seaBounds: Bounds2;
    readonly collidable: false;
    readonly screen: {
      readonly z: number;
      readonly height: number;
      readonly openings: readonly {
        readonly id: string;
        readonly minX: number;
        readonly maxX: number;
        readonly alignedRoadId: string;
      }[];
    };
  };
  readonly bounds: { readonly world: Bounds2; readonly navigable: Bounds2 };
  readonly grade: { readonly spawnHeight: number; readonly northHeight: number; readonly southHeight: number };
  readonly spawn: Vec2 & { readonly groundHeight: number; readonly yaw: number };
  readonly reset: Vec2 & { readonly groundHeight: number; readonly yaw: number };
  readonly route: readonly string[];
  readonly publicGreen: { readonly id: string; readonly name: string };
  readonly sightlines: readonly string[];
  readonly debug: {
    readonly visible: boolean;
    readonly currentAnchorId: string | null;
    readonly roadLabelCount: number;
    readonly sightlineCount: number;
    readonly publicGreenVisible: boolean;
    readonly lastProbe: WorldNavigationProbe | null;
    readonly activeView: WorldDebugViewName | null;
  };
}


export interface WorldNavigationProbe extends NavigationResult {
  readonly requested: Vec2;
}

interface RuntimeViewport {
  readonly measurement: ViewportMeasurement | null;
  start(): void;
  dispose(): void;
}

export interface ThreeRuntimeDependencies {
  readonly createRenderer: (canvas: HTMLCanvasElement) => WebGLRenderer;
  readonly createScene: () => Scene;
  readonly createCamera: () => PerspectiveCamera;
  readonly createClock: () => FrameClock;
  readonly createResources: () => ResourceRegistry;
  readonly createViewport: (
    canvas: HTMLCanvasElement,
    renderer: WebGLRenderer,
    camera: PerspectiveCamera,
    onChange: () => void,
  ) => RuntimeViewport;
  readonly buildWorld: (resources: ResourceRegistry, group: string) => WorldBuildResult;
  readonly completeInitialization: () => void;
}

const DEFAULT_DEPENDENCIES: ThreeRuntimeDependencies = {
  createRenderer: (canvas) => new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  }),
  createScene: () => new Scene(),
  createCamera: () => new PerspectiveCamera(
    APP_CONFIG.camera.fov,
    1,
    APP_CONFIG.camera.near,
    APP_CONFIG.camera.far,
  ),
  createClock: () => new FrameClock(),
  createResources: () => new ResourceRegistry(),
  createViewport: (canvas, renderer, camera, onChange) =>
    new ViewportObserver(canvas, renderer, camera, { onChange }),
  buildWorld: createWorld,
  completeInitialization: () => undefined,
};

let createdRuntimeCount = 0;
let disposedRuntimeCount = 0;

export class ThreeRuntime {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly scene: Scene;

  private readonly canvas: HTMLCanvasElement;
  private readonly options: ThreeRuntimeOptions;
  private readonly dependencies: ThreeRuntimeDependencies;
  private readonly clock: FrameClock;
  private readonly resources: ResourceRegistry;
  private readonly viewport: RuntimeViewport;
  private readonly onVisibilityChange = (): void => {
    this.syncAnimationLoop();
    this.publishDevelopmentMetrics();
  };
  private readonly animate = (timestampMs: number): void => {
    if (this.disposed || document.hidden) return;
    const frame = this.clock.tick(timestampMs);
    this.lastDeltaSeconds = frame.deltaSeconds;
    this.frameCount += 1;
    this.options.onUpdate?.(frame);
    this.options.onRender?.(this);
    this.renderer.render(this.scene, this.camera);
    this.renderCount += 1;
    this.publishDevelopmentMetrics();
  };

  private frameCount = 0;
  private renderCount = 0;
  private rebuildCount = 0;
  private sceneGeneration = 0;
  private activeResourceGroup: string | null = null;
  private activeWorld: WorldBuildResult | null = null;
  private lastProbe: WorldNavigationProbe | null = null;
  private lastWorldMetrics: WorldRuntimeMetrics | null = null;
  private lastDeltaSeconds = 0;
  private disposed = false;
  private loopRunning = false;
  private visibilityListenerInstalled = false;
  private countedAsCreated = false;
  private countedAsDisposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    options: ThreeRuntimeOptions = {},
    dependencies?: Partial<ThreeRuntimeDependencies>,
  ) {
    this.canvas = canvas;
    this.options = options;
    this.dependencies = dependencies === undefined
      ? DEFAULT_DEPENDENCIES
      : { ...DEFAULT_DEPENDENCIES, ...dependencies };

    let renderer: WebGLRenderer | undefined;
    let scene: Scene | undefined;
    let camera: PerspectiveCamera | undefined;
    let clock: FrameClock | undefined;
    let resources: ResourceRegistry | undefined;
    let viewport: RuntimeViewport | undefined;
    try {
      ColorManagement.enabled = true;
      renderer = this.dependencies.createRenderer(canvas);
      scene = this.dependencies.createScene();
      camera = this.dependencies.createCamera();
      clock = this.dependencies.createClock();
      resources = this.dependencies.createResources();
      viewport = this.dependencies.createViewport(
        canvas,
        renderer,
        camera,
        () => this.publishDevelopmentMetrics(),
      );
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      this.runCleanupStage(cleanupErrors, () => viewport?.dispose());
      this.runCleanupStage(cleanupErrors, () => clock?.dispose());
      this.runCleanupStage(cleanupErrors, () => resources?.disposeAll());
      this.runCleanupStage(cleanupErrors, () => renderer?.dispose());
      if (cleanupErrors.length !== 0) {
        throw new AggregateError([error, ...cleanupErrors], 'ThreeRuntime construction failed during rollback.');
      }
      throw error;
    }

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.clock = clock;
    this.resources = resources;
    this.viewport = viewport;

    try {
      this.configureRendererAndCamera();
      this.installWorld();
      this.viewport.start();
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      this.visibilityListenerInstalled = true;
      this.syncAnimationLoop();
      this.dependencies.completeInitialization();
      createdRuntimeCount += 1;
      this.countedAsCreated = true;
      this.publishDevelopmentMetrics();
    } catch (error) {
      const cleanupErrors = this.disposeStages();
      if (cleanupErrors.length !== 0) {
        throw new AggregateError([error, ...cleanupErrors], 'ThreeRuntime initialization failed during rollback.');
      }
      throw error;
    }
  }

  get worldBuildResult(): WorldBuildResult | null {
    return this.activeWorld;
  }

  get metrics(): ThreeRuntimeMetrics {
    const position = this.camera.position;
    const up = this.camera.up;
    return {
      viewport: this.viewport.measurement,
      camera: {
        aspect: this.camera.aspect,
        fov: this.camera.fov,
        near: this.camera.near,
        far: this.camera.far,
        position: [position.x, position.y, position.z],
        up: [up.x, up.y, up.z],
        roll: this.camera.rotation.z,
      },
      frame: {
        deltaSeconds: this.lastDeltaSeconds,
        elapsedSeconds: this.clock.elapsedSeconds,
        frameCount: this.frameCount,
        running: this.loopRunning,
        visible: !document.hidden,
      },
      resources: this.resources.getCounts(),
      runtime: {
        created: createdRuntimeCount,
        disposed: disposedRuntimeCount,
        rebuilds: this.rebuildCount,
        renders: this.renderCount,
      },
      world: this.currentWorldMetrics(),
    };
  }

  rebuildScene(): void {
    if (this.disposed) return;
    const nextGroup = this.resourceGroup(this.sceneGeneration + 1);
    let nextWorld: WorldBuildResult;
    try {
      nextWorld = this.dependencies.buildWorld(this.resources, nextGroup);
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      this.runCleanupStage(rollbackErrors, () => this.resources.disposeGroup(nextGroup));
      if (rollbackErrors.length !== 0) {
        throw new AggregateError([error, ...rollbackErrors], 'Scene rebuild failed during rollback.');
      }
      throw error;
    }

    const previousGroup = this.activeResourceGroup;
    const previousWorld = this.activeWorld;
    const previousChildren = [...this.scene.children];
    try {
      this.scene.clear();
      this.scene.add(nextWorld.root);
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      this.runCleanupStage(rollbackErrors, () => {
        this.scene.clear();
        this.scene.add(...previousChildren);
        this.activeWorld = previousWorld;
      });
      this.runCleanupStage(rollbackErrors, () => this.resources.disposeGroup(nextGroup));
      if (rollbackErrors.length !== 0) {
        throw new AggregateError([error, ...rollbackErrors], 'Scene rebuild commit failed during rollback.');
      }
      throw error;
    }

    this.activeResourceGroup = nextGroup;
    this.activeWorld = nextWorld;
    this.lastProbe = null;
    nextWorld.debug.setView(null);
    this.sceneGeneration += 1;
    this.rebuildCount += 1;
    const cleanupErrors: unknown[] = [];
    if (previousGroup !== null) {
      this.runCleanupStage(cleanupErrors, () => this.resources.disposeGroup(previousGroup));
    }
    this.publishDevelopmentMetrics();
    if (cleanupErrors.length !== 0) {
      throw new AggregateError(cleanupErrors, 'Scene rebuild committed but previous resources failed to dispose.');
    }
  }

  setWorldDebugVisible(visible: boolean): void {
    if (!import.meta.env.DEV || this.disposed) return;
    this.activeWorld?.debug.setVisible(visible);
    if (!visible) this.activeWorld?.debug.setView(null);
    this.publishDevelopmentMetrics();
  }

  visitWorldAnchor(anchorId: string): RouteAnchor | null {
    if (!import.meta.env.DEV || this.disposed) return null;
    const anchor = this.activeWorld?.debug.visitAnchor(anchorId) ?? null;
    this.activeWorld?.debug.setView(null);
    if (anchor !== null) this.moveCameraTo(anchor.position);
    this.publishDevelopmentMetrics();
    return anchor;
  }

  probeWorldNavigation(requested: Vec2, radius?: number): WorldNavigationProbe | null {
    if (!import.meta.env.DEV || this.disposed || this.activeWorld === null) return null;
    const previous = { x: this.camera.position.x, z: this.camera.position.z };
    const result = this.activeWorld.navigation.resolve(
      previous,
      requested,
      radius === undefined ? undefined : { radius },
    );
    this.lastProbe = { requested: { ...requested }, ...result };
    this.activeWorld.debug.setView(null);
    this.moveCameraTo(result.position);
    this.publishDevelopmentMetrics();
    return this.lastProbe;
  }
  frameWorldDebugView(name: WorldDebugViewName): void {
    if (!import.meta.env.DEV || this.disposed || this.activeWorld === null) return;
    const { data, debug, navigation } = this.activeWorld;
    debug.setVisible(true);
    if (name === 'grid') {
      const bounds = data.worldBounds;
      const x = (bounds.minX + bounds.maxX) / 2;
      const z = (bounds.minZ + bounds.maxZ) / 2;
      this.camera.position.set(x, navigation.sampleGroundHeight(x, z) + 430, z);
      this.camera.lookAt(x, navigation.sampleGroundHeight(x, z), z);
    } else if (name === 'public-green') {
      const bounds = data.publicGreen.bounds;
      const x = (bounds.minX + bounds.maxX) / 2;
      const z = (bounds.minZ + bounds.maxZ) / 2;
      const groundHeight = navigation.sampleGroundHeight(x, z);
      this.camera.position.set(x, groundHeight + 125, z);
      this.camera.lookAt(x, groundHeight, z);
    } else {
      const bounds = data.worldBounds;
      const x = (bounds.minX + bounds.maxX) / 2;
      const northZ = bounds.minZ - 35;
      const targetZ = -65;
      this.camera.position.set(x, navigation.sampleGroundHeight(x, northZ) + 240, northZ);
      this.camera.lookAt(x, navigation.sampleGroundHeight(x, targetZ), targetZ);
    }
    debug.setView(name);
    this.camera.rotation.z = APP_CONFIG.camera.roll;
    this.renderer.render(this.scene, this.camera);
    this.renderCount += 1;
    this.publishDevelopmentMetrics();
  }


  dispose(): void {
    if (this.disposed) return;
    const errors = this.disposeStages();
    if (errors.length !== 0) throw new AggregateError(errors, 'ThreeRuntime disposal failed.');
  }

  private configureRendererAndCamera(): void {
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.scene.background = new Color(0x7d898b);
    this.camera.position.set(0, APP_CONFIG.camera.eyeHeight, APP_CONFIG.camera.neutralZ);
    this.camera.up.set(...APP_CONFIG.camera.worldUp);
    this.camera.rotation.set(0, 0, APP_CONFIG.camera.roll, 'YXZ');
  }

  private installWorld(): void {
    const group = this.resourceGroup(this.sceneGeneration);
    try {
      const world = this.dependencies.buildWorld(this.resources, group);
      this.scene.add(world.root);
      this.activeWorld = world;
      const spawn = world.navigation.spawn;
      this.camera.position.set(
        spawn.x,
        world.navigation.sampleGroundHeight(spawn.x, spawn.z) + APP_CONFIG.camera.eyeHeight,
        spawn.z,
      );
      this.camera.rotation.set(0, world.data.spawnYaw, APP_CONFIG.camera.roll, 'YXZ');
      this.activeResourceGroup = group;
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      this.runCleanupStage(rollbackErrors, () => this.resources.disposeGroup(group));
      if (rollbackErrors.length !== 0) {
        throw new AggregateError([error, ...rollbackErrors], 'Scene initialization failed during rollback.');
      }
      throw error;
    }
  }

  private disposeStages(): unknown[] {
    if (this.disposed) return [];
    this.disposed = true;
    const errors: unknown[] = [];
    this.runCleanupStage(errors, () => this.renderer.setAnimationLoop(null));
    this.loopRunning = false;
    this.runCleanupStage(errors, () => {
      if (this.visibilityListenerInstalled) {
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.visibilityListenerInstalled = false;
      }
    });
    this.runCleanupStage(errors, () => this.viewport.dispose());
    this.runCleanupStage(errors, () => this.clock.dispose());
    this.runCleanupStage(errors, () => this.activeWorld?.debug.setView(null));
    this.runCleanupStage(errors, () => {
      this.lastWorldMetrics = this.worldMetrics();
    });
    this.runCleanupStage(errors, () => {
      this.scene.clear();
      this.activeWorld = null;
      if (this.activeResourceGroup !== null) {
        const group = this.activeResourceGroup;
        this.activeResourceGroup = null;
        this.resources.disposeGroup(group);
      }
    });
    this.runCleanupStage(errors, () => this.resources.disposeAll());
    this.runCleanupStage(errors, () => this.renderer.dispose());
    this.runCleanupStage(errors, () => this.finalizeDisposal());
    return errors;
  }

  private finalizeDisposal(): void {
    if (this.countedAsCreated && !this.countedAsDisposed) {
      disposedRuntimeCount += 1;
      this.countedAsDisposed = true;
    }
    if (import.meta.env.DEV) delete this.canvas.dataset.threeRuntimeMetrics;
  }

  private resourceGroup(generation: number): string {
    return `${WORLD_RESOURCE_GROUP_PREFIX}:${generation}`;
  }

  private moveCameraTo(position: Vec2): void {
    const sample = this.activeWorld?.navigation.sampleGroundHeight;
    if (sample === undefined) return;
    this.camera.position.set(position.x, sample(position.x, position.z) + APP_CONFIG.camera.eyeHeight, position.z);
    this.camera.rotation.z = APP_CONFIG.camera.roll;
  }

  private currentWorldMetrics(): WorldRuntimeMetrics {
    if (this.activeWorld !== null) return this.worldMetrics();
    if (this.lastWorldMetrics !== null) return this.lastWorldMetrics;
    throw new Error('World metrics requested without an initialized world.');
  }

  private worldMetrics(): WorldRuntimeMetrics {
    const world = this.activeWorld;
    if (world === null) throw new Error('World metrics requested without an active world.');
    const { data, debug, navigation } = world;
    const transverseCount = data.roads.filter((road) => road.orientation === 'east-west').length;
    const longitudinalCount = data.roads.length - transverseCount;
    return {
      roads: {
        count: data.roads.length,
        transverseCount,
        longitudinalCount,
        names: data.roads.map((road) => road.name),
        centerlines: data.roads.map((road) => ({
          id: road.id,
          orientation: road.orientation,
          from: road.centerline.from,
          via: road.centerline.via,
          to: road.centerline.to,
        })),
      },
      parcels: data.parcels.map((parcel) => ({
        id: parcel.id,
        bounds: parcel.bounds,
        setback: parcel.setback,
        wallSegments: parcel.wallSegments.map((segment) => ({
          from: segment.from,
          to: segment.to,
        })),
        gates: parcel.gates.map((gate) => ({ ...gate })),
      })),
      coast: {
        edgeZ: data.coast.edgeZ,
        seaBounds: data.coast.seaBounds,
        collidable: data.coast.collidable,
        screen: {
          z: data.coast.screen.z,
          height: data.coast.screen.height,
          openings: data.coast.screen.openings.map((opening) => ({ ...opening })),
        },
      },
      bounds: { world: data.worldBounds, navigable: data.navigableBounds },
      grade: {
        spawnHeight: navigation.sampleGroundHeight(data.spawn.x, data.spawn.z),
        northHeight: navigation.sampleGroundHeight(0, data.navigableBounds.minZ),
        southHeight: navigation.sampleGroundHeight(0, data.navigableBounds.maxZ),
      },
      spawn: { ...data.spawn, groundHeight: navigation.sampleGroundHeight(data.spawn.x, data.spawn.z), yaw: data.spawnYaw },
      reset: { ...data.reset, groundHeight: navigation.sampleGroundHeight(data.reset.x, data.reset.z), yaw: data.resetYaw },
      route: data.route.anchorIds,
      publicGreen: { id: data.publicGreen.id, name: data.publicGreen.name },
      sightlines: data.sightlines.map((sightline) => sightline.id),
      debug: {
        visible: debug.visible,
        currentAnchorId: debug.currentAnchorId,
        roadLabelCount: debug.roadLabelCount,
        sightlineCount: debug.sightlineCount,
        publicGreenVisible: debug.publicGreenVisible,
        lastProbe: this.lastProbe,
        activeView: debug.currentView,
      },
    };
  }

  private runCleanupStage(errors: unknown[], stage: () => void): void {
    try {
      stage();
    } catch (error) {
      errors.push(error);
    }
  }

  private syncAnimationLoop(): void {
    if (this.disposed) return;
    const shouldRun = !document.hidden;
    this.clock.setPaused(!shouldRun);
    this.renderer.setAnimationLoop(shouldRun ? this.animate : null);
    this.loopRunning = shouldRun;
  }

  private publishDevelopmentMetrics(): void {
    if (import.meta.env.DEV && !this.disposed && this.countedAsCreated) {
      this.canvas.dataset.threeRuntimeMetrics = JSON.stringify(this.metrics);
    }
  }
}
