import {
  INITIAL_APP_STATE,
  getAppStateInvariant,
  reduceAppState,
  type AppEvent,
  type AppState,
} from './appState';
import { detectCapabilities, type CapabilityDetectionOptions } from '../platform/capabilities';
import { detectPreferences } from '../platform/preferences';
import { createAppUI, type AppUI, type AppUIAction } from '../ui/AppUI';
import { ThreeRuntime } from '../render/ThreeRuntime';

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
  private readonly ui: AppUI;
  private runtime: ThreeRuntime | null = null;
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
    this.ui = createAppUI({
      preferences: detectPreferences(),
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
    if (transitioned && action.type === 'START_EXPLORING') {
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
      if (detail?.action === 'world-debug/set-visible') {
        if (typeof detail.visible === 'boolean') this.runtime?.setWorldDebugVisible(detail.visible);
        return;
      }
      if (detail?.action === 'world-debug/visit-anchor') {
        if (typeof detail.anchorId === 'string') this.runtime?.visitWorldAnchor(detail.anchorId);
        return;
      }
      if (detail?.action === 'world-debug/frame-view') {
        if (detail.name === 'grid' || detail.name === 'public-green' || detail.name === 'sightlines') {
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
          this.runtime?.probeWorldNavigation({ x: detail.x, z: detail.z }, radius);
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

    try {
      this.runtime = new ThreeRuntime(canvas);
      return true;
    } catch {
      this.disposeRuntime();
      this.dispatch({ type: 'FATAL', reason: 'The graphics runtime could not be created.' });
      return false;
    }
  }

  private disposeRuntime(): void {
    const runtime = this.runtime;
    this.runtime = null;
    runtime?.dispose();
  }

  private dispatch(event: AppEvent): boolean {
    const transition = reduceAppState(this.state, event);
    if (!transition.transitioned) {
      return false;
    }

    this.state = transition.state;
    this.ui.render({ state: transition.state, invariant: transition.invariant });
    return true;
  }

  private render(): void {
    this.ui.render({ state: this.state, invariant: getAppStateInvariant(this.state) });
  }
}
