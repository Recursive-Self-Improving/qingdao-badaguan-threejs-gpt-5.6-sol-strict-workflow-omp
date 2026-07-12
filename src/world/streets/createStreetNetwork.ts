import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D as TransformObject,
  PlaneGeometry,
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
const WALL_SECTION_LENGTH = 8;
const COAST_SECTION_LENGTH = 18;
const CROSSWALK_STRIPE_LENGTH = 0.8;
const CROSSWALK_STRIPE_GAP = 0.65;
const MINIMUM_ENTRANCE_WIDTH = 3;

const LAYERS = {
  lawn: 0.025,
  publicGreen: 0.035,
  setback: 0.045,
  sidewalk: 0.06,
  path: 0.075,
  promenade: 0.08,
  road: 0.09,
  entranceApron: 0.105,
  crosswalk: 0.12,
} as const;

const WALL_HEIGHT = 0.72;
const WALL_THICKNESS = 0.48;
const GATE_POST_HEIGHT = 0.9;
const GATE_POST_SIZE = 0.48;
const GATE_ALIGNMENT_TOLERANCE = 0.75;
const COAST_SCREEN_THICKNESS = 0.7;
const SEA_LEVEL_OFFSET = -0.08;

const COLORS = {
  road: 0x555c5b,
  sidewalk: 0xc5baa4,
  parcelLawn: 0x738363,
  setback: 0xa89c83,
  publicGreen: 0x4f7451,
  publicPath: 0xd3c5a5,
  promenade: 0xb6aa93,
  entranceApron: 0xdecfac,
  crosswalk: 0xeee2c5,
  wall: 0x887c69,
  gate: 0x665c50,
  coastScreen: 0x7e7467,
  sea: 0x557f8e,
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

function appendEntranceApron(
  positions: number[],
  entrance: PublicGreenEntrance,
): void {
  appendStripSegment(
    positions,
    entrance.endpoint,
    entrance.roadEdge,
    entrance.width,
    LAYERS.entranceApron,
  );
  appendTerrainDisk(
    positions,
    entrance.endpoint,
    entrance.width * 0.55,
    LAYERS.entranceApron,
  );
  appendTerrainDisk(
    positions,
    entrance.roadEdge,
    entrance.width * 0.65,
    LAYERS.entranceApron,
  );
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

function insetBounds(bounds: Bounds2, inset: number): Bounds2 | null {
  const insetBoundsValue = {
    minX: bounds.minX + inset,
    maxX: bounds.maxX - inset,
    minZ: bounds.minZ + inset,
    maxZ: bounds.maxZ - inset,
  };
  return insetBoundsValue.minX < insetBoundsValue.maxX && insetBoundsValue.minZ < insetBoundsValue.maxZ
    ? insetBoundsValue
    : null;
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
  geometry.computeBoundingSphere();
  resources.register(geometry, group);
  const material = resources.register(new MeshBasicMaterial({ color: new Color(color) }), group);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
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

function createCoastScreenInstances(): readonly BoxInstance[] {
  const { screen } = DISTRICT_DATA.coast;
  const minX = DISTRICT_DATA.coast.seaBounds.minX;
  const maxX = DISTRICT_DATA.coast.seaBounds.maxX;
  const cuts = screen.openings
    .map((opening) => ({
      start: Math.max(minX, Math.min(maxX, Math.min(opening.minX, opening.maxX))) - minX,
      end: Math.max(minX, Math.min(maxX, Math.max(opening.minX, opening.maxX))) - minX,
    }))
    .filter(({ start, end }) => end > start)
    .sort((first, second) => first.start - second.start);
  const intervals = remainingIntervals(maxX - minX, cuts);
  const segment = {
    from: { x: minX, z: screen.z },
    to: { x: maxX, z: screen.z },
  };
  const instances: BoxInstance[] = [];
  appendSegmentBoxes(
    instances,
    segment,
    intervals,
    screen.height,
    COAST_SCREEN_THICKNESS,
    COAST_SECTION_LENGTH,
  );
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
    appendPolylineStrip(roadPositions, centerline, road.width, LAYERS.road);
    const sidewalkOffset = road.width * 0.5 + road.sidewalkWidth * 0.5;
    for (const sidewalkCenterline of offsetPolylines(centerline, sidewalkOffset)) {
      appendPolylineStrip(
        sidewalkPositions,
        sidewalkCenterline,
        road.sidewalkWidth,
        LAYERS.sidewalk,
      );
    }
  }
  root.add(
    createSurfaceMesh(resources, group, 'street:roads', roadPositions, COLORS.road),
    createSurfaceMesh(resources, group, 'street:sidewalks', sidewalkPositions, COLORS.sidewalk),
  );

  const lawnPositions: number[] = [];
  const setbackPositions: number[] = [];
  for (const parcel of DISTRICT_DATA.parcels) {
    appendTerrainRect(lawnPositions, parcel.bounds, LAYERS.lawn);
    const setback = insetBounds(parcel.bounds, parcel.setback);
    if (setback !== null) appendTerrainRect(setbackPositions, setback, LAYERS.setback);
  }
  root.add(
    createSurfaceMesh(resources, group, 'street:parcel-lawns', lawnPositions, COLORS.parcelLawn),
    createSurfaceMesh(resources, group, 'street:setback-pads', setbackPositions, COLORS.setback),
  );

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

  const entranceApronPositions: number[] = [];
  const crosswalkPositions: number[] = [];
  for (const entrance of createPublicGreenEntrances()) {
    appendEntranceApron(entranceApronPositions, entrance);
    appendCrosswalk(crosswalkPositions, entrance);
  }
  root.add(
    createSurfaceMesh(
      resources,
      group,
      'street:public-green-entrance-aprons',
      entranceApronPositions,
      COLORS.entranceApron,
    ),
    createSurfaceMesh(
      resources,
      group,
      'street:public-green-crosswalks',
      crosswalkPositions,
      COLORS.crosswalk,
    ),
  );

  const promenadePositions: number[] = [];
  appendPolylineStrip(
    promenadePositions,
    DISTRICT_DATA.coast.promenade.centerline,
    DISTRICT_DATA.coast.promenade.width,
    LAYERS.promenade,
  );
  root.add(createSurfaceMesh(
    resources,
    group,
    'street:coastal-promenade',
    promenadePositions,
    COLORS.promenade,
  ));

  const seaBounds = DISTRICT_DATA.coast.seaBounds;
  const seaGeometry = resources.register(new PlaneGeometry(
    seaBounds.maxX - seaBounds.minX,
    seaBounds.maxZ - seaBounds.minZ,
  ), group);
  const seaMaterial = resources.register(new MeshBasicMaterial({ color: new Color(COLORS.sea) }), group);
  const sea = new Mesh(seaGeometry, seaMaterial);
  sea.name = 'street:noncollidable-sea';
  sea.rotation.x = -Math.PI * 0.5;
  sea.position.set(
    (seaBounds.minX + seaBounds.maxX) * 0.5,
    sampleGroundHeight(0, DISTRICT_DATA.coast.edgeZ) + SEA_LEVEL_OFFSET,
    (seaBounds.minZ + seaBounds.maxZ) * 0.5,
  );
  root.add(sea);

  const unitBox = resources.register(new BoxGeometry(1, 1, 1), group);
  const wallMaterial = resources.register(new MeshBasicMaterial({ color: new Color(COLORS.wall) }), group);
  const gateMaterial = resources.register(new MeshBasicMaterial({ color: new Color(COLORS.gate) }), group);
  const coastMaterial = resources.register(new MeshBasicMaterial({ color: new Color(COLORS.coastScreen) }), group);
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
  const coastScreen = createInstancedBoxes(
    resources,
    group,
    'street:coastal-view-screen',
    unitBox,
    coastMaterial,
    createCoastScreenInstances(),
  );
  if (walls !== null) root.add(walls);
  if (gates !== null) root.add(gates);
  if (coastScreen !== null) root.add(coastScreen);

  return root;
}
