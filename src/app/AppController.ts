import {
  INITIAL_APP_STATE,
  getAppStateInvariant,
  reduceAppState,
  type AppEvent,
  type AppState,
} from './appState';
import { detectCapabilities, type CapabilityDetectionOptions } from '../platform/capabilities';
import { detectPreferences, type PreferenceSnapshot } from '../platform/preferences';
import { createAppUI, type AppUI, type AppUIAction } from '../ui/AppUI';
import { ThreeRuntime } from '../render/ThreeRuntime';
import { APP_CONFIG } from './config';
import { DEFAULT_CAMERA_RADIUS } from '../exploration/navigation';
import { InputController } from '../exploration/InputController';
import { MovementController } from '../exploration/MovementController';
import { PointerLockLook, type PointerLockOutcome } from '../exploration/PointerLockLook';
import type { InputClearReason } from '../exploration/types';

type DevelopmentScenario =
  | 'unsupported'
  | 'locked'
  | 'denied'
  | 'error'
  | 'unlocked'
  | 'paused'
  | 'degraded'
  | 'context-lost'
  | 'fatal';

const DEVELOPMENT_SCENARIOS: Record<DevelopmentScenario, true> = {
  unsupported: true,
  locked: true,
  denied: true,
  error: true,
  unlocked: true,
  paused: true,
  degraded: true,
  'context-lost': true,
  fatal: true,
};

function readDevelopmentScenario(location: Location): DevelopmentScenario | null {
  if (!import.meta.env.DEV) {
    return null;
  }

  const candidate = new URLSearchParams(location.search).get('lifecycle');
  return candidate !== null && Object.hasOwn(DEVELOPMENT_SCENARIOS, candidate)
    ? (candidate as DevelopmentScenario)
    : null;
}

export interface AppControllerConfig {
  readonly capabilityOptions?: CapabilityDetectionOptions;
}

export function installPageHideHandler(
  controller: Pick<AppController, 'handlePageHide'>,
  target: Window = window,
): () => void {
  const onPageHide = (event: PageTransitionEvent): void => controller.handlePageHide(event);
  target.addEventListener('pagehide', onPageHide);
  return () => target.removeEventListener('pagehide', onPageHide);
}

export class AppController {
  private state: AppState = INITIAL_APP_STATE;
  private readonly scenario: DevelopmentScenario | null;
  private readonly capabilityOptions: CapabilityDetectionOptions | undefined;
  private readonly preferences: PreferenceSnapshot;
  private readonly ui: AppUI;
  private runtime: ThreeRuntime | null = null;
  private inputController: InputController | null = null;
  private pointerLockLook: PointerLockLook | null = null;
  private movementController: MovementController | null = null;
  private destroyed = false;
  private developmentRuntimeCleanup: (() => void) | null = null;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return;
    }

    const isExploring =
      this.state.kind === 'exploring' ||
      (this.state.kind === 'degraded' && this.state.underlying?.kind === 'exploring');
    if (isExploring) {
      event.preventDefault();
      this.dispatch({ type: 'PAUSE' });
    }
  };

  constructor(location: Location = window.location, config: AppControllerConfig = {}) {
    this.scenario = readDevelopmentScenario(location);
    this.capabilityOptions = import.meta.env.DEV ? config.capabilityOptions : undefined;
    this.preferences = detectPreferences();
    this.ui = createAppUI({
      preferences: this.preferences,
      onAction: (action) => this.handleUIAction(action),
    });
  }

  start(): void {
    this.render();
    window.addEventListener('keydown', this.onKeyDown);
    if (import.meta.env.DEV) this.installDevelopmentRuntimeSurface();
    this.dispatch({ type: 'BOOT' });
    this.evaluateCapabilities();
  }

  handlePageHide(event: PageTransitionEvent): void {
    if (!event.persisted) this.destroy();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const errors: unknown[] = [];
    const cleanup = (stage: () => void): void => {
      try {
        stage();
      } catch (error) {
        errors.push(error);
      }
    };
    cleanup(() => window.removeEventListener('keydown', this.onKeyDown));
    cleanup(() => this.developmentRuntimeCleanup?.());
    this.developmentRuntimeCleanup = null;
    cleanup(() => this.disposeRuntime());
    cleanup(() => this.ui.destroy());
    if (errors.length !== 0) throw new AggregateError(errors, 'AppController destruction failed.');
  }

  private handleUIAction(action: AppUIAction): void {
    if (action.type === 'RETRY') {
      const retry = this.dispatch(action);
      if (retry) {
        this.disposeRuntime();
        this.evaluateCapabilities();
      }
      return;
    }

    const transitioned = this.dispatch(action);
    if (!transitioned) return;
    if (action.type === 'START_EXPLORING' || action.type === 'RESUME') {
      if (this.scenario === null && this.hasFinePointer()) this.pointerLockLook?.requestLock();
      this.applyExplorationScenario();
    }
  }

  private evaluateCapabilities(): void {
    const options: CapabilityDetectionOptions =
      this.scenario === 'unsupported' ? { result: false } : (this.capabilityOptions ?? {});
    const capabilities = detectCapabilities(options);

    if (capabilities.status === 'unsupported') {
      this.dispatch({ type: 'CAPABILITY_UNSUPPORTED', reason: capabilities.reason });
      return;
    }

    if (!this.createRuntime()) return;
    this.dispatch({ type: 'CAPABILITY_SUPPORTED' });
    this.applyPostCapabilityScenario();
  }

  private applyPostCapabilityScenario(): void {
    switch (this.scenario) {
      case 'degraded':
        this.dispatch({ type: 'DEGRADED', reason: 'Forced reduced-mode scenario.' });
        break;
      case 'context-lost':
        this.dispatch({ type: 'CONTEXT_LOST' });
        break;
      case 'fatal':
        this.dispatch({ type: 'FATAL', reason: 'Forced fatal scenario.' });
        break;
      case 'paused':
        if (this.dispatch({ type: 'START_EXPLORING' })) {
          this.dispatch({ type: 'PAUSE' });
        }
        break;
      default:
        break;
    }
  }

  private applyExplorationScenario(): void {
    switch (this.scenario) {
      case 'locked':
        this.dispatch({ type: 'POINTER_LOCK_CONFIRMED' });
        break;
      case 'denied':
        this.dispatch({ type: 'POINTER_LOCK_DENIED' });
        break;
      case 'error':
        this.dispatch({ type: 'POINTER_LOCK_ERROR' });
        break;
      case 'unlocked':
        this.dispatch({ type: 'POINTER_LOCK_CONFIRMED' });
        this.dispatch({ type: 'POINTER_UNLOCKED' });
        break;
      default:
        break;
    }
  }

  private installDevelopmentRuntimeSurface(): void {
    if (!import.meta.env.DEV) return;
    const eventName = 'three-runtime:command';
    const listener = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as Record<string, unknown> | null;
      if (detail?.action === 'rebuild') {
        this.runtime?.rebuildScene();
        return;
      }
      if (detail?.action === 'landscape/set-settings') {
        const settings = detail.settings;
        if (typeof settings === 'object' && settings !== null) {
          const candidate = settings as Record<string, unknown>;
          const density = candidate.density;
          const motion = candidate.motion;
          if ((density === 'high' || density === 'medium' || density === 'low')
            && (motion === 'standard' || motion === 'reduced')) {
            this.runtime?.rebuildScene(Object.freeze({ density, motion }));
          }
        }
        return;
      }
      if (detail?.action === 'landscape/freeze-time') {
        if (typeof detail.time === 'number' && Number.isFinite(detail.time) && detail.time >= 0) {
          this.runtime?.setLandscapeCaptureTime(detail.time);
        }
        return;
      }
      if (detail?.action === 'landscape/unfreeze') {
        this.runtime?.setLandscapeCaptureTime(null);
        return;
      }
      if (detail?.action === 'landscape/reset') {
        this.runtime?.resetLandscape();
        return;
      }
      if (detail?.action === 'landscape/frame') {
        if (typeof detail.view === 'string') this.runtime?.frameLandscape(detail.view);
        return;
      }
      if (detail?.action === 'environment/probe') {
        const position = detail.position;
        const target = detail.target;
        if (Array.isArray(position) && position.length === 3 && position.every((value) => typeof value === 'number' && Number.isFinite(value))
          && Array.isArray(target) && target.length === 3 && target.every((value) => typeof value === 'number' && Number.isFinite(value))) {
          this.runtime?.frameEnvironmentProbe(
            position as unknown as readonly [number, number, number],
            target as unknown as readonly [number, number, number],
            typeof detail.id === 'string' ? detail.id : 'probe',
          );
        }
        return;
      }
      if (detail?.action === 'environment/frame') {
        if (typeof detail.view === 'string') this.runtime?.frameEnvironment(detail.view);
        return;
      }
      if (detail?.action === 'world-debug/set-visible') {
        if (typeof detail.visible === 'boolean') this.runtime?.setWorldDebugVisible(detail.visible);
        return;
      }
      if (detail?.action === 'world-debug/visit-anchor') {
        if (typeof detail.anchorId === 'string') this.runtime?.visitWorldAnchor(detail.anchorId);
        return;
      }
      if (detail?.action === 'world-debug/frame-view') {
        if (detail.name === 'grid' || detail.name === 'public-green' || detail.name === 'sightlines' || detail.name === 'planting') {
          this.runtime?.frameWorldDebugView(detail.name);
        }
        return;
      }
      if (detail?.action === 'world-debug/probe') {
        if (typeof detail.x === 'number' && Number.isFinite(detail.x)
          && typeof detail.z === 'number' && Number.isFinite(detail.z)) {
          const radius = typeof detail.radius === 'number' && Number.isFinite(detail.radius)
            ? detail.radius
            : undefined;
          const candidateFrom = detail.from;
          const from = typeof candidateFrom === 'object'
            && candidateFrom !== null
            && typeof (candidateFrom as Record<string, unknown>).x === 'number'
            && Number.isFinite((candidateFrom as Record<string, unknown>).x)
            && typeof (candidateFrom as Record<string, unknown>).z === 'number'
            && Number.isFinite((candidateFrom as Record<string, unknown>).z)
            ? {
                x: (candidateFrom as { readonly x: number }).x,
                z: (candidateFrom as { readonly z: number }).z,
              }
            : undefined;
          this.runtime?.probeWorldNavigation({ x: detail.x, z: detail.z }, radius, from);
        }
        return;
      }
      if (detail?.action === 'architecture/frame') {
        const view = detail.view;
        if (typeof detail.subjectId === 'string'
          && (view === 'front' || view === 'three-quarter' || view === 'route' || view === 'low')) {
          this.runtime?.frameArchitecture(detail.subjectId, view);
        }
        return;
      }
      if (detail?.action !== 'cycle' || this.runtime === null) return;
      const requestedCount = typeof detail.count === 'number' ? Math.floor(detail.count) : 10;
      const count = Math.min(100, Math.max(1, requestedCount));
      for (let index = 0; index < count; index += 1) {
        this.disposeRuntime();
        if (!this.createRuntime()) break;
      }
    };
    document.addEventListener(eventName, listener);
    this.developmentRuntimeCleanup = () => document.removeEventListener(eventName, listener);
  }

  private createRuntime(): boolean {
    if (this.destroyed || this.runtime !== null) return this.runtime !== null;
    const canvas = document.querySelector<HTMLCanvasElement>('#app-canvas');
    if (canvas === null) {
      this.dispatch({ type: 'FATAL', reason: 'The graphics canvas is unavailable.' });
      return false;
    }

    let runtime: ThreeRuntime | null = null;
    let input: InputController | null = null;
    let look: PointerLockLook | null = null;
    let movement: MovementController | null = null;
    try {
      runtime = new ThreeRuntime(canvas, {
        onUpdate: (frame) => this.movementController?.update(frame.deltaSeconds),
        landscapeSettings: Object.freeze({
          density: 'high',
          motion: this.preferences.prefersReducedMotion ? 'reduced' : 'standard',
        }),
      });
      const world = runtime.worldBuildResult;
      if (world === null) throw new Error('The graphics world was not initialized.');
      input = new InputController({
        canvas,
        onClear: (reason) => this.handleInputClear(reason),
      });
      movement = new MovementController({
        camera: runtime.camera,
        input,
        navigation: world.navigation,
        spawnPose: { position: world.navigation.spawn, yaw: world.data.spawnYaw },
        resetPose: { position: world.navigation.reset, yaw: world.data.resetYaw },
        eyeHeight: APP_CONFIG.camera.eyeHeight,
        walkSpeed: APP_CONFIG.controls.walkSpeed,
        cameraRadius: DEFAULT_CAMERA_RADIUS,
        maxPitchRadians: APP_CONFIG.controls.maxPitchRadians,
        maxDeltaSeconds: APP_CONFIG.controls.maxDeltaSeconds,
      });
      look = new PointerLockLook({
        target: canvas,
        sensitivityRadiansPerPixel: APP_CONFIG.controls.lookSensitivityRadiansPerPixel,
        onLook: (delta) => this.movementController?.applyLook(delta),
        onOutcome: (outcome) => this.handlePointerLockOutcome(outcome),
      });
      this.runtime = runtime;
      this.inputController = input;
      this.movementController = movement;
      this.pointerLockLook = look;
      input.start();
      look.start();
      this.syncExplorationControllers();
      return true;
    } catch {
      this.runtime = null;
      this.inputController = null;
      this.movementController = null;
      this.pointerLockLook = null;
      look?.dispose();
      input?.dispose();
      movement?.setActive(false);
      runtime?.dispose();
      this.dispatch({ type: 'FATAL', reason: 'The graphics runtime could not be created.' });
      return false;
    }
  }

  private disposeRuntime(): void {
    const runtime = this.runtime;
    const input = this.inputController;
    const movement = this.movementController;
    const look = this.pointerLockLook;
    this.runtime = null;
    this.inputController = null;
    this.movementController = null;
    this.pointerLockLook = null;
    look?.releaseLock();
    look?.dispose();
    input?.dispose();
    movement?.setActive(false);
    runtime?.dispose();
  }

  private dispatch(event: AppEvent): boolean {
    const transition = reduceAppState(this.state, event);
    if (!transition.transitioned) return false;
    this.state = transition.state;
    this.syncExplorationControllers();
    this.ui.render({ state: transition.state, invariant: transition.invariant });
    return true;
  }

  private syncExplorationControllers(): void {
    const exploring = getAppStateInvariant(this.state).isExploring;
    this.inputController?.setEnabled(exploring);
    this.movementController?.setActive(exploring);
    this.pointerLockLook?.setEnabled(exploring);
    if (!exploring) this.pointerLockLook?.releaseLock();
  }

  private handleInputClear(reason: InputClearReason): void {
    this.movementController?.invalidateResumeDelta();
    if ((reason === 'blur' || reason === 'hidden') && getAppStateInvariant(this.state).isExploring) {
      this.dispatch({ type: 'PAUSE' });
    }
  }

  private handlePointerLockOutcome(outcome: PointerLockOutcome): void {
    switch (outcome) {
      case 'locked':
        this.dispatch({ type: 'POINTER_LOCK_CONFIRMED' });
        return;
      case 'unlocked':
        if (!getAppStateInvariant(this.state).isExploring) return;
        this.inputController?.clear('lock-exit');
        this.dispatch({ type: 'PAUSE' });
        return;
      case 'denied':
        this.inputController?.clear('lock-exit');
        this.dispatch({ type: 'POINTER_LOCK_DENIED' });
        return;
      case 'error':
        this.inputController?.clear('lock-exit');
        this.dispatch({ type: 'POINTER_LOCK_ERROR' });
    }
  }

  private hasFinePointer(): boolean {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  private render(): void {
    this.ui.render({ state: this.state, invariant: getAppStateInvariant(this.state) });
  }
}
