import { APP_COPY } from './config';

export type ExplorationControl = 'locked' | 'drag';
export type PointerFallbackReason = 'initial' | 'denied' | 'error' | 'unlocked';
export type AppPanel = 'none' | 'help' | 'settings';

interface PanelState {
  readonly panel?: AppPanel;
}

export type AppOperationalProjection =
  | { readonly kind: 'onboarding' }
  | {
      readonly kind: 'exploring';
      readonly control: ExplorationControl;
      readonly fallbackReason?: PointerFallbackReason;
    }
  | { readonly kind: 'paused'; readonly resumeControl: ExplorationControl };

export type AppState =
  | ({ readonly kind: 'boot' } & PanelState)
  | ({ readonly kind: 'loading' } & PanelState)
  | ({ readonly kind: 'onboarding' } & PanelState)
  | ({
      readonly kind: 'exploring';
      readonly control: ExplorationControl;
      readonly fallbackReason?: PointerFallbackReason;
    } & PanelState)
  | ({ readonly kind: 'paused'; readonly resumeControl: ExplorationControl } & PanelState)
  | ({
      readonly kind: 'degraded';
      readonly reason: string;
      readonly underlying: AppOperationalProjection | null;
    } & PanelState)
  | ({ readonly kind: 'context-lost' } & PanelState)
  | ({ readonly kind: 'unsupported'; readonly reason: string } & PanelState)
  | ({ readonly kind: 'fatal'; readonly reason: string } & PanelState);

export type AppEvent =
  | { readonly type: 'BOOT' }
  | { readonly type: 'CAPABILITY_SUPPORTED' }
  | { readonly type: 'CAPABILITY_UNSUPPORTED'; readonly reason: string }
  | { readonly type: 'START_EXPLORING' }
  // Runtime pointer-lock events come from the authoritative browser bridge (DEV scenarios may inject them).
  // Escape dispatches PAUSE; a later POINTER_UNLOCKED may only downgrade paused resume control.
  | { readonly type: 'POINTER_LOCK_CONFIRMED' }
  | { readonly type: 'POINTER_LOCK_DENIED' }
  | { readonly type: 'POINTER_LOCK_ERROR' }
  | { readonly type: 'POINTER_UNLOCKED' }
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'DEGRADED'; readonly reason: string }
  | { readonly type: 'CONTEXT_LOST' }
  | { readonly type: 'CONTEXT_RESTORED' }
  | { readonly type: 'FATAL'; readonly reason: string }
  | { readonly type: 'RETRY' }
  | { readonly type: 'OPEN_PANEL'; readonly panel: Exclude<AppPanel, 'none'> }
  | { readonly type: 'CLOSE_PANEL' };

export interface AppStateInvariant {
  readonly visibleOutput: string;
  readonly canStart: boolean;
  readonly canRetry: boolean;
  readonly isExploring: boolean;
  readonly control: ExplorationControl | null;
  readonly panel: AppPanel;
}

export interface AppTransitionResult {
  readonly state: AppState;
  readonly invariant: AppStateInvariant;
  readonly transitioned: boolean;
  readonly accepted: boolean;
}

export const INITIAL_APP_STATE: AppState = Object.freeze({ kind: 'boot' });

function diagnostic(base: string, reason: string): string {
  const detail = reason.trim();
  return detail === '' ? base : `${base} ${detail}`;
}

export function getAppStateInvariant(state: AppState): AppStateInvariant {
  const panel = state.panel ?? 'none';
  switch (state.kind) {
    case 'boot':
      return {
        visibleOutput: APP_COPY.boot,
        canStart: false,
        canRetry: false,
        isExploring: false,
        control: null,
        panel,
      };
    case 'loading':
      return {
        visibleOutput: APP_COPY.loading,
        canStart: false,
        canRetry: false,
        isExploring: false,
        control: null,
        panel,
      };
    case 'onboarding':
      return {
        visibleOutput: APP_COPY.onboarding,
        canStart: true,
        canRetry: false,
        isExploring: false,
        control: null,
        panel,
      };
    case 'exploring':
      return {
        visibleOutput:
          state.control === 'locked' ? APP_COPY.exploringLocked : APP_COPY.exploringDrag,
        canStart: false,
        canRetry: false,
        isExploring: true,
        control: state.control,
        panel,
      };
    case 'paused':
      return {
        visibleOutput: APP_COPY.paused,
        canStart: false,
        canRetry: false,
        isExploring: false,
        control: state.resumeControl,
        panel,
      };
    case 'degraded':
      return {
        visibleOutput: diagnostic(APP_COPY.degraded, state.reason),
        canStart: state.underlying?.kind === 'onboarding',
        canRetry: true,
        isExploring: state.underlying?.kind === 'exploring',
        control:
          state.underlying?.kind === 'exploring'
            ? state.underlying.control
            : state.underlying?.kind === 'paused'
              ? state.underlying.resumeControl
              : null,
        panel,
      };
    case 'context-lost':
      return {
        visibleOutput: APP_COPY.contextLost,
        canStart: false,
        canRetry: true,
        isExploring: false,
        control: null,
        panel,
      };
    case 'unsupported':
      return {
        visibleOutput: diagnostic(APP_COPY.unsupported, state.reason),
        canStart: false,
        canRetry: true,
        isExploring: false,
        control: null,
        panel,
      };
    case 'fatal':
      return {
        visibleOutput: diagnostic(APP_COPY.fatal, state.reason),
        canStart: false,
        canRetry: true,
        isExploring: false,
        control: null,
        panel,
      };
  }
}

function result(state: AppState, next: AppState | null): AppTransitionResult {
  const accepted = next !== null;
  const resolved = next ?? state;
  return {
    state: resolved,
    invariant: getAppStateInvariant(resolved),
    transitioned: accepted && resolved !== state,
    accepted,
  };
}

export function reduceAppState(state: AppState, event: AppEvent): AppTransitionResult {
  if (event.type === 'OPEN_PANEL') {
    if (state.kind === 'boot' || state.kind === 'loading') {
      return result(state, null);
    }
    if (state.kind === 'exploring') {
      return result(state, {
        kind: 'paused',
        resumeControl: state.control,
        panel: event.panel,
      });
    }
    if (state.kind === 'degraded' && state.underlying?.kind === 'exploring') {
      return result(state, {
        ...state,
        panel: event.panel,
        underlying: {
          kind: 'paused',
          resumeControl: state.underlying.control,
        },
      });
    }
    return result(state, { ...state, panel: event.panel });
  }
  if (event.type === 'CLOSE_PANEL') {
    return state.panel === undefined || state.panel === 'none'
      ? result(state, null)
      : result(state, { ...state, panel: 'none' });
  }
  // Terminal/error signals take precedence over lifecycle-local events.
  if (event.type === 'FATAL') {
    return state.kind === 'fatal'
      ? result(state, null)
      : result(state, { kind: 'fatal', reason: event.reason });
  }
  if (event.type === 'CONTEXT_LOST') {
    if (
      state.kind === 'loading' ||
      state.kind === 'onboarding' ||
      state.kind === 'exploring' ||
      state.kind === 'paused' ||
      state.kind === 'degraded'
    ) {
      return result(state, { kind: 'context-lost' });
    }
    return result(state, null);
  }
  if (event.type === 'DEGRADED') {
    if (
      state.kind === 'loading' ||
      state.kind === 'onboarding' ||
      state.kind === 'exploring' ||
      state.kind === 'paused'
    ) {
      const underlying: AppOperationalProjection | null =
        state.kind === 'onboarding' || state.kind === 'exploring' || state.kind === 'paused'
          ? state
          : null;
      return result(state, { kind: 'degraded', reason: event.reason, underlying });
    }
    return result(state, null);
  }

  switch (state.kind) {
    case 'boot':
      return result(state, event.type === 'BOOT' ? { kind: 'loading' } : null);
    case 'loading':
      if (event.type === 'CAPABILITY_SUPPORTED') {
        return result(state, { kind: 'onboarding' });
      }
      if (event.type === 'CAPABILITY_UNSUPPORTED') {
        return result(state, { kind: 'unsupported', reason: event.reason });
      }
      return result(state, null);
    case 'onboarding':
      return result(
        state,
        event.type === 'START_EXPLORING'
          ? { kind: 'exploring', control: 'drag', fallbackReason: 'initial' }
          : null,
      );
    case 'exploring':
      if (event.type === 'POINTER_LOCK_CONFIRMED') {
        return state.control === 'locked'
          ? result(state, null)
          : result(state, { kind: 'exploring', control: 'locked' });
      }
      if (
        event.type === 'POINTER_LOCK_DENIED' ||
        event.type === 'POINTER_LOCK_ERROR' ||
        event.type === 'POINTER_UNLOCKED'
      ) {
        const fallbackReason: PointerFallbackReason =
          event.type === 'POINTER_LOCK_DENIED'
            ? 'denied'
            : event.type === 'POINTER_LOCK_ERROR'
              ? 'error'
              : 'unlocked';
        return state.control === 'drag' && state.fallbackReason === fallbackReason
          ? result(state, null)
          : result(state, {
              kind: 'exploring',
              control: 'drag',
              fallbackReason,
            });
      }
      if (event.type === 'PAUSE') {
        return result(state, { kind: 'paused', resumeControl: state.control });
      }
      return result(state, null);
    case 'paused':
      if (event.type === 'RESUME') {
        return result(state, { kind: 'exploring', control: 'drag', fallbackReason: 'initial' });
      }
      if (
        event.type === 'POINTER_UNLOCKED' ||
        event.type === 'POINTER_LOCK_DENIED' ||
        event.type === 'POINTER_LOCK_ERROR'
      ) {
        return state.resumeControl === 'drag'
          ? result(state, null)
          : result(state, { kind: 'paused', resumeControl: 'drag' });
      }
      return result(state, null);
    case 'context-lost':
      if (event.type === 'RETRY' || event.type === 'CONTEXT_RESTORED') {
        return result(state, { kind: 'loading' });
      }
      return result(state, null);
    case 'degraded': {
      const underlying = state.underlying;
      if (event.type === 'RETRY') {
        return result(state, { kind: 'loading' });
      }
      if (underlying?.kind === 'onboarding' && event.type === 'START_EXPLORING') {
        return result(state, {
          ...state,
          underlying: { kind: 'exploring', control: 'drag', fallbackReason: 'initial' },
        });
      }
      if (underlying?.kind === 'exploring') {
        if (event.type === 'POINTER_LOCK_CONFIRMED') {
          return underlying.control === 'locked'
            ? result(state, null)
            : result(state, {
                ...state,
                underlying: { kind: 'exploring', control: 'locked' },
              });
        }
        if (
          event.type === 'POINTER_LOCK_DENIED' ||
          event.type === 'POINTER_LOCK_ERROR' ||
          event.type === 'POINTER_UNLOCKED'
        ) {
          const fallbackReason: PointerFallbackReason =
            event.type === 'POINTER_LOCK_DENIED'
              ? 'denied'
              : event.type === 'POINTER_LOCK_ERROR'
                ? 'error'
                : 'unlocked';
          return underlying.control === 'drag' && underlying.fallbackReason === fallbackReason
            ? result(state, null)
            : result(state, {
                ...state,
                underlying: { kind: 'exploring', control: 'drag', fallbackReason },
              });
        }
        if (event.type === 'PAUSE') {
          return result(state, {
            ...state,
            underlying: { kind: 'paused', resumeControl: underlying.control },
          });
        }
      }
      if (underlying?.kind === 'paused') {
        if (event.type === 'RESUME') {
          return result(state, {
            ...state,
            underlying: { kind: 'exploring', control: 'drag', fallbackReason: 'initial' },
          });
        }
        if (
          event.type === 'POINTER_UNLOCKED' ||
          event.type === 'POINTER_LOCK_DENIED' ||
          event.type === 'POINTER_LOCK_ERROR'
        ) {
          return underlying.resumeControl === 'drag'
            ? result(state, null)
            : result(state, {
                ...state,
                underlying: { kind: 'paused', resumeControl: 'drag' },
              });
        }
      }
      return result(state, null);
    }
    case 'unsupported':
    case 'fatal':
      return result(state, event.type === 'RETRY' ? { kind: 'loading' } : null);
  }
}
