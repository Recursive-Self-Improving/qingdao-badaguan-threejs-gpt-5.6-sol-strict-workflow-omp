import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D as TransformObject,
  SphereGeometry,
  type BufferGeometry,
} from 'three';

import { sampleGroundHeight } from '../../exploration/navigation';
import type { ResourceRegistry } from '../../render/ResourceRegistry';
import { DISTRICT_DATA, VEGETATION_LOD_POLICIES } from '../districtData';
import type {
  Bounds2,
  DistrictData,
  LandscapeBuildMetrics,
  LandscapeBuildResult,
  LandscapeCameraView,
  LandscapeClearanceBound,
  LandscapeDebugLayout,
  LandscapeDensity,
  LandscapeDensityMetrics,
  LandscapeSettings,
  LandscapeUpdateFrame,
  PlantingZone,
  RoadId,
  RoadPlantingCue,
  RoadSpec,
  Vec2,
  VegetationCategory,
  VegetationLodPolicy,
  VegetationSpecies,
} from '../types';


const SPECIES_LABELS = Object.freeze({
  peach: 'Peach',
  crabapple: 'Crabapple',
  cedar: 'Cedar',
  'crape-myrtle': 'Crape myrtle',
  maple: 'Maple',
  ginkgo: 'Ginkgo',
  'chinese-juniper': 'Chinese juniper',
  'plane-tree': 'Plane tree',
} as const satisfies Readonly<Record<VegetationSpecies, string>>);

const MINIMUM_VERGE_OFFSET = 12;
const MASTER_SAMPLE_SPACING = 29;
const SAMPLE_END_MARGIN = 17;
const ARCHITECTURE_CLEARANCE = 1;
const PARCEL_CLEARANCE = 0.75;
const WALL_CLEARANCE = 1;
const GATE_APRON_CLEARANCE = 3;
const PATH_APRON_CLEARANCE = 1.5;
const ROUTE_ANCHOR_CLEARANCE = 5.5;
const SIGHTLINE_HALF_WIDTH = 4.5;
const COAST_OPENING_DEPTH = 16;
const TREE_SEPARATION = 1.25;
const WIND_CLEARANCE_PADDING = 0.18;
const STANDARD_WIND_AMPLITUDE = 0.016;
const HASH_OFFSET = 0x811c9dc5;
const HASH_PRIME = 0x01000193;
const CRAPE_MYRTLE_IDENTITY_CANOPY_SCALE = 0.82;
const CRAPE_MYRTLE_NON_IDENTITY_CANOPY_SCALE = 0.45;
const WARM_CANOPY_TINT = '#eee5d6';
const SHAOGUAN_PEACH_TINT_PATTERN = Object.freeze([0.12, 0.22, 0.32] as const);
const JIAYUGUAN_MAPLE_FOLIAGE_PATTERN = Object.freeze(['#9b4b2e', '#bd6b2f'] as const);
const AVENUE_PLANE_CROWN_BLEND_PATTERN = Object.freeze([0.08, 0.48, 0.84] as const);
const AVENUE_PLANE_CROWN_SCALE_CEILING_PATTERN = Object.freeze([0.96, 1, 0.98, 1.02] as const);
const AVENUE_PLANE_CROWN_HEIGHT_RATIO = 0.88;
const AVENUE_PLANE_TRUNK_TINT = 0.72;
const AVENUE_PLANE_TRUNK_HEIGHT_SCALE = 1.35;
const AVENUE_PLANE_TRUNK_RADIUS_SCALE = 1.14;
const AVENUE_FOREIGN_NONIDENTITY_CLEARANCE = 21;
const WUSHENG_PRIORITY_CADENCE = Object.freeze([
  Object.freeze({ id: 'cadence-mid', centerlineZ: -150, vergeOffset: 13.25, sequence: 1, side: 'west' }),
  Object.freeze({ id: 'cadence-north', centerlineZ: -244, vergeOffset: 14, sequence: 2, side: 'west' }),
] as const);
const SHANHAIGUAN_PRIORITY_CADENCE = Object.freeze([
  Object.freeze({ id: 'cadence-south', centerlineZ: -58, vergeOffset: 13.25, sequence: 0, side: 'west' }),
  Object.freeze({ id: 'cadence-mid-south', centerlineZ: -100, vergeOffset: 13.5, sequence: 1, side: 'east' }),
  Object.freeze({ id: 'cadence-mid-north', centerlineZ: -195, vergeOffset: 13.5, sequence: 2, side: 'west' }),
  Object.freeze({ id: 'cadence-north', centerlineZ: -245, vergeOffset: 13.75, sequence: 3, side: 'east' }),
] as const);
const ACTIVE_LOD_BAND_ID = 'near' as const;

export type VegetationTier = 'identity' | 'infill' | 'accent';
export type VegetationCanopyForm = 'broad' | 'upright' | 'conifer' | 'columnar';

type VegetationGeometryId = 'trunk' | VegetationCanopyForm | 'accent';
type VegetationMaterialId =
  | 'trunk-palette'
  | 'avenue-plane-trunk-palette'
  | 'foliage-palette'
  | 'accent-palette';
type VergeSide = PlantingZone['side'];

export interface VegetationLayoutInstance {
  readonly id: string;
  readonly roadId: RoadId;
  readonly species: VegetationSpecies;
  readonly speciesLabel: string;
  readonly category: VegetationCategory;
  readonly tier: VegetationTier;
  readonly identity: boolean;
  readonly position: Vec2;
  readonly tangent: Vec2;
  readonly vergeSide: VergeSide;
  readonly vergeOffset: number;
  readonly canopyForm: VegetationCanopyForm;
  readonly trunkHeight: number;
  readonly trunkRadius: number;
  readonly canopyCenterHeight: number;
  readonly canopyScale: readonly [number, number, number];
  readonly accentScale: number;
  readonly accentOffset: Vec2;
  readonly rotationY: number;
  readonly windPhase: number;
  readonly windFrequency: number;
  readonly trunkColor: string;
  readonly foliageColor: string;
  readonly accentColor: string;
  readonly litterColor: string | null;
  readonly clearanceBound: Bounds2;
}

export interface VegetationLayout {
  readonly density: LandscapeDensity;
  readonly policy: VegetationLodPolicy;
  readonly activeLodBand: 'near';
  readonly instances: readonly VegetationLayoutInstance[];
  readonly evaluatedCandidates: number;
  readonly rejectedCandidates: number;
}

export interface VegetationBuildResult extends LandscapeBuildResult {
  readonly layout: VegetationLayout;
}

interface SpeciesRecipe {
  readonly canopyForm: VegetationCanopyForm;
  readonly trunkHeight: number;
  readonly trunkRadius: number;
  readonly canopyScale: readonly [number, number, number];
  readonly accentScale: number;
}

interface RoadSegment {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly tangent: Vec2;
  readonly length: number;
  readonly startDistance: number;
}

interface RoadPath {
  readonly road: RoadSpec;
  readonly points: readonly Vec2[];
  readonly segments: readonly RoadSegment[];
  readonly totalLength: number;
}

interface PolylineSample {
  readonly position: Vec2;
  readonly tangent: Vec2;
}

interface NearestPolylineSample extends PolylineSample {
  readonly distance: number;
}

interface CandidateSpec {
  readonly id: string;
  readonly cue: RoadPlantingCue;
  readonly tier: VegetationTier;
  readonly position: Vec2;
  readonly tangent: Vec2;
  readonly vergeSide: VergeSide;
  readonly vergeOffset: number;
  readonly sequence: number;
}

interface LayoutPlan {
  readonly roadOrder: readonly RoadId[];
  readonly identities: readonly VegetationLayoutInstance[];
  readonly infill: readonly VegetationLayoutInstance[];
  readonly accents: readonly VegetationLayoutInstance[];
  readonly evaluatedCandidates: number;
  readonly rejectedCandidates: number;
}

interface ValidatedPlantingData {
  readonly cues: ReadonlyMap<RoadId, RoadPlantingCue>;
  readonly roadOrder: readonly RoadId[];
}

interface MutableCandidateCounts {
  evaluated: number;
  rejected: number;
}

interface RenderBatchItem {
  readonly instance: VegetationLayoutInstance;
  readonly groundHeight: number;
}

interface RenderBatch {
  readonly id: string;
  readonly geometryId: VegetationGeometryId;
  readonly materialId: VegetationMaterialId;
  readonly items: readonly RenderBatchItem[];
  readonly mesh: InstancedMesh<BufferGeometry, MeshStandardMaterial>;
  readonly dynamic: boolean;
}

const SPECIES_RECIPES = Object.freeze({
  peach: {
    canopyForm: 'broad', trunkHeight: 5.4, trunkRadius: 0.32,
    canopyScale: [3.45, 2.6, 3.25], accentScale: 0.72,
  },
  crabapple: {
    canopyForm: 'broad', trunkHeight: 5.7, trunkRadius: 0.34,
    canopyScale: [3.25, 2.75, 3.1], accentScale: 0.64,
  },
  cedar: {
    canopyForm: 'conifer', trunkHeight: 7.2, trunkRadius: 0.42,
    canopyScale: [3.25, 5.6, 3.25], accentScale: 0.5,
  },
  'crape-myrtle': {
    canopyForm: 'columnar', trunkHeight: 4.9, trunkRadius: 0.27,
    canopyScale: [2.45, 3.4, 2.35], accentScale: 0.66,
  },
  maple: {
    canopyForm: 'broad', trunkHeight: 6.4, trunkRadius: 0.4,
    canopyScale: [4.05, 3.2, 3.9], accentScale: 0.78,
  },
  ginkgo: {
    canopyForm: 'upright', trunkHeight: 7, trunkRadius: 0.38,
    canopyScale: [3.05, 4.65, 2.9], accentScale: 0.68,
  },
  'chinese-juniper': {
    canopyForm: 'columnar', trunkHeight: 6.5, trunkRadius: 0.38,
    canopyScale: [2.55, 4.9, 2.5], accentScale: 0.5,
  },
  'plane-tree': {
    canopyForm: 'broad', trunkHeight: 7.3, trunkRadius: 0.48,
    canopyScale: [4.55, 3.65, 4.35], accentScale: 0.72,
  },
} as const satisfies Readonly<Record<VegetationSpecies, SpeciesRecipe>>);

function hashString(value: string): number {
  let hash = HASH_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, HASH_PRIME);
  }
  return hash >>> 0;
}

function hashUnit(value: string): number {
  return hashString(value) / 0x1_0000_0000;
}

function mixHexColors(from: string, to: string, amount: number): string {
  const fromValue = Number.parseInt(from.slice(1), 16);
  const toValue = Number.parseInt(to.slice(1), 16);
  const mix = Math.min(1, Math.max(0, amount));
  const inverse = 1 - mix;
  const red = Math.round(((fromValue >>> 16) & 0xff) * inverse + ((toValue >>> 16) & 0xff) * mix);
  const green = Math.round(((fromValue >>> 8) & 0xff) * inverse + ((toValue >>> 8) & 0xff) * mix);
  const blue = Math.round((fromValue & 0xff) * inverse + (toValue & 0xff) * mix);
  return `#${((red << 16) | (green << 8) | blue).toString(16).padStart(6, '0')}`;
}

function immutableVec2(point: Vec2): Vec2 {
  return Object.freeze({ x: point.x, z: point.z });
}

function immutableBounds(bounds: Bounds2): Bounds2 {
  return Object.freeze({
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
  });
}

function cloneZone(zone: PlantingZone): PlantingZone {
  return Object.freeze({
    id: zone.id,
    roadId: zone.roadId,
    bounds: immutableBounds(zone.bounds),
    side: zone.side,
    minimumRoadClearance: zone.minimumRoadClearance,
    identity: zone.identity,
    inference: Object.freeze({ status: zone.inference.status, basis: zone.inference.basis }),
  });
}

function vectorLength(x: number, z: number): number {
  return Math.hypot(x, z);
}

function buildRoadPath(road: RoadSpec): RoadPath {
  const points = [road.centerline.from, ...road.centerline.via, road.centerline.to].map(immutableVec2);
  const segments: RoadSegment[] = [];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (from === undefined || to === undefined) continue;
    const deltaX = to.x - from.x;
    const deltaZ = to.z - from.z;
    const length = vectorLength(deltaX, deltaZ);
    if (length <= Number.EPSILON) continue;
    segments.push(Object.freeze({
      from,
      to,
      tangent: immutableVec2({ x: deltaX / length, z: deltaZ / length }),
      length,
      startDistance: totalLength,
    }));
    totalLength += length;
  }
  if (segments.length === 0) throw new RangeError(`Road "${road.id}" has no usable centerline segments.`);
  return Object.freeze({
    road,
    points: Object.freeze(points),
    segments: Object.freeze(segments),
    totalLength,
  });
}

function sampleRoad(path: RoadPath, distance: number): PolylineSample {
  const clampedDistance = Math.max(0, Math.min(path.totalLength, distance));
  let segment = path.segments[path.segments.length - 1];
  if (segment === undefined) throw new RangeError(`Road "${path.road.id}" has no usable segments.`);
  for (const candidate of path.segments) {
    if (clampedDistance <= candidate.startDistance + candidate.length) {
      segment = candidate;
      break;
    }
  }
  const localDistance = Math.max(0, Math.min(segment.length, clampedDistance - segment.startDistance));
  return {
    position: {
      x: segment.from.x + segment.tangent.x * localDistance,
      z: segment.from.z + segment.tangent.z * localDistance,
    },
    tangent: segment.tangent,
  };
}

function sampleRoadAtZ(path: RoadPath, targetZ: number): PolylineSample {
  for (const segment of path.segments) {
    const deltaZ = segment.to.z - segment.from.z;
    if (Math.abs(deltaZ) <= Number.EPSILON) continue;
    const fraction = (targetZ - segment.from.z) / deltaZ;
    if (fraction < 0 || fraction > 1) continue;
    return {
      position: {
        x: segment.from.x + (segment.to.x - segment.from.x) * fraction,
        z: targetZ,
      },
      tangent: segment.tangent,
    };
  }
  throw new RangeError(`Road "${path.road.id}" does not cross requested z ${targetZ}.`);
}

function nearestRoadSample(path: RoadPath, point: Vec2): NearestPolylineSample {
  let nearest: NearestPolylineSample | null = null;
  for (const segment of path.segments) {
    const deltaX = point.x - segment.from.x;
    const deltaZ = point.z - segment.from.z;
    const projected = deltaX * segment.tangent.x + deltaZ * segment.tangent.z;
    const localDistance = Math.max(0, Math.min(segment.length, projected));
    const x = segment.from.x + segment.tangent.x * localDistance;
    const z = segment.from.z + segment.tangent.z * localDistance;
    const distance = vectorLength(point.x - x, point.z - z);
    if (nearest === null || distance < nearest.distance) {
      nearest = { position: { x, z }, tangent: segment.tangent, distance };
    }
  }
  if (nearest === null) throw new RangeError(`Road "${path.road.id}" has no usable segments.`);
  return nearest;
}

function expandedBounds(bounds: Bounds2, padding: number): Bounds2 {
  return {
    minX: bounds.minX - padding,
    maxX: bounds.maxX + padding,
    minZ: bounds.minZ - padding,
    maxZ: bounds.maxZ + padding,
  };
}

function segmentIntersectsBounds(from: Vec2, to: Vec2, bounds: Bounds2): boolean {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  let entry = 0;
  let exit = 1;
  if (deltaX === 0) {
    if (from.x < bounds.minX || from.x > bounds.maxX) return false;
  } else {
    const first = (bounds.minX - from.x) / deltaX;
    const second = (bounds.maxX - from.x) / deltaX;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit) return false;
  }
  if (deltaZ === 0) {
    if (from.z < bounds.minZ || from.z > bounds.maxZ) return false;
  } else {
    const first = (bounds.minZ - from.z) / deltaZ;
    const second = (bounds.maxZ - from.z) / deltaZ;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
  }
  return entry <= exit && exit >= 0 && entry <= 1;
}

function polylineIntersectsBounds(points: readonly Vec2[], bounds: Bounds2): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (from !== undefined && to !== undefined && segmentIntersectsBounds(from, to, bounds)) return true;
  }
  return false;
}

function pointToBoundsDistance(point: Vec2, bounds: Bounds2): number {
  const deltaX = Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX);
  const deltaZ = Math.max(bounds.minZ - point.z, 0, point.z - bounds.maxZ);
  return Math.hypot(deltaX, deltaZ);
}

function normalForSide(tangent: Vec2, side: VergeSide): Vec2 {
  const left = { x: -tangent.z, z: tangent.x };
  const desired = side === 'north'
    ? { x: 0, z: -1 }
    : side === 'south'
      ? { x: 0, z: 1 }
      : side === 'east'
        ? { x: 1, z: 0 }
        : { x: -1, z: 0 };
  const direction = left.x * desired.x + left.z * desired.z >= 0 ? 1 : -1;
  return { x: left.x * direction, z: left.z * direction };
}

function sideForNormal(normal: Vec2): VergeSide {
  if (Math.abs(normal.x) >= Math.abs(normal.z)) return normal.x >= 0 ? 'east' : 'west';
  return normal.z >= 0 ? 'south' : 'north';
}

function oppositeSide(side: VergeSide): VergeSide {
  switch (side) {
    case 'north': return 'south';
    case 'south': return 'north';
    case 'east': return 'west';
    case 'west': return 'east';
  }
}

function pointInsideBounds(point: Vec2, bounds: Bounds2): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX
    && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

function boundsIntersect(first: Bounds2, second: Bounds2): boolean {
  return first.minX < second.maxX && first.maxX > second.minX
    && first.minZ < second.maxZ && first.maxZ > second.minZ;
}

function pointInsideExpandedBounds(point: Vec2, bounds: Bounds2, padding: number): boolean {
  return point.x > bounds.minX - padding && point.x < bounds.maxX + padding
    && point.z > bounds.minZ - padding && point.z < bounds.maxZ + padding;
}

function candidateBounds(position: Vec2, radius: number): Bounds2 {
  return {
    minX: position.x - radius,
    maxX: position.x + radius,
    minZ: position.z - radius,
    maxZ: position.z + radius,
  };
}


function createLayoutInstance(spec: CandidateSpec): VegetationLayoutInstance {
  const recipe = SPECIES_RECIPES[spec.cue.species];
  const identityScale = spec.tier === 'identity' ? 1.08 : spec.tier === 'accent' ? 0.86 : 1;
  const authoredVariation = identityScale * (0.92 + hashUnit(`${spec.id}:scale`) * 0.16);
  const isShaoguanPeachInfill = spec.cue.roadId === 'shaoguan'
    && spec.cue.species === 'peach'
    && spec.tier !== 'identity';
  const isJiayuguanMapleNonidentity = spec.cue.roadId === 'jiayuguan'
    && spec.cue.species === 'maple'
    && spec.tier !== 'identity';
  const isAvenuePlane = (spec.cue.roadId === 'wushengguan' || spec.cue.roadId === 'shanhaiguan')
    && spec.cue.species === 'plane-tree';
  const planeScaleCeiling = AVENUE_PLANE_CROWN_SCALE_CEILING_PATTERN[
    spec.sequence % AVENUE_PLANE_CROWN_SCALE_CEILING_PATTERN.length
  ] ?? 1;
  const visualVariation = isAvenuePlane
    ? Math.min(authoredVariation, planeScaleCeiling)
    : authoredVariation;
  const canopyMultiplier = spec.cue.species !== 'crape-myrtle'
    ? 1
    : spec.tier === 'identity'
      ? CRAPE_MYRTLE_IDENTITY_CANOPY_SCALE
      : CRAPE_MYRTLE_NON_IDENTITY_CANOPY_SCALE;
  const canopyHeightRatio = isAvenuePlane ? AVENUE_PLANE_CROWN_HEIGHT_RATIO : 1;
  const canopyScale = Object.freeze([
    recipe.canopyScale[0] * visualVariation * canopyMultiplier,
    recipe.canopyScale[1] * visualVariation * canopyMultiplier * canopyHeightRatio,
    recipe.canopyScale[2] * visualVariation * canopyMultiplier,
  ] as [number, number, number]);
  const trunkHeight = recipe.trunkHeight * authoredVariation
    * (isAvenuePlane ? AVENUE_PLANE_TRUNK_HEIGHT_SCALE : 1);
  const trunkRadius = recipe.trunkRadius * authoredVariation
    * (isAvenuePlane ? AVENUE_PLANE_TRUNK_RADIUS_SCALE : 1);
  const accentScale = recipe.accentScale * visualVariation;
  const accentDirection = hashUnit(`${spec.id}:accent-side`) < 0.5 ? -1 : 1;
  const accentOffset = immutableVec2({
    x: (spec.tangent.x * 0.55 - spec.tangent.z * 0.34) * accentDirection * visualVariation,
    z: (spec.tangent.z * 0.55 + spec.tangent.x * 0.34) * accentDirection * visualVariation,
  });
  const authoredCanopyRadius = Math.max(recipe.canopyScale[0], recipe.canopyScale[2]) * authoredVariation;
  const clearanceRadius = Math.max(
    authoredCanopyRadius,
    Math.abs(accentOffset.x) + accentScale,
    Math.abs(accentOffset.z) + accentScale,
  ) + WIND_CLEARANCE_PADDING;
  const foliageIndex = Math.floor(hashUnit(`${spec.id}:foliage`) * spec.cue.palette.foliage.length);
  const paletteStart = spec.cue.palette.foliage[0];
  const accentColor = spec.cue.palette.foliage[spec.cue.palette.foliage.length - 1] ?? paletteStart;
  const authoredFoliageColor = spec.cue.species === 'crape-myrtle' && spec.tier === 'identity'
    ? accentColor
    : spec.cue.palette.foliage[foliageIndex] ?? paletteStart;
  const peachTint = SHAOGUAN_PEACH_TINT_PATTERN[
    spec.sequence % SHAOGUAN_PEACH_TINT_PATTERN.length
  ] ?? SHAOGUAN_PEACH_TINT_PATTERN[0];
  const planeBlend = AVENUE_PLANE_CROWN_BLEND_PATTERN[
    spec.sequence % AVENUE_PLANE_CROWN_BLEND_PATTERN.length
  ] ?? AVENUE_PLANE_CROWN_BLEND_PATTERN[0];
  const mapleFoliageColor = JIAYUGUAN_MAPLE_FOLIAGE_PATTERN[
    spec.sequence % JIAYUGUAN_MAPLE_FOLIAGE_PATTERN.length
  ] ?? JIAYUGUAN_MAPLE_FOLIAGE_PATTERN[0];
  const foliageColor = isJiayuguanMapleNonidentity
    ? mapleFoliageColor
    : isShaoguanPeachInfill
      ? mixHexColors(accentColor, WARM_CANOPY_TINT, peachTint)
      : isAvenuePlane
        ? mixHexColors(paletteStart, accentColor, planeBlend)
        : authoredFoliageColor;
  const trunkColor = isAvenuePlane
    ? mixHexColors(spec.cue.palette.trunk, WARM_CANOPY_TINT, AVENUE_PLANE_TRUNK_TINT)
    : spec.cue.palette.trunk;
  return Object.freeze({
    id: spec.id,
    roadId: spec.cue.roadId,
    species: spec.cue.species,
    speciesLabel: SPECIES_LABELS[spec.cue.species],
    category: spec.cue.category,
    tier: spec.tier,
    identity: spec.tier === 'identity',
    position: immutableVec2(spec.position),
    tangent: immutableVec2(spec.tangent),
    vergeSide: spec.vergeSide,
    vergeOffset: spec.vergeOffset,
    canopyForm: recipe.canopyForm,
    trunkHeight,
    trunkRadius,
    canopyCenterHeight: trunkHeight + canopyScale[1] * 0.12,
    canopyScale,
    accentScale,
    accentOffset,
    rotationY: hashUnit(`${spec.id}:rotation`) * Math.PI * 2,
    windPhase: hashUnit(`${spec.id}:phase`) * Math.PI * 2,
    windFrequency: 0.31 + hashUnit(`${spec.id}:frequency`) * 0.17,
    trunkColor,
    foliageColor,
    accentColor,
    litterColor: spec.cue.palette.litter,
    clearanceBound: immutableBounds(candidateBounds(spec.position, clearanceRadius)),
  });
}

function usesAvenuePlaneTrunk(instance: VegetationLayoutInstance): boolean {
  return (instance.roadId === 'wushengguan' || instance.roadId === 'shanhaiguan')
    && instance.species === 'plane-tree';
}

function clearanceRadius(instance: VegetationLayoutInstance): number {
  return (instance.clearanceBound.maxX - instance.clearanceBound.minX) * 0.5;
}

function candidateIsClear(
  candidate: VegetationLayoutInstance,
  owningPath: RoadPath,
  roadPaths: ReadonlyMap<string, RoadPath>,
  data: DistrictData,
  placed: readonly VegetationLayoutInstance[],
  minimumRoadClearance: number,
): boolean {
  const radius = clearanceRadius(candidate);
  const bounds = candidate.clearanceBound;
  if (bounds.minX < data.worldBounds.minX || bounds.maxX > data.worldBounds.maxX
    || bounds.minZ < data.worldBounds.minZ || bounds.maxZ > data.worldBounds.maxZ) return false;


  const ownDistance = nearestRoadSample(owningPath, candidate.position).distance;
  if (ownDistance + 1e-6 < Math.max(MINIMUM_VERGE_OFFSET, minimumRoadClearance)) return false;

  for (const path of roadPaths.values()) {
    if (path.road.id === owningPath.road.id) continue;
    const protectsAvenue = (path.road.id === 'wushengguan' || path.road.id === 'shanhaiguan')
      && owningPath.road.id !== path.road.id
      && !candidate.identity;
    const corridorPadding = protectsAvenue
      ? AVENUE_FOREIGN_NONIDENTITY_CLEARANCE
      : path.road.width * 0.5 + path.road.sidewalkWidth + 0.5;
    if (polylineIntersectsBounds(path.points, expandedBounds(bounds, corridorPadding))) return false;
  }

  for (const footprint of data.collisionFootprints) {
    if (pointInsideExpandedBounds(candidate.position, footprint.bounds, radius + ARCHITECTURE_CLEARANCE)) return false;
  }

  for (const parcel of data.parcels) {
    if (pointInsideExpandedBounds(candidate.position, parcel.bounds, radius + PARCEL_CLEARANCE)) return false;
    for (const wall of parcel.wallSegments) {
      if (segmentIntersectsBounds(wall.from, wall.to, expandedBounds(bounds, WALL_CLEARANCE))) return false;
    }
    for (const gate of parcel.gates) {
      if (pointToBoundsDistance(gate.position, bounds)
        < gate.width * 0.5 + GATE_APRON_CLEARANCE) return false;
    }
  }

  for (const path of data.publicGreen.paths) {
    const apronPadding = path.width * 0.5 + PATH_APRON_CLEARANCE;
    if (polylineIntersectsBounds(path.centerline, expandedBounds(bounds, apronPadding))) return false;
  }

  for (const anchor of data.routeAnchors) {
    if (pointToBoundsDistance(anchor.position, bounds) < ROUTE_ANCHOR_CLEARANCE) return false;
  }

  for (const sightline of data.sightlines) {
    if (segmentIntersectsBounds(
      sightline.from,
      sightline.toward,
      expandedBounds(bounds, SIGHTLINE_HALF_WIDTH),
    )) return false;
  }

  const promenadePadding = data.coast.promenade.width * 0.5 + PATH_APRON_CLEARANCE;
  if (polylineIntersectsBounds(
    data.coast.promenade.centerline,
    expandedBounds(bounds, promenadePadding),
  )) return false;
  if (candidate.position.z + radius >= data.coast.edgeZ) return false;
  for (const opening of data.coast.screen.openings) {
    const openingBounds = {
      minX: opening.minX - radius,
      maxX: opening.maxX + radius,
      minZ: data.coast.screen.z - COAST_OPENING_DEPTH - radius,
      maxZ: data.coast.edgeZ + radius,
    };
    if (pointInsideBounds(candidate.position, openingBounds)) return false;
  }

  for (const view of data.landscapeCameraViews) {
    if (boundsIntersect(bounds, view.clearanceBounds)) return false;
  }

  for (const existing of placed) {
    const minimumDistance = radius + clearanceRadius(existing) + TREE_SEPARATION;
    if (vectorLength(candidate.position.x - existing.position.x, candidate.position.z - existing.position.z)
      < minimumDistance) return false;
  }
  return true;
}

function validateData(data: DistrictData): ValidatedPlantingData {
  if (data.roadPlantingCues.length !== 10) {
    throw new RangeError(`Expected 10 road planting cues; received ${data.roadPlantingCues.length}.`);
  }
  const cues = new Map<RoadId, RoadPlantingCue>();
  for (const cue of data.roadPlantingCues) {
    if (cues.has(cue.roadId)) throw new RangeError(`Duplicate planting cue for road "${cue.roadId}".`);
    cues.set(cue.roadId, cue);
  }

  const roadOrder: RoadId[] = [];
  for (const road of data.roads) {
    const cue = data.roadPlantingCues.find((candidate) => candidate.roadId === road.id);
    if (cue === undefined) continue;
    if (roadOrder.includes(cue.roadId)) throw new RangeError(`Duplicate road geometry for "${cue.roadId}".`);
    roadOrder.push(cue.roadId);
  }
  if (roadOrder.length !== cues.size) {
    const missing = data.roadPlantingCues
      .filter((cue) => !roadOrder.includes(cue.roadId))
      .map((cue) => cue.roadId);
    throw new RangeError(`Missing road geometry for planting cues: ${missing.join(', ')}.`);
  }
  const cameraRoads = new Set(data.landscapeCameraViews.flatMap((view) => view.roadIds));
  for (const roadId of roadOrder) {
    if (!cameraRoads.has(roadId)) throw new RangeError(`Landscape camera views do not frame road "${roadId}".`);
  }
  return Object.freeze({ cues, roadOrder: Object.freeze(roadOrder) });
}

function identityFromZone(
  zone: PlantingZone,
  cue: RoadPlantingCue,
  path: RoadPath,
  sequence: number,
): CandidateSpec | null {
  const center = {
    x: (zone.bounds.minX + zone.bounds.maxX) * 0.5,
    z: (zone.bounds.minZ + zone.bounds.maxZ) * 0.5,
  };
  const nearest = nearestRoadSample(path, center);
  const normal = normalForSide(nearest.tangent, zone.side);
  const offset = Math.max(zone.minimumRoadClearance, nearest.distance);
  const position = {
    x: nearest.position.x + normal.x * offset,
    z: nearest.position.z + normal.z * offset,
  };
  if (!pointInsideBounds(position, zone.bounds)) return null;
  return {
    id: `vegetation:${cue.roadId}:identity:${sequence}`,
    cue,
    tier: 'identity',
    position,
    tangent: nearest.tangent,
    vergeSide: zone.side,
    vergeOffset: offset,
    sequence,
  };
}

function fallbackIdentityCandidates(
  cue: RoadPlantingCue,
  path: RoadPath,
): readonly CandidateSpec[] {
  const candidates: CandidateSpec[] = [];
  const usableLength = Math.max(0, path.totalLength - SAMPLE_END_MARGIN * 2);
  const sampleCount = 73;
  const start = hashString(`identity:${cue.roadId}`) % sampleCount;
  for (let attempt = 0; attempt < sampleCount; attempt += 1) {
    const index = (start + attempt * 37) % sampleCount;
    const distance = SAMPLE_END_MARGIN + usableLength * ((index + 0.5) / sampleCount);
    const sample = sampleRoad(path, distance);
    const leftNormal = { x: -sample.tangent.z, z: sample.tangent.x };
    const firstSide = sideForNormal(leftNormal);
    const sideOrder = hashUnit(`${cue.roadId}:${index}:side`) < 0.5
      ? [firstSide, oppositeSide(firstSide)] as const
      : [oppositeSide(firstSide), firstSide] as const;
    for (let offsetIndex = 0; offsetIndex < 3; offsetIndex += 1) {
      const offset = MINIMUM_VERGE_OFFSET + 0.65 + offsetIndex * 2.8;
      for (const side of sideOrder) {
        const normal = normalForSide(sample.tangent, side);
        candidates.push({
          id: `vegetation:${cue.roadId}:identity-fallback:${attempt}:${offsetIndex}:${side}`,
          cue,
          tier: 'identity',
          position: {
            x: sample.position.x + normal.x * offset,
            z: sample.position.z + normal.z * offset,
          },
          tangent: sample.tangent,
          vergeSide: side,
          vergeOffset: offset,
          sequence: attempt,
        });
      }
    }
  }
  return candidates;
}


function buildMasterLayout(data: DistrictData): LayoutPlan {
  const { cues, roadOrder } = validateData(data);
  const roadPaths = new Map<string, RoadPath>();
  for (const road of data.roads) roadPaths.set(road.id, buildRoadPath(road));
  const identities: VegetationLayoutInstance[] = [];
  const infill: VegetationLayoutInstance[] = [];
  const accents: VegetationLayoutInstance[] = [];
  const placed: VegetationLayoutInstance[] = [];
  const counts: MutableCandidateCounts = { evaluated: 0, rejected: 0 };

  const tryCandidate = (
    spec: CandidateSpec,
    path: RoadPath,
    minimumRoadClearance: number,
  ): VegetationLayoutInstance | null => {
    counts.evaluated += 1;
    const instance = createLayoutInstance(spec);
    if (!candidateIsClear(instance, path, roadPaths, data, placed, minimumRoadClearance)) {
      counts.rejected += 1;
      return null;
    }
    placed.push(instance);
    return instance;
  };

  for (const roadId of roadOrder) {
    const cue = cues.get(roadId);
    const path = roadPaths.get(roadId);
    if (cue === undefined || path === undefined) throw new RangeError(`Missing planting inputs for road "${roadId}".`);
    let identity: VegetationLayoutInstance | null = null;
    const zones = data.plantingZones.filter((zone) => zone.roadId === roadId && zone.identity);
    for (let index = 0; index < zones.length && identity === null; index += 1) {
      const zone = zones[index];
      if (zone === undefined) continue;
      const spec = identityFromZone(zone, cue, path, index);
      if (spec !== null) identity = tryCandidate(spec, path, zone.minimumRoadClearance);
    }
    if (identity === null) {
      for (const spec of fallbackIdentityCandidates(cue, path)) {
        identity = tryCandidate(spec, path, MINIMUM_VERGE_OFFSET);
        if (identity !== null) break;
      }
    }
    if (identity === null) throw new RangeError(`Could not place a clear identity tree for road "${roadId}".`);
    identities.push(identity);
  }

  const wushengCue = cues.get('wushengguan');
  const wushengPath = roadPaths.get('wushengguan');
  if (wushengCue === undefined || wushengPath === undefined) {
    throw new RangeError('Missing Wushengguan inputs for the plane-tree cadence.');
  }
  for (const station of WUSHENG_PRIORITY_CADENCE) {
    const sample = sampleRoadAtZ(wushengPath, station.centerlineZ);
    const normal = normalForSide(sample.tangent, station.side);
    const instance = tryCandidate({
      id: `vegetation:wushengguan:infill:${station.id}`,
      cue: wushengCue,
      tier: 'infill',
      position: {
        x: sample.position.x + normal.x * station.vergeOffset,
        z: sample.position.z + normal.z * station.vergeOffset,
      },
      tangent: sample.tangent,
      vergeSide: station.side,
      vergeOffset: station.vergeOffset,
      sequence: station.sequence,
    }, wushengPath, MINIMUM_VERGE_OFFSET);
    if (instance === null) {
      throw new RangeError(`Could not place Wushengguan priority station "${station.id}".`);
    }
    infill.push(instance);
  }

  const shanhaiguanCue = cues.get('shanhaiguan');
  const shanhaiguanPath = roadPaths.get('shanhaiguan');
  if (shanhaiguanCue === undefined || shanhaiguanPath === undefined) {
    throw new RangeError('Missing Shanhaiguan inputs for the plane-tree cadence.');
  }
  for (const station of SHANHAIGUAN_PRIORITY_CADENCE) {
    const sample = sampleRoadAtZ(shanhaiguanPath, station.centerlineZ);
    const normal = normalForSide(sample.tangent, station.side);
    const instance = tryCandidate({
      id: `vegetation:shanhaiguan:infill:${station.id}`,
      cue: shanhaiguanCue,
      tier: 'infill',
      position: {
        x: sample.position.x + normal.x * station.vergeOffset,
        z: sample.position.z + normal.z * station.vergeOffset,
      },
      tangent: sample.tangent,
      vergeSide: station.side,
      vergeOffset: station.vergeOffset,
      sequence: station.sequence,
    }, shanhaiguanPath, MINIMUM_VERGE_OFFSET);
    if (instance === null) {
      throw new RangeError(`Could not place Shanhaiguan priority station "${station.id}".`);
    }
    infill.push(instance);
  }

  for (const roadId of roadOrder) {
    const cue = cues.get(roadId);
    const path = roadPaths.get(roadId);
    if (cue === undefined || path === undefined) continue;
    if (roadId === 'shanhaiguan') continue;
    const usableLength = Math.max(0, path.totalLength - SAMPLE_END_MARGIN * 2);
    const sampleCount = Math.max(1, Math.floor(usableLength / MASTER_SAMPLE_SPACING));
    let sequence = 0;
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const jitter = (hashUnit(`${roadId}:sample:${sampleIndex}`) - 0.5) * MASTER_SAMPLE_SPACING * 0.34;
      const distance = SAMPLE_END_MARGIN
        + usableLength * ((sampleIndex + 0.5) / sampleCount)
        + jitter;
      const sample = sampleRoad(path, distance);
      const leftSide = sideForNormal({ x: -sample.tangent.z, z: sample.tangent.x });
      const sides = hashUnit(`${roadId}:sample:${sampleIndex}:order`) < 0.5
        ? [leftSide, oppositeSide(leftSide)] as const
        : [oppositeSide(leftSide), leftSide] as const;
      for (const side of sides) {
        const tier: VegetationTier = sequence % 6 === 4 ? 'accent' : 'infill';
        const offset = MINIMUM_VERGE_OFFSET + 0.7 + hashUnit(`${roadId}:${sequence}:offset`) * 3.9;
        const normal = normalForSide(sample.tangent, side);
        const spec: CandidateSpec = {
          id: `vegetation:${roadId}:${tier}:${sequence}`,
          cue,
          tier,
          position: {
            x: sample.position.x + normal.x * offset,
            z: sample.position.z + normal.z * offset,
          },
          tangent: sample.tangent,
          vergeSide: side,
          vergeOffset: offset,
          sequence,
        };
        const instance = tryCandidate(spec, path, MINIMUM_VERGE_OFFSET);
        if (instance !== null) {
          if (tier === 'accent') accents.push(instance);
          else infill.push(instance);
        }
        sequence += 1;
      }
    }
  }

  return {
    roadOrder,
    identities: Object.freeze(identities),
    infill: Object.freeze(infill),
    accents: Object.freeze(accents),
    evaluatedCandidates: counts.evaluated,
    rejectedCandidates: counts.rejected,
  };
}

function selectRoadFraction(
  instances: readonly VegetationLayoutInstance[],
  fraction: number,
  roadOrder: readonly RoadId[],
): readonly VegetationLayoutInstance[] {
  if (fraction <= 0) return Object.freeze([]);
  if (fraction >= 1) return instances;
  const selected: VegetationLayoutInstance[] = [];
  for (const roadId of roadOrder) {
    const roadInstances = instances.filter((instance) => instance.roadId === roadId);
    if (roadInstances.length === 0) continue;
    const count = Math.max(1, Math.floor(roadInstances.length * fraction));
    selected.push(...roadInstances.slice(0, count));
  }
  return Object.freeze(selected);
}

function selectInstances(plan: LayoutPlan, density: LandscapeDensity): readonly VegetationLayoutInstance[] {
  const policy = VEGETATION_LOD_POLICIES[density];
  const infill = selectRoadFraction(plan.infill, policy.infillFraction, plan.roadOrder);
  const accents = selectRoadFraction(plan.accents, policy.accentFraction, plan.roadOrder);
  return Object.freeze([...plan.identities, ...infill, ...accents]);
}

function freezePolicy(policy: VegetationLodPolicy): VegetationLodPolicy {
  return Object.freeze({
    density: policy.density,
    identityInstancesPerRoad: policy.identityInstancesPerRoad,
    infillFraction: policy.infillFraction,
    accentFraction: policy.accentFraction,
    bands: Object.freeze(policy.bands.map((band) => Object.freeze({
      id: band.id,
      maximumDistance: band.maximumDistance,
      canopySegments: band.canopySegments,
    }))),
  });
}

/** Pure deterministic placement helper. It allocates no Three.js or GPU resources. */
export function createVegetationLayout(
  data: DistrictData,
  density: LandscapeDensity,
): VegetationLayout {
  const policy = VEGETATION_LOD_POLICIES[density];
  if (policy === undefined) throw new RangeError(`Unsupported landscape density "${String(density)}".`);
  const plan = buildMasterLayout(data);
  return Object.freeze({
    density,
    policy: freezePolicy(policy),
    activeLodBand: ACTIVE_LOD_BAND_ID,
    instances: selectInstances(plan, density),
    evaluatedCandidates: plan.evaluatedCandidates,
    rejectedCandidates: plan.rejectedCandidates,
  });
}

function geometryTriangleCount(geometry: BufferGeometry): number {
  const indexCount = geometry.index?.count;
  const positionCount = geometry.getAttribute('position').count;
  return Math.floor((indexCount ?? positionCount) / 3);
}


interface VegetationGeometryRecipe {
  readonly radialSegments: number;
  readonly broadHeightSegments: number;
  readonly accentWidthSegments: number;
  readonly accentHeightSegments: number;
}

/** C06 renders the active near topology; camera-distance band switching remains the published C11 seam. */
function geometryRecipe(policy: VegetationLodPolicy): VegetationGeometryRecipe {
  const radialSegments = policy.bands.find(({ id }) => id === ACTIVE_LOD_BAND_ID)?.canopySegments ?? 5;
  return {
    radialSegments,
    broadHeightSegments: Math.max(4, Math.floor(radialSegments * 0.6)),
    accentWidthSegments: Math.max(5, radialSegments - 2),
    accentHeightSegments: Math.max(3, Math.floor(radialSegments * 0.45)),
  };
}

function predictedGeometryTriangles(
  geometryId: VegetationGeometryId,
  recipe: VegetationGeometryRecipe,
): number {
  switch (geometryId) {
    case 'trunk': return recipe.radialSegments * 4;
    case 'broad':
    case 'upright': return 2 * recipe.radialSegments * (recipe.broadHeightSegments - 1);
    case 'conifer': return recipe.radialSegments * 2;
    case 'columnar': return recipe.radialSegments * 4;
    case 'accent': return 2 * recipe.accentWidthSegments * (recipe.accentHeightSegments - 1);
  }
}

function createSharedGeometries(
  resources: ResourceRegistry,
  group: string,
  policy: VegetationLodPolicy,
): ReadonlyMap<VegetationGeometryId, BufferGeometry> {
  const recipe = geometryRecipe(policy);
  const trunk = new CylinderGeometry(0.5, 0.62, 1, recipe.radialSegments);
  trunk.translate(0, 0.5, 0);
  const definitions: readonly (readonly [VegetationGeometryId, BufferGeometry])[] = [
    ['trunk', trunk],
    ['broad', new SphereGeometry(1, recipe.radialSegments, recipe.broadHeightSegments)],
    ['upright', new SphereGeometry(1, recipe.radialSegments, recipe.broadHeightSegments)],
    ['conifer', new ConeGeometry(1, 2, recipe.radialSegments)],
    ['columnar', new CylinderGeometry(0.56, 0.82, 2, recipe.radialSegments)],
    ['accent', new SphereGeometry(1, recipe.accentWidthSegments, recipe.accentHeightSegments)],
  ];
  const geometries = new Map<VegetationGeometryId, BufferGeometry>();
  for (const [geometryId, geometry] of definitions) {
    geometry.name = `vegetation:${geometryId}:${ACTIVE_LOD_BAND_ID}`;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometries.set(geometryId, resources.register(geometry, group));
  }
  return geometries;
}

function createSharedMaterials(
  resources: ResourceRegistry,
  group: string,
): ReadonlyMap<VegetationMaterialId, MeshStandardMaterial> {
  const definitions: readonly (readonly [VegetationMaterialId, string])[] = [
    ['trunk-palette', 'vegetation:trunk-palette'],
    ['avenue-plane-trunk-palette', 'vegetation:avenue-plane-trunk-palette'],
    ['foliage-palette', 'vegetation:foliage-palette'],
    ['accent-palette', 'vegetation:accent-palette'],
  ];
  const materials = new Map<VegetationMaterialId, MeshStandardMaterial>();
  for (const [materialId, name] of definitions) {
    const isTrunk = materialId.includes('trunk');
    const material = new MeshStandardMaterial({
      color: new Color(0xffffff),
      transparent: false,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
      roughness: isTrunk ? 0.96 : 0.9,
      metalness: 0,
      emissive: isTrunk ? 0x000000 : 0x30382a,
      emissiveIntensity: isTrunk ? 1 : 0.18,
    });
    material.name = name;
    materials.set(materialId, resources.register(material, group));
  }
  return materials;
}

function requireMapValue<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing vegetation ${label} "${String(key)}".`);
  return value;
}

function applyTrunkTransform(transform: TransformObject, item: RenderBatchItem): void {
  const instance = item.instance;
  transform.position.set(instance.position.x, item.groundHeight, instance.position.z);
  transform.rotation.set(0, instance.rotationY, 0);
  transform.scale.set(instance.trunkRadius * 2, instance.trunkHeight, instance.trunkRadius * 2);
  transform.updateMatrix();
}

function applyCanopyTransform(
  transform: TransformObject,
  item: RenderBatchItem,
  time: number,
  amplitude: number,
): void {
  const instance = item.instance;
  const phase = time * instance.windFrequency + instance.windPhase;
  const windX = amplitude === 0 ? 0 : Math.sin(phase) * amplitude;
  const windZ = amplitude === 0 ? 0 : Math.cos(phase * 0.83) * amplitude * 0.72;
  transform.position.set(
    instance.position.x,
    item.groundHeight + instance.canopyCenterHeight,
    instance.position.z,
  );
  transform.rotation.set(windX, instance.rotationY, windZ);
  transform.scale.set(instance.canopyScale[0], instance.canopyScale[1], instance.canopyScale[2]);
  transform.updateMatrix();
}

function applyAccentTransform(
  transform: TransformObject,
  item: RenderBatchItem,
  time: number,
  amplitude: number,
): void {
  const instance = item.instance;
  const phase = time * instance.windFrequency + instance.windPhase;
  const windX = amplitude === 0 ? 0 : Math.sin(phase) * amplitude;
  const windZ = amplitude === 0 ? 0 : Math.cos(phase * 0.83) * amplitude * 0.72;
  transform.position.set(
    instance.position.x + instance.accentOffset.x,
    item.groundHeight + instance.canopyCenterHeight + instance.canopyScale[1] * 0.22,
    instance.position.z + instance.accentOffset.z,
  );
  transform.rotation.set(windX, instance.rotationY, windZ);
  transform.scale.setScalar(instance.accentScale);
  transform.updateMatrix();
}

function matrixChecksum(current: number, elements: ArrayLike<number>): number {
  let checksum = current;
  for (let index = 0; index < elements.length; index += 1) {
    const quantized = Math.round((elements[index] ?? 0) * 10_000);
    checksum ^= quantized;
    checksum = Math.imul(checksum, HASH_PRIME);
  }
  return checksum >>> 0;
}

function createRenderBatches(
  resources: ResourceRegistry,
  group: string,
  root: Group,
  instances: readonly VegetationLayoutInstance[],
  geometries: ReadonlyMap<VegetationGeometryId, BufferGeometry>,
  materials: ReadonlyMap<VegetationMaterialId, MeshStandardMaterial>,
): readonly RenderBatch[] {
  const grounded = instances.map((instance) => Object.freeze({
    instance,
    groundHeight: sampleGroundHeight(instance.position.x, instance.position.z),
  }));
  const avenuePlaneTrunks = grounded.filter(({ instance }) => usesAvenuePlaneTrunk(instance));
  const standardTrunks = grounded.filter(({ instance }) => !usesAvenuePlaneTrunk(instance));
  const batchDefinitions: readonly {
    readonly id: string;
    readonly geometryId: VegetationGeometryId;
    readonly materialId: VegetationMaterialId;
    readonly items: readonly RenderBatchItem[];
    readonly dynamic: boolean;
  }[] = [
    { id: 'trunks', geometryId: 'trunk', materialId: 'trunk-palette', items: standardTrunks, dynamic: false },
    {
      id: 'trunks:avenue-plane-pale',
      geometryId: 'trunk',
      materialId: 'avenue-plane-trunk-palette',
      items: avenuePlaneTrunks,
      dynamic: false,
    },
    ...(['broad', 'upright', 'conifer', 'columnar'] as const).map((form) => ({
      id: `canopies:${form}`,
      geometryId: form,
      materialId: 'foliage-palette' as const,
      items: grounded.filter(({ instance }) => instance.canopyForm === form),
      dynamic: true,
    })),
    {
      id: 'accents',
      geometryId: 'accent',
      materialId: 'accent-palette',
      items: grounded.filter(({ instance }) => instance.tier === 'accent'),
      dynamic: true,
    },
  ];
  const batches: RenderBatch[] = [];
  const transform = new TransformObject();
  const color = new Color();
  for (const definition of batchDefinitions) {
    if (definition.items.length === 0) continue;
    const geometry = requireMapValue(geometries, definition.geometryId, 'geometry');
    const material = requireMapValue(materials, definition.materialId, 'material');
    const mesh = resources.register(new InstancedMesh(geometry, material, definition.items.length), group);
    mesh.name = `vegetation:instances:${ACTIVE_LOD_BAND_ID}:${definition.id}`;
    mesh.userData.collidable = false;
    mesh.castShadow = definition.geometryId === 'trunk';
    mesh.receiveShadow = definition.geometryId === 'trunk';
    if (definition.dynamic) mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let index = 0; index < definition.items.length; index += 1) {
      const item = definition.items[index];
      if (item === undefined) continue;
      const colorValue = definition.geometryId === 'trunk'
        ? item.instance.trunkColor
        : definition.geometryId === 'accent'
          ? item.instance.accentColor
          : item.instance.foliageColor;
      mesh.setColorAt(index, color.set(colorValue));
      if (!definition.dynamic) {
        applyTrunkTransform(transform, item);
        mesh.setMatrixAt(index, transform.matrix);
      }
    }
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    batches.push({
      id: definition.id,
      geometryId: definition.geometryId,
      materialId: definition.materialId,
      items: definition.items,
      mesh,
      dynamic: definition.dynamic,
    });
    root.add(mesh);
  }
  return Object.freeze(batches);
}

function densityMetric(
  instances: readonly VegetationLayoutInstance[],
  policy: VegetationLodPolicy,
  actualGeometryTriangles?: ReadonlyMap<VegetationGeometryId, number>,
): LandscapeDensityMetrics {
  const recipe = geometryRecipe(policy);
  const forms = new Set<VegetationCanopyForm>();
  let triangles = 0;
  let accentInstances = 0;
  let hasAvenuePlaneTrunks = false;
  const triangleCount = (geometryId: VegetationGeometryId): number =>
    actualGeometryTriangles?.get(geometryId) ?? predictedGeometryTriangles(geometryId, recipe);
  for (const instance of instances) {
    forms.add(instance.canopyForm);
    triangles += triangleCount('trunk') + triangleCount(instance.canopyForm);
    if (usesAvenuePlaneTrunk(instance)) hasAvenuePlaneTrunks = true;
    if (instance.tier === 'accent') {
      accentInstances += 1;
      triangles += triangleCount('accent');
    }
  }
  return Object.freeze({
    vegetationInstances: instances.length,
    identityInstances: instances.filter((instance) => instance.identity).length,
    detailInstances: 0,
    drawCalls: instances.length === 0
      ? 0
      : 1 + forms.size + (hasAvenuePlaneTrunks ? 1 : 0) + (accentInstances > 0 ? 1 : 0),
    triangles,
  });
}

function cloneCameraViews(
  data: DistrictData,
  vegetationBounds: readonly LandscapeClearanceBound[],
): readonly LandscapeCameraView[] {
  return Object.freeze(data.landscapeCameraViews.map((view) => {
    const intersections = vegetationBounds.filter((clearance) =>
      boundsIntersect(clearance.bounds, view.clearanceBounds)).length;
    return Object.freeze({
      id: view.id,
      position: Object.freeze([view.position[0], view.position[1], view.position[2]] as [number, number, number]),
      target: Object.freeze([view.target[0], view.target[1], view.target[2]] as [number, number, number]),
      roadIds: Object.freeze([...view.roadIds]),
      clearanceBounds: immutableBounds(view.clearanceBounds),
      clearanceIntersections: intersections,
      ySemantics: 'world' as const,
    });
  }));
}

function createDebugLayout(
  data: DistrictData,
  instances: readonly VegetationLayoutInstance[],
  roadOrder: readonly RoadId[],
): LandscapeDebugLayout {
  const markers = roadOrder.map((roadId) => {
    const identity = instances.find((instance) => instance.roadId === roadId && instance.identity);
    if (identity === undefined) throw new RangeError(`Missing active identity marker for road "${roadId}".`);
    return Object.freeze({
      roadId,
      speciesId: identity.species,
      position: immutableVec2(identity.position),
    });
  });
  return Object.freeze({
    markers: Object.freeze(markers),
    zones: Object.freeze(data.plantingZones.map(cloneZone)),
  });
}

function validateSettings(settings: LandscapeSettings): LandscapeSettings {
  if (settings.density !== 'high' && settings.density !== 'medium' && settings.density !== 'low') {
    throw new RangeError(`Unsupported landscape density "${String(settings.density)}".`);
  }
  if (settings.motion !== 'standard' && settings.motion !== 'reduced') {
    throw new RangeError(`Unsupported landscape motion "${String(settings.motion)}".`);
  }
  return Object.freeze({ density: settings.density, motion: settings.motion });
}

/**
 * Creates deterministic road-specific vegetation in generation-scoped global instanced batches.
 * All geometry, material, and mesh resources are owned by the supplied registry group.
 */
export function createVegetation(
  resources: ResourceRegistry,
  group: string,
  settings: LandscapeSettings,
  data: DistrictData = DISTRICT_DATA,
): VegetationBuildResult {
  const immutableSettings = validateSettings(settings);
  const policy = VEGETATION_LOD_POLICIES[immutableSettings.density];
  const plan = buildMasterLayout(data);
  const activeInstances = selectInstances(plan, immutableSettings.density);
  const layout: VegetationLayout = Object.freeze({
    density: immutableSettings.density,
    policy: freezePolicy(policy),
    activeLodBand: ACTIVE_LOD_BAND_ID,
    instances: activeInstances,
    evaluatedCandidates: plan.evaluatedCandidates,
    rejectedCandidates: plan.rejectedCandidates,
  });

  const root = new Group();
  root.name = 'landscape:vegetation';
  root.userData.collidable = false;
  const geometries = createSharedGeometries(resources, group, policy);
  const materials = createSharedMaterials(resources, group);
  const batches = createRenderBatches(resources, group, root, activeInstances, geometries, materials);
  const actualGeometryTriangles = new Map<VegetationGeometryId, number>();
  for (const [geometryId, geometry] of geometries) {
    actualGeometryTriangles.set(geometryId, geometryTriangleCount(geometry));
  }

  const vegetationBounds = Object.freeze(activeInstances.map((instance): LandscapeClearanceBound => Object.freeze({
    id: instance.id,
    roadId: instance.roadId,
    kind: 'vegetation',
    bounds: immutableBounds(instance.clearanceBound),
  })));
  const cameraViews = cloneCameraViews(data, vegetationBounds);
  const cameraBounds = cameraViews.map((view): LandscapeClearanceBound => Object.freeze({
    id: `camera:${view.id}`,
    roadId: null,
    kind: 'camera',
    bounds: immutableBounds(view.clearanceBounds),
  }));
  const clearanceBounds = Object.freeze([...vegetationBounds, ...cameraBounds]);
  const clearanceIntersections = cameraViews.reduce(
    (total, view) => total + view.clearanceIntersections,
    0,
  );
  const debugLayout = createDebugLayout(data, activeInstances, plan.roadOrder);

  const densityCounts = {
    high: densityMetric(selectInstances(plan, 'high'), VEGETATION_LOD_POLICIES.high),
    medium: densityMetric(selectInstances(plan, 'medium'), VEGETATION_LOD_POLICIES.medium),
    low: densityMetric(selectInstances(plan, 'low'), VEGETATION_LOD_POLICIES.low),
  } as Record<LandscapeDensity, LandscapeDensityMetrics>;
  densityCounts[immutableSettings.density] = densityMetric(activeInstances, policy, actualGeometryTriangles);
  const immutableDensityCounts = Object.freeze(densityCounts);
  const activeMetric = immutableDensityCounts[immutableSettings.density];
  const identities = Object.freeze(plan.identities.map((identity) => Object.freeze({
    roadId: identity.roadId,
    speciesId: identity.species,
  })));
  const renderedInstanceCount = activeInstances.length * 2
    + activeInstances.filter((instance) => instance.tier === 'accent').length;
  const transparentObjects = batches.filter((batch) => batch.mesh.material.transparent).length;
  const depthWriteDisabled = batches.filter((batch) => !batch.mesh.material.depthWrite).length;
  const staticMetrics = Object.freeze({
    settings: immutableSettings,
    densityCounts: immutableDensityCounts,
    active: activeMetric,
    identities,
    lodBands: layout.policy.bands,
    reuse: Object.freeze({
      sharedGeometryCount: geometries.size,
      sharedMaterialCount: materials.size,
      instanceBatchCount: batches.length,
      instanceCount: renderedInstanceCount,
      estimatedInstancedDrawCalls: batches.length,
      naiveRepeatedDrawCalls: renderedInstanceCount,
    }),
    clearanceIntersections,
    transparentObjects,
    depthWriteDisabled,
  });

  const dynamicBatches = batches.filter((batch) => batch.dynamic);
  const transform = new TransformObject();
  const amplitude = immutableSettings.motion === 'reduced' || immutableSettings.density === 'low'
    ? 0
    : STANDARD_WIND_AMPLITUDE;
  let currentTime = 0;
  let captureTime: number | null = null;
  let transformChecksum = HASH_OFFSET;
  let transformChecksumDirty = true;
  let dynamicTransformsInitialized = false;

  const applyDynamicTransforms = (time: number, force: boolean): void => {
    if (!force && time === currentTime) return;
    currentTime = time;
    if (amplitude === 0 && dynamicTransformsInitialized) return;
    for (const batch of dynamicBatches) {
      for (let index = 0; index < batch.items.length; index += 1) {
        const item = batch.items[index];
        if (item === undefined) continue;
        if (batch.geometryId === 'accent') applyAccentTransform(transform, item, time, amplitude);
        else applyCanopyTransform(transform, item, time, amplitude);
        batch.mesh.setMatrixAt(index, transform.matrix);
      }
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
    transformChecksumDirty = true;
    dynamicTransformsInitialized = true;
  };

  const currentTransformChecksum = (): number => {
    if (!transformChecksumDirty) return transformChecksum;
    let checksum = HASH_OFFSET;
    for (const batch of dynamicBatches) {
      checksum = matrixChecksum(checksum, batch.mesh.instanceMatrix.array);
    }
    transformChecksum = checksum >>> 0;
    transformChecksumDirty = false;
    return transformChecksum;
  };
  applyDynamicTransforms(0, true);
  for (const batch of batches) {
    batch.mesh.computeBoundingBox();
    batch.mesh.computeBoundingSphere();
    if (batch.dynamic) {
      batch.mesh.boundingBox?.expandByScalar(WIND_CLEARANCE_PADDING);
      if (batch.mesh.boundingSphere !== null) batch.mesh.boundingSphere.radius += WIND_CLEARANCE_PADDING;
    }
  }

  const controller = {
    root,
    settings: immutableSettings,
    layout,
    cameraViews,
    clearanceBounds,
    debugLayout,
    get metrics(): LandscapeBuildMetrics {
      return Object.freeze({
        ...staticMetrics,
        motion: Object.freeze({
          time: currentTime,
          amplitude,
          transformChecksum: currentTransformChecksum(),
        }),
      });
    },
    update(frame: LandscapeUpdateFrame): void {
      if (!Number.isFinite(frame.elapsedSeconds) || frame.elapsedSeconds < 0) return;
      applyDynamicTransforms(captureTime ?? frame.elapsedSeconds, false);
    },
    reset(): void {
      captureTime = null;
      applyDynamicTransforms(0, true);
    },
    setCaptureTime(time: number | null): void {
      if (time === null) {
        captureTime = null;
        return;
      }
      if (!Number.isFinite(time) || time < 0) {
        throw new RangeError('Landscape capture time must be a finite non-negative number or null.');
      }
      captureTime = time;
      applyDynamicTransforms(time, true);
    },
  } satisfies VegetationBuildResult;
  return Object.freeze(controller);
}
