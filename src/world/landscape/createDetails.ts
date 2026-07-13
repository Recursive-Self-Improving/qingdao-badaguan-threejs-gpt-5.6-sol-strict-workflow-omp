import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D as TransformObject,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry,
  type Object3D,
} from 'three';

import { sampleGroundHeight } from '../../exploration/navigation';
import type { ResourceRegistry } from '../../render/ResourceRegistry';
import { DISTRICT_DATA } from '../districtData';
import type {
  Bounds2,
  DistrictData,
  LandscapeClearanceBound,
  LandscapeDensity,
  RoadId,
  Vec2,
  VegetationSpecies,
} from '../types';

export interface DetailVegetationAnchor {
  readonly id: string;
  readonly roadId: RoadId;
  readonly species: VegetationSpecies;
  readonly identity: boolean;
  readonly position: Vec2;
}

/** Structural seam accepted directly by the vegetation factory's immutable layout. */
export interface DetailVegetationLayout {
  readonly instances: readonly DetailVegetationAnchor[];
}

export interface CreateDetailsOptions {
  readonly density: LandscapeDensity;
  readonly vegetationLayout: DetailVegetationLayout;
  readonly data?: DistrictData;
}

export interface DetailKindCounts {
  readonly leafLitter: number;
  readonly understory: number;
  readonly gardenUnderstory: number;
  readonly publicGreenUnderstory: number;
  readonly roadsideUnderstory: number;
  readonly benches: number;
  readonly stoneBenches: number;
  readonly woodBenches: number;
  readonly lamps: number;
  readonly bollards: number;
  readonly shoreDetails: number;
  readonly total: number;
}

export interface DetailBuildMetrics {
  readonly density: LandscapeDensity;
  /** Logical authored details; multi-part fixtures may use more than one GPU instance. */
  readonly counts: DetailKindCounts;
  readonly logicalDetailCount: number;
  readonly totalInstances: number;
  readonly triangles: number;
  readonly drawCalls: number;
  readonly sharedGeometryCount: number;
  readonly sharedMaterialCount: number;
  readonly instanceBatchCount: number;
  readonly naiveRepeatedDrawCalls: number;
  readonly placementChecksum: number;
  readonly rejectedCandidates: number;
  readonly clearanceIntersections: 0;
  readonly transparentObjects: 0;
  readonly depthWriteDisabled: 0;
  readonly collidable: false;
}

export interface DetailBuildResult {
  readonly root: Object3D;
  readonly metrics: DetailBuildMetrics;
  readonly clearanceBounds: readonly LandscapeClearanceBound[];
}

type DetailKind = 'leaf-litter' | 'understory' | 'bench' | 'lamp' | 'bollard' | 'shore-detail';
type DetailVariant =
  | 'ginkgo-leaf'
  | 'maple-leaf'
  | 'leaf-accent'
  | 'garden-shrub'
  | 'public-green-shrub'
  | 'roadside-juniper-shrub'
  | 'stone-bench'
  | 'wood-bench'
  | 'heritage-lamp'
  | 'heritage-bollard'
  | 'shore-stone';
type DetailGeometryId = 'unit-box' | 'unit-cylinder' | 'unit-leaf' | 'unit-shrub' | 'unit-stone';
type DetailMaterialId =
  | 'ginkgo-litter'
  | 'maple-litter'
  | 'litter-accent'
  | 'garden-understory'
  | 'public-green-understory'
  | 'weathered-wood'
  | 'restrained-stone'
  | 'dark-heritage-metal'
  | 'warm-opaque-lantern';
type DetailBatchId =
  | 'leaf-litter'
  | 'shrub-understory'
  | 'stone-bench'
  | 'wood-bench'
  | 'lamp'
  | 'bollard'
  | 'shore';
 

interface DetailCandidate {
  readonly id: string;
  readonly roadId: RoadId | null;
  readonly kind: DetailKind;
  readonly variant: DetailVariant;
  readonly position: Vec2;
  readonly yaw: number;
  readonly radius: number;
}

interface SampledPolylinePoint {
  readonly position: Vec2;
  readonly tangent: Vec2;
}

interface DetailInstance {
  readonly id: string;
  readonly batchId: DetailBatchId;
  readonly geometryId: DetailGeometryId;
  readonly materialId: DetailMaterialId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotationX: number;
  readonly rotationY: number;
  readonly rotationZ: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
}

interface DetailBatch {
  readonly batchId: DetailBatchId;
  readonly geometryId: DetailGeometryId;
  readonly materialId: DetailMaterialId;
  readonly instances: DetailInstance[];
}

interface PlacementContext {
  readonly data: DistrictData;
  readonly accepted: DetailCandidate[];
  rejectedCandidates: number;
}

interface DetailPlan {
  readonly data: DistrictData;
  readonly instances: readonly DetailInstance[];
  readonly batches: readonly DetailBatch[];
  readonly metrics: DetailBuildMetrics;
  readonly clearanceBounds: readonly LandscapeClearanceBound[];
}

const DENSITY_STRIDE: Readonly<Record<LandscapeDensity, number>> = {
  high: 1,
  medium: 2,
  low: 3,
};

const ROAD_CLEARANCE_MARGIN = 0.6;
const SITE_CLEARANCE = 1;
const PATH_CLEARANCE_MARGIN = 0.65;
const PROMENADE_CLEARANCE_MARGIN = 0.35;
const SIGHTLINE_HALF_WIDTH = 5.5;
const ROUTE_ANCHOR_CLEARANCE = 3;
const ACCESS_APRON_CLEARANCE = 4;
const WALL_CLEARANCE = 0.7;
const OPENING_APPROACH_CLEARANCE = 2;
const DETAIL_SPACING = 0.75;
const ROAD_DETAIL_OFFSET = 12.6;
const PUBLIC_GREEN_INSET = 4;
const GARDEN_GRID_SPACING = 5.5;
const PUBLIC_GREEN_GRID_SPACING = 8.5;
const ROADSIDE_JUNIPER_OFFSET = 4;
const ROADSIDE_JUNIPER_RADIUS = 1.7;
const ROADSIDE_JUNIPER_WIDTH = 3.2;
const ROADSIDE_JUNIPER_HEIGHT = 1.15;
const ROADSIDE_JUNIPER_DEPTH = 1.8;
const SHORE_DETAIL_Z_MIN = 29;
const SHORE_DETAIL_Z_MAX = 31;
const TWO_PI = Math.PI * 2;
const SHARED_GEOMETRY_COUNT = 5;
const SHARED_MATERIAL_COUNT = 9;
const TRIANGLES_BY_GEOMETRY: Readonly<Record<DetailGeometryId, number>> = {
  'unit-box': 12,
  'unit-cylinder': 32,
  'unit-leaf': 2,
  'unit-shrub': 56,
  'unit-stone': 36,
};

const MATERIAL_COLORS = {
  litterAccent: 0x8e7543,
  gardenUnderstory: 0x405a39,
  publicGreenUnderstory: 0x526b42,
  weatheredWood: 0x6a4e35,
  restrainedStone: 0x777268,
  darkHeritageMetal: 0x3e403b,
  warmOpaqueLantern: 0xb68342,
} as const;

function freezeBounds(bounds: Bounds2): Bounds2 {
  return Object.freeze({
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
  });
}

function insetBounds(bounds: Bounds2, inset: number): Bounds2 | null {
  const next = {
    minX: bounds.minX + inset,
    maxX: bounds.maxX - inset,
    minZ: bounds.minZ + inset,
    maxZ: bounds.maxZ - inset,
  };
  return next.minX < next.maxX && next.minZ < next.maxZ ? next : null;
}

function containsPoint(bounds: Bounds2, point: Vec2, padding = 0): boolean {
  return point.x >= bounds.minX + padding
    && point.x <= bounds.maxX - padding
    && point.z >= bounds.minZ + padding
    && point.z <= bounds.maxZ - padding;
}

function pointInExpandedBounds(point: Vec2, bounds: Bounds2, expansion: number): boolean {
  return point.x >= bounds.minX - expansion
    && point.x <= bounds.maxX + expansion
    && point.z >= bounds.minZ - expansion
    && point.z <= bounds.maxZ + expansion;
}

function pointToSegmentDistance(point: Vec2, from: Vec2, to: Vec2): number {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.z - from.z);
  const projection = Math.max(0, Math.min(1,
    ((point.x - from.x) * deltaX + (point.z - from.z) * deltaZ) / lengthSquared,
  ));
  return Math.hypot(
    point.x - (from.x + deltaX * projection),
    point.z - (from.z + deltaZ * projection),
  );
}

function pointToPolylineDistance(point: Vec2, points: readonly Vec2[]): number {
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (from === undefined || to === undefined) continue;
    closest = Math.min(closest, pointToSegmentDistance(point, from, to));
  }
  return closest;
}

function samplePolyline(points: readonly Vec2[], progress: number): SampledPolylinePoint | null {
  if (points.length < 2) return null;
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (from === undefined || to === undefined) continue;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    segmentLengths.push(length);
    totalLength += length;
  }
  if (totalLength === 0) return null;

  const targetDistance = Math.max(0, Math.min(1, progress)) * totalLength;
  let traversed = 0;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index];
    const from = points[index];
    const to = points[index + 1];
    if (length === undefined || from === undefined || to === undefined || length === 0) continue;
    if (targetDistance <= traversed + length || index === segmentLengths.length - 1) {
      const local = Math.max(0, Math.min(1, (targetDistance - traversed) / length));
      return {
        position: {
          x: from.x + (to.x - from.x) * local,
          z: from.z + (to.z - from.z) * local,
        },
        tangent: {
          x: (to.x - from.x) / length,
          z: (to.z - from.z) / length,
        },
      };
    }
    traversed += length;
  }
  return null;
}

function hashString(value: string, seed = 0): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function unitHash(value: string, salt: number): number {
  return hashString(value, salt) / 0x1_0000_0000;
}

function yawForTangent(tangent: Vec2): number {
  return Math.atan2(-tangent.z, tangent.x);
}

function offsetPoint(sample: SampledPolylinePoint, offset: number): Vec2 {
  return {
    x: sample.position.x - sample.tangent.z * offset,
    z: sample.position.z + sample.tangent.x * offset,
  };
}


function isFixedClear(candidate: DetailCandidate, data: DistrictData): boolean {
  if (!containsPoint(data.worldBounds, candidate.position, candidate.radius)) return false;

  for (const road of data.roads) {
    const points = [road.centerline.from, ...road.centerline.via, road.centerline.to];
    const protectedRadius = road.width * 0.5
      + road.sidewalkWidth
      + ROAD_CLEARANCE_MARGIN
      + candidate.radius;
    if (pointToPolylineDistance(candidate.position, points) <= protectedRadius) return false;
  }

  for (const footprint of data.collisionFootprints) {
    if (pointInExpandedBounds(candidate.position, footprint.bounds, SITE_CLEARANCE + candidate.radius)) {
      return false;
    }
  }

  for (const path of data.publicGreen.paths) {
    const protectedRadius = path.width * 0.5 + PATH_CLEARANCE_MARGIN + candidate.radius;
    if (pointToPolylineDistance(candidate.position, path.centerline) <= protectedRadius) return false;
    for (const endpoint of [path.centerline[0], path.centerline[path.centerline.length - 1]]) {
      if (endpoint !== undefined
        && Math.hypot(candidate.position.x - endpoint.x, candidate.position.z - endpoint.z)
          <= ACCESS_APRON_CLEARANCE + candidate.radius) {
        return false;
      }
    }
  }

  const promenade = data.coast.promenade;
  const promenadeRadius = promenade.width * 0.5 + PROMENADE_CLEARANCE_MARGIN + candidate.radius;
  if (pointToPolylineDistance(candidate.position, promenade.centerline) <= promenadeRadius) return false;

  for (const parcel of data.parcels) {
    for (const wall of parcel.wallSegments) {
      if (pointToSegmentDistance(candidate.position, wall.from, wall.to)
        <= WALL_CLEARANCE + candidate.radius) {
        return false;
      }
    }
    for (const gate of parcel.gates) {
      if (Math.hypot(candidate.position.x - gate.position.x, candidate.position.z - gate.position.z)
        <= gate.width * 0.5 + ACCESS_APRON_CLEARANCE + candidate.radius) {
        return false;
      }
    }
  }

  for (const anchor of data.routeAnchors) {
    if (Math.hypot(candidate.position.x - anchor.position.x, candidate.position.z - anchor.position.z)
      <= ROUTE_ANCHOR_CLEARANCE + candidate.radius) {
      return false;
    }
  }

  for (const sightline of data.sightlines) {
    if (pointToSegmentDistance(candidate.position, sightline.from, sightline.toward)
      <= SIGHTLINE_HALF_WIDTH + candidate.radius) {
      return false;
    }
  }

  for (const view of data.landscapeCameraViews) {
    if (pointInExpandedBounds(candidate.position, view.clearanceBounds, candidate.radius)) return false;
  }

  const promenadeZ = promenade.centerline[0]?.z ?? data.coast.screen.z;
  const openingApproachStart = promenadeZ - promenade.width * 0.5 - OPENING_APPROACH_CLEARANCE;
  if (candidate.position.z >= openingApproachStart) {
    for (const opening of data.coast.screen.openings) {
      if (candidate.position.x >= opening.minX - OPENING_APPROACH_CLEARANCE - candidate.radius
        && candidate.position.x <= opening.maxX + OPENING_APPROACH_CLEARANCE + candidate.radius) {
        return false;
      }
    }
  }

  return true;
}

function overlapsAccepted(candidate: DetailCandidate, accepted: readonly DetailCandidate[]): boolean {
  if (candidate.kind === 'leaf-litter') return false;
  return accepted.some((placed) => placed.kind !== 'leaf-litter'
    && Math.hypot(
      candidate.position.x - placed.position.x,
      candidate.position.z - placed.position.z,
    ) < candidate.radius + placed.radius + DETAIL_SPACING);
}

function selectDensity<T>(values: readonly T[], density: LandscapeDensity): readonly T[] {
  const stride = DENSITY_STRIDE[density];
  return values.filter((_value, index) => index % stride === 0);
}

function acceptCandidateGroup(
  candidates: readonly DetailCandidate[],
  density: LandscapeDensity,
  context: PlacementContext,
  requireOne: boolean,
): void {
  const eligible: DetailCandidate[] = [];
  for (const candidate of candidates) {
    if (!isFixedClear(candidate, context.data)) {
      context.rejectedCandidates += 1;
      continue;
    }
    eligible.push(candidate);
  }

  const selected = selectDensity(eligible, density);
  let acceptedFromGroup = 0;
  const tryAccept = (candidate: DetailCandidate): boolean => {
    if (overlapsAccepted(candidate, context.accepted)) {
      context.rejectedCandidates += 1;
      return false;
    }
    context.accepted.push(candidate);
    acceptedFromGroup += 1;
    return true;
  };

  for (const candidate of selected) tryAccept(candidate);
  if (!requireOne || acceptedFromGroup !== 0) return;
  const selectedIds = new Set(selected.map(({ id }) => id));
  for (const candidate of eligible) {
    if (selectedIds.has(candidate.id)) continue;
    if (tryAccept(candidate)) return;
  }
}

function createGardenBenchCandidates(data: DistrictData): readonly DetailCandidate[] {
  const candidates: DetailCandidate[] = [];
  for (let index = 0; index < data.parcels.length; index += 1) {
    const parcel = data.parcels[index];
    if (parcel === undefined) continue;
    const interior = insetBounds(parcel.bounds, parcel.setback);
    if (interior === null) continue;
    const middleX = (interior.minX + interior.maxX) * 0.5;
    const middleZ = (interior.minZ + interior.maxZ) * 0.5;
    const position = index % 3 === 0
      ? { x: interior.maxX - 2.4, z: middleZ }
      : index % 3 === 1
        ? { x: middleX, z: middleZ }
        : { x: interior.minX + 2.4, z: middleZ };
    const variant: DetailVariant = index % 2 === 0 ? 'wood-bench' : 'stone-bench';
    candidates.push({
      id: `garden-bench:${parcel.id}`,
      roadId: null,
      kind: 'bench',
      variant,
      position,
      yaw: 0,
      radius: 1.65,
    });
  }
  return candidates;
}

function createPublicGreenBenchCandidates(data: DistrictData): readonly DetailCandidate[] {
  const candidates: DetailCandidate[] = [];
  for (let pathIndex = 0; pathIndex < data.publicGreen.paths.length; pathIndex += 1) {
    const path = data.publicGreen.paths[pathIndex];
    if (path === undefined) continue;
    const fractions: readonly [number, number, number] = [0.22, 0.5, 0.78];
    let index = 0;
    for (const fraction of fractions) {
      const currentIndex = index;
      index += 1;
      const sample = samplePolyline(path.centerline, fraction);
      if (sample === null) continue;
      const side = unitHash(`${path.id}:${currentIndex}`, 11) < 0.5 ? -1 : 1;
      const position = offsetPoint(sample, side * (path.width * 0.5 + 3.25));
      if (!containsPoint(data.publicGreen.bounds, position, 1.65)) continue;
      candidates.push({
        id: `public-green-bench:${path.id}:${currentIndex}`,
        roadId: null,
        kind: 'bench',
        variant: (pathIndex + currentIndex) % 2 === 0 ? 'stone-bench' : 'wood-bench',
        position,
        yaw: yawForTangent(sample.tangent),
        radius: 1.65,
      });
    }
  }
  return candidates;
}

function createLampCandidates(data: DistrictData): readonly DetailCandidate[] {
  const candidates: DetailCandidate[] = [];
  const fractions: readonly [number, number, number, number] = [0.14, 0.34, 0.66, 0.86];
  for (const road of data.roads) {
    const points = [road.centerline.from, ...road.centerline.via, road.centerline.to];
    const roadId = data.roadPlantingCues.find((cue) => cue.roadId === road.id)?.roadId ?? null;
    let index = 0;
    for (const fraction of fractions) {
      const currentIndex = index;
      index += 1;
      const sample = samplePolyline(points, fraction);
      if (sample === null) continue;
      const side = unitHash(`${road.id}:${currentIndex}`, 23) < 0.5 ? -1 : 1;
      candidates.push({
        id: `heritage-lamp:${road.id}:${currentIndex}`,
        roadId,
        kind: 'lamp',
        variant: 'heritage-lamp',
        position: offsetPoint(sample, side * ROAD_DETAIL_OFFSET),
        yaw: 0,
        radius: 0.42,
      });
    }
  }
  return candidates;
}

function createBollardCandidates(data: DistrictData): readonly DetailCandidate[] {
  const candidates: DetailCandidate[] = [];
  const z = Math.max(
    SHORE_DETAIL_Z_MIN,
    Math.min(SHORE_DETAIL_Z_MAX, data.coast.edgeZ - 8.8),
  );
  let index = 0;
  for (let x = data.worldBounds.minX + 22; x <= data.worldBounds.maxX - 22; x += 32) {
    candidates.push({
      id: `shore-bollard:${index}`,
      roadId: null,
      kind: 'bollard',
      variant: 'heritage-bollard',
      position: { x, z },
      yaw: 0,
      radius: 0.22,
    });
    index += 1;
  }
  return candidates;
}

function createShoreCandidates(data: DistrictData): readonly DetailCandidate[] {
  const candidates: DetailCandidate[] = [];
  let index = 0;
  for (let x = data.worldBounds.minX + 16; x <= data.worldBounds.maxX - 16; x += 24) {
    const jitter = (unitHash(`shore-stone:${index}`, 31) - 0.5) * 0.4;
    const z = Math.max(
      SHORE_DETAIL_Z_MIN,
      Math.min(SHORE_DETAIL_Z_MAX, data.coast.edgeZ - 8.65 + jitter),
    );
    candidates.push({
      id: `shore-stone:${index}`,
      roadId: null,
      kind: 'shore-detail',
      variant: 'shore-stone',
      position: { x, z },
      yaw: unitHash(`shore-stone:${index}`, 37) * TWO_PI,
      radius: 0.92,
    });
    index += 1;
  }
  return candidates;
}

function gridCandidates(
  idPrefix: string,
  bounds: Bounds2,
  spacing: number,
  variant: 'garden-shrub' | 'public-green-shrub',
): readonly DetailCandidate[] {
  const candidates: DetailCandidate[] = [];
  let index = 0;
  for (let z = bounds.minZ + 1.2; z <= bounds.maxZ - 1.2; z += spacing) {
    for (let x = bounds.minX + 1.2; x <= bounds.maxX - 1.2; x += spacing) {
      const id = `${idPrefix}:${index}`;
      const jitterX = (unitHash(id, 41) - 0.5) * Math.min(1.6, spacing * 0.22);
      const jitterZ = (unitHash(id, 43) - 0.5) * Math.min(1.6, spacing * 0.22);
      candidates.push({
        id,
        roadId: null,
        kind: 'understory',
        variant,
        position: { x: x + jitterX, z: z + jitterZ },
        yaw: unitHash(id, 47) * TWO_PI,
        radius: 0.86,
      });
      index += 1;
    }
  }
  return candidates;
}

function createGardenUnderstoryCandidates(data: DistrictData): readonly DetailCandidate[] {
  const candidates: DetailCandidate[] = [];
  for (const parcel of data.parcels) {
    const interior = insetBounds(parcel.bounds, parcel.setback);
    if (interior === null) continue;
    candidates.push(...gridCandidates(
      `garden-understory:${parcel.id}`,
      interior,
      GARDEN_GRID_SPACING,
      'garden-shrub',
    ));
  }
  return candidates;
}

function createPublicGreenUnderstoryCandidates(data: DistrictData): readonly DetailCandidate[] {
  const interior = insetBounds(data.publicGreen.bounds, PUBLIC_GREEN_INSET);
  return interior === null
    ? []
    : gridCandidates(
      `public-green-understory:${data.publicGreen.id}`,
      interior,
      PUBLIC_GREEN_GRID_SPACING,
      'public-green-shrub',
    );
}

function createRoadsideJuniperUnderstoryCandidate(
  layout: DetailVegetationLayout,
  data: DistrictData,
): DetailCandidate | null {
  const anchor = layout.instances.find(
    ({ species, identity }) => species === 'chinese-juniper' && identity,
  );
  if (anchor === undefined) return null;
  const road = data.roads.find(({ id }) => id === anchor.roadId);
  if (road === undefined) return null;
  const from = road.centerline.from;
  const to = road.centerline.to;
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  if (length <= 0) return null;
  const tangent = { x: (to.x - from.x) / length, z: (to.z - from.z) / length };
  const id = `roadside-juniper-understory:${anchor.id}`;
  return {
    id,
    roadId: anchor.roadId,
    kind: 'understory',
    variant: 'roadside-juniper-shrub',
    position: {
      x: anchor.position.x + tangent.x * ROADSIDE_JUNIPER_OFFSET,
      z: anchor.position.z + tangent.z * ROADSIDE_JUNIPER_OFFSET,
    },
    yaw: Math.atan2(-tangent.z, tangent.x),
    radius: ROADSIDE_JUNIPER_RADIUS,
  };
}

function replacePublicGreenUnderstoryWithRoadsideJuniper(
  layout: DetailVegetationLayout,
  context: PlacementContext,
): void {
  const replacement = createRoadsideJuniperUnderstoryCandidate(layout, context.data);
  if (replacement === null
    || !isFixedClear(replacement, context.data)
    || overlapsAccepted(replacement, context.accepted)) return;
  const replacementIndex = context.accepted.findIndex(
    ({ variant }) => variant === 'public-green-shrub',
  );
  if (replacementIndex >= 0) context.accepted[replacementIndex] = replacement;
}

function addLeafLitter(
  layout: DetailVegetationLayout,
  density: LandscapeDensity,
  context: PlacementContext,
): void {
  const slotsPerAnchor: Readonly<Record<LandscapeDensity, number>> = {
    high: 3,
    medium: 2,
    low: 1,
  };
  const anchors = [...layout.instances]
    .filter(({ species }) => species === 'ginkgo' || species === 'maple')
    .sort((first, second) => first.id.localeCompare(second.id));

  for (const anchor of anchors) {
    if (!Number.isFinite(anchor.position.x) || !Number.isFinite(anchor.position.z)) {
      throw new RangeError(`Vegetation anchor "${anchor.id}" has a non-finite position.`);
    }
    for (let slot = 0; slot < slotsPerAnchor[density]; slot += 1) {
      let placed = false;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const key = `${anchor.id}:${slot}:${attempt}`;
        const angle = unitHash(key, 53) * TWO_PI;
        const distance = 1 + unitHash(key, 59) * 1.8;
        const useAccent = density === 'high' && slot === slotsPerAnchor.high - 1;
        const candidate: DetailCandidate = {
          id: `leaf-litter:${anchor.id}:${slot}`,
          roadId: anchor.roadId,
          kind: 'leaf-litter',
          variant: useAccent
            ? 'leaf-accent'
            : anchor.species === 'ginkgo' ? 'ginkgo-leaf' : 'maple-leaf',
          position: {
            x: anchor.position.x + Math.cos(angle) * distance,
            z: anchor.position.z + Math.sin(angle) * distance,
          },
          yaw: unitHash(key, 61) * TWO_PI,
          radius: 0.22,
        };
        if (!isFixedClear(candidate, context.data)) {
          context.rejectedCandidates += 1;
          continue;
        }
        context.accepted.push(candidate);
        placed = true;
        break;
      }
      if (!placed) context.rejectedCandidates += 1;
    }
  }
}

function createSharedGeometries(
  resources: ResourceRegistry,
  group: string,
): ReadonlyMap<DetailGeometryId, BufferGeometry> {
  const leaf = new PlaneGeometry(1, 1);
  leaf.rotateX(-Math.PI * 0.5);
  const definitions: readonly (readonly [DetailGeometryId, BufferGeometry])[] = [
    ['unit-box', new BoxGeometry(1, 1, 1)],
    ['unit-cylinder', new CylinderGeometry(0.5, 0.5, 1, 8, 1, false)],
    ['unit-leaf', leaf],
    ['unit-shrub', new SphereGeometry(0.5, 7, 5)],
    ['unit-stone', new DodecahedronGeometry(0.5, 0)],
  ];
  const geometries = new Map<DetailGeometryId, BufferGeometry>();
  for (const [id, geometry] of definitions) {
    geometry.name = `landscape:details:${id}`;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometries.set(id, resources.register(geometry, group));
  }
  return geometries;
}

function litterColor(data: DistrictData, species: 'ginkgo' | 'maple', fallback: number): Color {
  const color = data.roadPlantingCues.find((cue) => cue.species === species)?.palette.litter;
  return new Color(color ?? fallback);
}

function createSharedMaterials(
  resources: ResourceRegistry,
  group: string,
  data: DistrictData,
): ReadonlyMap<DetailMaterialId, MeshBasicMaterial> {
  const definitions: readonly (readonly [DetailMaterialId, Color | number])[] = [
    ['ginkgo-litter', litterColor(data, 'ginkgo', 0xb89c35)],
    ['maple-litter', litterColor(data, 'maple', 0x9b5830)],
    ['litter-accent', MATERIAL_COLORS.litterAccent],
    ['garden-understory', MATERIAL_COLORS.gardenUnderstory],
    ['public-green-understory', MATERIAL_COLORS.publicGreenUnderstory],
    ['weathered-wood', MATERIAL_COLORS.weatheredWood],
    ['restrained-stone', MATERIAL_COLORS.restrainedStone],
    ['dark-heritage-metal', MATERIAL_COLORS.darkHeritageMetal],
    ['warm-opaque-lantern', MATERIAL_COLORS.warmOpaqueLantern],
  ];
  const materials = new Map<DetailMaterialId, MeshBasicMaterial>();
  for (const [id, color] of definitions) {
    const material = new MeshBasicMaterial({
      color,
      transparent: false,
      opacity: 1,
      depthTest: true,
      depthWrite: true,
      toneMapped: true,
    });
    material.name = `landscape:details:${id}`;
    materials.set(id, resources.register(material, group));
  }
  return materials;
}

function requireMapValue<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing shared landscape detail ${label}.`);
  return value;
}

function rotatedOffset(position: Vec2, yaw: number, localX: number, localZ: number): Vec2 {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return {
    x: position.x + cosine * localX + sine * localZ,
    z: position.z - sine * localX + cosine * localZ,
  };
}

function appendInstance(
  instances: DetailInstance[],
  placement: DetailCandidate,
  componentId: string,
  geometryId: DetailGeometryId,
  materialId: DetailMaterialId,
  localX: number,
  localY: number,
  localZ: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  rotationX = 0,
  rotationY = placement.yaw,
  rotationZ = 0,
): void {
  const position = rotatedOffset(placement.position, placement.yaw, localX, localZ);
  const batchId: DetailBatchId = placement.kind === 'leaf-litter'
    ? 'leaf-litter'
    : placement.kind === 'understory'
      ? 'shrub-understory'
      : placement.kind === 'bench'
        ? placement.variant === 'stone-bench' ? 'stone-bench' : 'wood-bench'
        : placement.kind === 'lamp'
          ? 'lamp'
          : placement.kind === 'bollard' ? 'bollard' : 'shore';
  instances.push({
    id: `${placement.id}:${componentId}`,
    batchId,
    geometryId,
    materialId,
    x: position.x,
    y: sampleGroundHeight(position.x, position.z) + localY,
    z: position.z,
    rotationX,
    rotationY,
    rotationZ,
    scaleX,
    scaleY,
    scaleZ,
  });
}

function appendBenchInstances(instances: DetailInstance[], placement: DetailCandidate): void {
  if (placement.variant === 'stone-bench') {
    appendInstance(instances, placement, 'seat', 'unit-box', 'restrained-stone', 0, 0.66, 0, 2.7, 0.22, 0.62);
    appendInstance(instances, placement, 'support-west', 'unit-box', 'restrained-stone', -0.9, 0.34, 0, 0.32, 0.58, 0.5);
    appendInstance(instances, placement, 'support-east', 'unit-box', 'restrained-stone', 0.9, 0.34, 0, 0.32, 0.58, 0.5);
    return;
  }
  appendInstance(instances, placement, 'seat', 'unit-box', 'weathered-wood', 0, 0.68, 0, 2.75, 0.18, 0.56);
  appendInstance(instances, placement, 'back', 'unit-box', 'weathered-wood', 0, 1.03, 0.24, 2.75, 0.55, 0.13);
  appendInstance(instances, placement, 'leg-west', 'unit-box', 'dark-heritage-metal', -0.92, 0.35, 0, 0.16, 0.58, 0.44);
  appendInstance(instances, placement, 'leg-east', 'unit-box', 'dark-heritage-metal', 0.92, 0.35, 0, 0.16, 0.58, 0.44);
}

function appendLampInstances(instances: DetailInstance[], placement: DetailCandidate): void {
  appendInstance(instances, placement, 'base', 'unit-cylinder', 'dark-heritage-metal', 0, 0.14, 0, 0.34, 0.28, 0.34);
  appendInstance(instances, placement, 'post', 'unit-cylinder', 'dark-heritage-metal', 0, 1.55, 0, 0.16, 2.9, 0.16);
  appendInstance(instances, placement, 'lantern', 'unit-box', 'warm-opaque-lantern', 0, 3.2, 0, 0.42, 0.5, 0.42);
  appendInstance(instances, placement, 'cap', 'unit-box', 'dark-heritage-metal', 0, 3.5, 0, 0.54, 0.12, 0.54);
}

function appendBollardInstances(instances: DetailInstance[], placement: DetailCandidate): void {
  appendInstance(instances, placement, 'post', 'unit-cylinder', 'dark-heritage-metal', 0, 0.42, 0, 0.2, 0.78, 0.2);
  appendInstance(instances, placement, 'cap', 'unit-cylinder', 'restrained-stone', 0, 0.84, 0, 0.28, 0.12, 0.28);
}

function appendShoreInstances(instances: DetailInstance[], placement: DetailCandidate): void {
  for (let index = 0; index < 2; index += 1) {
    const id = `${placement.id}:${index}`;
    const localX = index === 0 ? -0.28 : 0.34;
    const localZ = (unitHash(id, 67) - 0.5) * 0.4;
    const height = 0.5 + unitHash(id, 71) * 0.3;
    appendInstance(
      instances,
      placement,
      `stone-${index}`,
      'unit-stone',
      'restrained-stone',
      localX,
      height * 0.4,
      localZ,
      0.72 + unitHash(id, 73) * 0.35,
      height,
      0.62 + unitHash(id, 79) * 0.3,
      0,
      placement.yaw + unitHash(id, 83) * Math.PI,
      0,
    );
  }
}

function appendPlacementInstances(instances: DetailInstance[], placement: DetailCandidate): void {
  switch (placement.kind) {
    case 'leaf-litter': {
      const materialId: DetailMaterialId = placement.variant === 'ginkgo-leaf'
        ? 'ginkgo-litter'
        : placement.variant === 'maple-leaf' ? 'maple-litter' : 'litter-accent';
      const tiltX = (unitHash(placement.id, 89) - 0.5) * 0.12;
      const tiltZ = (unitHash(placement.id, 97) - 0.5) * 0.12;
      appendInstance(
        instances,
        placement,
        'leaf',
        'unit-leaf',
        materialId,
        0,
        0.11,
        0,
        0.32 + unitHash(placement.id, 101) * 0.12,
        1,
        0.16 + unitHash(placement.id, 103) * 0.08,
        tiltX,
        placement.yaw,
        tiltZ,
      );
      return;
    }
    case 'understory': {
      const roadsideJuniper = placement.variant === 'roadside-juniper-shrub';
      const materialId: DetailMaterialId = placement.variant === 'public-green-shrub'
        ? 'public-green-understory'
        : 'garden-understory';
      const width = roadsideJuniper
        ? ROADSIDE_JUNIPER_WIDTH
        : 1.15 + unitHash(placement.id, 107) * 0.5;
      const height = roadsideJuniper
        ? ROADSIDE_JUNIPER_HEIGHT
        : 0.85 + unitHash(placement.id, 109) * 0.45;
      const depth = roadsideJuniper
        ? ROADSIDE_JUNIPER_DEPTH
        : width * (0.82 + unitHash(placement.id, 113) * 0.2);
      appendInstance(
        instances,
        placement,
        'shrub',
        'unit-shrub',
        materialId,
        0,
        height * 0.5,
        0,
        width,
        height,
        depth,
      );
      return;
    }
    case 'bench':
      appendBenchInstances(instances, placement);
      return;
    case 'lamp':
      appendLampInstances(instances, placement);
      return;
    case 'bollard':
      appendBollardInstances(instances, placement);
      return;
    case 'shore-detail':
      appendShoreInstances(instances, placement);
  }
}


function buildBatches(instances: readonly DetailInstance[]): readonly DetailBatch[] {
  const batches = new Map<string, DetailBatch>();
  for (const instance of instances) {
    const key = `${instance.batchId}:${instance.geometryId}:${instance.materialId}`;
    let batch = batches.get(key);
    if (batch === undefined) {
      batch = {
        batchId: instance.batchId,
        geometryId: instance.geometryId,
        materialId: instance.materialId,
        instances: [],
      };
      batches.set(key, batch);
    }
    batch.instances.push(instance);
  }
  return [...batches.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([, batch]) => ({
      ...batch,
      instances: batch.instances.sort((first, second) => first.id.localeCompare(second.id)),
    }));
}

function transformChecksum(instances: readonly DetailInstance[]): number {
  let checksum = 0x811c9dc5;
  const mix = (value: number): void => {
    checksum ^= value >>> 0;
    checksum = Math.imul(checksum, 0x01000193) >>> 0;
  };
  for (const instance of [...instances].sort((first, second) => first.id.localeCompare(second.id))) {
    mix(hashString(instance.id));
    mix(Math.round(instance.x * 1_000));
    mix(Math.round(instance.y * 1_000));
    mix(Math.round(instance.z * 1_000));
    mix(Math.round(instance.rotationY * 10_000));
    mix(Math.round(instance.scaleX * 1_000));
    mix(Math.round(instance.scaleY * 1_000));
    mix(Math.round(instance.scaleZ * 1_000));
  }
  return checksum >>> 0;
}

function detailCounts(placements: readonly DetailCandidate[]): DetailKindCounts {
  const leafLitter = placements.filter(({ kind }) => kind === 'leaf-litter').length;
  const gardenUnderstory = placements.filter(({ variant }) => variant === 'garden-shrub').length;
  const publicGreenUnderstory = placements.filter(({ variant }) => variant === 'public-green-shrub').length;
  const roadsideUnderstory = placements.filter(({ variant }) => variant === 'roadside-juniper-shrub').length;
  const stoneBenches = placements.filter(({ variant }) => variant === 'stone-bench').length;
  const woodBenches = placements.filter(({ variant }) => variant === 'wood-bench').length;
  const lamps = placements.filter(({ kind }) => kind === 'lamp').length;
  const bollards = placements.filter(({ kind }) => kind === 'bollard').length;
  const shoreDetails = placements.filter(({ kind }) => kind === 'shore-detail').length;
  return Object.freeze({
    leafLitter,
    understory: gardenUnderstory + publicGreenUnderstory + roadsideUnderstory,
    gardenUnderstory,
    publicGreenUnderstory,
    roadsideUnderstory,
    benches: stoneBenches + woodBenches,
    stoneBenches,
    woodBenches,
    lamps,
    bollards,
    shoreDetails,
    total: placements.length,
  });
}

function clearanceBounds(placements: readonly DetailCandidate[]): readonly LandscapeClearanceBound[] {
  return Object.freeze(placements.map((placement) => Object.freeze({
    id: `detail:${placement.id}`,
    roadId: placement.roadId,
    kind: 'detail' as const,
    bounds: freezeBounds({
      minX: placement.position.x - placement.radius,
      maxX: placement.position.x + placement.radius,
      minZ: placement.position.z - placement.radius,
      maxZ: placement.position.z + placement.radius,
    }),
  })));
}

function addFixtureAndUnderstoryPlacements(
  density: LandscapeDensity,
  context: PlacementContext,
): void {
  const gardenBenches = createGardenBenchCandidates(context.data);
  acceptCandidateGroup(
    gardenBenches.filter(({ variant }) => variant === 'stone-bench'),
    density,
    context,
    true,
  );
  acceptCandidateGroup(
    gardenBenches.filter(({ variant }) => variant === 'wood-bench'),
    density,
    context,
    true,
  );

  const publicBenches = createPublicGreenBenchCandidates(context.data);
  acceptCandidateGroup(
    publicBenches.filter(({ variant }) => variant === 'stone-bench'),
    density,
    context,
    false,
  );
  acceptCandidateGroup(
    publicBenches.filter(({ variant }) => variant === 'wood-bench'),
    density,
    context,
    false,
  );

  acceptCandidateGroup(createLampCandidates(context.data), density, context, true);
  acceptCandidateGroup(createBollardCandidates(context.data), density, context, true);
  acceptCandidateGroup(createShoreCandidates(context.data), density, context, true);
  acceptCandidateGroup(createGardenUnderstoryCandidates(context.data), density, context, true);
  acceptCandidateGroup(createPublicGreenUnderstoryCandidates(context.data), density, context, true);
}

function createDetailPlan(options: CreateDetailsOptions): DetailPlan {
  const { density, vegetationLayout } = options;
  if (density !== 'high' && density !== 'medium' && density !== 'low') {
    throw new RangeError('Landscape detail density must be high, medium, or low.');
  }
  const data = options.data ?? DISTRICT_DATA;
  const context: PlacementContext = {
    data,
    accepted: [],
    rejectedCandidates: 0,
  };
  addFixtureAndUnderstoryPlacements(density, context);
  replacePublicGreenUnderstoryWithRoadsideJuniper(vegetationLayout, context);
  addLeafLitter(vegetationLayout, density, context);

  const instances: DetailInstance[] = [];
  for (const placement of context.accepted) appendPlacementInstances(instances, placement);
  const batches = buildBatches(instances);
  const counts = detailCounts(context.accepted);
  const triangles = instances.reduce(
    (total, instance) => total + TRIANGLES_BY_GEOMETRY[instance.geometryId],
    0,
  );
  const metrics: DetailBuildMetrics = Object.freeze({
    density,
    counts,
    logicalDetailCount: counts.total,
    totalInstances: instances.length,
    triangles,
    drawCalls: batches.length,
    sharedGeometryCount: SHARED_GEOMETRY_COUNT,
    sharedMaterialCount: SHARED_MATERIAL_COUNT,
    instanceBatchCount: batches.length,
    naiveRepeatedDrawCalls: instances.length,
    placementChecksum: transformChecksum(instances),
    rejectedCandidates: context.rejectedCandidates,
    clearanceIntersections: 0,
    transparentObjects: 0,
    depthWriteDisabled: 0,
    collidable: false,
  });
  return {
    data,
    instances,
    batches,
    metrics,
    clearanceBounds: clearanceBounds(context.accepted),
  };
}

/** Computes exact active detail counts without allocating geometry, materials, or meshes. */
export function createDetailMetrics(options: CreateDetailsOptions): DetailBuildMetrics {
  return createDetailPlan(options).metrics;
}

/**
 * Builds deterministic, non-collidable landscape details from canonical district data and the
 * active vegetation layout. Every visible component is opaque, depth-writing, globally instanced,
 * and registered in the supplied generation resource group.
 */
export function createDetails(
  resources: ResourceRegistry,
  group: string,
  options: CreateDetailsOptions,
): DetailBuildResult {
  const plan = createDetailPlan(options);
  const root = new Group();
  root.name = 'landscape-details';
  root.userData['collidable'] = false;

  const geometries = createSharedGeometries(resources, group);
  const materials = createSharedMaterials(resources, group, plan.data);
  const transform = new TransformObject();

  for (const batch of plan.batches) {
    const geometry = requireMapValue(geometries, batch.geometryId, `geometry "${batch.geometryId}"`);
    const material = requireMapValue(materials, batch.materialId, `material "${batch.materialId}"`);
    const mesh = resources.register(new InstancedMesh(geometry, material, batch.instances.length), group);
    mesh.name = `landscape:details:instances:${batch.batchId}:${batch.geometryId}:${batch.materialId}`;
    mesh.userData['collidable'] = false;
    for (let index = 0; index < batch.instances.length; index += 1) {
      const instance = batch.instances[index];
      if (instance === undefined) continue;
      transform.position.set(instance.x, instance.y, instance.z);
      transform.rotation.set(instance.rotationX, instance.rotationY, instance.rotationZ);
      transform.scale.set(instance.scaleX, instance.scaleY, instance.scaleZ);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    root.add(mesh);
  }

  return Object.freeze({
    root,
    metrics: plan.metrics,
    clearanceBounds: plan.clearanceBounds,
  });
}
