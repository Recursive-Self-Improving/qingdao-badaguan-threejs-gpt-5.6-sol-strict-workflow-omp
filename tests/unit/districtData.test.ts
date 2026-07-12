import { describe, expect, it } from 'vitest';

import { DISTRICT_DATA, ROAD_SPECS, ROUTE_ANCHORS } from '../../src/world/districtData';
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

  it('keeps every road straight, axis-correct, consistently sized, and spanning navigation', () => {
    for (const road of ROAD_SPECS) {
      const { from, to } = road.centerline;
      expect(road.width).toBe(12);
      expect(road.sidewalkWidth).toBe(3);
      expect(road.inference.status).toBe('authored-inference');
      if (road.orientation === 'east-west') {
        expect(from.z).toBe(to.z);
        expect([from.x, to.x]).toEqual([
          DISTRICT_DATA.navigableBounds.minX,
          DISTRICT_DATA.navigableBounds.maxX,
        ]);
      } else {
        expect(from.x).toBe(to.x);
        expect([from.z, to.z]).toEqual([
          DISTRICT_DATA.navigableBounds.maxZ,
          DISTRICT_DATA.navigableBounds.minZ,
        ]);
      }
    }
  });

  it('defines the contracted metre-scale world, navigation inset, and noncollidable coast', () => {
    const { worldBounds, navigableBounds, coast } = DISTRICT_DATA;
    expect(worldBounds).toEqual({ minX: -210, maxX: 210, minZ: -300, maxZ: 60 });
    expect(worldBounds.maxX - worldBounds.minX).toBe(420);
    expect(worldBounds.maxZ - worldBounds.minZ).toBe(360);
    expect(navigableBounds).toEqual({ minX: -200, maxX: 200, minZ: -290, maxZ: 38 });
    expect(coast.edgeZ).toBe(navigableBounds.maxZ);
    expect(coast.seaBounds.minZ).toBe(coast.edgeZ);
    expect(coast.seaBounds.maxZ).toBe(worldBounds.maxZ);
    expect(coast.collidable).toBe(false);
    expect(DISTRICT_DATA.provenance.coordinateSystem).toContain('+X east, -Z north, +Y up');
  });

  it('records coherent parcel setbacks, walls, gates, paths, and future collisions', () => {
    const roadIds = new Set(ROAD_SPECS.map(({ id }) => id));
    expect(DISTRICT_DATA.parcels.length).toBeGreaterThan(0);
    for (const parcel of DISTRICT_DATA.parcels) {
      expect(parcel.setback).toBeGreaterThan(0);
      expect(parcel.wallSegments.length).toBeGreaterThanOrEqual(4);
      expect(parcel.gates.length).toBeGreaterThan(0);
      for (const wall of parcel.wallSegments) {
        expect(contains(parcel.bounds, wall.from)).toBe(true);
        expect(contains(parcel.bounds, wall.to)).toBe(true);
      }
      for (const gate of parcel.gates) {
        expect(contains(parcel.bounds, gate.position)).toBe(true);
        expect(gate.width).toBeGreaterThan(0);
        expect(roadIds.has(gate.facesRoadId)).toBe(true);
      }
    }

    expect(DISTRICT_DATA.publicGreen.paths.length).toBeGreaterThan(0);
    for (const path of DISTRICT_DATA.publicGreen.paths) {
      expect(path.centerline.length).toBeGreaterThanOrEqual(2);
      expect(path.centerline.every((point) => contains(DISTRICT_DATA.publicGreen.bounds, point))).toBe(true);
    }
    for (const footprint of DISTRICT_DATA.collisionFootprints) {
      expect(footprint.purpose).toBe('future-building');
      expect(contains(DISTRICT_DATA.navigableBounds, { x: footprint.bounds.minX, z: footprint.bounds.minZ })).toBe(true);
      expect(contains(DISTRICT_DATA.navigableBounds, { x: footprint.bounds.maxX, z: footprint.bounds.maxZ })).toBe(true);
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
});
