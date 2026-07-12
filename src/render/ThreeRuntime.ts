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
} from 'three';
import { ViewportObserver, type ViewportMeasurement } from '../platform/viewport';
import { FrameClock } from './frameClock';
import { ResourceRegistry, type ResourceRegistryCounts } from './ResourceRegistry';

const NEUTRAL_RESOURCE_GROUP = 'neutral-scene';
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

let createdRuntimeCount = 0;
let disposedRuntimeCount = 0;

export class ThreeRuntime {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly scene: Scene;

  private readonly canvas: HTMLCanvasElement;
  private readonly options: ThreeRuntimeOptions;
  private readonly clock = new FrameClock();
  private readonly resources = new ResourceRegistry();
  private readonly viewport: ViewportObserver;
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
  private lastDeltaSeconds = 0;
  private disposed = false;
  private loopRunning = false;

  constructor(canvas: HTMLCanvasElement, options: ThreeRuntimeOptions = {}) {
    this.canvas = canvas;
    this.options = options;
    ColorManagement.enabled = true;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;

    this.scene = new Scene();
    this.scene.background = new Color(0x7d898b);
    this.camera = new PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(...CAMERA_POSITION);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);

    this.viewport = new ViewportObserver(canvas, this.renderer, this.camera, {
      onChange: () => this.publishDevelopmentMetrics(),
    });
    this.buildNeutralScene();
    this.viewport.start();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    createdRuntimeCount += 1;
    this.syncAnimationLoop();
    this.publishDevelopmentMetrics();
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
    this.clearNeutralScene();
    this.buildNeutralScene();
    this.rebuildCount += 1;
    this.publishDevelopmentMetrics();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.setAnimationLoop(null);
    this.loopRunning = false;
    this.clock.dispose();
    this.viewport.dispose();
    this.clearNeutralScene();
    this.resources.disposeAll();
    this.renderer.dispose();
    disposedRuntimeCount += 1;
    if (import.meta.env.DEV) delete this.canvas.dataset.threeRuntimeMetrics;
  }

  private buildNeutralScene(): void {
    const geometry = this.resources.register(new BoxGeometry(1.4, 1.4, 1.4), NEUTRAL_RESOURCE_GROUP);
    const material = this.resources.register(
      new MeshBasicMaterial({ color: 0xb9c0bd }),
      NEUTRAL_RESOURCE_GROUP,
    );
    const mesh = new Mesh(geometry, material);
    mesh.rotation.set(0.18, 0.35, 0);
    this.scene.add(mesh);
  }

  private clearNeutralScene(): void {
    this.scene.clear();
    this.resources.disposeGroup(NEUTRAL_RESOURCE_GROUP);
  }

  private syncAnimationLoop(): void {
    if (this.disposed) return;
    const shouldRun = !document.hidden;
    this.clock.setPaused(!shouldRun);
    this.renderer.setAnimationLoop(shouldRun ? this.animate : null);
    this.loopRunning = shouldRun;
  }

  private publishDevelopmentMetrics(): void {
    if (import.meta.env.DEV && !this.disposed) {
      this.canvas.dataset.threeRuntimeMetrics = JSON.stringify(this.metrics);
    }
  }
}
