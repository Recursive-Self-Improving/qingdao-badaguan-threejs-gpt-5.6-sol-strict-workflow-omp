import { describe, expect, it } from 'vitest';

import {
  INITIAL_APP_STATE,
  getAppStateInvariant,
  normalizeRestorableProjection,
  reduceAppState,
  type AppEvent,
  type AppOperationalProjection,
  type AppState,
} from '../../src/app/appState';
import { APP_CONFIG, APP_COPY } from '../../src/app/config';

function transition(state: AppState, event: AppEvent): AppState {
  return reduceAppState(state, event).state;
}

const OPTIONAL_FAILURE = { assetId: 'route-guide', message: 'Unavailable.', status: 'failed' as const, classification: 'http' as const };

const ALL_STATES: readonly AppState[] = [
  { kind: 'boot' },
  { kind: 'loading' },
  { kind: 'loading', attempt: 7, phase: 'preparing', progress: { kind: 'indeterminate', phase: 'preparing', label: 'Preparing' }, canCancel: true },
  { kind: 'onboarding' },
  { kind: 'exploring', control: 'locked' },
  { kind: 'exploring', control: 'drag' },
  { kind: 'paused', resumeControl: 'locked' },
  { kind: 'degraded', reason: 'Reduced detail.', underlying: null },
  { kind: 'degraded', failures: [OPTIONAL_FAILURE], underlying: { kind: 'onboarding' } },
  { kind: 'degraded', failures: [{ ...OPTIONAL_FAILURE, status: 'retrying' }], underlying: { kind: 'paused', resumeControl: 'drag' } },
  { kind: 'context-lost' },
  { kind: 'context-lost', phase: 'waiting', restore: { kind: 'exploring', control: 'locked' } },
  { kind: 'context-lost', phase: 'rebuilding', restore: { kind: 'paused', resumeControl: 'drag' } },
  { kind: 'unsupported', reason: 'WebGL2 unavailable.' },
  { kind: 'fatal', reason: 'Unexpected failure.' },
  { kind: 'load-cancelled', reason: 'Cancelled.' },
  { kind: 'recovery-failed', reason: 'Recovery failed.' },
  { kind: 'static', reason: 'recovery-failed' },
];

const ALL_EVENTS: readonly AppEvent[] = [
  { type: 'BOOT' },
  { type: 'LOAD_PROGRESS', attempt: 7, progress: { kind: 'items', phase: 'assets', loaded: 0, total: 1, currentLabel: 'Route guide' }, canCancel: true },
  { type: 'LOAD_ESSENTIAL_READY', attempt: 7 },
  { type: 'LOAD_OPTIONAL_FAILED', attempt: 7, failure: OPTIONAL_FAILURE },
  { type: 'RETRY_OPTIONAL', assetId: 'route-guide' },
  { type: 'LOAD_OPTIONAL_RECOVERED', assetId: 'route-guide' },
  { type: 'LOAD_FAILED', attempt: 7, reason: 'Required failed.' },
  { type: 'LOAD_CANCELLED', attempt: 7 },
  { type: 'CAPABILITY_SUPPORTED' },
  { type: 'CAPABILITY_UNSUPPORTED', reason: 'WebGL2 unavailable.' },
  { type: 'START_EXPLORING' },
  { type: 'POINTER_LOCK_CONFIRMED' },
  { type: 'POINTER_LOCK_DENIED' },
  { type: 'POINTER_LOCK_ERROR' },
  { type: 'POINTER_UNLOCKED' },
  { type: 'PAUSE' },
  { type: 'RESUME' },
  { type: 'DEGRADED', reason: 'Reduced detail.' },
  { type: 'CONTEXT_LOST' },
  { type: 'CONTEXT_RECOVERY_STARTED' },
  { type: 'CONTEXT_RECOVERY_FAILED', reason: 'Recovery failed.' },
  { type: 'CONTEXT_RESTORED' },
  { type: 'FATAL', reason: 'Unexpected failure.' },
  { type: 'RETRY' },
  { type: 'RETURN_TO_STATIC' },
  { type: 'RELOAD' },
  { type: 'OPEN_PANEL', panel: 'help' },
  { type: 'CLOSE_PANEL' },
];

function expectedNextState(state: AppState, event: AppEvent): AppState | null {
  if (event.type === 'OPEN_PANEL') {
    if (state.kind === 'boot' || state.kind === 'loading' || state.kind === 'context-lost') return null;
    if (state.kind === 'exploring') return { kind: 'paused', resumeControl: state.control, panel: event.panel };
    if (state.kind === 'degraded' && state.underlying?.kind === 'exploring') {
      return { ...state, panel: event.panel, underlying: { kind: 'paused', resumeControl: state.underlying.control } };
    }
    return { ...state, panel: event.panel };
  }
  if (event.type === 'CLOSE_PANEL') return state.panel === undefined || state.panel === 'none' ? null : { ...state, panel: 'none' };
  if (event.type === 'FATAL') return state.kind === 'fatal' ? null : { kind: 'fatal', reason: event.reason };
  if (event.type === 'LOAD_FAILED') return state.kind === 'loading' && (event.attempt === undefined || state.attempt === event.attempt) ? { kind: 'fatal', reason: event.reason } : null;
  if (event.type === 'LOAD_OPTIONAL_FAILED') {
    const underlying = state.kind === 'degraded' ? state.underlying : state.kind === 'onboarding' || state.kind === 'exploring' || state.kind === 'paused' ? state : null;
    if (underlying === null) return null;
    const current = state.kind === 'degraded' ? state.failures ?? [{ assetId: 'legacy', message: state.reason ?? '', status: 'failed' as const, classification: 'runtime' as const }] : [];
    return { kind: 'degraded', failures: [...current.filter(({ assetId }) => assetId !== event.failure.assetId), event.failure], underlying, panel: state.panel };
  }
  if (event.type === 'RETURN_TO_STATIC') {
    const reason = state.kind === 'load-cancelled' ? 'cancelled' : state.kind === 'unsupported' ? 'unsupported' : state.kind === 'recovery-failed' ? 'recovery-failed' : state.kind === 'fatal' || state.kind === 'context-lost' ? 'fatal' : null;
    return reason === null ? null : { kind: 'static', reason };
  }
  if (event.type === 'CONTEXT_RECOVERY_FAILED') return state.kind === 'context-lost' ? { kind: 'recovery-failed', reason: event.reason } : null;
  if (event.type === 'CONTEXT_LOST') {
    if (state.kind === 'context-lost') return { ...state, phase: 'waiting' };
    if (state.kind === 'onboarding' || state.kind === 'exploring' || state.kind === 'paused') return { kind: 'context-lost', phase: 'waiting', restore: state };
    if (state.kind === 'degraded' && state.underlying !== null) return { kind: 'context-lost', phase: 'waiting', restore: { kind: 'degraded', failures: state.failures ?? [{ assetId: 'legacy', message: state.reason ?? '', status: 'failed', classification: 'runtime' }], underlying: state.underlying } };
    return null;
  }
  if (event.type === 'DEGRADED') {
    if (!['loading', 'onboarding', 'exploring', 'paused'].includes(state.kind)) return null;
    return { kind: 'degraded', reason: event.reason, underlying: state.kind === 'onboarding' || state.kind === 'exploring' || state.kind === 'paused' ? state : null };
  }
  switch (state.kind) {
    case 'boot': return event.type === 'BOOT' ? { kind: 'loading' } : null;
    case 'loading':
      if (event.type === 'LOAD_PROGRESS' && state.attempt === event.attempt) return { ...state, phase: event.progress.kind === 'items' ? 'items' : event.progress.phase, progress: event.progress, canCancel: event.canCancel };
      if ((event.type === 'LOAD_ESSENTIAL_READY' && state.attempt === event.attempt) || event.type === 'CAPABILITY_SUPPORTED') return { kind: 'onboarding' };
      if (event.type === 'CAPABILITY_UNSUPPORTED') return { kind: 'unsupported', reason: event.reason };
      if (event.type === 'LOAD_CANCELLED' && (event.attempt === undefined || state.attempt === event.attempt)) return { kind: 'load-cancelled', reason: 'Loading was cancelled. No background loading will continue.' };
      return null;
    case 'onboarding': return event.type === 'START_EXPLORING' ? { kind: 'exploring', control: 'drag', fallbackReason: 'initial' } : null;
    case 'exploring': {
      if (event.type === 'POINTER_LOCK_CONFIRMED') return state.control === 'locked' ? null : { kind: 'exploring', control: 'locked' };
      const fallbackReason = event.type === 'POINTER_LOCK_DENIED' ? 'denied' : event.type === 'POINTER_LOCK_ERROR' ? 'error' : event.type === 'POINTER_UNLOCKED' ? 'unlocked' : null;
      if (fallbackReason !== null) return state.control === 'drag' && state.fallbackReason === fallbackReason ? null : { kind: 'exploring', control: 'drag', fallbackReason };
      return event.type === 'PAUSE' ? { kind: 'paused', resumeControl: state.control } : null;
    }
    case 'paused':
      if (event.type === 'RESUME') return { kind: 'exploring', control: 'drag', fallbackReason: 'initial' };
      if (event.type === 'POINTER_UNLOCKED' || event.type === 'POINTER_LOCK_DENIED' || event.type === 'POINTER_LOCK_ERROR') return state.resumeControl === 'drag' ? null : { kind: 'paused', resumeControl: 'drag' };
      return null;
    case 'degraded': {
      const current = state.failures ?? (state.reason === undefined ? [] : [{ assetId: 'legacy', message: state.reason, status: 'failed' as const, classification: 'runtime' as const }]);
      if (event.type === 'RETRY' && state.failures === undefined) return { kind: 'loading' };
      if (event.type === 'RETRY_OPTIONAL') {
        const updated = current.map((failure) => event.assetId === undefined || failure.assetId === event.assetId ? { ...failure, status: 'retrying' as const } : failure);
        return updated.some((failure, index) => failure !== current[index]) ? { ...state, failures: updated, reason: undefined } : null;
      }
      if (event.type === 'LOAD_OPTIONAL_RECOVERED') {
        const remaining = current.filter(({ assetId }) => assetId !== event.assetId);
        return remaining.length === current.length ? null : remaining.length === 0 ? { ...state.underlying!, panel: state.panel } : { ...state, failures: remaining, reason: undefined };
      }
      if (state.underlying?.kind === 'onboarding' && event.type === 'START_EXPLORING') return { ...state, underlying: { kind: 'exploring', control: 'drag', fallbackReason: 'initial' } };
      if (state.underlying?.kind === 'exploring' || state.underlying?.kind === 'paused') {
        const projected = expectedNextState(state.underlying, event);
        return projected === null ? null : { ...state, underlying: projected as AppOperationalProjection };
      }
      return null;
    }
    case 'context-lost':
      if (event.type === 'CONTEXT_RECOVERY_STARTED' && state.phase === 'waiting') return { ...state, phase: 'rebuilding' };
      if (event.type === 'CONTEXT_RESTORED' && state.phase === 'rebuilding') return event.projection ?? state.restore ?? { kind: 'loading' };
      if (event.type === 'CONTEXT_RESTORED' && state.phase === undefined) return { kind: 'loading' };
      return event.type === 'RETRY' ? { kind: 'loading' } : null;
    case 'unsupported':
    case 'fatal': return event.type === 'RETRY' ? { kind: 'loading' } : null;
    case 'load-cancelled':
    case 'recovery-failed':
    case 'static': return event.type === 'RETRY' ? { kind: 'loading' } : null;
  }
}

const TRANSITION_STATES: readonly AppState[] = [
  ...ALL_STATES,
  { kind: 'exploring', control: 'drag', fallbackReason: 'denied' },
  { kind: 'paused', resumeControl: 'drag', panel: 'help' },
  { kind: 'degraded', reason: 'Reduced detail.', underlying: { kind: 'onboarding' } },
  { kind: 'degraded', reason: 'Reduced detail.', underlying: { kind: 'exploring', control: 'locked' } },
  { kind: 'degraded', reason: 'Reduced detail.', underlying: { kind: 'exploring', control: 'drag', fallbackReason: 'error' } },
  { kind: 'degraded', reason: 'Reduced detail.', underlying: { kind: 'paused', resumeControl: 'locked' }, panel: 'settings' },
];

describe('app state contract', () => {
  it('matches the explicit legal and illegal transition table for every event kind', () => {
    for (const state of TRANSITION_STATES) {
      expect(getAppStateInvariant(state).visibleOutput.trim()).not.toBe('');
      for (const event of ALL_EVENTS) {
        const expected = expectedNextState(state, event);
        const actual = reduceAppState(state, event);
        const accepted = expected !== null;

        expect(actual.accepted, `${state.kind} + ${event.type}: accepted`).toBe(accepted);
        expect(actual.transitioned, `${state.kind} + ${event.type}: transitioned`).toBe(accepted);
        expect(actual.state, `${state.kind} + ${event.type}: exact state`).toEqual(expected ?? state);
        if (!accepted) expect(actual.state, `${state.kind} + ${event.type}: identity`).toBe(state);
        expect(actual.invariant).toEqual(getAppStateInvariant(expected ?? state));
      }
    }
  });

  it('boots through capability loading and starts only from ready onboarding', () => {
    const loading = reduceAppState(INITIAL_APP_STATE, { type: 'BOOT' });
    expect(loading).toMatchObject({
      accepted: true,
      transitioned: true,
      state: { kind: 'loading' },
    });

    const onboarding = transition(loading.state, { type: 'CAPABILITY_SUPPORTED' });
    expect(getAppStateInvariant(onboarding).canStart).toBe(true);
    expect(transition(onboarding, { type: 'START_EXPLORING' })).toEqual({
      kind: 'exploring',
      control: 'drag',
      fallbackReason: 'initial',
    });
    expect(reduceAppState({ kind: 'loading' }, { type: 'START_EXPLORING' }).accepted).toBe(
      false,
    );
  });

  it('projects confirmed lock and all denied, error, and unlock outcomes to drag fallback', () => {
    const drag: AppState = { kind: 'exploring', control: 'drag' };
    const locked = transition(drag, { type: 'POINTER_LOCK_CONFIRMED' });
    expect(locked).toEqual({ kind: 'exploring', control: 'locked' });

    const fallbacks = [
      [{ type: 'POINTER_LOCK_DENIED' }, 'denied'],
      [{ type: 'POINTER_LOCK_ERROR' }, 'error'],
      [{ type: 'POINTER_UNLOCKED' }, 'unlocked'],
    ] as const;
    for (const [event, fallbackReason] of fallbacks) {
      expect(transition(locked, event)).toEqual({
        kind: 'exploring',
        control: 'drag',
        fallbackReason,
      });
    }

    const initial: AppState = {
      kind: 'exploring',
      control: 'drag',
      fallbackReason: 'initial',
    };
    const denied = reduceAppState(initial, { type: 'POINTER_LOCK_DENIED' });
    expect(denied).toMatchObject({
      accepted: true,
      state: { kind: 'exploring', control: 'drag', fallbackReason: 'denied' },
    });
    expect(reduceAppState(denied.state, { type: 'POINTER_LOCK_DENIED' })).toMatchObject({
      accepted: false,
      transitioned: false,
    });

    const degradedInitial: AppState = {
      kind: 'degraded',
      reason: 'reduced',
      underlying: initial,
    };
    const degradedError = reduceAppState(degradedInitial, { type: 'POINTER_LOCK_ERROR' });
    expect(degradedError.state).toMatchObject({
      kind: 'degraded',
      underlying: { kind: 'exploring', control: 'drag', fallbackReason: 'error' },
    });
    expect(reduceAppState(degradedError.state, { type: 'POINTER_LOCK_ERROR' }).accepted).toBe(
      false,
    );
  });

  it('resumes in keyboard fallback until a new document lock confirmation', () => {
    const paused = transition(
      { kind: 'exploring', control: 'locked' },
      { type: 'PAUSE' },
    );
    expect(paused).toEqual({ kind: 'paused', resumeControl: 'locked' });
    expect(transition(paused, { type: 'RESUME' })).toEqual({
      kind: 'exploring',
      control: 'drag',
      fallbackReason: 'initial',
    });

    const unlockedPause = transition(paused, { type: 'POINTER_UNLOCKED' });
    expect(unlockedPause).toEqual({ kind: 'paused', resumeControl: 'drag' });
    expect(transition(unlockedPause, { type: 'RESUME' })).toEqual({
      kind: 'exploring',
      control: 'drag',
      fallbackReason: 'initial',
    });
  });

  it('gives fatal and context loss precedence over lifecycle-local transitions', () => {
    expect(
      transition({ kind: 'exploring', control: 'locked' }, { type: 'FATAL', reason: 'boom' }),
    ).toEqual({ kind: 'fatal', reason: 'boom' });
    expect(transition({ kind: 'onboarding' }, { type: 'CONTEXT_LOST' })).toEqual({
      kind: 'context-lost', phase: 'waiting', restore: { kind: 'onboarding' },
    });
    expect(
      transition({ kind: 'paused', resumeControl: 'locked' }, { type: 'DEGRADED', reason: 'low' }),
    ).toEqual({
      kind: 'degraded',
      reason: 'low',
      underlying: { kind: 'paused', resumeControl: 'locked' },
    });
  });

  it('preserves available actions through degraded mode', () => {
    const degradedOnboarding: AppState = {
      kind: 'degraded',
      reason: 'reduced',
      underlying: { kind: 'onboarding' },
    };
    expect(getAppStateInvariant(degradedOnboarding)).toMatchObject({
      canStart: true,
      canRetry: true,
      isExploring: false,
    });

    const degradedExploring = transition(degradedOnboarding, { type: 'START_EXPLORING' });
    expect(degradedExploring).toMatchObject({
      kind: 'degraded',
      underlying: { kind: 'exploring', control: 'drag', fallbackReason: 'initial' },
    });
    expect(getAppStateInvariant(degradedExploring).isExploring).toBe(true);

    const degradedPaused = transition(degradedExploring, { type: 'PAUSE' });
    expect(degradedPaused).toMatchObject({
      kind: 'degraded',
      underlying: { kind: 'paused', resumeControl: 'drag' },
    });
    expect(transition(degradedPaused, { type: 'RESUME' })).toMatchObject({
      kind: 'degraded',
      underlying: { kind: 'exploring', control: 'drag', fallbackReason: 'initial' },
    });
  });

  it('retries deterministically by restarting capability evaluation', () => {
    const retryable: readonly AppState[] = [
      { kind: 'unsupported', reason: 'one' },
      { kind: 'degraded', reason: 'two', underlying: null },
      { kind: 'context-lost' },
      { kind: 'fatal', reason: 'three' },
    ];

    for (const state of retryable) {
      expect(transition(state, { type: 'RETRY' })).toEqual({ kind: 'loading' });
    }
    expect(transition({ kind: 'context-lost' }, { type: 'CONTEXT_RESTORED' })).toEqual({
      kind: 'loading',
    });
  });

  it('rejects illegal and duplicate events without changing state optimistically', () => {
    const state: AppState = { kind: 'onboarding' };
    const illegal = reduceAppState(state, { type: 'POINTER_LOCK_CONFIRMED' });
    expect(illegal).toEqual({
      state,
      invariant: getAppStateInvariant(state),
      transitioned: false,
      accepted: false,
    });

    const locked: AppState = { kind: 'exploring', control: 'locked' };
    const duplicate = reduceAppState(locked, { type: 'POINTER_LOCK_CONFIRMED' });
    expect(duplicate.state).toBe(locked);
    expect(duplicate).toMatchObject({ accepted: false, transitioned: false });
  });

  it('keeps required instructions exact and visibly identifies Badaguan controls', () => {
    expect(APP_COPY.exploringLocked).toBe('Press Escape to release');
    expect(APP_CONFIG.lockedInstruction).toBe('Press Escape to release');
    expect(APP_COPY.exploringDrag).toMatch(/drag/i);
    expect(APP_COPY.exploringDrag).toMatch(/keyboard|touch/i);
    expect(APP_COPY.onboarding).toMatch(/Badaguan/);
    expect(APP_COPY.onboarding).toMatch(/WASD/);
    expect(APP_COPY.onboarding).toMatch(/arrow keys/i);
    expect(APP_COPY.onboarding).toMatch(/mouse/);
    expect(APP_COPY.onboarding).toMatch(/drag\/touch/i);
    expect(APP_COPY.onboarding).toMatch(/Escape/);
  });
  it('owns deterministic help and settings panel projection', () => {
    const exploring: AppState = { kind: 'exploring', control: 'drag' };
    const help = reduceAppState(exploring, { type: 'OPEN_PANEL', panel: 'help' });
    expect(help.state).toEqual({ kind: 'paused', resumeControl: 'drag', panel: 'help' });
    expect(help.invariant).toMatchObject({ panel: 'help', isExploring: false });

    const settings = reduceAppState(help.state, { type: 'OPEN_PANEL', panel: 'settings' });
    expect(settings.invariant.panel).toBe('settings');
    expect(reduceAppState(settings.state, { type: 'CLOSE_PANEL' }).invariant.panel).toBe('none');
    expect(reduceAppState({ kind: 'loading' }, { type: 'OPEN_PANEL', panel: 'help' }).accepted).toBe(
      false,
    );

    const degraded: AppState = {
      kind: 'degraded',
      reason: 'reduced',
      underlying: { kind: 'exploring', control: 'locked' },
    };
    const degradedHelp = reduceAppState(degraded, { type: 'OPEN_PANEL', panel: 'help' });
    expect(degradedHelp.state).toMatchObject({
      kind: 'degraded',
      panel: 'help',
      underlying: { kind: 'paused', resumeControl: 'locked' },
    });
    expect(degradedHelp.invariant.isExploring).toBe(false);
  });

  it('normalizes restored locked intent to honest drag control', () => {
    expect(normalizeRestorableProjection({ kind: 'exploring', control: 'locked' })).toEqual({ kind: 'exploring', control: 'drag', fallbackReason: 'unlocked' });
    expect(normalizeRestorableProjection({ kind: 'degraded', failures: [], underlying: { kind: 'paused', resumeControl: 'locked' } })).toEqual({ kind: 'degraded', failures: [], underlying: { kind: 'paused', resumeControl: 'drag' } });
  });

  it('restarts waiting for a newer loss while rebuilding without dropping the snapshot', () => {
    const restore = { kind: 'exploring', control: 'drag' } as const;
    const rebuilding: AppState = { kind: 'context-lost', phase: 'rebuilding', restore };
    expect(transition(rebuilding, { type: 'CONTEXT_LOST' })).toEqual({ kind: 'context-lost', phase: 'waiting', restore });
  });

});
