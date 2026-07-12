import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CAMERA_RADIUS,
  resolveNavigation,
  sampleGroundHeight,
} from '../../src/exploration/navigation';
import { DISTRICT_DATA } from '../../src/world/districtData';

function expectSafe(position: { readonly x: number; readonly z: number }, radius = DEFAULT_CAMERA_RADIUS): void {
  const bounds = DISTRICT_DATA.navigableBounds;
  expect(position.x).toBeGreaterThanOrEqual(bounds.minX + radius);
  expect(position.x).toBeLessThanOrEqual(bounds.maxX - radius);
  expect(position.z).toBeGreaterThanOrEqual(bounds.minZ + radius);
  expect(position.z).toBeLessThanOrEqual(bounds.maxZ - radius);
  for (const footprint of DISTRICT_DATA.collisionFootprints) {
    const outside = position.x <= footprint.bounds.minX - radius
      || position.x >= footprint.bounds.maxX + radius
      || position.z <= footprint.bounds.minZ - radius
      || position.z >= footprint.bounds.maxZ + radius;
    expect(outside).toBe(true);
  }
}

describe('sampleGroundHeight', () => {
  it('is deterministic and exactly zero at the authored spawn', () => {
    const { x, z } = DISTRICT_DATA.spawn;
    const first = sampleGroundHeight(x, z);

    expect(first).toBe(0);
    expect(sampleGroundHeight(x, z)).toBe(first);
    expect(sampleGroundHeight(73.25, -142.5)).toBe(sampleGroundHeight(73.25, -142.5));
  });

  it('has a clear north-high and south-low grade at road intersections', () => {
    const northern = sampleGroundHeight(0, -260);
    const middle = sampleGroundHeight(0, -125);
    const southern = sampleGroundHeight(0, 10);

    expect(northern).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(southern);
    expect(northern - southern).toBeGreaterThan(4);

    for (const x of [-120, 0, 120]) {
      expect(sampleGroundHeight(x, -215)).toBeGreaterThan(sampleGroundHeight(x, -35));
    }
  });

  it('keeps cross-slope undulation restrained relative to the district grade', () => {
    const heights = [-200, -100, 0, 100, 200].map((x) => sampleGroundHeight(x, -125));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.35);
  });
});

describe('resolveNavigation', () => {
  it.each([
    ['west', { x: -999, z: 0 }, { x: DISTRICT_DATA.navigableBounds.minX + 2, z: 0 }],
    ['east', { x: 999, z: 0 }, { x: DISTRICT_DATA.navigableBounds.maxX - 2, z: 0 }],
    ['north', { x: 0, z: -999 }, { x: 0, z: DISTRICT_DATA.navigableBounds.minZ + 2 }],
    ['south', { x: 0, z: 999 }, { x: 0, z: DISTRICT_DATA.navigableBounds.maxZ - 2 }],
  ] as const)('radius-clamps a push through the %s edge', (_edge, requested, previous) => {
    const result = resolveNavigation(previous, requested);

    expect(result.clamped).toBe(true);
    expectSafe(result.position);
  });

  it('slides along a clear axis when a diagonal request enters a soft footprint', () => {
    const footprint = DISTRICT_DATA.collisionFootprints[0];
    expect(footprint).toBeDefined();
    const bounds = footprint!.bounds;
    const previous = { x: bounds.minX - 5, z: bounds.minZ - 5 };
    const requested = { x: bounds.minX + 1, z: bounds.minZ + 1 };
    const result = resolveNavigation(previous, requested, { radius: 1 });

    expect(result.collided).toBe(true);
    expect(result.position).not.toEqual(requested);
    expect(result.position.x === previous.x || result.position.z === previous.z).toBe(true);
    expectSafe(result.position, 1);
  });

  it('rejects forward penetration when no lateral movement was requested', () => {
    const footprint = DISTRICT_DATA.collisionFootprints[0];
    expect(footprint).toBeDefined();
    const bounds = footprint!.bounds;
    const z = (bounds.minZ + bounds.maxZ) / 2;
    const previous = { x: bounds.minX - 2, z };
    const requested = { x: bounds.minX + 2, z };
    const result = resolveNavigation(previous, requested, { radius: 0.5 });

    expect(result.collided).toBe(true);
    expect(result.position).toEqual(previous);
    expectSafe(result.position, 0.5);
  });

  it('does not tunnel through a footprint when the requested endpoint is beyond it', () => {
    const footprint = DISTRICT_DATA.collisionFootprints[0];
    expect(footprint).toBeDefined();
    const bounds = footprint!.bounds;
    const z = (bounds.minZ + bounds.maxZ) / 2;
    const previous = { x: bounds.minX - 3, z };
    const requested = { x: bounds.maxX + 3, z };
    const result = resolveNavigation(previous, requested, { radius: 0.5 });

    expect(result.collided).toBe(true);
    expect(result.position).toEqual(previous);
  });

  it('returns sampled ground height and a safe authored reset for invalid coordinates', () => {
    const ordinary = resolveNavigation(DISTRICT_DATA.spawn, { x: 12, z: -40 });
    expect(ordinary.groundHeight).toBe(sampleGroundHeight(12, -40));

    const reset = resolveNavigation(DISTRICT_DATA.spawn, { x: Number.NaN, z: 0 });
    expect(reset.reset).toBe(true);
    expect(reset.position).toEqual(DISTRICT_DATA.reset);
    expect(reset.groundHeight).toBe(sampleGroundHeight(DISTRICT_DATA.reset.x, DISTRICT_DATA.reset.z));
    expectSafe(reset.position);
    expectSafe(DISTRICT_DATA.spawn);
  });

  it('keeps the noncollidable sea outside navigation without treating the coast as collision', () => {
    expect(DISTRICT_DATA.coast.collidable).toBe(false);
    const result = resolveNavigation(
      { x: 0, z: DISTRICT_DATA.coast.edgeZ - 2 },
      { x: 0, z: DISTRICT_DATA.coast.seaBounds.maxZ },
    );

    expect(result.clamped).toBe(true);
    expect(result.collided).toBe(false);
    expect(result.position.z).toBe(DISTRICT_DATA.navigableBounds.maxZ - DEFAULT_CAMERA_RADIUS);
  });

  it('rejects invalid radii deterministically', () => {
    expect(() => resolveNavigation(DISTRICT_DATA.spawn, DISTRICT_DATA.spawn, { radius: -1 })).toThrow(RangeError);
    expect(() => resolveNavigation(DISTRICT_DATA.spawn, DISTRICT_DATA.spawn, { radius: Number.NaN })).toThrow(RangeError);
    expect(() => resolveNavigation(DISTRICT_DATA.spawn, DISTRICT_DATA.spawn, { radius: 150 })).toThrow(RangeError);
  });
});
