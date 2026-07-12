import { DISTRICT_DATA } from '../world/districtData';
import type { Bounds2, NavigationOptions, NavigationResult, Vec2 } from '../world/types';

export const DEFAULT_CAMERA_RADIUS = 0.35;


/** Deterministic authored terrain grade in metres. +Z runs south, so north is higher. */
export function sampleGroundHeight(x: number, z: number): number {
  const grade = -0.018 * (z - DISTRICT_DATA.spawn.z);
  const undulation = 0.16 * Math.sin(x / 58) * Math.sin((z - DISTRICT_DATA.spawn.z) / 47);
  return grade + undulation;
}

function clampToBounds(point: Vec2, bounds: Bounds2, radius: number): Vec2 {
  return {
    x: Math.min(bounds.maxX - radius, Math.max(bounds.minX + radius, point.x)),
    z: Math.min(bounds.maxZ - radius, Math.max(bounds.minZ + radius, point.z)),
  };
}

function intersectsSoftCollision(point: Vec2, radius: number): boolean {
  return DISTRICT_DATA.collisionFootprints.some(({ bounds }) =>
    point.x > bounds.minX - radius
    && point.x < bounds.maxX + radius
    && point.z > bounds.minZ - radius
    && point.z < bounds.maxZ + radius,
  );
}

function movementIntersectsSoftCollision(from: Vec2, to: Vec2, radius: number): boolean {
  return DISTRICT_DATA.collisionFootprints.some(({ bounds }) => {
    const deltaX = to.x - from.x;
    const deltaZ = to.z - from.z;
    let entry = 0;
    let exit = 1;
    const minX = bounds.minX - radius;
    const maxX = bounds.maxX + radius;
    if (deltaX === 0) {
      if (from.x <= minX || from.x >= maxX) return false;
    } else {
      const first = (minX - from.x) / deltaX;
      const second = (maxX - from.x) / deltaX;
      entry = Math.max(entry, Math.min(first, second));
      exit = Math.min(exit, Math.max(first, second));
      if (entry >= exit) return false;
    }

    const minZ = bounds.minZ - radius;
    const maxZ = bounds.maxZ + radius;
    if (deltaZ === 0) {
      if (from.z <= minZ || from.z >= maxZ) return false;
    } else {
      const first = (minZ - from.z) / deltaZ;
      const second = (maxZ - from.z) / deltaZ;
      entry = Math.max(entry, Math.min(first, second));
      exit = Math.min(exit, Math.max(first, second));
      if (entry >= exit) return false;
    }
    return entry < 1 && exit > 0;
  });
}

function resolvedResult(
  position: Vec2,
  collided: boolean,
  clamped: boolean,
  reset: boolean,
): NavigationResult {
  return {
    position,
    groundHeight: sampleGroundHeight(position.x, position.z),
    collided,
    clamped,
    reset,
  };
}

/**
 * Resolves a requested camera-ground position against radius-aware district bounds and
 * soft authored footprints. A diagonal collision slides on a clear axis; otherwise the
 * previous safe position is retained. Invalid inputs return the authored safe reset.
 */
export function resolveNavigation(
  previous: Vec2,
  requested: Vec2,
  options: NavigationOptions = {},
): NavigationResult {
  const radius = options.radius ?? DEFAULT_CAMERA_RADIUS;
  if (!Number.isFinite(radius) || radius < 0) {
    throw new RangeError('Navigation radius must be a finite non-negative number.');
  }

  const bounds = DISTRICT_DATA.navigableBounds;
  if (radius * 2 > bounds.maxX - bounds.minX || radius * 2 > bounds.maxZ - bounds.minZ) {
    throw new RangeError('Navigation radius does not fit inside the navigable bounds.');
  }

  const safeReset = clampToBounds(DISTRICT_DATA.reset, bounds, radius);
  if (intersectsSoftCollision(safeReset, radius)) {
    throw new RangeError('Navigation radius leaves no safe authored reset position.');
  }
  if (!Number.isFinite(previous.x) || !Number.isFinite(previous.z)
    || !Number.isFinite(requested.x) || !Number.isFinite(requested.z)) {
    return resolvedResult(safeReset, false, false, true);
  }

  const safePreviousCandidate = clampToBounds(previous, bounds, radius);
  const safePrevious = intersectsSoftCollision(safePreviousCandidate, radius)
    ? safeReset
    : safePreviousCandidate;
  const boundedRequested = clampToBounds(requested, bounds, radius);
  const wasClamped = requested.x !== boundedRequested.x || requested.z !== boundedRequested.z;

  if (!movementIntersectsSoftCollision(safePrevious, boundedRequested, radius)) {
    return resolvedResult(boundedRequested, false, wasClamped, false);
  }

  const xSlide = { x: boundedRequested.x, z: safePrevious.z };
  const zSlide = { x: safePrevious.x, z: boundedRequested.z };
  const xClear = !movementIntersectsSoftCollision(safePrevious, xSlide, radius);
  const zClear = !movementIntersectsSoftCollision(safePrevious, zSlide, radius);

  if (xClear || zClear) {
    const xProgress = Math.abs(xSlide.x - safePrevious.x);
    const zProgress = Math.abs(zSlide.z - safePrevious.z);
    const position = xClear && (!zClear || xProgress >= zProgress) ? xSlide : zSlide;
    return resolvedResult(position, true, wasClamped, false);
  }

  return resolvedResult(safePrevious, true, wasClamped, false);
}
