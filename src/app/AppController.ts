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

export class AppController {
  private state: AppState = INITIAL_APP_STATE;
  private readonly scenario: DevelopmentScenario | null;
  private readonly capabilityOptions: CapabilityDetectionOptions | undefined;
  private readonly ui: AppUI;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return;
    }

    const control =
      this.state.kind === 'exploring'
        ? this.state.control
        : this.state.kind === 'degraded' && this.state.underlying?.kind === 'exploring'
          ? this.state.underlying.control
          : null;
    if (control !== null) {
      event.preventDefault();
      this.dispatch(control === 'locked' ? { type: 'POINTER_UNLOCKED' } : { type: 'PAUSE' });
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
    this.dispatch({ type: 'BOOT' });
    this.evaluateCapabilities();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.ui.destroy();
  }

  private handleUIAction(action: AppUIAction): void {
    if (action.type === 'RETRY') {
      const retry = this.dispatch(action);
      if (retry) {
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
