import { describe, expect, it } from 'vitest';

import {
  INITIAL_APP_STATE,
  getAppStateInvariant,
  reduceAppState,
  type AppEvent,
  type AppState,
} from '../../src/app/appState';
import { APP_CONFIG, APP_COPY } from '../../src/app/config';

function transition(state: AppState, event: AppEvent): AppState {
  return reduceAppState(state, event).state;
}

const ALL_STATES: readonly AppState[] = [
  { kind: 'boot' },
  { kind: 'loading' },
  { kind: 'onboarding' },
  { kind: 'exploring', control: 'locked' },
  { kind: 'exploring', control: 'drag' },
  { kind: 'paused', resumeControl: 'locked' },
  { kind: 'degraded', reason: 'Reduced detail.', underlying: null },
  { kind: 'context-lost' },
  { kind: 'unsupported', reason: 'WebGL2 unavailable.' },
  { kind: 'fatal', reason: 'Unexpected failure.' },
];

const ALL_EVENTS: readonly AppEvent[] = [
  { type: 'BOOT' },
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
  { type: 'CONTEXT_RESTORED' },
  { type: 'FATAL', reason: 'Unexpected failure.' },
  { type: 'RETRY' },
  { type: 'OPEN_PANEL', panel: 'help' },
  { type: 'CLOSE_PANEL' },
];

describe('app state contract', () => {
  it('provides nonblank visible output for every state and safely reduces every event', () => {
    for (const state of ALL_STATES) {
      expect(getAppStateInvariant(state).visibleOutput.trim()).not.toBe('');
      for (const event of ALL_EVENTS) {
        expect(reduceAppState(state, event).invariant.visibleOutput.trim()).not.toBe('');
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

  it('pauses and resumes the current projection while unlock during pause removes stale lock', () => {
    const paused = transition(
      { kind: 'exploring', control: 'locked' },
      { type: 'PAUSE' },
    );
    expect(paused).toEqual({ kind: 'paused', resumeControl: 'locked' });
    expect(transition(paused, { type: 'RESUME' })).toEqual({
      kind: 'exploring',
      control: 'locked',
    });

    const unlockedPause = transition(paused, { type: 'POINTER_UNLOCKED' });
    expect(unlockedPause).toEqual({ kind: 'paused', resumeControl: 'drag' });
    expect(transition(unlockedPause, { type: 'RESUME' })).toEqual({
      kind: 'exploring',
      control: 'drag',
    });
  });

  it('gives fatal and context loss precedence over lifecycle-local transitions', () => {
    expect(
      transition({ kind: 'exploring', control: 'locked' }, { type: 'FATAL', reason: 'boom' }),
    ).toEqual({ kind: 'fatal', reason: 'boom' });
    expect(transition({ kind: 'onboarding' }, { type: 'CONTEXT_LOST' })).toEqual({
      kind: 'context-lost',
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
      underlying: { kind: 'exploring', control: 'drag' },
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

});
