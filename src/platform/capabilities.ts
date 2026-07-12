export type CapabilityStatus = 'supported' | 'unsupported';

export interface CapabilitySnapshot {
  readonly status: CapabilityStatus;
  readonly webgl2: boolean;
  readonly reason: string;
}

export type WebGL2Probe = () => boolean;

export type CapabilityDetectionOptions =
  | { readonly result: boolean; readonly probe?: never }
  | { readonly probe: WebGL2Probe; readonly result?: never }
  | { readonly probe?: undefined; readonly result?: undefined };

const SUPPORTED_REASON = 'WebGL2 is available.';
const UNSUPPORTED_REASON = 'WebGL2 is unavailable in this browser.';

function probeWebGL2(): boolean {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return false;
  }

  let context: WebGL2RenderingContext | null = null;

  try {
    const canvas = document.createElement('canvas');
    context = canvas.getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
    });

    return context !== null;
  } catch {
    return false;
  } finally {
    try {
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      // Cleanup is best-effort; capability classification has already completed.
    }
    context = null;
  }
}

export function detectCapabilities(
  options: CapabilityDetectionOptions = {},
): CapabilitySnapshot {
  const webgl2 =
    options.result ?? (options.probe === undefined ? probeWebGL2() : safelyRunProbe(options.probe));

  return webgl2
    ? { status: 'supported', webgl2: true, reason: SUPPORTED_REASON }
    : { status: 'unsupported', webgl2: false, reason: UNSUPPORTED_REASON };
}

function safelyRunProbe(probe: WebGL2Probe): boolean {
  try {
    return probe();
  } catch {
    return false;
  }
}
