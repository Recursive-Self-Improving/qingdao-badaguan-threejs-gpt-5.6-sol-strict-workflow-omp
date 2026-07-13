import { describe, expect, it } from 'vitest';

import {
  DISTRICT_DATA,
  LANDSCAPE_CAMERA_VIEWS,
  PLANTING_ZONES,
  ROAD_PLANTING_CUES,
  ROAD_SPECS,
  ROUTE_ANCHORS,
} from '../../src/world/districtData';
import type { Bounds2, Vec2 } from '../../src/world/types';

const expectedEastWestNames = [
  'Shaoguan Road',
  'Ningwuguan Road',
  'Zijingguan Road',
  'Zhengyangguan Road',
  'Jiayuguan Road',
  'Juyongguan Road',
  'Linhuaiguan Road',
] as const;

const expectedNorthSouthNames = [
  'Wushengguan Road',
  'Hangu Pass Road',
  'Shanhaiguan Road',
] as const;

function contains(bounds: Bounds2, point: Vec2): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX
    && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

function overlapsPoint(bounds: Bounds2, point: Vec2): boolean {
  return point.x > bounds.minX && point.x < bounds.maxX
    && point.z > bounds.minZ && point.z < bounds.maxZ;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function roadPoints(road: (typeof ROAD_SPECS)[number]): readonly Vec2[] {
  return [road.centerline.from, ...road.centerline.via, road.centerline.to];
}

function pointToSegmentDistance(point: Vec2, from: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return distance(point, from);
  const amount = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared));
  return distance(point, { x: from.x + dx * amount, z: from.z + dz * amount });
}

function pointToRoadDistance(point: Vec2, road: (typeof ROAD_SPECS)[number]): number {
  const points = roadPoints(road);
  return Math.min(...points.slice(1).map((to, index) => pointToSegmentDistance(point, points[index] as Vec2, to)));
}

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

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const cross = (first: Vec2, second: Vec2, third: Vec2) => (
    (second.x - first.x) * (third.z - first.z) - (second.z - first.z) * (third.x - first.x)
  );
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD <= 0 && cdA * cdB <= 0;
}

function roadsIntersect(left: (typeof ROAD_SPECS)[number], right: (typeof ROAD_SPECS)[number]): boolean {
  const leftPoints = roadPoints(left);
  const rightPoints = roadPoints(right);
  return leftPoints.slice(1).some((leftTo, leftIndex) => rightPoints.slice(1).some((rightTo, rightIndex) => (
    segmentsIntersect(leftPoints[leftIndex] as Vec2, leftTo, rightPoints[rightIndex] as Vec2, rightTo)
  )));
}

function expectDeeplyFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeeplyFrozen(child);
}

describe('authored Badaguan district data', () => {
  it('publishes the exact unique 7 transverse plus 3 longitudinal road grid', () => {
    expect(ROAD_SPECS).toBe(DISTRICT_DATA.roads);
    expect(ROAD_SPECS.map(({ name }) => name)).toEqual([
      ...expectedEastWestNames,
      ...expectedNorthSouthNames,
    ]);
    expect(new Set(ROAD_SPECS.map(({ id }) => id)).size).toBe(10);
    expect(new Set(ROAD_SPECS.map(({ name }) => name)).size).toBe(10);

    const eastWest = ROAD_SPECS.filter(({ orientation }) => orientation === 'east-west');
    const northSouth = ROAD_SPECS.filter(({ orientation }) => orientation === 'north-south');
    expect(eastWest).toHaveLength(7);
    expect(northSouth).toHaveLength(3);
    expect(eastWest.map(({ name }) => name)).toEqual(expectedEastWestNames);
    expect(northSouth.map(({ name }) => name)).toEqual(expectedNorthSouthNames);
    expect(eastWest.map(({ centerline }) => centerline.from.z)).toEqual([-260, -215, -170, -125, -80, -35, 10]);
    expect(northSouth.map(({ centerline }) => centerline.from.x)).toEqual([-120, 0, 120]);
  });

  it('keeps road topology, spans, sizing, and restrained terrain-led turns', () => {
    const curvedRoads = ROAD_SPECS.filter(({ centerline }) => centerline.via.length > 0);
    expect(curvedRoads.length).toBeGreaterThan(0);
    expect(curvedRoads.length).toBeLessThan(ROAD_SPECS.length);
    expect(curvedRoads.map(({ id }) => id)).toEqual([
      'ningwuguan',
      'zhengyangguan',
      'juyongguan',
      'wushengguan',
      'shanhaiguan',
    ]);

    for (const road of ROAD_SPECS) {
      const { from, to, via } = road.centerline;
      const points = roadPoints(road);
      expect(road.width).toBe(12);
      expect(road.sidewalkWidth).toBe(3);
      expect(road.inference.status).toBe('authored-inference');
      expect(new Set(points.map(({ x, z }) => `${x}:${z}`)).size).toBe(points.length);
      if (road.orientation === 'east-west') {
        expect([from.x, to.x]).toEqual([
          DISTRICT_DATA.navigableBounds.minX,
          DISTRICT_DATA.navigableBounds.maxX,
        ]);
        expect(points.map(({ x }) => x)).toEqual([...points.map(({ x }) => x)].sort((left, right) => left - right));
        expect(via.every(({ z }) => Math.abs(z - from.z) <= 4)).toBe(true);
      } else {
        expect([from.z, to.z]).toEqual([
          DISTRICT_DATA.navigableBounds.maxZ,
          DISTRICT_DATA.navigableBounds.minZ,
        ]);
        expect(points.map(({ z }) => z)).toEqual([...points.map(({ z }) => z)].sort((left, right) => right - left));
        expect(via.every(({ x }) => Math.abs(x - from.x) <= 4)).toBe(true);
      }
    }

    const eastWest = ROAD_SPECS.filter(({ orientation }) => orientation === 'east-west');
    const northSouth = ROAD_SPECS.filter(({ orientation }) => orientation === 'north-south');
    for (const transverse of eastWest) {
      for (const longitudinal of northSouth) expect(roadsIntersect(transverse, longitudinal)).toBe(true);
    }
  });

  it('defines the contracted metre-scale world and a selectively screened noncollidable coast', () => {
    const { worldBounds, navigableBounds, coast } = DISTRICT_DATA;
    expect(worldBounds).toEqual({ minX: -210, maxX: 210, minZ: -300, maxZ: 60 });
    expect(worldBounds.maxX - worldBounds.minX).toBe(420);
    expect(worldBounds.maxZ - worldBounds.minZ).toBe(360);
    expect(navigableBounds).toEqual({ minX: -200, maxX: 200, minZ: -290, maxZ: 38 });
    expect(coast.edgeZ).toBe(navigableBounds.maxZ);
    expect(coast.seaBounds.minZ).toBe(coast.edgeZ);
    expect(coast.seaBounds.maxZ).toBe(worldBounds.maxZ);
    expect(coast.collidable).toBe(false);
    expect(coast.screen.height).toBeGreaterThan(1.68);
    expect(coast.screen.z).toBeLessThanOrEqual(coast.edgeZ);
    expect(coast.screen.openings).toHaveLength(3);
    expect(coast.screen.inference.status).toBe('authored-inference');
    const openings = [...coast.screen.openings].sort((left, right) => left.minX - right.minX);
    for (const [index, opening] of openings.entries()) {
      expect(opening.minX).toBeLessThan(opening.maxX);
      expect(opening.minX).toBeGreaterThanOrEqual(navigableBounds.minX);
      expect(opening.maxX).toBeLessThanOrEqual(navigableBounds.maxX);
      if (index > 0) expect(openings[index - 1]?.maxX).toBeLessThan(opening.minX);
      const road = ROAD_SPECS.find(({ id }) => id === opening.alignedRoadId);
      expect(road?.orientation).toBe('north-south');
      expect(road && opening.minX <= road.centerline.from.x && opening.maxX >= road.centerline.from.x).toBe(true);
    }
    expect(DISTRICT_DATA.provenance.coordinateSystem).toContain('+X east, -Z north, +Y up');
  });

  it('keeps parcels, setbacks, perimeter walls, and gates outside every road-sidewalk corridor', () => {
    const corridorPadding = (road: (typeof ROAD_SPECS)[number]) => road.width * 0.5 + road.sidewalkWidth;
    expect(DISTRICT_DATA.parcels.length).toBeGreaterThan(0);
    for (const parcel of DISTRICT_DATA.parcels) {
      expect(parcel.setback).toBeGreaterThan(0);
      expect(parcel.setback * 2).toBeLessThan(Math.min(
        parcel.bounds.maxX - parcel.bounds.minX,
        parcel.bounds.maxZ - parcel.bounds.minZ,
      ));
      expect(parcel.wallSegments).toHaveLength(4);
      expect(parcel.gates.length).toBeGreaterThan(0);

      const wallLength = parcel.wallSegments.reduce((total, wall) => total + distance(wall.from, wall.to), 0);
      expect(wallLength).toBe(2 * (
        parcel.bounds.maxX - parcel.bounds.minX + parcel.bounds.maxZ - parcel.bounds.minZ
      ));
      for (const wall of parcel.wallSegments) {
        expect(contains(parcel.bounds, wall.from)).toBe(true);
        expect(contains(parcel.bounds, wall.to)).toBe(true);
        expect(wall.from.x === wall.to.x || wall.from.z === wall.to.z).toBe(true);
        expect(
          wall.from.x === parcel.bounds.minX || wall.from.x === parcel.bounds.maxX
          || wall.from.z === parcel.bounds.minZ || wall.from.z === parcel.bounds.maxZ,
        ).toBe(true);
      }
      const endpointCounts = new Map<string, number>();
      for (const wall of parcel.wallSegments) {
        for (const endpoint of [wall.from, wall.to]) {
          const key = `${endpoint.x}:${endpoint.z}`;
          endpointCounts.set(key, (endpointCounts.get(key) ?? 0) + 1);
        }
      }
      expect([...endpointCounts.values()]).toEqual([2, 2, 2, 2]);

      for (const road of ROAD_SPECS) {
        const padding = corridorPadding(road);
        const expandedParcel = {
          minX: parcel.bounds.minX - padding,
          maxX: parcel.bounds.maxX + padding,
          minZ: parcel.bounds.minZ - padding,
          maxZ: parcel.bounds.maxZ + padding,
        };
        const points = roadPoints(road);
        expect(points.slice(1).some((to, index) => segmentIntersectsBounds(points[index] as Vec2, to, expandedParcel))).toBe(false);
      }

      for (const gate of parcel.gates) {
        expect(contains(parcel.bounds, gate.position)).toBe(true);
        expect(gate.width).toBeGreaterThan(0);
        expect(parcel.wallSegments.some(({ from, to }) => pointToSegmentDistance(gate.position, from, to) === 0)).toBe(true);
        const declaredRoad = ROAD_SPECS.find(({ id }) => id === gate.facesRoadId);
        expect(declaredRoad).toBeDefined();
        if (!declaredRoad) continue;
        const declaredDistance = pointToRoadDistance(gate.position, declaredRoad);
        expect(ROAD_SPECS.every((road) => declaredDistance <= pointToRoadDistance(gate.position, road) + 1e-8)).toBe(true);
        const boundaryMidpoints = [
          { x: (parcel.bounds.minX + parcel.bounds.maxX) * 0.5, z: parcel.bounds.minZ },
          { x: (parcel.bounds.minX + parcel.bounds.maxX) * 0.5, z: parcel.bounds.maxZ },
          { x: parcel.bounds.minX, z: (parcel.bounds.minZ + parcel.bounds.maxZ) * 0.5 },
          { x: parcel.bounds.maxX, z: (parcel.bounds.minZ + parcel.bounds.maxZ) * 0.5 },
        ];
        expect(pointToRoadDistance(gate.position, declaredRoad)).toBeLessThanOrEqual(
          Math.min(...boundaryMidpoints.map((point) => pointToRoadDistance(point, declaredRoad))) + gate.width,
        );
      }
    }

    expect(DISTRICT_DATA.publicGreen.paths.length).toBeGreaterThan(0);
    for (const path of DISTRICT_DATA.publicGreen.paths) {
      expect(path.centerline.length).toBeGreaterThanOrEqual(2);
      expect(path.centerline.every((point) => contains(DISTRICT_DATA.publicGreen.bounds, point))).toBe(true);
    }
    expect(DISTRICT_DATA.collisionFootprints).toHaveLength(DISTRICT_DATA.architectureSites.length);
    for (const footprint of DISTRICT_DATA.collisionFootprints) {
      expect(footprint.purpose).toBe('architecture');
      const site = DISTRICT_DATA.architectureSites.find(({ id }) => id === footprint.subjectId);
      expect(site, `${footprint.id} must identify an architecture site`).toBeDefined();
      expect(footprint.bounds).toEqual(site?.collisionBounds);


      for (const road of ROAD_SPECS) {
        const padding = corridorPadding(road);
        const expandedFootprint = {
          minX: footprint.bounds.minX - padding,
          maxX: footprint.bounds.maxX + padding,
          minZ: footprint.bounds.minZ - padding,
          maxZ: footprint.bounds.maxZ + padding,
        };
        const points = roadPoints(road);
        expect(
          points.slice(1).some((to, index) => segmentIntersectsBounds(
            points[index] as Vec2,
            to,
            expandedFootprint,
          )),
          `${footprint.id} must stay outside the ${road.id} road and sidewalk corridor`,
        ).toBe(false);
      }
    }
  });

  it('keeps spawn and reset safe, central-south, and yaw-only orientation data finite', () => {
    expect(DISTRICT_DATA.spawn).toEqual({ x: 0, z: 5 });
    expect(DISTRICT_DATA.reset).toEqual(DISTRICT_DATA.spawn);
    expect(contains(DISTRICT_DATA.navigableBounds, DISTRICT_DATA.spawn)).toBe(true);
    expect(DISTRICT_DATA.spawn.z).toBeLessThan(DISTRICT_DATA.coast.edgeZ);
    expect(DISTRICT_DATA.collisionFootprints.some(({ bounds }) => overlapsPoint(bounds, DISTRICT_DATA.spawn))).toBe(false);
    expect(DISTRICT_DATA.collisionFootprints.some(({ bounds }) => overlapsPoint(bounds, DISTRICT_DATA.reset))).toBe(false);
    expect(Number.isFinite(DISTRICT_DATA.spawnYaw)).toBe(true);
    expect(DISTRICT_DATA.resetYaw).toBe(DISTRICT_DATA.spawnYaw);
    expect(DISTRICT_DATA.spawnYaw).not.toBe(0);
  });

  it('provides one continuous ordered route through green, uphill, coast, and reset', () => {
    expect(ROUTE_ANCHORS).toBe(DISTRICT_DATA.routeAnchors);
    expect(ROUTE_ANCHORS.map(({ order }) => order)).toEqual(
      Array.from({ length: ROUTE_ANCHORS.length }, (_, index) => index),
    );
    expect(DISTRICT_DATA.route.anchorIds).toEqual(ROUTE_ANCHORS.map(({ id }) => id));
    expect(new Set(DISTRICT_DATA.route.anchorIds).size).toBe(DISTRICT_DATA.route.anchorIds.length);
    expect(ROUTE_ANCHORS[0]?.position).toEqual(DISTRICT_DATA.spawn);
    expect(ROUTE_ANCHORS.at(-1)?.position).toEqual(DISTRICT_DATA.reset);
    expect(ROUTE_ANCHORS.every(({ position }) => contains(DISTRICT_DATA.navigableBounds, position))).toBe(true);
    expect(ROUTE_ANCHORS.some(({ kind, position }) => kind === 'public-green' && contains(DISTRICT_DATA.publicGreen.bounds, position))).toBe(true);
    expect(ROUTE_ANCHORS.some(({ kind }) => kind === 'uphill')).toBe(true);
    expect(ROUTE_ANCHORS.some(({ position }) => position.z < DISTRICT_DATA.coast.edgeZ && position.z >= DISTRICT_DATA.coast.edgeZ - 4)).toBe(true);
    expect(ROUTE_ANCHORS.every(({ inference }) => inference.status === 'authored-inference')).toBe(true);

    const requiredStages = [
      'mixed-villa-intersection',
      'ginkgo-maple-corridor',
      'public-green-heart',
      'uphill-grid-vista',
      'princess-inspired-anchor',
      'butterfly-inspired-anchor',
      'shore-huashi-vista',
    ] as const;
    const routeIds = ROUTE_ANCHORS.map(({ id }) => id);
    const requiredStageIndexes = requiredStages.map((id) => routeIds.indexOf(id));
    expect(requiredStageIndexes.every((index) => index >= 0)).toBe(true);
    expect(requiredStageIndexes).toEqual([...requiredStageIndexes].sort((left, right) => left - right));
    expect(DISTRICT_DATA.landmarkAnchors).toEqual(
      ROUTE_ANCHORS.filter(({ kind }) => kind === 'landmark'),
    );
    expect(DISTRICT_DATA.landmarkAnchors.map(({ inspiration }) => inspiration)).toEqual([
      'mixed-villa-intersection',
      'ginkgo-maple-corridor',
      'princess-inspired',
      'butterfly-inspired',
      'huashi-inspired',
    ]);

    for (let index = 1; index < ROUTE_ANCHORS.length; index += 1) {
      const previous = ROUTE_ANCHORS[index - 1];
      const current = ROUTE_ANCHORS[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous && current) expect(distance(previous.position, current.position)).toBeLessThanOrEqual(75);
    }
  });

  it('declares all required sightline themes with safe in-world endpoints', () => {
    expect(DISTRICT_DATA.sightlines.map(({ theme }) => theme).sort()).toEqual(['coast', 'green', 'uphill']);
    for (const sightline of DISTRICT_DATA.sightlines) {
      expect(contains(DISTRICT_DATA.worldBounds, sightline.from)).toBe(true);
      expect(contains(DISTRICT_DATA.worldBounds, sightline.toward)).toBe(true);
      expect(distance(sightline.from, sightline.toward)).toBeGreaterThan(0);
    }
    const uphill = DISTRICT_DATA.sightlines.find(({ theme }) => theme === 'uphill');
    const coast = DISTRICT_DATA.sightlines.find(({ theme }) => theme === 'coast');
    expect(uphill && uphill.toward.z < uphill.from.z).toBe(true);
    expect(coast?.toward.z).toBe(DISTRICT_DATA.coast.edgeZ);
  });

  it('is deeply frozen and explicitly discloses authored non-geospatial inference', () => {
    expectDeeplyFrozen(DISTRICT_DATA);
    expectDeeplyFrozen(ROAD_SPECS);
    expectDeeplyFrozen(ROUTE_ANCHORS);
    expect(DISTRICT_DATA.provenance.roadLayout.status).toBe('authored-inference');
    expect(DISTRICT_DATA.provenance.roadLayout.basis).toContain('not surveyed or geospatial');
    expect(DISTRICT_DATA.provenance.publicGreen.status).toBe('authored-inference');
    expect(DISTRICT_DATA.provenance.routeGeometry.status).toBe('authored-inference');
    expect(DISTRICT_DATA.provenance.buildingFootprints.status).toBe('authored-inference');
  });

  it('publishes landscape records through the canonical district object with authored provenance', () => {
    expect(ROAD_PLANTING_CUES).toBe(DISTRICT_DATA.roadPlantingCues);
    expect(PLANTING_ZONES).toBe(DISTRICT_DATA.plantingZones);
    expect(LANDSCAPE_CAMERA_VIEWS).toBe(DISTRICT_DATA.landscapeCameraViews);
    expect(ROAD_PLANTING_CUES).toHaveLength(ROAD_SPECS.length);
    expect(PLANTING_ZONES).toHaveLength(ROAD_SPECS.length);
    expect(LANDSCAPE_CAMERA_VIEWS).toHaveLength(ROAD_SPECS.length);
    expectDeeplyFrozen(ROAD_PLANTING_CUES);
    expectDeeplyFrozen(PLANTING_ZONES);
    expectDeeplyFrozen(LANDSCAPE_CAMERA_VIEWS);
    expect(ROAD_PLANTING_CUES.every(({ provenance }) => provenance.status === 'authored-inference')).toBe(true);
    expect(PLANTING_ZONES.every(({ inference }) => inference.status === 'authored-inference')).toBe(true);
  });
});
