import { describe, expect, it } from 'vitest';

import { APP_CONFIG } from '../../src/app/config';
import { sampleGroundHeight } from '../../src/exploration/navigation';

import {
  DISTRICT_DATA,
  LANDSCAPE_CAMERA_VIEWS,
  PLANTING_ZONES,
  ROAD_PLANTING_CUES,
  ROAD_SPECS,
  VEGETATION_LOD_POLICIES,
} from '../../src/world/districtData';
import type { Bounds2, Vec2 } from '../../src/world/types';

const expectedMapping = {
  shaoguan: 'peach',
  ningwuguan: 'crabapple',
  zijingguan: 'cedar',
  zhengyangguan: 'crape-myrtle',
  jiayuguan: 'maple',
  juyongguan: 'ginkgo',
  linhuaiguan: 'chinese-juniper',
  wushengguan: 'plane-tree',
  'hangu-pass': 'plane-tree',
  shanhaiguan: 'plane-tree',
} as const;

function deeplyFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

function corners(bounds: Bounds2): readonly Vec2[] {
  return [
    { x: bounds.minX, z: bounds.minZ }, { x: bounds.minX, z: bounds.maxZ },
    { x: bounds.maxX, z: bounds.minZ }, { x: bounds.maxX, z: bounds.maxZ },
  ];
}

function pointToSegment(point: Vec2, from: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.z - from.z);
  const amount = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared));
  return Math.hypot(point.x - from.x - dx * amount, point.z - from.z - dz * amount);
}

function polylineDistance(point: Vec2, points: readonly Vec2[]): number {
  return Math.min(...points.slice(1).map((to, index) => pointToSegment(point, points[index] as Vec2, to)));
}

function nearestPolylineFrame(point: Vec2, points: readonly Vec2[]): { readonly nearest: Vec2; readonly tangent: Vec2 } {
  let bestDistance = Number.POSITIVE_INFINITY;
  let best = { nearest: points[0] as Vec2, tangent: { x: 0, z: 0 } };
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1] as Vec2;
    const to = points[index] as Vec2;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lengthSquared = dx * dx + dz * dz;
    const amount = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared));
    const nearest = { x: from.x + dx * amount, z: from.z + dz * amount };
    const candidateDistance = Math.hypot(point.x - nearest.x, point.z - nearest.z);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      best = { nearest, tangent: { x: dx, z: dz } };
    }
  }
  return best;
}

function segmentIntersectsBounds(from: Vec2, to: Vec2, bounds: Bounds2): boolean {
  let near = 0;
  let far = 1;
  for (const [origin, delta, minimum, maximum] of [
    [from.x, to.x - from.x, bounds.minX, bounds.maxX],
    [from.z, to.z - from.z, bounds.minZ, bounds.maxZ],
  ] as const) {
    if (delta === 0) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return false;
  }
  return true;
}

function boundsToPolylineDistance(bounds: Bounds2, points: readonly Vec2[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1] as Vec2;
    const to = points[index] as Vec2;
    if (segmentIntersectsBounds(from, to, bounds)) return 0;
    minimum = Math.min(minimum, ...corners(bounds).map((point) => pointToSegment(point, from, to)));
    for (const endpoint of [from, to]) {
      const dx = Math.max(bounds.minX - endpoint.x, 0, endpoint.x - bounds.maxX);
      const dz = Math.max(bounds.minZ - endpoint.z, 0, endpoint.z - bounds.maxZ);
      minimum = Math.min(minimum, Math.hypot(dx, dz));
    }
  }
  return minimum;
}

function boundsOverlap(left: Bounds2, right: Bounds2): boolean {
  return left.minX < right.maxX && left.maxX > right.minX && left.minZ < right.maxZ && left.maxZ > right.minZ;
}

function expanded(bounds: Bounds2, amount: number): Bounds2 {
  return { minX: bounds.minX - amount, maxX: bounds.maxX + amount, minZ: bounds.minZ - amount, maxZ: bounds.maxZ + amount };
}

describe('canonical landscape data', () => {
  it('maps every road exactly once to its representative species and visual class', () => {
    expect(ROAD_PLANTING_CUES).toBe(DISTRICT_DATA.roadPlantingCues);
    expect(ROAD_PLANTING_CUES).toHaveLength(10);
    expect(Object.fromEntries(ROAD_PLANTING_CUES.map(({ roadId, species }) => [roadId, species]))).toEqual(expectedMapping);
    expect(new Set(ROAD_PLANTING_CUES.map(({ roadId }) => roadId)).size).toBe(10);
    expect(ROAD_PLANTING_CUES.every(({ identityPriority }) => identityPriority === 0)).toBe(true);
    expect(ROAD_PLANTING_CUES.every(({ provenance }) => provenance.status === 'authored-inference' && provenance.basis.includes('not a claim'))).toBe(true);

    expect(ROAD_PLANTING_CUES.filter(({ category }) => category === 'evergreen-conifer').map(({ species }) => species)).toEqual(['cedar', 'chinese-juniper']);
    expect(ROAD_PLANTING_CUES.filter(({ category }) => category === 'autumn-deciduous').map(({ species }) => species)).toEqual(['maple', 'ginkgo']);
    expect(ROAD_PLANTING_CUES.filter(({ category }) => category === 'deciduous-canopy').map(({ species }) => species)).toEqual(['plane-tree', 'plane-tree', 'plane-tree']);
    expect(ROAD_PLANTING_CUES.filter(({ species }) => ['maple', 'ginkgo'].includes(species)).every(({ palette }) => palette.litter !== null)).toBe(true);
    expect(ROAD_PLANTING_CUES.filter(({ category }) => category === 'evergreen-conifer').every(({ palette }) => palette.litter === null)).toBe(true);
  });

  it('publishes ordered explicit density and LOD policies that preserve one identity per road', () => {
    expect(deeplyFrozen(VEGETATION_LOD_POLICIES)).toBe(true);
    expect(Object.keys(VEGETATION_LOD_POLICIES)).toEqual(['high', 'medium', 'low']);
    const policies = [VEGETATION_LOD_POLICIES.high, VEGETATION_LOD_POLICIES.medium, VEGETATION_LOD_POLICIES.low];
    expect(policies.every(({ identityInstancesPerRoad }) => identityInstancesPerRoad === 1)).toBe(true);
    expect(policies.map(({ infillFraction }) => infillFraction)).toEqual([1, 0.62, 0.28]);
    expect(policies.map(({ accentFraction }) => accentFraction)).toEqual([1, 0.5, 0]);
    for (const policy of policies) {
      expect(policy.bands.map(({ id }) => id)).toEqual(['near', 'mid', 'far']);
      expect(policy.bands.map(({ maximumDistance }) => maximumDistance)).toEqual([...policy.bands.map(({ maximumDistance }) => maximumDistance)].sort((a, b) => a - b));
      expect(policy.bands.every(({ canopySegments }) => canopySegments > 0)).toBe(true);
    }
  });

  it('keeps identity planting zones in bounded verges and outside protected geometry', () => {
    expect(PLANTING_ZONES).toBe(DISTRICT_DATA.plantingZones);
    expect(PLANTING_ZONES).toHaveLength(10);
    expect(new Set(PLANTING_ZONES.map(({ id }) => id)).size).toBe(10);
    expect(new Set(PLANTING_ZONES.map(({ roadId }) => roadId))).toEqual(new Set(Object.keys(expectedMapping)));
    expect(PLANTING_ZONES.map(({ id, roadId, side, bounds, minimumRoadClearance, identity }) => ({
      id, roadId, side, bounds, minimumRoadClearance, identity,
    }))).toEqual([
      { id: 'shaoguan-peach-north', roadId: 'shaoguan', side: 'north', bounds: { minX: -180, maxX: -150, minZ: -274, maxZ: -272 }, minimumRoadClearance: 12, identity: true },
      { id: 'ningwuguan-crabapple-south', roadId: 'ningwuguan', side: 'south', bounds: { minX: 92, maxX: 104, minZ: -203, maxZ: -201 }, minimumRoadClearance: 12, identity: true },
      { id: 'zijingguan-cedar-north', roadId: 'zijingguan', side: 'north', bounds: { minX: -100, maxX: -80, minZ: -184, maxZ: -182 }, minimumRoadClearance: 12, identity: true },
      { id: 'zhengyangguan-myrtle-north', roadId: 'zhengyangguan', side: 'north', bounds: { minX: -100, maxX: -80, minZ: -143, maxZ: -141 }, minimumRoadClearance: 12, identity: true },
      { id: 'jiayuguan-maple-north', roadId: 'jiayuguan', side: 'north', bounds: { minX: 140, maxX: 160, minZ: -94, maxZ: -92 }, minimumRoadClearance: 12, identity: true },
      { id: 'juyongguan-ginkgo-north', roadId: 'juyongguan', side: 'north', bounds: { minX: -100, maxX: -80, minZ: -49, maxZ: -47 }, minimumRoadClearance: 12, identity: true },
      { id: 'linhuaiguan-juniper-north', roadId: 'linhuaiguan', side: 'north', bounds: { minX: 140, maxX: 160, minZ: -4, maxZ: -2 }, minimumRoadClearance: 12, identity: true },
      { id: 'wushengguan-plane-east', roadId: 'wushengguan', side: 'east', bounds: { minX: -106, maxX: -104, minZ: -110, maxZ: -100 }, minimumRoadClearance: 12, identity: true },
      { id: 'hangu-plane-east', roadId: 'hangu-pass', side: 'east', bounds: { minX: 12, maxX: 14, minZ: -245, maxZ: -235 }, minimumRoadClearance: 12, identity: true },
      { id: 'shanhaiguan-plane-east', roadId: 'shanhaiguan', side: 'east', bounds: { minX: 134, maxX: 136, minZ: -150, maxZ: -140 }, minimumRoadClearance: 12, identity: true },
    ]);

    for (const zone of PLANTING_ZONES) {
      expect(zone.identity).toBe(true);
      expect(zone.minimumRoadClearance).toBe(12);
      expect(zone.inference.status).toBe('authored-inference');
      expect(corners(zone.bounds).every(({ x, z }) => x >= DISTRICT_DATA.navigableBounds.minX && x <= DISTRICT_DATA.navigableBounds.maxX && z >= DISTRICT_DATA.navigableBounds.minZ && z <= DISTRICT_DATA.navigableBounds.maxZ)).toBe(true);
      const road = ROAD_SPECS.find(({ id }) => id === zone.roadId);
      expect(road).toBeDefined();
      if (road) {
        const center = { x: (zone.bounds.minX + zone.bounds.maxX) * 0.5, z: (zone.bounds.minZ + zone.bounds.maxZ) * 0.5 };
        const points = [road.centerline.from, ...road.centerline.via, road.centerline.to];
        const frame = nearestPolylineFrame(center, points);
        const offset = { x: center.x - frame.nearest.x, z: center.z - frame.nearest.z };
        const direction = zone.side === 'north' ? { x: 0, z: -1 }
          : zone.side === 'south' ? { x: 0, z: 1 }
            : zone.side === 'west' ? { x: -1, z: 0 } : { x: 1, z: 0 };
        expect(offset.x * direction.x + offset.z * direction.z, `${zone.id} side against nearest local road segment`).toBeGreaterThan(0);
        expect(Math.hypot(frame.tangent.x, frame.tangent.z)).toBeGreaterThan(0);
      }
      for (const road of ROAD_SPECS) {
        const points = [road.centerline.from, ...road.centerline.via, road.centerline.to];
        const required = road.id === zone.roadId ? zone.minimumRoadClearance : road.width * 0.5 + road.sidewalkWidth;
        expect(Math.min(...corners(zone.bounds).map((point) => polylineDistance(point, points))), `${zone.id} clearance from ${road.id}`).toBeGreaterThanOrEqual(required);
      }
      expect(DISTRICT_DATA.architectureSites.some(({ collisionBounds }) => boundsOverlap(zone.bounds, expanded(collisionBounds, 1)))).toBe(false);
      expect(DISTRICT_DATA.parcels.some(({ bounds }) => boundsOverlap(zone.bounds, bounds))).toBe(false);
      expect(boundsOverlap(zone.bounds, DISTRICT_DATA.publicGreen.bounds)).toBe(false);
      expect(zone.bounds.maxZ).toBeLessThan(DISTRICT_DATA.coast.promenade.centerline[0]!.z - DISTRICT_DATA.coast.promenade.width * 0.5);
      for (const anchor of DISTRICT_DATA.routeAnchors) expect(corners(zone.bounds).every((point) => Math.hypot(point.x - anchor.position.x, point.z - anchor.position.z) >= 6)).toBe(true);
      for (const sightline of DISTRICT_DATA.sightlines) expect(corners(zone.bounds).every((point) => pointToSegment(point, sightline.from, sightline.toward) >= 4)).toBe(true);
      for (const path of DISTRICT_DATA.publicGreen.paths) expect(corners(zone.bounds).every((point) => polylineDistance(point, path.centerline) >= path.width * 0.5 + 1)).toBe(true);
    }
  });

  it('provides seven safe representative frames whose road union is exactly ten', () => {
    expect(LANDSCAPE_CAMERA_VIEWS).toBe(DISTRICT_DATA.landscapeCameraViews);
    expect(LANDSCAPE_CAMERA_VIEWS).toHaveLength(7);
    expect(new Set(LANDSCAPE_CAMERA_VIEWS.flatMap(({ roadIds }) => roadIds))).toEqual(new Set(Object.keys(expectedMapping)));
    expect(LANDSCAPE_CAMERA_VIEWS.map(({ id, position, target, roadIds, ySemantics, clearanceBounds }) => ({
      id, position, target, roadIds, ySemantics, clearanceBounds,
    }))).toEqual([
      { id: 'southern-flowering-roads', position: [-34, 12, -286], target: [-26, 4, -230], roadIds: ['shaoguan', 'ningwuguan'], ySemantics: 'world', clearanceBounds: { minX: -36, maxX: -32, minZ: -288, maxZ: -284 } },
      { id: 'cedar-myrtle-roads', position: [-68, 11, -150], target: [-110, 4, -164], roadIds: ['zijingguan', 'zhengyangguan'], ySemantics: 'world', clearanceBounds: { minX: -70, maxX: -66, minZ: -152, maxZ: -148 } },
      { id: 'autumn-maple-road', position: [104, 10, -105], target: [150, 4, -80], roadIds: ['jiayuguan'], ySemantics: 'world', clearanceBounds: { minX: 102, maxX: 106, minZ: -107, maxZ: -103 } },
      { id: 'autumn-ginkgo-road', position: [-72, 10, -92], target: [-72, 4, -35], roadIds: ['juyongguan'], ySemantics: 'world', clearanceBounds: { minX: -74, maxX: -70, minZ: -94, maxZ: -90 } },
      { id: 'shore-juniper-road', position: [170, 9, -18], target: [150, 4, 10], roadIds: ['linhuaiguan'], ySemantics: 'world', clearanceBounds: { minX: 168, maxX: 172, minZ: -20, maxZ: -16 } },
      { id: 'western-plane-road', position: [-50, 11, -155], target: [-120, 4, -154], roadIds: ['wushengguan'], ySemantics: 'world', clearanceBounds: { minX: -52, maxX: -48, minZ: -157, maxZ: -153 } },
      { id: 'central-eastern-plane-roads', position: [-30, 12, -238], target: [65, 4, -190], roadIds: ['hangu-pass', 'shanhaiguan'], ySemantics: 'world', clearanceBounds: { minX: -32, maxX: -28, minZ: -240, maxZ: -236 } },
    ]);
    expect(new Set(LANDSCAPE_CAMERA_VIEWS.map(({ id }) => id)).size).toBe(7);
    for (const view of LANDSCAPE_CAMERA_VIEWS) {
      expect(view.clearanceIntersections).toBe(0);
      expect(view.ySemantics).toBe('world');
      expect([...view.position, ...view.target].every(Number.isFinite)).toBe(true);
      expect(view.position[1]).toBeGreaterThan(0);
      expect(view.position[1] - sampleGroundHeight(view.position[0], view.position[2]), `${view.id} camera height above terrain`).toBeGreaterThanOrEqual(APP_CONFIG.camera.eyeHeight);
      expect(view.roadIds.length).toBeGreaterThan(0);
      expect(view.roadIds.every((roadId) => roadId in expectedMapping)).toBe(true);
      expect(view.clearanceBounds.maxX - view.clearanceBounds.minX, `${view.id} camera diameter`).toBeGreaterThanOrEqual(4);
      expect(view.clearanceBounds.maxZ - view.clearanceBounds.minZ, `${view.id} camera diameter`).toBeGreaterThanOrEqual(4);
      expect(DISTRICT_DATA.architectureSites.some(({ collisionBounds }) => boundsOverlap(view.clearanceBounds, expanded(collisionBounds, 1)))).toBe(false);
      expect(DISTRICT_DATA.plantingZones.some(({ bounds }) => boundsOverlap(view.clearanceBounds, bounds))).toBe(false);
      expect(boundsOverlap(view.clearanceBounds, DISTRICT_DATA.coast.seaBounds)).toBe(false);
      for (const road of ROAD_SPECS) {
        const points = [road.centerline.from, ...road.centerline.via, road.centerline.to];
        expect(boundsToPolylineDistance(view.clearanceBounds, points), `${view.id} road corridor ${road.id}`).toBeGreaterThanOrEqual(road.width * 0.5 + road.sidewalkWidth);
      }
      for (const parcel of DISTRICT_DATA.parcels) {
        expect(boundsOverlap(view.clearanceBounds, parcel.bounds), `${view.id} parcel apron ${parcel.id}`).toBe(false);
        for (const wall of parcel.wallSegments) expect(boundsToPolylineDistance(view.clearanceBounds, [wall.from, wall.to]), `${view.id} wall ${parcel.id}`).toBeGreaterThanOrEqual(1);
        for (const gate of parcel.gates) expect(corners(view.clearanceBounds).every((point) => Math.hypot(point.x - gate.position.x, point.z - gate.position.z) >= gate.width * 0.5 + 1), `${view.id} gate ${gate.id}`).toBe(true);
      }
      expect(boundsOverlap(view.clearanceBounds, DISTRICT_DATA.publicGreen.bounds), `${view.id} public-green apron`).toBe(false);
      for (const path of DISTRICT_DATA.publicGreen.paths) expect(boundsToPolylineDistance(view.clearanceBounds, path.centerline), `${view.id} path ${path.id}`).toBeGreaterThanOrEqual(path.width * 0.5 + 1);
      for (const sightline of DISTRICT_DATA.sightlines) expect(boundsToPolylineDistance(view.clearanceBounds, [sightline.from, sightline.toward]), `${view.id} sightline ${sightline.id}`).toBeGreaterThanOrEqual(4);
      for (const anchor of DISTRICT_DATA.routeAnchors) expect(corners(view.clearanceBounds).every((point) => Math.hypot(point.x - anchor.position.x, point.z - anchor.position.z) >= 6), `${view.id} anchor ${anchor.id}`).toBe(true);
      const promenade = DISTRICT_DATA.coast.promenade;
      expect(boundsToPolylineDistance(view.clearanceBounds, promenade.centerline), `${view.id} promenade`).toBeGreaterThanOrEqual(promenade.width * 0.5 + 1);
      expect(view.clearanceBounds.maxZ).toBeLessThan(DISTRICT_DATA.coast.screen.z - 1);
      for (const opening of DISTRICT_DATA.coast.screen.openings) {
        const openingBounds = { minX: opening.minX, maxX: opening.maxX, minZ: DISTRICT_DATA.coast.screen.z - 1, maxZ: DISTRICT_DATA.coast.screen.z + 1 };
        expect(boundsOverlap(view.clearanceBounds, openingBounds), `${view.id} coast opening ${opening.id}`).toBe(false);
      }
    }
    expect([ROAD_PLANTING_CUES, PLANTING_ZONES, LANDSCAPE_CAMERA_VIEWS].every(deeplyFrozen)).toBe(true);
  });
});
