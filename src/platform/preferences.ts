export interface PreferenceSnapshot {
  readonly prefersReducedMotion: boolean;
  readonly primaryPointerCoarse: boolean;
  readonly anyPointerFine: boolean;
  readonly hoverCapable: boolean;
  readonly touchCapable: boolean;
  readonly keyboardControlsAvailable: true;
}

export interface PreferenceEnvironment {
  readonly matchMedia?: (query: string) => Pick<MediaQueryList, 'matches'>;
  readonly maxTouchPoints?: number;
}

const DEFAULT_PREFERENCES: PreferenceSnapshot = {
  prefersReducedMotion: false,
  primaryPointerCoarse: false,
  anyPointerFine: false,
  hoverCapable: false,
  touchCapable: false,
  keyboardControlsAvailable: true,
};

function safelyMatches(
  matchMedia: PreferenceEnvironment['matchMedia'],
  query: string,
): boolean {
  if (matchMedia === undefined) {
    return false;
  }

  try {
    return matchMedia(query).matches;
  } catch {
    return false;
  }
}

function getBrowserEnvironment(): PreferenceEnvironment {
  const matchMedia =
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? undefined
      : window.matchMedia.bind(window);
  const maxTouchPoints =
    typeof navigator === 'undefined' || !Number.isFinite(navigator.maxTouchPoints)
      ? undefined
      : navigator.maxTouchPoints;

  return {
    ...(matchMedia === undefined ? {} : { matchMedia }),
    ...(maxTouchPoints === undefined ? {} : { maxTouchPoints }),
  };
}

export function detectPreferences(
  environment: PreferenceEnvironment = getBrowserEnvironment(),
): PreferenceSnapshot {
  if (environment.matchMedia === undefined && environment.maxTouchPoints === undefined) {
    return DEFAULT_PREFERENCES;
  }

  const primaryPointerCoarse = safelyMatches(environment.matchMedia, '(pointer: coarse)');
  const touchCapable =
    (environment.maxTouchPoints ?? 0) > 0 ||
    safelyMatches(environment.matchMedia, '(any-pointer: coarse)');

  return {
    prefersReducedMotion: safelyMatches(
      environment.matchMedia,
      '(prefers-reduced-motion: reduce)',
    ),
    primaryPointerCoarse,
    anyPointerFine: safelyMatches(environment.matchMedia, '(any-pointer: fine)'),
    hoverCapable: safelyMatches(environment.matchMedia, '(any-hover: hover)'),
    touchCapable,
    keyboardControlsAvailable: true,
  };
}
