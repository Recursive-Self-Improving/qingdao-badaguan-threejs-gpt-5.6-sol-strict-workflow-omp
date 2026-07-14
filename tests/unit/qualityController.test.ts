import { describe, expect, it, vi } from 'vitest';
import { loadPersistedPreferences, observeReducedMotion, PREFERENCE_STORAGE_KEY, savePersistedPreferences } from '../../src/platform/preferences';
import { QualityController, type QualityState } from '../../src/quality/QualityController';
import { respondToDevelopmentQualityState } from '../../src/app/AppController';

const highFacts = { acceleration: 'hardware' as const, deviceMemoryGiB: 8, primaryPointerCoarse: false, anyPointerFine: true, hoverCapable: true, maxTextureSize: 8192, maxAnisotropy: 8, cssWidth: 1280, cssHeight: 720, devicePixelRatio: 1 };
const lowFacts = { ...highFacts, acceleration: 'software' as const };
const initial = { version: 1 as const, quality: 'auto' as const, motion: 'system' as const };
const availableInitial = { ...initial, persistence: 'available' as const };
const sessionInitial = { ...initial, persistence: 'session-only' as const };
function feed(controller: QualityController, start: number, interval: number, duration: number): number {
  let now = start;
  if (start === 0) controller.sampleFrame(now);
  while (now + interval <= start + duration) { now += interval; controller.sampleFrame(now); }
  return now;
}

describe('C11 quality controller', () => {
  it('loads and saves only valid versioned enum records, failing closed', () => {
    expect(loadPersistedPreferences({ getItem: () => null })).toEqual(availableInitial);
    for (const raw of ['{', '[]', '{"version":2,"quality":"high","motion":"reduced"}', '{"version":1,"quality":"ultra","motion":"system"}', '{"version":1,"quality":"low"}']) {
      expect(loadPersistedPreferences({ getItem: () => raw })).toEqual(availableInitial);
    }
    expect(loadPersistedPreferences({ getItem: () => JSON.stringify({ version: 1, quality: 'high', motion: 'reduced' }) })).toEqual({ version: 1, quality: 'high', motion: 'reduced', persistence: 'available' });
    expect(loadPersistedPreferences({ getItem: () => { throw new DOMException('blocked'); } })).toEqual(sessionInitial);
    const setItem = vi.fn();
    expect(savePersistedPreferences({ version: 1, quality: 'medium', motion: 'system' }, { setItem })).toBe(true);
    expect(setItem).toHaveBeenCalledWith(PREFERENCE_STORAGE_KEY, JSON.stringify({ version: 1, quality: 'medium', motion: 'system' }));
    expect(savePersistedPreferences(initial, { setItem: () => { throw new DOMException('quota'); } })).toBe(false);
  });

  it('applies manual choices transactionally, persists intent, and honors system motion precedence', () => {
    const apply = vi.fn(); const persist = vi.fn(() => true);
    const controller = new QualityController({ initial, capabilities: highFacts, systemReducedMotion: true, apply, persist });
    expect(controller.state).toMatchObject({ preference: 'auto', activeTier: 'high', effectiveReducedMotion: true });
    controller.setQualityPreference('medium');
    expect(controller.state).toMatchObject({ preference: 'medium', activeTier: 'medium' });
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ profile: expect.objectContaining({ tier: 'medium' }), motion: 'reduced' }), expect.anything(), 'user-quality');
    controller.setMotionPreference('reduced');
    expect(controller.state.effectiveReducedMotion).toBe(true);
    controller.setSystemReducedMotion(false);
    expect(controller.state.effectiveReducedMotion).toBe(true);
    expect(persist).toHaveBeenLastCalledWith({ version: 1, quality: 'medium', motion: 'reduced' });
    const failing = new QualityController({ initial, capabilities: highFacts, systemReducedMotion: false, apply: () => { throw new Error('rebuild'); } });
    expect(() => failing.setQualityPreference('low')).toThrow('rebuild');
    expect(failing.state).toMatchObject({ preference: 'auto', activeTier: 'high' });
  });

  it('downshifts after five contiguous over-budget seconds and never jumps', () => {
    let now = 0; const apply = vi.fn();
    const controller = new QualityController({ initial, capabilities: highFacts, systemReducedMotion: false, now: () => now, apply });
    now = feed(controller, 0, 21, 4_999); expect(controller.state.activeTier).toBe('high');
    now = feed(controller, now, 21, 1_100); expect(controller.state.activeTier).toBe('medium');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(controller.state.auto.phase).toBe('cooldown');
  });

  it('uses strict headroom, twenty seconds, cooldown, and hidden baseline reset', () => {
    let now = 0;
    const exact = new QualityController({ initial, capabilities: lowFacts, systemReducedMotion: false, now: () => now, apply: vi.fn() });
    now = feed(exact, 0, 14, 25_000); expect(exact.state.activeTier).toBe('low');
    exact.suspend('hidden'); now += 60_000; exact.resume('hidden', now);
    now = feed(exact, now, 13, 19_999); expect(exact.state.activeTier).toBe('low');
    now = feed(exact, now, 13, 1_100); expect(exact.state.activeTier).toBe('medium');

    let clock = 0; const oscillation = new QualityController({ initial, capabilities: highFacts, systemReducedMotion: false, now: () => clock, apply: vi.fn() });
    clock = feed(oscillation, 0, 21, 6_000); expect(oscillation.state.activeTier).toBe('medium');
    clock = feed(oscillation, clock, 13, 29_000); expect(oscillation.state.activeTier).toBe('medium');
    clock = feed(oscillation, clock, 13, 20_000); expect(oscillation.state.activeTier).toBe('high');
  });
  it('never publishes candidate system motion and contains observer apply failures', () => {
    const projections: boolean[] = [];
    let controller: QualityController;
    controller = new QualityController({
      initial, capabilities: highFacts, systemReducedMotion: false,
      apply: () => { controller.suspend('rebuild'); controller.resume('rebuild', 0); throw new Error('motion apply failed'); },
      onStateChange: (state) => projections.push(state.effectiveReducedMotion),
    });
    expect(() => controller.setSystemReducedMotion(true)).toThrow('motion apply failed');
    expect(controller.state.effectiveReducedMotion).toBe(false);
    expect(controller.application.motion).toBe('standard');
    expect(projections.length).toBeGreaterThan(0);
    expect(projections.every((reduced) => !reduced)).toBe(true);
    let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;
    const matchMedia = (() => ({
      matches: false,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => { mediaListener = listener as (event: MediaQueryListEvent) => void; },
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const stop = observeReducedMotion(() => { throw new Error('observer apply failed'); }, matchMedia);
    expect(() => mediaListener?.({ matches: true } as MediaQueryListEvent)).not.toThrow();
    stop();
  });

  it('requires a fresh contiguous Auto window after resetSampling', () => {
    let now = 0; const apply = vi.fn();
    const controller = new QualityController({ initial, capabilities: highFacts, systemReducedMotion: false, now: () => now, apply });
    now = feed(controller, 0, 21, 4_999);
    expect(controller.state.activeTier).toBe('high'); expect(apply).not.toHaveBeenCalled();
    controller.resetSampling();
    now = feed(controller, now, 21, 1_100);
    expect(controller.state.activeTier).toBe('high'); expect(apply).not.toHaveBeenCalled();
    now = feed(controller, now, 21, 5_000);
    expect(controller.state.activeTier).toBe('medium'); expect(apply).toHaveBeenCalledTimes(1);
  });

  it('returns only controller state for valid DEV observation and remains inert for invalid or production requests', () => {
    const state = Object.freeze({ activeTier: 'medium' }) as unknown as QualityState;
    const getState = vi.fn(() => state); const respond = vi.fn();
    expect(respondToDevelopmentQualityState({ action: 'quality/state', respond }, getState, true)).toBe(true);
    expect(respond).toHaveBeenCalledWith(state);
    expect(getState).toHaveBeenCalledTimes(1);
    getState.mockClear(); respond.mockClear();
    for (const detail of [null, {}, { action: 'quality/state' }, { action: 'quality/state', respond: true }, { action: 'quality/metrics-snapshot', respond }]) {
      expect(respondToDevelopmentQualityState(detail, getState, true)).toBe(false);
    }
    expect(respondToDevelopmentQualityState({ action: 'quality/state', respond }, getState, false)).toBe(false);
    expect(getState).not.toHaveBeenCalled(); expect(respond).not.toHaveBeenCalled();
  });

});
