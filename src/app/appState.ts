import type { LoadProgress } from '../loading/AssetCoordinator';
import type { DegradationFailure } from '../loading/fallbacks';
import { APP_COPY } from './config';

export type ExplorationControl = 'locked' | 'drag';
export type PointerFallbackReason = 'initial' | 'denied' | 'error' | 'unlocked';
export type AppPanel = 'none' | 'help' | 'settings';
interface PanelState { readonly panel?: AppPanel | undefined }

export type AppOperationalProjection =
  | { readonly kind: 'onboarding' }
  | { readonly kind: 'exploring'; readonly control: ExplorationControl; readonly fallbackReason?: PointerFallbackReason }
  | { readonly kind: 'paused'; readonly resumeControl: ExplorationControl };
export type RestorableAppProjection = AppOperationalProjection | { readonly kind: 'degraded'; readonly failures: readonly DegradationFailure[]; readonly underlying: AppOperationalProjection };

export type AppState =
  | ({ readonly kind: 'boot' } & PanelState)
  | ({ readonly kind: 'loading'; readonly attempt?: number; readonly phase?: 'preparing' | 'essential' | 'items'; readonly progress?: LoadProgress; readonly canCancel?: boolean } & PanelState)
  | ({ readonly kind: 'onboarding' } & PanelState)
  | ({ readonly kind: 'exploring'; readonly control: ExplorationControl; readonly fallbackReason?: PointerFallbackReason } & PanelState)
  | ({ readonly kind: 'paused'; readonly resumeControl: ExplorationControl } & PanelState)
  | ({ readonly kind: 'degraded'; readonly failures?: readonly DegradationFailure[]; readonly reason?: string | undefined; readonly underlying: AppOperationalProjection | null } & PanelState)
  | ({ readonly kind: 'load-cancelled'; readonly reason: string } & PanelState)
  | ({ readonly kind: 'context-lost'; readonly phase?: 'waiting' | 'rebuilding'; readonly restore?: RestorableAppProjection } & PanelState)
  | ({ readonly kind: 'unsupported'; readonly reason: string } & PanelState)
  | ({ readonly kind: 'fatal'; readonly reason: string } & PanelState)
  | ({ readonly kind: 'recovery-failed'; readonly reason: string } & PanelState)
  | ({ readonly kind: 'static'; readonly reason: 'cancelled' | 'unsupported' | 'fatal' | 'recovery-failed' } & PanelState);

export type AppEvent =
  | { readonly type: 'BOOT'; readonly attempt?: number }
  | { readonly type: 'LOAD_PROGRESS'; readonly attempt: number; readonly progress: LoadProgress; readonly canCancel: boolean }
  | { readonly type: 'LOAD_ESSENTIAL_READY'; readonly attempt: number }
  | { readonly type: 'LOAD_OPTIONAL_FAILED'; readonly attempt?: number; readonly failure: DegradationFailure }
  | { readonly type: 'RETRY_OPTIONAL'; readonly assetId?: string }
  | { readonly type: 'LOAD_OPTIONAL_RECOVERED'; readonly assetId: string }
  | { readonly type: 'LOAD_FAILED'; readonly attempt?: number; readonly reason: string }
  | { readonly type: 'LOAD_CANCELLED'; readonly attempt?: number }
  | { readonly type: 'CAPABILITY_SUPPORTED' }
  | { readonly type: 'CAPABILITY_UNSUPPORTED'; readonly reason: string }
  | { readonly type: 'START_EXPLORING' }
  | { readonly type: 'POINTER_LOCK_CONFIRMED' }
  | { readonly type: 'POINTER_LOCK_DENIED' }
  | { readonly type: 'POINTER_LOCK_ERROR' }
  | { readonly type: 'POINTER_UNLOCKED' }
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'DEGRADED'; readonly reason: string }
  | { readonly type: 'CONTEXT_LOST' }
  | { readonly type: 'CONTEXT_RECOVERY_STARTED' }
  | { readonly type: 'CONTEXT_RESTORED'; readonly projection?: RestorableAppProjection | undefined }
  | { readonly type: 'CONTEXT_RECOVERY_FAILED'; readonly reason: string }
  | { readonly type: 'FATAL'; readonly reason: string }
  | { readonly type: 'RETRY'; readonly attempt?: number }
  | { readonly type: 'RETURN_TO_STATIC' }
  | { readonly type: 'RELOAD' }
  | { readonly type: 'OPEN_PANEL'; readonly panel: Exclude<AppPanel, 'none'> }
  | { readonly type: 'CLOSE_PANEL' };

export interface AppStateInvariant {
  readonly visibleOutput: string;
  readonly canStart: boolean;
  readonly canCancel: boolean;
  readonly canRetry: boolean;
  readonly canRetryOptional: boolean;
  readonly canReturn: boolean;
  readonly canReload: boolean;
  readonly isExploring: boolean;
  readonly control: ExplorationControl | null;
  readonly panel: AppPanel;
}
export interface AppTransitionResult { readonly state: AppState; readonly invariant: AppStateInvariant; readonly transitioned: boolean; readonly accepted: boolean }
export const INITIAL_APP_STATE: AppState = Object.freeze({ kind: 'boot' });

function operational(state: AppState): AppOperationalProjection | null {
  if (state.kind === 'onboarding' || state.kind === 'exploring' || state.kind === 'paused') return state;
  if (state.kind === 'degraded') return state.underlying;
  return null;
}
function failures(state: Extract<AppState, { kind: 'degraded' }>): readonly DegradationFailure[] {
  if (state.failures !== undefined) return state.failures;
  return state.reason === undefined ? [] : [{ assetId: 'legacy', message: state.reason, status: 'failed', classification: 'runtime' }];
}
function diagnostic(base: string, reason: string): string { const detail = reason.trim(); return detail === '' ? base : `${base} ${detail}`; }

export function normalizeRestorableProjection(projection: RestorableAppProjection): RestorableAppProjection {
  const normalize = (value: AppOperationalProjection): AppOperationalProjection => value.kind === 'exploring' && value.control === 'locked'
    ? { kind: 'exploring', control: 'drag', fallbackReason: 'unlocked' }
    : value.kind === 'paused' && value.resumeControl === 'locked'
      ? { kind: 'paused', resumeControl: 'drag' }
      : value;
  return projection.kind === 'degraded'
    ? { kind: 'degraded', failures: projection.failures, underlying: normalize(projection.underlying) }
    : normalize(projection);
}

export function getAppStateInvariant(state: AppState): AppStateInvariant {
  const panel = state.panel ?? 'none';
  const base = { canStart: false, canCancel: false, canRetry: false, canRetryOptional: false, canReturn: false, canReload: false, isExploring: false, control: null as ExplorationControl | null, panel };
  switch (state.kind) {
    case 'boot': return { ...base, visibleOutput: APP_COPY.boot };
    case 'loading': return { ...base, visibleOutput: APP_COPY.loading, canCancel: state.canCancel === true };
    case 'onboarding': return { ...base, visibleOutput: APP_COPY.onboarding, canStart: true };
    case 'exploring': return { ...base, visibleOutput: state.control === 'locked' ? APP_COPY.exploringLocked : APP_COPY.exploringDrag, isExploring: true, control: state.control };
    case 'paused': return { ...base, visibleOutput: APP_COPY.paused, control: state.resumeControl };
    case 'degraded': {
      const under = state.underlying;
      return { ...base, visibleOutput: 'Route guide unavailable. The 3D scene and controls still work.', canStart: under?.kind === 'onboarding', canRetry: state.failures === undefined, canRetryOptional: failures(state).some(({ status }) => status === 'failed'), isExploring: under?.kind === 'exploring', control: under?.kind === 'exploring' ? under.control : under?.kind === 'paused' ? under.resumeControl : null };
    }
    case 'load-cancelled': return { ...base, visibleOutput: state.reason, canRetry: true, canReturn: true };
    case 'context-lost': return { ...base, visibleOutput: state.phase === 'rebuilding' ? 'Rebuilding graphics. Your position and settings will be kept.' : 'Movement is paused while the browser restores graphics. Your position and settings are being kept.', canReturn: true };
    case 'unsupported': return { ...base, visibleOutput: diagnostic(APP_COPY.unsupported, state.reason), canRetry: true, canReturn: true };
    case 'fatal': return { ...base, visibleOutput: state.reason, canRetry: true, canReturn: true };
    case 'recovery-failed': return { ...base, visibleOutput: state.reason, canReload: true, canReturn: true };
    case 'static': return { ...base, visibleOutput: 'The interactive walk is unavailable in this view. Badaguan is represented here as a leafy coastal garden-villa district with tree-lined roads, varied low-rise architecture, sloping ground, and framed sea views.', canRetry: true };
  }
}

function result(state: AppState, next: AppState | null): AppTransitionResult {
  const accepted = next !== null;
  const resolved = next ?? state;
  return { state: resolved, invariant: getAppStateInvariant(resolved), transitioned: accepted && resolved !== state, accepted };
}
function nextLoading(attempt?: number): AppState { return attempt === undefined ? { kind: 'loading' } : { kind: 'loading', attempt, phase: 'preparing', progress: { kind: 'indeterminate', phase: 'preparing', label: 'Preparing required resources' }, canCancel: true }; }
function transformOperational(state: AppState, event: AppEvent): AppOperationalProjection | null {
  const under = operational(state);
  if (under === null) return null;
  if (under.kind === 'onboarding') return event.type === 'START_EXPLORING' ? { kind: 'exploring', control: 'drag', fallbackReason: 'initial' } : null;
  if (under.kind === 'exploring') {
    if (event.type === 'POINTER_LOCK_CONFIRMED') return under.control === 'locked' ? null : { kind: 'exploring', control: 'locked' };
    if (event.type === 'PAUSE') return { kind: 'paused', resumeControl: under.control };
    if (event.type === 'POINTER_LOCK_DENIED' || event.type === 'POINTER_LOCK_ERROR' || event.type === 'POINTER_UNLOCKED') {
      const fallbackReason = event.type === 'POINTER_LOCK_DENIED' ? 'denied' : event.type === 'POINTER_LOCK_ERROR' ? 'error' : 'unlocked';
      return under.control === 'drag' && under.fallbackReason === fallbackReason ? null : { kind: 'exploring', control: 'drag', fallbackReason };
    }
    return null;
  }
  if (event.type === 'RESUME') return { kind: 'exploring', control: 'drag', fallbackReason: 'initial' };
  if (event.type === 'POINTER_UNLOCKED' || event.type === 'POINTER_LOCK_DENIED' || event.type === 'POINTER_LOCK_ERROR') return under.resumeControl === 'drag' ? null : { kind: 'paused', resumeControl: 'drag' };
  return null;
}

export function reduceAppState(state: AppState, event: AppEvent): AppTransitionResult {
  if (event.type === 'OPEN_PANEL') {
    if (state.kind === 'boot' || state.kind === 'loading' || state.kind === 'context-lost') return result(state, null);
    const projected = transformOperational(state, { type: 'PAUSE' });
    if (projected !== null && (state.kind === 'exploring' || state.kind === 'degraded')) return result(state, state.kind === 'degraded' ? { ...state, panel: event.panel, underlying: projected } : { ...projected, panel: event.panel });
    return result(state, { ...state, panel: event.panel });
  }
  if (event.type === 'CLOSE_PANEL') return state.panel === undefined || state.panel === 'none' ? result(state, null) : result(state, { ...state, panel: 'none' });
  if (event.type === 'FATAL') return state.kind === 'fatal' ? result(state, null) : result(state, { kind: 'fatal', reason: event.reason });
  if (event.type === 'LOAD_FAILED') return state.kind === 'loading' && (event.attempt === undefined || state.attempt === event.attempt) ? result(state, { kind: 'fatal', reason: event.reason }) : result(state, null);
  if (event.type === 'CONTEXT_LOST') {
    if (state.kind === 'context-lost') return result(state, { ...state, phase: 'waiting' });
    const projection = operational(state);
    if (projection === null) return result(state, null);
    const restore: RestorableAppProjection = state.kind === 'degraded' ? { kind: 'degraded', failures: failures(state), underlying: projection } : projection;
    return result(state, { kind: 'context-lost', phase: 'waiting', restore });
  }
  if (event.type === 'DEGRADED') {
    if (state.kind === 'loading') return result(state, { kind: 'degraded', reason: event.reason, underlying: null });
    if (state.kind === 'degraded') return result(state, null);
    const under = operational(state);
    return under === null ? result(state, null) : result(state, { kind: 'degraded', reason: event.reason, underlying: under });
  }
  if (event.type === 'LOAD_OPTIONAL_FAILED') {
    const under = operational(state);
    if (under === null) return result(state, null);
    const current = state.kind === 'degraded' ? failures(state) : [];
    const merged = [...current.filter(({ assetId }) => assetId !== event.failure.assetId), event.failure];
    return result(state, { kind: 'degraded', failures: Object.freeze(merged), underlying: under, panel: state.panel });
  }
  if (event.type === 'RETURN_TO_STATIC') {
    const reason = state.kind === 'load-cancelled' ? 'cancelled' : state.kind === 'unsupported' ? 'unsupported' : state.kind === 'recovery-failed' ? 'recovery-failed' : state.kind === 'fatal' || state.kind === 'context-lost' ? 'fatal' : null;
    return reason === null ? result(state, null) : result(state, { kind: 'static', reason });
  }
  if (event.type === 'CONTEXT_RECOVERY_FAILED') return state.kind === 'context-lost' ? result(state, { kind: 'recovery-failed', reason: event.reason }) : result(state, null);

  switch (state.kind) {
    case 'boot': return result(state, event.type === 'BOOT' ? nextLoading(event.attempt) : null);
    case 'loading':
      if (event.type === 'LOAD_PROGRESS' && state.attempt === event.attempt) return result(state, { ...state, phase: event.progress.kind === 'items' ? 'items' : event.progress.phase, progress: event.progress, canCancel: event.canCancel });
      if ((event.type === 'LOAD_ESSENTIAL_READY' && state.attempt === event.attempt) || event.type === 'CAPABILITY_SUPPORTED') return result(state, { kind: 'onboarding' });
      if (event.type === 'CAPABILITY_UNSUPPORTED') return result(state, { kind: 'unsupported', reason: event.reason });
      if (event.type === 'LOAD_CANCELLED' && (event.attempt === undefined || state.attempt === event.attempt)) return result(state, { kind: 'load-cancelled', reason: 'Loading was cancelled. No background loading will continue.' });
      return result(state, null);
    case 'degraded':
      if (event.type === 'RETRY' && state.failures === undefined) return result(state, nextLoading(event.attempt));
      if (event.type === 'RETRY_OPTIONAL') {
        const current = failures(state);
        const updated = current.map((failure) => event.assetId === undefined || failure.assetId === event.assetId ? { ...failure, status: 'retrying' as const } : failure);
        return updated.some((failure, index) => failure !== current[index]) ? result(state, { ...state, failures: Object.freeze(updated), reason: undefined }) : result(state, null);
      }
      if (event.type === 'LOAD_OPTIONAL_RECOVERED') {
        const remaining = failures(state).filter(({ assetId }) => assetId !== event.assetId);
        return remaining.length === failures(state).length ? result(state, null) : remaining.length === 0 ? result(state, { ...state.underlying!, panel: state.panel }) : result(state, { ...state, failures: Object.freeze(remaining), reason: undefined });
      }
      {
        const projected = transformOperational(state, event);
        return projected === null ? result(state, null) : result(state, { ...state, underlying: projected });
      }
    case 'onboarding':
    case 'exploring':
    case 'paused': {
      const projected = transformOperational(state, event);
      return projected === null ? result(state, null) : result(state, projected);
    }
    case 'context-lost':
      if (event.type === 'CONTEXT_RECOVERY_STARTED' && state.phase === 'waiting') return result(state, { ...state, phase: 'rebuilding' });
      if (event.type === 'CONTEXT_RESTORED' && state.phase === 'rebuilding') return result(state, event.projection ?? state.restore ?? nextLoading());
      if (event.type === 'CONTEXT_RESTORED' && state.phase === undefined) return result(state, nextLoading());
      if (event.type === 'RETRY') return result(state, nextLoading(event.attempt));
      return result(state, null);
    case 'load-cancelled':
    case 'unsupported':
    case 'fatal':
    case 'recovery-failed':
    case 'static': return result(state, event.type === 'RETRY' ? nextLoading(event.attempt) : null);
  }
}
