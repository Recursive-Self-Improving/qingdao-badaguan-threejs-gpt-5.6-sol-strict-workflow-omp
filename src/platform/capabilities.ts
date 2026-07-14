export type CapabilityStatus = 'supported' | 'unsupported';

export interface CapabilitySnapshot {
  readonly status: CapabilityStatus;
  readonly webgl2: boolean;
  readonly reason: string;
}


export interface GraphicsCapabilityFacts {
  readonly backend: 'webgl2';
  readonly renderer: string | null;
  readonly vendor: string | null;
  readonly acceleration: 'hardware' | 'software' | 'unknown';
  readonly maxTextureSize: number | null;
  readonly maxAnisotropy: number | null;
  readonly deviceMemoryGiB: number | null;
  readonly hardwareConcurrency: number | null;
}

const SOFTWARE_RENDERER = /SwiftShader|llvmpipe|Software|Mesa OffScreen/i;

export function detectGraphicsCapabilityFacts(): GraphicsCapabilityFacts {
  const deviceMemory = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const hardwareConcurrency = typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency;
  const fallback = (renderer: string | null = null, vendor: string | null = null): GraphicsCapabilityFacts => Object.freeze({
    backend: 'webgl2', renderer, vendor,
    acceleration: renderer === null ? 'unknown' : SOFTWARE_RENDERER.test(renderer) ? 'software' : 'hardware',
    maxTextureSize: null, maxAnisotropy: null,
    deviceMemoryGiB: Number.isFinite(deviceMemory) ? deviceMemory! : null,
    hardwareConcurrency: typeof hardwareConcurrency === 'number' && Number.isFinite(hardwareConcurrency) ? hardwareConcurrency : null,
  });
  if (typeof document === 'undefined') return fallback();
  let context: WebGL2RenderingContext | null = null;
  try {
    context = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (context === null) return fallback();
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug === null ? null : String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL));
    const vendor = debug === null ? null : String(context.getParameter(debug.UNMASKED_VENDOR_WEBGL));
    const anisotropy = context.getExtension('EXT_texture_filter_anisotropic');
    return Object.freeze({
      backend: 'webgl2', renderer, vendor,
      acceleration: renderer === null ? 'unknown' : SOFTWARE_RENDERER.test(renderer) ? 'software' : 'hardware',
      maxTextureSize: Number(context.getParameter(context.MAX_TEXTURE_SIZE)),
      maxAnisotropy: anisotropy === null ? 1 : Number(context.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)),
      deviceMemoryGiB: Number.isFinite(deviceMemory) ? deviceMemory! : null,
      hardwareConcurrency: typeof hardwareConcurrency === 'number' && Number.isFinite(hardwareConcurrency) ? hardwareConcurrency : null,
    });
  } catch { return fallback(); }
  finally { try { context?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* best effort */ } }
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
