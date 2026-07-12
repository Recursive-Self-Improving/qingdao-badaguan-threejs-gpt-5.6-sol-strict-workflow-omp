import { describe, expect, it } from 'vitest';

import { ARCHITECTURE_SITES, DISTRICT_DATA, ROAD_SPECS, ROUTE_ANCHORS } from '../../src/world/districtData';
import type { Bounds2, Vec2 } from '../../src/world/types';

function contains(outer: Bounds2, inner: Bounds2): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX
    && inner.minZ >= outer.minZ && inner.maxZ <= outer.maxZ;
}

function containsPoint(bounds: Bounds2, point: Vec2): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX
    && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}
const READABLE_ROUTE_VIEW_SUBJECT_IDS: Record<string, true> = {
  'villa-west-neoclassical': true,
  'villa-central-spanish': true,
  'villa-central-gothic': true,
  'villa-east-neoclassical': true,
};
const READABLE_ROUTE_VIEW_DISTANCE_BAND_METRES = { min: 14, max: 22 } as const;

function segmentIntersectsBounds(from: Vec2, to: Vec2, bounds: Bounds2): boolean {
  let near = 0;
  let far = 1;
  const clip = (origin: number, delta: number, minimum: number, maximum: number): boolean => {
    if (delta === 0) return origin >= minimum && origin <= maximum;
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    return near <= far;
  };
  return clip(from.x, to.x - from.x, bounds.minX, bounds.maxX)
    && clip(from.z, to.z - from.z, bounds.minZ, bounds.maxZ);
}

function roadPoints(road: (typeof ROAD_SPECS)[number]): readonly Vec2[] {
  return [road.centerline.from, ...road.centerline.via, road.centerline.to];
}

function expectDeeplyFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeeplyFrozen(child);
}

describe('canonical architecture data', () => {
  it('publishes exactly four ordinary villas across three families and three named landmarks', () => {
    expect(ARCHITECTURE_SITES).toBe(DISTRICT_DATA.architectureSites);
    expect(ARCHITECTURE_SITES.map(({ id }) => id)).toEqual([
      'villa-west-neoclassical',
      'villa-central-spanish',
      'villa-central-gothic',
      'villa-east-neoclassical',
      'princess-inspired-landmark',
      'butterfly-inspired-landmark',
      'huashi-inspired-landmark',
    ]);

    const ordinary = ARCHITECTURE_SITES.filter(({ kind }) => kind === 'ordinary');
    const landmarks = ARCHITECTURE_SITES.filter(({ kind }) => kind === 'landmark');
    expect(ordinary).toHaveLength(4);
    expect(landmarks).toHaveLength(3);
    expect(new Set(ordinary.map(({ style }) => style))).toEqual(new Set([
      'german-neoclassical', 'spanish', 'gothic-castle',
    ]));
    expect(ordinary.every(({ stories }) => stories <= 3)).toBe(true);
    expect(landmarks.map(({ inspiration }) => inspiration)).toEqual(['princess', 'butterfly', 'huashi']);
    expect(landmarks.map(({ style }) => style)).toEqual([
      'princess-nordic', 'butterfly-mansard', 'huashi-castle',
    ]);
    expect(ARCHITECTURE_SITES.map(({ id, stories, viewpointId }) => ({ id, stories, viewpointId }))).toEqual([
      { id: 'villa-west-neoclassical', stories: 2, viewpointId: 'zijingguan-return' },
      { id: 'villa-central-spanish', stories: 2, viewpointId: 'mixed-villa-intersection' },
      { id: 'villa-central-gothic', stories: 3, viewpointId: 'mixed-villa-intersection' },
      { id: 'villa-east-neoclassical', stories: 3, viewpointId: 'ginkgo-maple-corridor' },
      { id: 'princess-inspired-landmark', stories: 2, viewpointId: 'princess-inspired-anchor' },
      { id: 'butterfly-inspired-landmark', stories: 3, viewpointId: 'butterfly-inspired-anchor' },
      { id: 'huashi-inspired-landmark', stories: 3, viewpointId: 'shore-huashi-vista' },
    ]);
    expect(ordinary.find(({ style }) => style === 'german-neoclassical')?.materials).toContain('muted-cream-stucco');
    expect(ordinary.find(({ style }) => style === 'spanish')?.materials).toContain('low-red-tile-roof');
    expect(ordinary.find(({ style }) => style === 'gothic-castle')?.materials).toContain('gray-stone');
    expect(landmarks.find(({ inspiration }) => inspiration === 'princess')?.materials).toContain('pine-green-stucco');
    expect(landmarks.find(({ inspiration }) => inspiration === 'butterfly')?.materials).toContain('warm-brick');
    expect(landmarks.find(({ inspiration }) => inspiration === 'huashi')?.materials).toContain('warm-gray-stone');
  });

  it('uses the exact contracted sites and matching conservative collision footprints', () => {
    const expected = {
      'villa-west-neoclassical': { minX: -178, maxX: -160, minZ: -196, maxZ: -189 },
      'villa-central-spanish': { minX: 24, maxX: 44, minZ: -106, maxZ: -99 },
      'villa-central-gothic': { minX: 60, maxX: 82, minZ: -106, maxZ: -99 },
      'villa-east-neoclassical': { minX: 146, maxX: 168, minZ: -196, maxZ: -189 },
      'princess-inspired-landmark': { minX: 20, maxX: 42, minZ: -158, maxZ: -140 },
      'butterfly-inspired-landmark': { minX: -48, maxX: -22, minZ: -202, maxZ: -182 },
      'huashi-inspired-landmark': { minX: 22, maxX: 50, minZ: 20, maxZ: 31 },
    } as const;

    for (const site of ARCHITECTURE_SITES) {
      expect(site.siteBounds).toEqual(expected[site.id]);
      expect(site.collisionBounds).toEqual(site.siteBounds);
      expect(contains(site.siteBounds, site.visibleBounds)).toBe(true);
      const footprint = DISTRICT_DATA.collisionFootprints.find(({ subjectId }) => subjectId === site.id);
      expect(footprint?.bounds).toEqual(site.collisionBounds);
      expect(footprint?.purpose).toBe('architecture');
    }
  });

  it('places every ordinary site and collision AABB inside a parcel setback interior', () => {
    const ordinarySites = ARCHITECTURE_SITES.filter(({ kind }) => kind === 'ordinary');
    expect(ordinarySites).toHaveLength(4);
    for (const site of ordinarySites) {
      const parcel = DISTRICT_DATA.parcels.find(({ bounds, setback }) => contains({
        minX: bounds.minX + setback,
        maxX: bounds.maxX - setback,
        minZ: bounds.minZ + setback,
        maxZ: bounds.maxZ - setback,
      }, site.siteBounds));
      expect(parcel, `${site.id} must stay inside a parcel's authored setback`).toBeDefined();
      expect(contains(site.siteBounds, site.visibleBounds)).toBe(true);
      expect(contains(site.siteBounds, site.collisionBounds)).toBe(true);
    }
  });

  it('keeps sites outside roads, route anchors, sightlines, and the open coast', () => {
    for (const site of ARCHITECTURE_SITES) {
      for (const road of ROAD_SPECS) {
        const padding = road.width * 0.5 + road.sidewalkWidth;
        const expanded = {
          minX: site.siteBounds.minX - padding,
          maxX: site.siteBounds.maxX + padding,
          minZ: site.siteBounds.minZ - padding,
          maxZ: site.siteBounds.maxZ + padding,
        };
        const points = roadPoints(road);
        expect(points.slice(1).some((to, index) => segmentIntersectsBounds(points[index] as Vec2, to, expanded))).toBe(false);
      }
      expect(ROUTE_ANCHORS.some(({ position }) => containsPoint(site.siteBounds, position))).toBe(false);
      expect(DISTRICT_DATA.sightlines.some(({ from, toward }) => segmentIntersectsBounds(from, toward, site.siteBounds))).toBe(false);
      expect(site.siteBounds.maxZ).toBeLessThanOrEqual(DISTRICT_DATA.coast.edgeZ);
      expect(contains(DISTRICT_DATA.coast.seaBounds, site.siteBounds)).toBe(false);
      expect(site.viewpointId).not.toBe(site.id);
      expect(ROUTE_ANCHORS.some(({ id }) => id === site.viewpointId)).toBe(true);
    }
  });

  it('keeps Huashi clear of the promenade, screen, and road-aligned coast openings', () => {
    const huashi = ARCHITECTURE_SITES.find(({ id }) => id === 'huashi-inspired-landmark');
    expect(huashi).toBeDefined();
    if (!huashi) return;
    const promenadeZ = DISTRICT_DATA.coast.promenade.centerline[0]?.z;
    expect(promenadeZ).toBeDefined();
    if (promenadeZ === undefined) return;
    expect(huashi.siteBounds.maxZ).toBeLessThanOrEqual(promenadeZ - DISTRICT_DATA.coast.promenade.width * 0.5);
    expect(huashi.siteBounds.maxZ).toBeLessThan(DISTRICT_DATA.coast.screen.z);
    for (const opening of DISTRICT_DATA.coast.screen.openings) {
      expect(huashi.siteBounds.maxX <= opening.minX || huashi.siteBounds.minX >= opening.maxX).toBe(true);
    }
  });

  it('bounds landmark-only motifs and keeps generic route cues free of landmark geometry', () => {
    const princess = ARCHITECTURE_SITES.find(({ id }) => id === 'princess-inspired-landmark');
    const butterfly = ARCHITECTURE_SITES.find(({ id }) => id === 'butterfly-inspired-landmark');
    const huashi = ARCHITECTURE_SITES.find(({ id }) => id === 'huashi-inspired-landmark');
    expect(princess?.motifs).toEqual([
      { id: 'nordic-danish-pine-green', ownership: 'landmark-specific', sourceBound: true },
      { id: 'crafted-wood-window-cue', ownership: 'landmark-specific', sourceBound: true },
    ]);
    expect(butterfly?.motifs).toEqual([
      { id: 'mansard-roof', ownership: 'landmark-specific', sourceBound: true },
      { id: 'brick-timber-expression', ownership: 'landmark-specific', sourceBound: true },
    ]);
    expect(huashi?.motifs).toEqual([
      { id: 'compact-sculptural-shore-massing', ownership: 'landmark-specific', sourceBound: true },
      { id: 'compact-tower-cue', ownership: 'landmark-specific', sourceBound: false },
    ]);

    for (const site of ARCHITECTURE_SITES) {
      expect(site.motifs.every((motif) => motif.ownership === (site.kind === 'landmark' ? 'landmark-specific' : 'style-family'))).toBe(true);
      if (site.kind === 'ordinary') expect(site.motifs.every(({ sourceBound }) => !sourceBound)).toBe(true);
    }
    expect(ARCHITECTURE_SITES.some(({ viewpointId }) => viewpointId === 'mixed-villa-intersection')).toBe(true);
    expect(ARCHITECTURE_SITES.some(({ viewpointId }) => viewpointId === 'ginkgo-maple-corridor')).toBe(true);
    expect(ARCHITECTURE_SITES.some(({ id }) => id.includes('mixed-villa') || id.includes('ginkgo-maple'))).toBe(false);
  });

  it('records materials, restrained signage, deterministic views, provenance, and deep immutability', () => {
    for (const site of ARCHITECTURE_SITES) {
      expect(site.materials.length).toBeGreaterThanOrEqual(3);
      expect(site.signage).toBe(site.kind === 'landmark' ? 'none' : 'small-gate-plaque');
      expect(site.provenance.sourcedContext.length).toBeGreaterThan(20);
      expect(site.provenance.artisticInterpretation).toMatch(/authored|not a replica/i);
      expect(site.provenance.exactFacade).toBe('authored-inference');
      expect(site.provenance.replica).toBe(false);
      const viewpoint = ROUTE_ANCHORS.find(({ id }) => id === site.viewpointId);
      expect(viewpoint).toBeDefined();
      const center = {
        x: (site.siteBounds.minX + site.siteBounds.maxX) * 0.5,
        z: (site.siteBounds.minZ + site.siteBounds.maxZ) * 0.5,
      };
      const routePosition = { x: site.cameraViews.route.position[0], z: site.cameraViews.route.position[2] };
      expect([site.cameraViews.route.target[0], site.cameraViews.route.target[2]]).toEqual([center.x, center.z]);
      expect(containsPoint(site.siteBounds, routePosition)).toBe(false);
      expect(containsPoint(site.collisionBounds, routePosition)).toBe(false);
      if (READABLE_ROUTE_VIEW_SUBJECT_IDS[site.id]) {
        const distance = Math.hypot(routePosition.x - center.x, routePosition.z - center.z);
        expect(distance).toBeGreaterThanOrEqual(READABLE_ROUTE_VIEW_DISTANCE_BAND_METRES.min);
        expect(distance).toBeLessThanOrEqual(READABLE_ROUTE_VIEW_DISTANCE_BAND_METRES.max);
        expect(routePosition).not.toEqual(viewpoint?.position);
      }
      expect(Object.keys(site.cameraViews).sort()).toEqual(['front', 'low', 'route', 'three-quarter']);
      for (const view of Object.values(site.cameraViews)) {
        expect(view.position).toHaveLength(3);
        expect(view.target).toHaveLength(3);
        expect([...view.position, ...view.target].every(Number.isFinite)).toBe(true);
        expect(view.ySemantics).toBe('site-ground-relative');
        expect(view.position[1]).toBeGreaterThan(0);
        expect(view.target[1]).toBeGreaterThan(0);
      }
    }
    expectDeeplyFrozen(ARCHITECTURE_SITES);
    expectDeeplyFrozen(DISTRICT_DATA.collisionFootprints);
  });
});
