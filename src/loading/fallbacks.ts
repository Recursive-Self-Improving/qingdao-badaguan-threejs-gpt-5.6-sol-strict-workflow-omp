import type { LoadFailure } from './AssetCoordinator';
import { compiledRouteGuideFallback, type RouteGuide } from './routeGuide';

export interface DegradationFailure {
  readonly assetId: string;
  readonly message: string;
  readonly status: 'failed' | 'retrying';
  readonly classification: LoadFailure['kind'];
}

export function optionalFallback(failure: LoadFailure): DegradationFailure {
  const message = failure.kind === 'timeout'
    ? 'Route notes took too long to load. The 3D walk and controls remain available.'
    : failure.kind === 'malformed'
      ? 'Route notes could not be read. The 3D walk and controls remain available.'
      : 'Route notes are unavailable. The 3D walk and controls remain available.';
  return Object.freeze({ assetId: failure.assetId, message, status: 'failed', classification: failure.kind });
}

export function requiredFailureMessage(failure: LoadFailure): string {
  switch (failure.kind) {
    case 'timeout': return 'A required part of the 3D view took too long to load.';
    case 'network': return 'A required part of the 3D view could not be loaded.';
    case 'malformed': return 'A required part of the 3D view could not be read.';
    default: return 'The interactive landscape could not be prepared.';
  }
}

export function neutralRouteGuideFallback(): RouteGuide {
  return compiledRouteGuideFallback();
}
