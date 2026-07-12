import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  ColorManagement,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { ViewportObserver, type ViewportMeasurement } from '../platform/viewport';
import { FrameClock } from './frameClock';
import { ResourceRegistry, type ResourceRegistryCounts } from './ResourceRegistry';

const NEUTRAL_RESOURCE_GROUP_PREFIX = 'neutral-scene';
const CAMERA_POSITION = [0, 1.5, 5] as const;

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
  readonly buildNeutralScene: (resources: ResourceRegistry, group: string) => Object3D;
  readonly completeInitialization: () => void;
}

const DEFAULT_DEPENDENCIES: ThreeRuntimeDependencies = {
  createRenderer: (canvas) => new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  }),
  createScene: () => new Scene(),
  createCamera: () => new PerspectiveCamera(50, 1, 0.1, 100),
  createClock: () => new FrameClock(),
  createResources: () => new ResourceRegistry(),
  createViewport: (canvas, renderer, camera, onChange) =>
    new ViewportObserver(canvas, renderer, camera, { onChange }),
  buildNeutralScene: (resources, group) => {
    const geometry = resources.register(new BoxGeometry(1.4, 1.4, 1.4), group);
    const material = resources.register(new MeshBasicMaterial({ color: 0xb9c0bd }), group);
    const mesh = new Mesh(geometry, material);
    mesh.rotation.set(0.18, 0.35, 0);
    return mesh;
  },
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
      this.installNeutralScene();
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
    };
  }

  rebuildScene(): void {
    if (this.disposed) return;
    const nextGroup = this.resourceGroup(this.sceneGeneration + 1);
    let nextScene: Object3D;
    try {
      nextScene = this.dependencies.buildNeutralScene(this.resources, nextGroup);
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      this.runCleanupStage(rollbackErrors, () => this.resources.disposeGroup(nextGroup));
      if (rollbackErrors.length !== 0) {
        throw new AggregateError([error, ...rollbackErrors], 'Scene rebuild failed during rollback.');
      }
      throw error;
    }

    const previousGroup = this.activeResourceGroup;
    const previousChildren = [...this.scene.children];
    try {
      this.scene.clear();
      this.scene.add(nextScene);
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      this.runCleanupStage(rollbackErrors, () => {
        this.scene.clear();
        this.scene.add(...previousChildren);
      });
      this.runCleanupStage(rollbackErrors, () => this.resources.disposeGroup(nextGroup));
      if (rollbackErrors.length !== 0) {
        throw new AggregateError([error, ...rollbackErrors], 'Scene rebuild commit failed during rollback.');
      }
      throw error;
    }

    this.activeResourceGroup = nextGroup;
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
    this.camera.position.set(...CAMERA_POSITION);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
  }

  private installNeutralScene(): void {
    const group = this.resourceGroup(this.sceneGeneration);
    try {
      this.scene.add(this.dependencies.buildNeutralScene(this.resources, group));
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
    this.runCleanupStage(errors, () => {
      this.scene.clear();
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
    return `${NEUTRAL_RESOURCE_GROUP_PREFIX}:${generation}`;
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
