import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D as TransformObject,
  type Material,
  type Object3D,
} from 'three';

import { sampleGroundHeight } from '../../exploration/navigation';
import type { ResourceRegistry } from '../../render/ResourceRegistry';
import { DISTRICT_DATA, ROAD_SPECS } from '../districtData';
import type {
  Bounds2,
  GateSpec,
  LineSegment,
  ParcelSpec,
  RoadSpec,
  Vec2,
} from '../types';

const SURFACE_SAMPLE_SPACING = 8;
const POLYLINE_JOINT_SEGMENTS = 12;
const CORRIDOR_SAMPLE_SPACING = 2;
const WALL_SECTION_LENGTH = 8;
const CROSSWALK_STRIPE_LENGTH = 0.8;
const CROSSWALK_STRIPE_GAP = 0.65;
const MINIMUM_ENTRANCE_WIDTH = 3;

const LAYERS = {
  lawn: 0.025,
  publicGreen: 0.035,
  sidewalk: 0.09,
  path: 0.09,
  road: 0.095,
  roadIntersection: 0.1,
  crosswalk: 0.12,
} as const;

const WALL_HEIGHT = 0.72;
const WALL_THICKNESS = 0.48;
const GATE_POST_HEIGHT = 0.9;
const GATE_POST_SIZE = 0.48;
const GATE_ALIGNMENT_TOLERANCE = 0.75;
const COLORS = {
  road: 0x555c5b,
  sidewalk: 0xb7b09b,
  parcelLawn: 0x738363,
  publicGreen: 0x4f7451,
  publicPath: 0xd3c5a5,
  crosswalk: 0xeee2c5,
  wall: 0x887c69,
  gate: 0x665c50,
} as const;

interface BoxInstance {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly length: number;
  readonly height: number;
  readonly depth: number;
  readonly yaw: number;
}

interface Interval {
  readonly start: number;
  readonly end: number;
}

interface PublicGreenEntrance {
  readonly endpoint: Vec2;
  readonly road: RoadSpec;
  readonly roadCenter: Vec2;
  readonly roadEdge: Vec2;
  readonly roadNormal: Vec2;
  readonly width: number;
}

interface RoadApproach {
  readonly roadCenter: Vec2;
  readonly roadEdge: Vec2;
  readonly roadNormal: Vec2;
  readonly sidewalkDistance: number;
}

function terrainPoint(point: Vec2, yOffset: number): readonly [number, number, number] {
  return [point.x, sampleGroundHeight(point.x, point.z) + yOffset, point.z];
}

function appendTriangle(
  positions: number[],
  first: readonly [number, number, number],
  second: readonly [number, number, number],
  third: readonly [number, number, number],
): void {
  positions.push(...first, ...second, ...third);
}

function appendTerrainQuad(
  positions: number[],
  first: Vec2,
  second: Vec2,
  third: Vec2,
  fourth: Vec2,
  yOffset: number,
): void {
  const a = terrainPoint(first, yOffset);
  const b = terrainPoint(second, yOffset);
  const c = terrainPoint(third, yOffset);
  const d = terrainPoint(fourth, yOffset);
  appendTriangle(positions, a, b, c);
  appendTriangle(positions, c, b, d);
}

function appendTerrainRect(
  positions: number[],
  bounds: Bounds2,
  yOffset: number,
): void {
  const columns = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / SURFACE_SAMPLE_SPACING));
  const rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / SURFACE_SAMPLE_SPACING));

  for (let column = 0; column < columns; column += 1) {
    const minX = bounds.minX + ((bounds.maxX - bounds.minX) * column) / columns;
    const maxX = bounds.minX + ((bounds.maxX - bounds.minX) * (column + 1)) / columns;
    for (let row = 0; row < rows; row += 1) {
      const minZ = bounds.minZ + ((bounds.maxZ - bounds.minZ) * row) / rows;
      const maxZ = bounds.minZ + ((bounds.maxZ - bounds.minZ) * (row + 1)) / rows;
      appendTerrainQuad(
        positions,
        { x: minX, z: minZ },
        { x: minX, z: maxZ },
        { x: maxX, z: minZ },
        { x: maxX, z: maxZ },
        yOffset,
      );
    }
  }
}

function appendStripSegment(
  positions: number[],
  from: Vec2,
  to: Vec2,
  width: number,
  yOffset: number,
): void {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  const length = Math.hypot(deltaX, deltaZ);
  if (length === 0) return;

  const normalX = (-deltaZ / length) * width * 0.5;
  const normalZ = (deltaX / length) * width * 0.5;
  const sections = Math.max(1, Math.ceil(length / SURFACE_SAMPLE_SPACING));

  for (let section = 0; section < sections; section += 1) {
    const start = section / sections;
    const end = (section + 1) / sections;
    const startX = from.x + deltaX * start;
    const startZ = from.z + deltaZ * start;
    const endX = from.x + deltaX * end;
    const endZ = from.z + deltaZ * end;
    appendTerrainQuad(
      positions,
      { x: startX + normalX, z: startZ + normalZ },
      { x: endX + normalX, z: endZ + normalZ },
      { x: startX - normalX, z: startZ - normalZ },
      { x: endX - normalX, z: endZ - normalZ },
      yOffset,
    );
  }
}

function appendTerrainDisk(
  positions: number[],
  center: Vec2,
  radius: number,
  yOffset: number,
): void {
  const middle = terrainPoint(center, yOffset);
  for (let segment = 0; segment < POLYLINE_JOINT_SEGMENTS; segment += 1) {
    const firstAngle = (segment / POLYLINE_JOINT_SEGMENTS) * Math.PI * 2;
    const secondAngle = ((segment + 1) / POLYLINE_JOINT_SEGMENTS) * Math.PI * 2;
    const first = terrainPoint({
      x: center.x + Math.cos(firstAngle) * radius,
      z: center.z + Math.sin(firstAngle) * radius,
    }, yOffset);
    const second = terrainPoint({
      x: center.x + Math.cos(secondAngle) * radius,
      z: center.z + Math.sin(secondAngle) * radius,
    }, yOffset);
    appendTriangle(positions, middle, second, first);
  }
}

function appendPolylineStrip(
  positions: number[],
  centerline: readonly Vec2[],
  width: number,
  yOffset: number,
): void {
  for (let index = 1; index < centerline.length; index += 1) {
    const from = centerline[index - 1];
    const to = centerline[index];
    if (from === undefined || to === undefined) continue;
    appendStripSegment(positions, from, to, width, yOffset);
  }
  for (const point of centerline) appendTerrainDisk(positions, point, width * 0.5, yOffset);
}

function offsetPolylines(
  centerline: readonly Vec2[],
  offset: number,
): readonly [readonly Vec2[], readonly Vec2[]] {
  const segmentNormals: Array<Vec2 | null> = [];
  for (let index = 1; index < centerline.length; index += 1) {
    const from = centerline[index - 1];
    const to = centerline[index];
    if (from === undefined || to === undefined) {
      segmentNormals.push(null);
      continue;
    }
    const deltaX = to.x - from.x;
    const deltaZ = to.z - from.z;
    const length = Math.hypot(deltaX, deltaZ);
    segmentNormals.push(length === 0 ? null : { x: -deltaZ / length, z: deltaX / length });
  }

  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let index = 0; index < centerline.length; index += 1) {
    const point = centerline[index];
    if (point === undefined) continue;
    const previous = segmentNormals[index - 1] ?? null;
    const next = segmentNormals[index] ?? null;
    let normalX = previous?.x ?? next?.x ?? 0;
    let normalZ = previous?.z ?? next?.z ?? 0;
    if (previous !== null && next !== null) {
      normalX = previous.x + next.x;
      normalZ = previous.z + next.z;
      const combinedLength = Math.hypot(normalX, normalZ);
      if (combinedLength === 0) {
        normalX = next.x;
        normalZ = next.z;
      } else {
        normalX /= combinedLength;
        normalZ /= combinedLength;
      }
    }
    const offsetX = normalX * offset;
    const offsetZ = normalZ * offset;
    left.push({ x: point.x + offsetX, z: point.z + offsetZ });
    right.push({ x: point.x - offsetX, z: point.z - offsetZ });
  }
  return [left, right];
}

function appendRoadCorridor(
  roadPositions: number[],
  sidewalkPositions: number[],
  centerline: readonly Vec2[],
  roadWidth: number,
  sidewalkWidth: number,
): void {
  const [roadLeft, roadRight] = offsetPolylines(centerline, roadWidth * 0.5);
  const [outerLeft, outerRight] = offsetPolylines(centerline, roadWidth * 0.5 + sidewalkWidth);
  const interpolatePoint = (from: Vec2, to: Vec2, t: number): Vec2 => ({
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
  });
  for (let index = 1; index < centerline.length; index += 1) {
    const previous = index - 1;
    const roadLeftPrevious = roadLeft[previous];
    const roadLeftCurrent = roadLeft[index];
    const roadRightPrevious = roadRight[previous];
    const roadRightCurrent = roadRight[index];
    const outerLeftPrevious = outerLeft[previous];
    const outerLeftCurrent = outerLeft[index];
    const outerRightPrevious = outerRight[previous];
    const outerRightCurrent = outerRight[index];
    const centerPrevious = centerline[previous];
    const centerCurrent = centerline[index];
    if (roadLeftPrevious === undefined || roadLeftCurrent === undefined
      || roadRightPrevious === undefined || roadRightCurrent === undefined
      || outerLeftPrevious === undefined || outerLeftCurrent === undefined
      || outerRightPrevious === undefined || outerRightCurrent === undefined
      || centerPrevious === undefined || centerCurrent === undefined) continue;
    const sections = Math.max(1, Math.ceil(Math.hypot(centerCurrent.x - centerPrevious.x, centerCurrent.z - centerPrevious.z) / CORRIDOR_SAMPLE_SPACING));
    for (let section = 0; section < sections; section += 1) {
      const start = section / sections;
      const end = (section + 1) / sections;
      const roadLeftStart = interpolatePoint(roadLeftPrevious, roadLeftCurrent, start);
      const roadLeftEnd = interpolatePoint(roadLeftPrevious, roadLeftCurrent, end);
      const roadRightStart = interpolatePoint(roadRightPrevious, roadRightCurrent, start);
      const roadRightEnd = interpolatePoint(roadRightPrevious, roadRightCurrent, end);
      const outerLeftStart = interpolatePoint(outerLeftPrevious, outerLeftCurrent, start);
      const outerLeftEnd = interpolatePoint(outerLeftPrevious, outerLeftCurrent, end);
      const outerRightStart = interpolatePoint(outerRightPrevious, outerRightCurrent, start);
      const outerRightEnd = interpolatePoint(outerRightPrevious, outerRightCurrent, end);
      appendTerrainQuad(roadPositions, roadLeftStart, roadLeftEnd, roadRightStart, roadRightEnd, LAYERS.road);
      appendTerrainQuad(sidewalkPositions, outerLeftStart, outerLeftEnd, roadLeftStart, roadLeftEnd, LAYERS.sidewalk);
      appendTerrainQuad(sidewalkPositions, roadRightStart, roadRightEnd, outerRightStart, outerRightEnd, LAYERS.sidewalk);
    }
  }
}

function segmentIntersection(firstFrom: Vec2, firstTo: Vec2, secondFrom: Vec2, secondTo: Vec2): Vec2 | null {
  const firstX = firstTo.x - firstFrom.x;
  const firstZ = firstTo.z - firstFrom.z;
  const secondX = secondTo.x - secondFrom.x;
  const secondZ = secondTo.z - secondFrom.z;
  const denominator = firstX * secondZ - firstZ * secondX;
  if (Math.abs(denominator) < 1e-8) return null;
  const offsetX = secondFrom.x - firstFrom.x;
  const offsetZ = secondFrom.z - firstFrom.z;
  const firstT = (offsetX * secondZ - offsetZ * secondX) / denominator;
  const secondT = (offsetX * firstZ - offsetZ * firstX) / denominator;
  if (firstT < 0 || firstT > 1 || secondT < 0 || secondT > 1) return null;
  return { x: firstFrom.x + firstX * firstT, z: firstFrom.z + firstZ * firstT };
}
function appendRoadIntersections(roadPositions: number[]): number {
  const seen = new Set<string>();
  for (let firstIndex = 0; firstIndex < ROAD_SPECS.length; firstIndex += 1) {
    const first = ROAD_SPECS[firstIndex];
    if (first === undefined) continue;
    const firstCenterline = [first.centerline.from, ...first.centerline.via, first.centerline.to];
    for (let secondIndex = firstIndex + 1; secondIndex < ROAD_SPECS.length; secondIndex += 1) {
      const second = ROAD_SPECS[secondIndex];
      if (second === undefined || first.orientation === second.orientation) continue;
      const secondCenterline = [second.centerline.from, ...second.centerline.via, second.centerline.to];
      for (let firstSegment = 1; firstSegment < firstCenterline.length; firstSegment += 1) {
        const firstFrom = firstCenterline[firstSegment - 1];
        const firstTo = firstCenterline[firstSegment];
        if (firstFrom === undefined || firstTo === undefined) continue;
        for (let secondSegment = 1; secondSegment < secondCenterline.length; secondSegment += 1) {
          const secondFrom = secondCenterline[secondSegment - 1];
          const secondTo = secondCenterline[secondSegment];
          if (secondFrom === undefined || secondTo === undefined) continue;
          const point = segmentIntersection(firstFrom, firstTo, secondFrom, secondTo);
          if (point === null) continue;
          const key = `${Math.round(point.x * 1000)}:${Math.round(point.z * 1000)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const eastWest = first.orientation === 'east-west' ? first : second;
          const northSouth = first.orientation === 'north-south' ? first : second;
          const eastWestRoadHalf = eastWest.width * 0.5;
          const eastWestOuterHalf = eastWestRoadHalf + eastWest.sidewalkWidth;
          const northSouthRoadHalf = northSouth.width * 0.5;
          const northSouthOuterHalf = northSouthRoadHalf + northSouth.sidewalkWidth;
          appendTerrainRect(roadPositions, {
            minX: point.x - northSouthOuterHalf,
            maxX: point.x + northSouthOuterHalf,
            minZ: point.z - eastWestRoadHalf,
            maxZ: point.z + eastWestRoadHalf,
          }, LAYERS.roadIntersection);
          appendTerrainRect(roadPositions, {
            minX: point.x - northSouthRoadHalf,
            maxX: point.x + northSouthRoadHalf,
            minZ: point.z - eastWestOuterHalf,
            maxZ: point.z + eastWestOuterHalf,
          }, LAYERS.roadIntersection);
        }
      }
    }
  }
  return seen.size;
}

function closestRoadApproach(endpoint: Vec2, road: RoadSpec): RoadApproach | null {
  const centerline = [road.centerline.from, ...road.centerline.via, road.centerline.to];
  let closest: RoadApproach | null = null;

  for (let index = 1; index < centerline.length; index += 1) {
    const from = centerline[index - 1];
    const to = centerline[index];
    if (from === undefined || to === undefined) continue;
    const deltaX = to.x - from.x;
    const deltaZ = to.z - from.z;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (lengthSquared === 0) continue;
    const length = Math.sqrt(lengthSquared);
    const projection = Math.min(1, Math.max(0,
      ((endpoint.x - from.x) * deltaX + (endpoint.z - from.z) * deltaZ) / lengthSquared,
    ));
    const roadCenter = {
      x: from.x + deltaX * projection,
      z: from.z + deltaZ * projection,
    };
    const leftNormal = { x: -deltaZ / length, z: deltaX / length };
    const side = (endpoint.x - roadCenter.x) * leftNormal.x
      + (endpoint.z - roadCenter.z) * leftNormal.z >= 0 ? 1 : -1;
    const roadNormal = { x: leftNormal.x * side, z: leftNormal.z * side };
    const roadEdgeOffset = road.width * 0.5;
    const sidewalkEdgeOffset = roadEdgeOffset + road.sidewalkWidth;
    const roadEdge = {
      x: roadCenter.x + roadNormal.x * roadEdgeOffset,
      z: roadCenter.z + roadNormal.z * roadEdgeOffset,
    };
    const sidewalkEdge = {
      x: roadCenter.x + roadNormal.x * sidewalkEdgeOffset,
      z: roadCenter.z + roadNormal.z * sidewalkEdgeOffset,
    };
    const sidewalkDistance = Math.hypot(
      endpoint.x - sidewalkEdge.x,
      endpoint.z - sidewalkEdge.z,
    );
    if (closest === null || sidewalkDistance < closest.sidewalkDistance) {
      closest = { roadCenter, roadEdge, roadNormal, sidewalkDistance };
    }
  }

  return closest;
}

function createPublicGreenEntrances(): readonly PublicGreenEntrance[] {
  const entrances: PublicGreenEntrance[] = [];
  const seenEndpoints = new Set<string>();

  for (const path of DISTRICT_DATA.publicGreen.paths) {
    const first = path.centerline[0];
    const last = path.centerline[path.centerline.length - 1];
    if (first === undefined || last === undefined) continue;
    const endpoints = first === last ? [first] : [first, last];

    for (const endpoint of endpoints) {
      const endpointKey = `${endpoint.x}:${endpoint.z}`;
      if (seenEndpoints.has(endpointKey)) continue;
      seenEndpoints.add(endpointKey);

      let closestRoad: RoadSpec | null = null;
      let closestApproach: RoadApproach | null = null;
      for (const road of ROAD_SPECS) {
        const approach = closestRoadApproach(endpoint, road);
        if (approach !== null && (
          closestApproach === null || approach.sidewalkDistance < closestApproach.sidewalkDistance
        )) {
          closestRoad = road;
          closestApproach = approach;
        }
      }

      if (closestRoad !== null && closestApproach !== null) {
        entrances.push({
          endpoint,
          road: closestRoad,
          roadCenter: closestApproach.roadCenter,
          roadEdge: closestApproach.roadEdge,
          roadNormal: closestApproach.roadNormal,
          width: Math.max(MINIMUM_ENTRANCE_WIDTH, path.width),
        });
      }
    }
  }

  return entrances;
}


function appendCrosswalk(
  positions: number[],
  entrance: PublicGreenEntrance,
): void {
  const stripeCount = Math.max(1, Math.floor(
    (entrance.road.width + CROSSWALK_STRIPE_GAP)
      / (CROSSWALK_STRIPE_LENGTH + CROSSWALK_STRIPE_GAP),
  ));
  const occupiedLength = stripeCount * CROSSWALK_STRIPE_LENGTH
    + (stripeCount - 1) * CROSSWALK_STRIPE_GAP;
  const firstStripeOffset = -occupiedLength * 0.5;

  for (let stripe = 0; stripe < stripeCount; stripe += 1) {
    const stripeStart = firstStripeOffset
      + stripe * (CROSSWALK_STRIPE_LENGTH + CROSSWALK_STRIPE_GAP);
    const stripeEnd = stripeStart + CROSSWALK_STRIPE_LENGTH;
    appendStripSegment(
      positions,
      {
        x: entrance.roadCenter.x + entrance.roadNormal.x * stripeStart,
        z: entrance.roadCenter.z + entrance.roadNormal.z * stripeStart,
      },
      {
        x: entrance.roadCenter.x + entrance.roadNormal.x * stripeEnd,
        z: entrance.roadCenter.z + entrance.roadNormal.z * stripeEnd,
      },
      entrance.width,
      LAYERS.crosswalk,
    );
  }
}


function createSurfaceMesh(
  resources: ResourceRegistry,
  group: string,
  name: string,
  positions: readonly number[],
  color: number,
): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const normals = new Float32Array(positions.length);
  for (let index = 1; index < normals.length; index += 3) normals[index] = 1;
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  resources.register(geometry, group);
  const material = resources.register(name === 'street:sidewalks'
    ? new MeshBasicMaterial({ color: new Color(color), fog: false })
    : new MeshStandardMaterial({ color: new Color(color), roughness: 0.94, metalness: 0 }), group);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = name !== 'street:sidewalks';
  return mesh;
}

function closestWallSegment(gate: GateSpec, segments: readonly LineSegment[]): LineSegment | null {
  let closest: LineSegment | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    const deltaX = segment.to.x - segment.from.x;
    const deltaZ = segment.to.z - segment.from.z;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (lengthSquared === 0) continue;
    const projection = Math.min(1, Math.max(0,
      ((gate.position.x - segment.from.x) * deltaX
        + (gate.position.z - segment.from.z) * deltaZ) / lengthSquared,
    ));
    const projectedX = segment.from.x + deltaX * projection;
    const projectedZ = segment.from.z + deltaZ * projection;
    const distance = Math.hypot(gate.position.x - projectedX, gate.position.z - projectedZ);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = segment;
    }
  }
  return closest;
}

function gateCutsForSegment(parcel: ParcelSpec, segment: LineSegment): readonly Interval[] {
  const deltaX = segment.to.x - segment.from.x;
  const deltaZ = segment.to.z - segment.from.z;
  const length = Math.hypot(deltaX, deltaZ);
  if (length === 0) return [];

  const cuts: Interval[] = [];
  for (const gate of parcel.gates) {
    const projected = ((gate.position.x - segment.from.x) * deltaX
      + (gate.position.z - segment.from.z) * deltaZ) / length;
    if (projected < 0 || projected > length) continue;
    const projectedX = segment.from.x + (deltaX / length) * projected;
    const projectedZ = segment.from.z + (deltaZ / length) * projected;
    if (Math.hypot(gate.position.x - projectedX, gate.position.z - projectedZ) > GATE_ALIGNMENT_TOLERANCE) {
      continue;
    }
    cuts.push({
      start: Math.max(0, projected - gate.width * 0.5),
      end: Math.min(length, projected + gate.width * 0.5),
    });
  }
  return cuts.sort((first, second) => first.start - second.start);
}

function remainingIntervals(length: number, cuts: readonly Interval[]): readonly Interval[] {
  const intervals: Interval[] = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (cut.start > cursor) intervals.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < length) intervals.push({ start: cursor, end: length });
  return intervals;
}

function appendSegmentBoxes(
  instances: BoxInstance[],
  segment: LineSegment,
  intervals: readonly Interval[],
  height: number,
  depth: number,
  maxSectionLength: number,
): void {
  const deltaX = segment.to.x - segment.from.x;
  const deltaZ = segment.to.z - segment.from.z;
  const length = Math.hypot(deltaX, deltaZ);
  if (length === 0) return;
  const directionX = deltaX / length;
  const directionZ = deltaZ / length;
  const yaw = Math.atan2(-deltaZ, deltaX);

  for (const interval of intervals) {
    const intervalLength = interval.end - interval.start;
    if (intervalLength <= 0) continue;
    const sections = Math.max(1, Math.ceil(intervalLength / maxSectionLength));
    for (let section = 0; section < sections; section += 1) {
      const start = interval.start + (intervalLength * section) / sections;
      const end = interval.start + (intervalLength * (section + 1)) / sections;
      const middle = (start + end) * 0.5;
      const x = segment.from.x + directionX * middle;
      const z = segment.from.z + directionZ * middle;
      instances.push({
        x,
        y: sampleGroundHeight(x, z) + LAYERS.road + height * 0.5,
        z,
        length: end - start,
        height,
        depth,
        yaw,
      });
    }
  }
}

function createWallInstances(): readonly BoxInstance[] {
  const instances: BoxInstance[] = [];
  for (const parcel of DISTRICT_DATA.parcels) {
    for (const segment of parcel.wallSegments) {
      const length = Math.hypot(segment.to.x - segment.from.x, segment.to.z - segment.from.z);
      const intervals = remainingIntervals(length, gateCutsForSegment(parcel, segment));
      appendSegmentBoxes(
        instances,
        segment,
        intervals,
        WALL_HEIGHT,
        WALL_THICKNESS,
        WALL_SECTION_LENGTH,
      );
    }
  }
  return instances;
}

function createGateInstances(): readonly BoxInstance[] {
  const instances: BoxInstance[] = [];
  for (const parcel of DISTRICT_DATA.parcels) {
    for (const gate of parcel.gates) {
      const segment = closestWallSegment(gate, parcel.wallSegments);
      if (segment === null) continue;
      const deltaX = segment.to.x - segment.from.x;
      const deltaZ = segment.to.z - segment.from.z;
      const length = Math.hypot(deltaX, deltaZ);
      if (length === 0) continue;
      const directionX = deltaX / length;
      const directionZ = deltaZ / length;
      const postOffset = gate.width * 0.5 + GATE_POST_SIZE * 0.5;
      for (const side of [-1, 1] as const) {
        const x = gate.position.x + directionX * postOffset * side;
        const z = gate.position.z + directionZ * postOffset * side;
        instances.push({
          x,
          y: sampleGroundHeight(x, z) + LAYERS.road + GATE_POST_HEIGHT * 0.5,
          z,
          length: GATE_POST_SIZE,
          height: GATE_POST_HEIGHT,
          depth: GATE_POST_SIZE,
          yaw: 0,
        });
      }
    }
  }
  return instances;
}

function createInstancedBoxes(
  resources: ResourceRegistry,
  group: string,
  name: string,
  geometry: BoxGeometry,
  material: Material,
  instances: readonly BoxInstance[],
): InstancedMesh | null {
  if (instances.length === 0) return null;
  const mesh = resources.register(new InstancedMesh(geometry, material, instances.length), group);
  const transform = new TransformObject();
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index];
    if (instance === undefined) continue;
    transform.position.set(instance.x, instance.y, instance.z);
    transform.rotation.set(0, instance.yaw, 0);
    transform.scale.set(instance.length, instance.height, instance.depth);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = name;
  return mesh;
}

/** Builds the terrain-conforming, data-driven C04 street and garden skeleton. */
export function createStreetNetwork(resources: ResourceRegistry, group: string): Object3D {
  const root = new Group();
  root.name = 'street-network';

  const roadPositions: number[] = [];
  const sidewalkPositions: number[] = [];
  for (const road of ROAD_SPECS) {
    const centerline = [road.centerline.from, ...road.centerline.via, road.centerline.to];
    appendRoadCorridor(roadPositions, sidewalkPositions, centerline, road.width, road.sidewalkWidth);
  }
  const intersectionPositions: number[] = [];
  const intersectionCount = appendRoadIntersections(intersectionPositions);
  const intersections = createSurfaceMesh(resources, group, 'street:road-intersections', intersectionPositions, COLORS.road);
  intersections.userData.intersectionCount = intersectionCount;
  root.add(
    createSurfaceMesh(resources, group, 'street:roads', roadPositions, COLORS.road),
    createSurfaceMesh(resources, group, 'street:sidewalks', sidewalkPositions, COLORS.sidewalk),
    intersections,
  );

  const lawnPositions: number[] = [];
  for (const parcel of DISTRICT_DATA.parcels) appendTerrainRect(lawnPositions, parcel.bounds, LAYERS.lawn);
  root.add(createSurfaceMesh(resources, group, 'street:parcel-lawns', lawnPositions, COLORS.parcelLawn));
  const publicGreenPositions: number[] = [];
  appendTerrainRect(publicGreenPositions, DISTRICT_DATA.publicGreen.bounds, LAYERS.publicGreen);
  root.add(createSurfaceMesh(
    resources,
    group,
    'street:public-green',
    publicGreenPositions,
    COLORS.publicGreen,
  ));

  const publicPathPositions: number[] = [];
  for (const path of DISTRICT_DATA.publicGreen.paths) {
    appendPolylineStrip(publicPathPositions, path.centerline, path.width, LAYERS.path);
  }
  root.add(createSurfaceMesh(
    resources,
    group,
    'street:public-green-paths',
    publicPathPositions,
    COLORS.publicPath,
  ));

  const crosswalkPositions: number[] = [];
  for (const entrance of createPublicGreenEntrances()) appendCrosswalk(crosswalkPositions, entrance);
  root.add(createSurfaceMesh(
    resources,
    group,
    'street:public-green-crosswalks',
    crosswalkPositions,
    COLORS.crosswalk,
  ));


  const unitBox = resources.register(new BoxGeometry(1, 1, 1), group);
  const wallMaterial = resources.register(new MeshStandardMaterial({ color: new Color(COLORS.wall), roughness: 0.96 }), group);
  const gateMaterial = resources.register(new MeshStandardMaterial({ color: new Color(COLORS.gate), roughness: 0.88, metalness: 0.03 }), group);
  const walls = createInstancedBoxes(
    resources,
    group,
    'street:low-walls',
    unitBox,
    wallMaterial,
    createWallInstances(),
  );
  const gates = createInstancedBoxes(
    resources,
    group,
    'street:gates',
    unitBox,
    gateMaterial,
    createGateInstances(),
  );
  if (walls !== null) {
    walls.castShadow = true;
    walls.receiveShadow = true;
    root.add(walls);
  }
  if (gates !== null) {
    gates.castShadow = true;
    gates.receiveShadow = true;
    root.add(gates);
  }

  return root;
}
