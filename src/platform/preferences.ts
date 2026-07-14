import type { MotionPreference, QualityPreference } from '../quality/qualityTiers';

export interface PreferenceSnapshot {
  readonly prefersReducedMotion: boolean;
  readonly primaryPointerCoarse: boolean;
  readonly anyPointerFine: boolean;
  readonly hoverCapable: boolean;
  readonly touchCapable: boolean;
  readonly keyboardControlsAvailable: true;
}

export const PREFERENCE_STORAGE_KEY = 'badaguan.preferences.v1';
export interface PersistedPreferencesV1 {
  readonly version: 1;
  readonly quality: QualityPreference;
  readonly motion: MotionPreference;
}
export const DEFAULT_PERSISTED_PREFERENCES: PersistedPreferencesV1 = Object.freeze({ version: 1, quality: 'auto', motion: 'system' });
export interface LoadedPreferencesV1 extends PersistedPreferencesV1 {
  readonly persistence: 'available' | 'session-only';
}
const AVAILABLE_DEFAULTS: LoadedPreferencesV1 = Object.freeze({ ...DEFAULT_PERSISTED_PREFERENCES, persistence: 'available' });
const SESSION_ONLY_DEFAULTS: LoadedPreferencesV1 = Object.freeze({ ...DEFAULT_PERSISTED_PREFERENCES, persistence: 'session-only' });

export function shouldOfferTouchControls(snapshot: PreferenceSnapshot): boolean {
  return snapshot.primaryPointerCoarse || (snapshot.touchCapable && !snapshot.anyPointerFine);
}

export interface PreferenceEnvironment {
  readonly matchMedia?: (query: string) => Pick<MediaQueryList, 'matches'>;
  readonly maxTouchPoints?: number;
}

const DEFAULT_PREFERENCES: PreferenceSnapshot = Object.freeze({
  prefersReducedMotion: false, primaryPointerCoarse: false, anyPointerFine: false,
  hoverCapable: false, touchCapable: false, keyboardControlsAvailable: true,
});

function safelyMatches(matchMedia: PreferenceEnvironment['matchMedia'], query: string): boolean {
  if (matchMedia === undefined) return false;
  try { return matchMedia(query).matches; } catch { return false; }
}

function getBrowserEnvironment(): PreferenceEnvironment {
  const matchMedia = typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? undefined : window.matchMedia.bind(window);
  const maxTouchPoints = typeof navigator === 'undefined' || !Number.isFinite(navigator.maxTouchPoints) ? undefined : navigator.maxTouchPoints;
  return { ...(matchMedia === undefined ? {} : { matchMedia }), ...(maxTouchPoints === undefined ? {} : { maxTouchPoints }) };
}

export function detectPreferences(environment: PreferenceEnvironment = getBrowserEnvironment()): PreferenceSnapshot {
  if (environment.matchMedia === undefined && environment.maxTouchPoints === undefined) return DEFAULT_PREFERENCES;
  const primaryPointerCoarse = safelyMatches(environment.matchMedia, '(pointer: coarse)');
  const touchCapable = (environment.maxTouchPoints ?? 0) > 0 || safelyMatches(environment.matchMedia, '(any-pointer: coarse)');
  return {
    prefersReducedMotion: safelyMatches(environment.matchMedia, '(prefers-reduced-motion: reduce)'),
    primaryPointerCoarse, anyPointerFine: safelyMatches(environment.matchMedia, '(any-pointer: fine)'),
    hoverCapable: safelyMatches(environment.matchMedia, '(any-hover: hover)'), touchCapable,
    keyboardControlsAvailable: true,
  };
}

function isQualityPreference(value: unknown): value is QualityPreference {
  return value === 'auto' || value === 'low' || value === 'medium' || value === 'high';
}
function isMotionPreference(value: unknown): value is MotionPreference { return value === 'system' || value === 'reduced'; }

export function loadPersistedPreferences(storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): LoadedPreferencesV1 {
  if (storage === undefined) return SESSION_ONLY_DEFAULTS;
  let encoded: string | null;
  try { encoded = storage.getItem(PREFERENCE_STORAGE_KEY); }
  catch { return SESSION_ONLY_DEFAULTS; }
  if (encoded === null) return AVAILABLE_DEFAULTS;
  try {
    const value: unknown = JSON.parse(encoded);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return AVAILABLE_DEFAULTS;
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || !isQualityPreference(record.quality) || !isMotionPreference(record.motion)) return AVAILABLE_DEFAULTS;
    return Object.freeze({ version: 1, quality: record.quality, motion: record.motion, persistence: 'available' });
  } catch { return AVAILABLE_DEFAULTS; }
}
export function savePersistedPreferences(value: PersistedPreferencesV1, storage: Pick<Storage, 'setItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): boolean {
  if (storage === undefined || value.version !== 1 || !isQualityPreference(value.quality) || !isMotionPreference(value.motion)) return false;
  try { storage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(value)); return true; } catch { return false; }
}

export function resolveReducedMotion(preference: MotionPreference, systemReducedMotion: boolean): boolean {
  return systemReducedMotion || preference === 'reduced';
}

export function observeReducedMotion(onChange: (reduced: boolean) => void, matchMedia: typeof window.matchMedia | undefined = typeof window === 'undefined' ? undefined : window.matchMedia?.bind(window)): () => void {
  if (matchMedia === undefined) return () => undefined;
  let query: MediaQueryList;
  try { query = matchMedia('(prefers-reduced-motion: reduce)'); } catch { return () => undefined; }
  const listener = (event: MediaQueryListEvent): void => { try { onChange(event.matches); } catch { /* Runtime apply failure leaves the prior synchronized state active. */ } };
  try { query.addEventListener('change', listener); } catch { return () => undefined; }
  return () => query.removeEventListener('change', listener);
}
