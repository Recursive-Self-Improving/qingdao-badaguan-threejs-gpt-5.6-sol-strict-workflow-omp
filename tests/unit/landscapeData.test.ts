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
    expect(Object.keys(VEGETATION_LOD_POLICIES)).toEqual(['low', 'medium', 'high']);
    const policies = [VEGETATION_LOD_POLICIES.high, VEGETATION_LOD_POLICIES.medium, VEGETATION_LOD_POLICIES.low];
    expect(policies.every(({ identityInstancesPerRoad }) => identityInstancesPerRoad === 1)).toBe(true);
    expect(policies.map(({ infillFraction }) => infillFraction)).toEqual([1, 0.62, 0]);
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

  it('provides exact10 eye-level one-road frames with each identity cue ahead', () => {
    const eyeHeightTolerance = 0.001;
    const corridorTolerance = 0.001;
    const maximumCueAngle = Math.PI / 9;

    expect(LANDSCAPE_CAMERA_VIEWS).toBe(DISTRICT_DATA.landscapeCameraViews);
    expect(LANDSCAPE_CAMERA_VIEWS).toHaveLength(10);
    expect(LANDSCAPE_CAMERA_VIEWS.map(({ roadIds }) => roadIds)).toEqual(ROAD_SPECS.map(({ id }) => [id]));
    expect(new Set(LANDSCAPE_CAMERA_VIEWS.flatMap(({ roadIds }) => roadIds))).toEqual(new Set(Object.keys(expectedMapping)));
    expect(LANDSCAPE_CAMERA_VIEWS.map(({ id, position, target, roadIds, ySemantics, clearanceBounds }) => ({
      id, position, target, roadIds, ySemantics, clearanceBounds,
    }))).toEqual([
      { id: 'shaoguan-peach-road', position: [-195, 6.601323, -267.5], target: [-100, 6.511238, -267.5], roadIds: ['shaoguan'], ySemantics: 'world', clearanceBounds: { minX: -197, maxX: -193, minZ: -269.5, maxZ: -265.5 } },
      { id: 'ningwuguan-crabapple-road', position: [74.826969, 5.709407, -210.386612], target: [159.826969, 5.581, -208.425073], roadIds: ['ningwuguan'], ySemantics: 'world', clearanceBounds: { minX: 72.826969, maxX: 76.826969, minZ: -212.386612, maxZ: -208.386612 } },
      { id: 'zijingguan-cedar-road', position: [-145, 4.900335, -177.5], target: [-50, 4.88297, -177.5], roadIds: ['zijingguan'], ySemantics: 'world', clearanceBounds: { minX: -147, maxX: -143, minZ: -179.5, maxZ: -175.5 } },
      { id: 'zhengyangguan-myrtle-road', position: [-150.214198, 4.196145, -133.925512], target: [-65.214198, 4.243663, -136.354084], roadIds: ['zhengyangguan'], ySemantics: 'world', clearanceBounds: { minX: -152.214198, maxX: -148.214198, minZ: -135.925512, maxZ: -131.925512 } },
      { id: 'jiayuguan-maple-road', position: [-100, 3.363676, -80], target: [-20, 3.262565, -80], roadIds: ['jiayuguan'], ySemantics: 'world', clearanceBounds: { minX: -102, maxX: -98, minZ: -82, maxZ: -78 } },
      { id: 'juyongguan-ginkgo-road', position: [-140, 2.596319, -41], target: [-55, 2.604859, -40.4375], roadIds: ['juyongguan'], ySemantics: 'world', clearanceBounds: { minX: -142, maxX: -138, minZ: -43, maxZ: -39 } },
      { id: 'linhuaiguan-juniper-road', position: [105, 1.716736, 2.5], target: [185, 1.725409, 2.5], roadIds: ['linhuaiguan'], ySemantics: 'world', clearanceBounds: { minX: 103, maxX: 107, minZ: 0.5, maxZ: 4.5 } },
      { id: 'wushengguan-plane-road', position: [-112, 2.309214, -25], target: [-107, 5.486047, -215], roadIds: ['wushengguan'], ySemantics: 'world', clearanceBounds: { minX: -114, maxX: -110, minZ: -27, maxZ: -23 } },
      { id: 'hangu-pass-plane-road', position: [7.5, 6.285604, -250], target: [13, 5.801318, -222], roadIds: ['hangu-pass'], ySemantics: 'world', clearanceBounds: { minX: 5.5, maxX: 9.5, minZ: -252, maxZ: -248 } },
      { id: 'shanhaiguan-plane-road', position: [128, 4.17913, -135], target: [135, 4.691962, -160], roadIds: ['shanhaiguan'], ySemantics: 'world', clearanceBounds: { minX: 126, maxX: 130, minZ: -137, maxZ: -133 } },
    ]);
    expect(new Set(LANDSCAPE_CAMERA_VIEWS.map(({ id }) => id)).size).toBe(10);
    for (const view of LANDSCAPE_CAMERA_VIEWS) {
      const cameraPoint = { x: view.position[0], z: view.position[2] };
      const targetPoint = { x: view.target[0], z: view.target[2] };
      const roadId = view.roadIds[0];
      const road = ROAD_SPECS.find(({ id }) => id === roadId);
      const zone = PLANTING_ZONES.find(({ roadId: zoneRoadId }) => zoneRoadId === roadId);
      expect(view.roadIds).toHaveLength(1);
      expect(road).toBeDefined();
      expect(zone).toBeDefined();
      if (road === undefined || zone === undefined) throw new Error(`Missing road or cue zone for ${view.id}`);
      const roadPoints = [road.centerline.from, ...road.centerline.via, road.centerline.to];
      const corridorRadius = road.width * 0.5 + road.sidewalkWidth + corridorTolerance;
      const cuePoint = { x: (zone.bounds.minX + zone.bounds.maxX) * 0.5, z: (zone.bounds.minZ + zone.bounds.maxZ) * 0.5 };
      const forward = { x: targetPoint.x - cameraPoint.x, z: targetPoint.z - cameraPoint.z };
      const toCue = { x: cuePoint.x - cameraPoint.x, z: cuePoint.z - cameraPoint.z };
      const forwardLength = Math.hypot(forward.x, forward.z);
      const cueDistance = Math.hypot(toCue.x, toCue.z);
      const cueCosine = Math.max(-1, Math.min(1, (forward.x * toCue.x + forward.z * toCue.z) / (forwardLength * cueDistance)));
      const shortBlockView = view.id === 'hangu-pass-plane-road' || view.id === 'shanhaiguan-plane-road';
      const minimumForwardLength = shortBlockView ? 20 : 60;
      const minimumCueDistance = shortBlockView ? 8 : 20;
      const maximumCueDistance = view.id === 'jiayuguan-maple-road' ? 260 : 90;

      expect(view.clearanceIntersections).toBe(0);
      expect(view.ySemantics).toBe('world');
      expect([...view.position, ...view.target].every(Number.isFinite)).toBe(true);
      expect(Math.abs(view.position[1] - sampleGroundHeight(cameraPoint.x, cameraPoint.z) - APP_CONFIG.camera.eyeHeight), `${view.id} camera eye height`).toBeLessThanOrEqual(eyeHeightTolerance);
      expect(Math.abs(view.target[1] - sampleGroundHeight(targetPoint.x, targetPoint.z) - APP_CONFIG.camera.eyeHeight), `${view.id} target eye height`).toBeLessThanOrEqual(eyeHeightTolerance);
      expect(polylineDistance(cameraPoint, roadPoints), `${view.id} camera own road/sidewalk corridor`).toBeLessThanOrEqual(corridorRadius);
      expect(polylineDistance(targetPoint, roadPoints), `${view.id} target road-and-cue corridor`).toBeLessThanOrEqual(Math.max(corridorRadius, zone.minimumRoadClearance + 4));
      expect(forwardLength, `${view.id} forward corridor length`).toBeGreaterThanOrEqual(minimumForwardLength);
      expect(cueDistance, `${view.id} cue distance`).toBeGreaterThanOrEqual(minimumCueDistance);
      expect(cueDistance, `${view.id} cue distance`).toBeLessThanOrEqual(maximumCueDistance);
      expect(Math.acos(cueCosine), `${view.id} identity cue angle`).toBeLessThanOrEqual(maximumCueAngle);
      expect(view.clearanceBounds.maxX - view.clearanceBounds.minX, `${view.id} camera diameter`).toBe(4);
      expect(view.clearanceBounds.maxZ - view.clearanceBounds.minZ, `${view.id} camera diameter`).toBe(4);
      expect((view.clearanceBounds.minX + view.clearanceBounds.maxX) * 0.5, `${view.id} clearance X center`).toBeCloseTo(cameraPoint.x, 6);
      expect((view.clearanceBounds.minZ + view.clearanceBounds.maxZ) * 0.5, `${view.id} clearance Z center`).toBeCloseTo(cameraPoint.z, 6);
      expect(DISTRICT_DATA.architectureSites.some(({ collisionBounds }) => boundsOverlap(view.clearanceBounds, expanded(collisionBounds, 1)))).toBe(false);
      expect(DISTRICT_DATA.plantingZones.some(({ bounds }) => boundsOverlap(view.clearanceBounds, bounds))).toBe(false);
      expect(boundsOverlap(view.clearanceBounds, DISTRICT_DATA.coast.seaBounds)).toBe(false);
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
