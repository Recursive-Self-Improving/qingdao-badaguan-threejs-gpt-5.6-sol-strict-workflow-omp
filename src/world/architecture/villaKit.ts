import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D as TransformObject,
  type Object3D,
} from 'three';

import { sampleGroundHeight } from '../../exploration/navigation';
import type { ResourceRegistry } from '../../render/ResourceRegistry';
import type {
  ArchitectureBuildResult,
  ArchitectureCameraView,
  ArchitectureFrameView,
  ArchitectureSite,
  ArchitectureStyle,
  ArchitectureSubjectId,
  ArchitectureSubjectMetrics,
  Bounds2,
} from '../types';

export type VillaStyle = ArchitectureStyle;

export interface VillaComponentMetrics {
  readonly wall: number;
  readonly roof: number;
  readonly turret: number;
  readonly window: number;
  readonly door: number;
  readonly trim: number;
  readonly total: number;
  readonly instanced: number;
  readonly directDrawCalls: number;
  readonly estimatedTriangles: number;
}

export interface VillaSubjectBuildResult {
  readonly root: Group;
  readonly metrics: ArchitectureSubjectMetrics;
  readonly components: VillaComponentMetrics;
}

export interface VillaKit {
  readonly root: Group;
  createVilla(site: ArchitectureSite): VillaSubjectBuildResult;
  finalize(): ArchitectureBuildResult;
}

type VillaComponentKind = 'wall' | 'roof' | 'turret' | 'window' | 'door' | 'trim';
type InstancedComponentKind = 'window' | 'door' | 'trim';
type DirectComponentKind = Exclude<VillaComponentKind, InstancedComponentKind>;

type VillaGeometryId =
  | 'unit-wall'
  | 'unit-trim'
  | 'unit-window'
  | 'unit-door'
  | 'unit-gable-roof'
  | 'unit-hip-roof'
  | 'unit-butterfly-lower-roof'
  | 'unit-butterfly-upper-roof'
  | 'unit-butterfly-roof-band'
  | 'unit-butterfly-dormer-gable'
  | 'unit-turret';

type VillaMaterialId =
  | 'muted-cream-stucco'
  | 'warm-stucco'
  | 'gray-stone'
  | 'pine-green-stucco'
  | 'warm-brick'
  | 'warm-gray-stone'
  | 'red-brown-roof'
  | 'red-tile-roof'
  | 'charcoal-roof'
  | 'butterfly-lower-roof'
  | 'butterfly-upper-roof'
  | 'butterfly-roof-band'
  | 'restrained-trim'
  | 'medium-stone-trim'
  | 'dark-wood'
  | 'warm-timber'
  | 'dark-window'
  | 'dark-metal';

type ImmutableCameraViews = Readonly<Record<ArchitectureFrameView, ArchitectureCameraView>>;

type VillaTransform = {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
};

interface MutableComponentMetrics {
  wall: number;
  roof: number;
  turret: number;
  window: number;
  door: number;
  trim: number;
  directDrawCalls: number;
  estimatedTriangles: number;
}

interface LocalInstance {
  readonly kind: InstancedComponentKind;
  readonly geometryId: VillaGeometryId;
  readonly materialId: VillaMaterialId;
  readonly transform: VillaTransform;
  readonly name: string;
  readonly order: number;
}

interface PendingInstance extends LocalInstance {
  readonly subjectId: ArchitectureSubjectId;
}

interface PendingBatch {
  readonly geometryId: VillaGeometryId;
  readonly materialId: VillaMaterialId;
  readonly instances: PendingInstance[];
}

interface RecipeContext {
  readonly site: ArchitectureSite;
  readonly root: Group;
  readonly ground: number;
  readonly geometries: ReadonlyMap<VillaGeometryId, BufferGeometry>;
  readonly materials: ReadonlyMap<VillaMaterialId, MeshBasicMaterial>;
  readonly counts: MutableComponentMetrics;
  readonly instances: LocalInstance[];
}

interface BuiltSubject {
  readonly result: VillaSubjectBuildResult;
  readonly cameraViews: ImmutableCameraViews;
}

interface Plan {
  readonly centerX: number;
  readonly centerZ: number;
  readonly width: number;
  readonly depth: number;
}

interface FacadeWindowsOptions {
  readonly centerX: number;
  readonly centerZ: number;
  readonly width: number;
  readonly depth: number;
  readonly baseY: number;
  readonly storyHeight: number;
  readonly floors: number;
  readonly columns: number;
  readonly sideColumns: number;
  readonly windowWidth: number;
  readonly windowHeight: number;
  readonly materialId: VillaMaterialId;
  readonly includeRear: boolean;
}

interface FrontWindow {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
}

interface SubjectContract {
  readonly kind: ArchitectureSite['kind'];
  readonly style: VillaStyle;
  readonly stories: 2 | 3;
  readonly inspiration: ArchitectureSite['inspiration'];
  readonly viewpointId: string;
  readonly signage: ArchitectureSite['signage'];
  readonly materials: readonly string[];
  readonly motifs: readonly {
    readonly id: string;
    readonly ownership: ArchitectureSite['motifs'][number]['ownership'];
    readonly sourceBound: boolean;
  }[];
}

const EXPECTED_SUBJECT_IDS = [
  'villa-west-neoclassical',
  'villa-central-spanish',
  'villa-central-gothic',
  'villa-east-neoclassical',
  'princess-inspired-landmark',
  'butterfly-inspired-landmark',
  'huashi-inspired-landmark',
] as const satisfies readonly ArchitectureSubjectId[];

const SUBJECT_ORDER: Readonly<Record<ArchitectureSubjectId, number>> = Object.freeze({
  'villa-west-neoclassical': 0,
  'villa-central-spanish': 1,
  'villa-central-gothic': 2,
  'villa-east-neoclassical': 3,
  'princess-inspired-landmark': 4,
  'butterfly-inspired-landmark': 5,
  'huashi-inspired-landmark': 6,
});

const SUBJECT_CONTRACTS = {
  'villa-west-neoclassical': {
    kind: 'ordinary',
    style: 'german-neoclassical',
    stories: 2,
    inspiration: null,
    viewpointId: 'zijingguan-return',
    signage: 'small-gate-plaque',
    materials: ['muted-cream-stucco', 'red-brown-roof', 'restrained-stone-trim'],
    motifs: [
      { id: 'symmetric-stucco-massing', ownership: 'style-family', sourceBound: false },
      { id: 'hipped-gabled-red-brown-roof', ownership: 'style-family', sourceBound: false },
    ],
  },
  'villa-central-spanish': {
    kind: 'ordinary',
    style: 'spanish',
    stories: 2,
    inspiration: null,
    viewpointId: 'mixed-villa-intersection',
    signage: 'small-gate-plaque',
    materials: ['warm-stucco', 'low-red-tile-roof', 'dark-balcony-metal'],
    motifs: [
      { id: 'restrained-balcony-cue', ownership: 'style-family', sourceBound: false },
    ],
  },
  'villa-central-gothic': {
    kind: 'ordinary',
    style: 'gothic-castle',
    stories: 3,
    inspiration: null,
    viewpointId: 'mixed-villa-intersection',
    signage: 'small-gate-plaque',
    materials: ['gray-stone', 'charcoal-steep-roof', 'restrained-stone-trim'],
    motifs: [
      { id: 'asymmetric-steep-gable', ownership: 'style-family', sourceBound: false },
      { id: 'compact-tower', ownership: 'style-family', sourceBound: false },
    ],
  },
  'villa-east-neoclassical': {
    kind: 'ordinary',
    style: 'german-neoclassical',
    stories: 3,
    inspiration: null,
    viewpointId: 'ginkgo-maple-corridor',
    signage: 'small-gate-plaque',
    materials: ['muted-cream-stucco', 'red-brown-roof', 'restrained-stone-trim'],
    motifs: [
      { id: 'symmetric-stucco-massing', ownership: 'style-family', sourceBound: false },
      { id: 'restrained-classical-trim', ownership: 'style-family', sourceBound: false },
    ],
  },
  'princess-inspired-landmark': {
    kind: 'landmark',
    style: 'princess-nordic',
    stories: 2,
    inspiration: 'princess',
    viewpointId: 'princess-inspired-anchor',
    signage: 'none',
    materials: ['pine-green-stucco', 'dark-nordic-roof', 'crafted-wood-window'],
    motifs: [
      { id: 'nordic-danish-pine-green', ownership: 'landmark-specific', sourceBound: true },
      { id: 'crafted-wood-window-cue', ownership: 'landmark-specific', sourceBound: true },
    ],
  },
  'butterfly-inspired-landmark': {
    kind: 'landmark',
    style: 'butterfly-mansard',
    stories: 3,
    inspiration: 'butterfly',
    viewpointId: 'butterfly-inspired-anchor',
    signage: 'none',
    materials: ['warm-brick', 'dark-timber', 'charcoal-mansard-roof'],
    motifs: [
      { id: 'mansard-roof', ownership: 'landmark-specific', sourceBound: true },
      { id: 'brick-timber-expression', ownership: 'landmark-specific', sourceBound: true },
    ],
  },
  'huashi-inspired-landmark': {
    kind: 'landmark',
    style: 'huashi-castle',
    stories: 3,
    inspiration: 'huashi',
    viewpointId: 'shore-huashi-vista',
    signage: 'none',
    materials: ['warm-gray-stone', 'charcoal-roof', 'restrained-castle-trim'],
    motifs: [
      { id: 'compact-sculptural-shore-massing', ownership: 'landmark-specific', sourceBound: true },
      { id: 'compact-tower-cue', ownership: 'landmark-specific', sourceBound: false },
    ],
  },
} as const satisfies Record<ArchitectureSubjectId, SubjectContract>;

const GEOMETRY_IDS = [
  'unit-wall',
  'unit-trim',
  'unit-window',
  'unit-door',
  'unit-gable-roof',
  'unit-hip-roof',
  'unit-butterfly-lower-roof',
  'unit-butterfly-upper-roof',
  'unit-butterfly-roof-band',
  'unit-butterfly-dormer-gable',
  'unit-turret',
] as const satisfies readonly VillaGeometryId[];

const MATERIAL_IDS = [
  'muted-cream-stucco',
  'warm-stucco',
  'gray-stone',
  'pine-green-stucco',
  'warm-brick',
  'warm-gray-stone',
  'red-brown-roof',
  'red-tile-roof',
  'charcoal-roof',
  'butterfly-lower-roof',
  'butterfly-upper-roof',
  'butterfly-roof-band',
  'restrained-trim',
  'medium-stone-trim',
  'dark-wood',
  'warm-timber',
  'dark-window',
  'dark-metal',
] as const satisfies readonly VillaMaterialId[];

const MATERIAL_COLORS = {
  'muted-cream-stucco': 0xc5b58f,
  'warm-stucco': 0xbc8966,
  'gray-stone': 0x777872,
  'pine-green-stucco': 0x486657,
  'warm-brick': 0x895b4d,
  'warm-gray-stone': 0x918878,
  'red-brown-roof': 0x73473c,
  'red-tile-roof': 0x965a45,
  'charcoal-roof': 0x4d5050,
  'butterfly-lower-roof': 0x404748,
  'butterfly-upper-roof': 0x858078,
  'butterfly-roof-band': 0x513a32,
  'restrained-trim': 0xb4a78c,
  'medium-stone-trim': 0x6f716f,
  'dark-wood': 0x4c372e,
  'warm-timber': 0x89684f,
  'dark-window': 0x405159,
  'dark-metal': 0x50514d,
} as const satisfies Record<VillaMaterialId, number>;

const WINDOW_PROJECTION = 0.08;
const TRIM_PROJECTION = 0.12;
const GROUND_CLEARANCE = 0.035;
const BOUNDS_EPSILON = 1e-6;

function createGableRoofGeometry(): BufferGeometry {
  const a = [-0.5, 0, -0.5] as const;
  const b = [0.5, 0, -0.5] as const;
  const c = [0.5, 0, 0.5] as const;
  const d = [-0.5, 0, 0.5] as const;
  const e = [0, 1, -0.5] as const;
  const f = [0, 1, 0.5] as const;
  const positions = [
    ...a, ...c, ...b,
    ...a, ...d, ...c,
    ...a, ...e, ...b,
    ...d, ...c, ...f,
    ...a, ...d, ...f,
    ...a, ...f, ...e,
    ...b, ...e, ...f,
    ...b, ...f, ...c,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createButterflyLowerRoofGeometry(): BufferGeometry {
  const eaveFrontLeft = [-0.5, 0, 0.5] as const;
  const eaveFrontRight = [0.5, 0, 0.5] as const;
  const eaveRearRight = [0.5, 0, -0.5] as const;
  const eaveRearLeft = [-0.5, 0, -0.5] as const;
  const breakFrontLeft = [-0.38, 1, 0.38] as const;
  const breakFrontRight = [0.38, 1, 0.38] as const;
  const breakRearRight = [0.38, 1, -0.38] as const;
  const breakRearLeft = [-0.38, 1, -0.38] as const;
  const positions = [
    ...eaveFrontLeft, ...eaveFrontRight, ...breakFrontRight,
    ...eaveFrontLeft, ...breakFrontRight, ...breakFrontLeft,
    ...eaveRearRight, ...eaveRearLeft, ...breakRearLeft,
    ...eaveRearRight, ...breakRearLeft, ...breakRearRight,
    ...eaveFrontRight, ...eaveRearRight, ...breakRearRight,
    ...eaveFrontRight, ...breakRearRight, ...breakFrontRight,
    ...eaveRearLeft, ...eaveFrontLeft, ...breakFrontLeft,
    ...eaveRearLeft, ...breakFrontLeft, ...breakRearLeft,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createButterflyUpperRoofGeometry(): BufferGeometry {
  const frontLeft = [-0.5, 0, 0.5] as const;
  const frontRight = [0.5, 0, 0.5] as const;
  const rearRight = [0.5, 0, -0.5] as const;
  const rearLeft = [-0.5, 0, -0.5] as const;
  const ridgeLeft = [-0.31, 1, 0] as const;
  const ridgeRight = [0.31, 1, 0] as const;
  const positions = [
    ...frontLeft, ...frontRight, ...ridgeRight,
    ...frontLeft, ...ridgeRight, ...ridgeLeft,
    ...rearRight, ...rearLeft, ...ridgeLeft,
    ...rearRight, ...ridgeLeft, ...ridgeRight,
    ...rearLeft, ...frontLeft, ...ridgeLeft,
    ...frontRight, ...rearRight, ...ridgeRight,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createButterflyDormerGableGeometry(): BufferGeometry {
  const positions = [
    -0.5, 0, 0,
    0.5, 0, 0,
    0, 1, 0,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createButterflyRoofBandGeometry(): BufferGeometry {
  const innerHalf = 0.48;
  const outerFrontLeftBottom = [-0.5, -0.5, 0.5] as const;
  const outerFrontRightBottom = [0.5, -0.5, 0.5] as const;
  const outerRearRightBottom = [0.5, -0.5, -0.5] as const;
  const outerRearLeftBottom = [-0.5, -0.5, -0.5] as const;
  const outerFrontLeftTop = [-0.5, 0.5, 0.5] as const;
  const outerFrontRightTop = [0.5, 0.5, 0.5] as const;
  const outerRearRightTop = [0.5, 0.5, -0.5] as const;
  const outerRearLeftTop = [-0.5, 0.5, -0.5] as const;
  const innerFrontLeftTop = [-innerHalf, 0.5, innerHalf] as const;
  const innerFrontRightTop = [innerHalf, 0.5, innerHalf] as const;
  const innerRearRightTop = [innerHalf, 0.5, -innerHalf] as const;
  const innerRearLeftTop = [-innerHalf, 0.5, -innerHalf] as const;
  const positions = [
    ...outerFrontLeftBottom, ...outerFrontRightBottom, ...outerFrontRightTop,
    ...outerFrontLeftBottom, ...outerFrontRightTop, ...outerFrontLeftTop,
    ...outerRearRightBottom, ...outerRearLeftBottom, ...outerRearLeftTop,
    ...outerRearRightBottom, ...outerRearLeftTop, ...outerRearRightTop,
    ...outerFrontRightBottom, ...outerRearRightBottom, ...outerRearRightTop,
    ...outerFrontRightBottom, ...outerRearRightTop, ...outerFrontRightTop,
    ...outerRearLeftBottom, ...outerFrontLeftBottom, ...outerFrontLeftTop,
    ...outerRearLeftBottom, ...outerFrontLeftTop, ...outerRearLeftTop,
    ...outerFrontLeftTop, ...outerFrontRightTop, ...innerFrontRightTop,
    ...outerFrontLeftTop, ...innerFrontRightTop, ...innerFrontLeftTop,
    ...outerRearRightTop, ...outerRearLeftTop, ...innerRearLeftTop,
    ...outerRearRightTop, ...innerRearLeftTop, ...innerRearRightTop,
    ...outerFrontRightTop, ...outerRearRightTop, ...innerRearRightTop,
    ...outerFrontRightTop, ...innerRearRightTop, ...innerFrontRightTop,
    ...outerRearLeftTop, ...outerFrontLeftTop, ...innerFrontLeftTop,
    ...outerRearLeftTop, ...innerFrontLeftTop, ...innerRearLeftTop,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSharedGeometries(
  resources: ResourceRegistry,
  group: string,
): ReadonlyMap<VillaGeometryId, BufferGeometry> {
  const hipRoof = new ConeGeometry(Math.SQRT1_2, 1, 4, 1, false, Math.PI * 0.25);
  hipRoof.translate(0, 0.5, 0);

  const definitions: readonly (readonly [VillaGeometryId, BufferGeometry])[] = [
    ['unit-wall', new BoxGeometry(1, 1, 1)],
    ['unit-trim', new BoxGeometry(1, 1, 1)],
    ['unit-window', new BoxGeometry(1, 1, 1)],
    ['unit-door', new BoxGeometry(1, 1, 1)],
    ['unit-gable-roof', createGableRoofGeometry()],
    ['unit-hip-roof', hipRoof],
    ['unit-butterfly-lower-roof', createButterflyLowerRoofGeometry()],
    ['unit-butterfly-upper-roof', createButterflyUpperRoofGeometry()],
    ['unit-butterfly-roof-band', createButterflyRoofBandGeometry()],
    ['unit-butterfly-dormer-gable', createButterflyDormerGableGeometry()],
    ['unit-turret', new CylinderGeometry(0.5, 0.5, 1, 8)],
  ];
  const geometries = new Map<VillaGeometryId, BufferGeometry>();
  for (const [geometryId, geometry] of definitions) {
    geometry.name = `architecture:${geometryId}`;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometries.set(geometryId, resources.register(geometry, group));
  }
  return geometries;
}

function createSharedMaterials(
  resources: ResourceRegistry,
  group: string,
): ReadonlyMap<VillaMaterialId, MeshBasicMaterial> {
  const materials = new Map<VillaMaterialId, MeshBasicMaterial>();
  for (const materialId of MATERIAL_IDS) {
    const material = new MeshBasicMaterial({ color: new Color(MATERIAL_COLORS[materialId]) });
    material.name = `architecture:${materialId}`;
    materials.set(materialId, resources.register(material, group));
  }
  return materials;
}

function requireMapValue<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing shared architecture ${label}.`);
  return value;
}

function immutableBounds(bounds: Bounds2): Bounds2 {
  return Object.freeze({
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
  });
}

function immutableTuple(tuple: readonly [number, number, number]): readonly [number, number, number] {
  return Object.freeze([tuple[0], tuple[1], tuple[2]] as [number, number, number]);
}

function immutableCameraViews(site: ArchitectureSite): ImmutableCameraViews {
  const clone = (view: ArchitectureCameraView): ArchitectureCameraView => Object.freeze({
    position: immutableTuple(view.position),
    target: immutableTuple(view.target),
    ySemantics: 'site-ground-relative' as const,
  });
  return Object.freeze({
    front: clone(site.cameraViews.front),
    'three-quarter': clone(site.cameraViews['three-quarter']),
    route: clone(site.cameraViews.route),
    low: clone(site.cameraViews.low),
  });
}

function assertFiniteBounds(bounds: Bounds2, label: string): void {
  if (![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)) {
    throw new RangeError(`${label} must contain finite coordinates.`);
  }
  if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) {
    throw new RangeError(`${label} must have positive width and depth.`);
  }
}

function sameBounds(first: Bounds2, second: Bounds2): boolean {
  return first.minX === second.minX
    && first.maxX === second.maxX
    && first.minZ === second.minZ
    && first.maxZ === second.maxZ;
}

function containsBounds(container: Bounds2, contained: Bounds2): boolean {
  return contained.minX >= container.minX
    && contained.maxX <= container.maxX
    && contained.minZ >= container.minZ
    && contained.maxZ <= container.maxZ;
}

function sameStringMembers(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) return false;
  return expected.every((value) => actual.includes(value));
}

function validateSite(site: ArchitectureSite): void {
  const contract = SUBJECT_CONTRACTS[site.id];
  if (contract === undefined) throw new RangeError(`Unsupported architecture subject "${site.id}".`);
  if (site.kind !== contract.kind
    || site.style !== contract.style
    || site.stories !== contract.stories
    || site.inspiration !== contract.inspiration
    || site.viewpointId !== contract.viewpointId
    || site.signage !== contract.signage) {
    throw new RangeError(`Architecture subject "${site.id}" does not match its style recipe contract.`);
  }
  if (!sameStringMembers(site.materials, contract.materials)) {
    throw new RangeError(`Architecture subject "${site.id}" has an invalid material disclosure.`);
  }
  if (site.motifs.length !== contract.motifs.length
    || new Set(site.motifs.map(({ id }) => id)).size !== site.motifs.length) {
    throw new RangeError(`Architecture subject "${site.id}" has an invalid motif set.`);
  }
  for (const expected of contract.motifs) {
    const actual = site.motifs.find(({ id }) => id === expected.id);
    if (actual === undefined
      || actual.ownership !== expected.ownership
      || actual.sourceBound !== expected.sourceBound) {
      throw new RangeError(`Architecture subject "${site.id}" violates motif ownership for "${expected.id}".`);
    }
  }
  if (site.provenance.exactFacade !== 'authored-inference' || site.provenance.replica !== false) {
    throw new RangeError(`Architecture subject "${site.id}" must remain authored inference, not a replica.`);
  }

  assertFiniteBounds(site.siteBounds, `${site.id} site bounds`);
  assertFiniteBounds(site.visibleBounds, `${site.id} visible bounds`);
  assertFiniteBounds(site.collisionBounds, `${site.id} collision bounds`);
  if (!sameBounds(site.siteBounds, site.collisionBounds)) {
    throw new RangeError(`Architecture subject "${site.id}" must use its site AABB as its collision AABB.`);
  }
  if (!containsBounds(site.siteBounds, site.visibleBounds)) {
    throw new RangeError(`Architecture subject "${site.id}" visible bounds must stay inside its site.`);
  }

  for (const viewName of ['front', 'three-quarter', 'route', 'low'] as const) {
    const view = site.cameraViews[viewName];
    if (view.ySemantics !== 'site-ground-relative'
      || ![...view.position, ...view.target].every(Number.isFinite)) {
      throw new RangeError(`Architecture subject "${site.id}" has an invalid ${viewName} camera view.`);
    }
  }
}

function siteGround(site: ArchitectureSite): number {
  const { minX, maxX, minZ, maxZ } = site.visibleBounds;
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  return Math.max(
    sampleGroundHeight(minX, minZ),
    sampleGroundHeight(maxX, minZ),
    sampleGroundHeight(minX, maxZ),
    sampleGroundHeight(maxX, maxZ),
    sampleGroundHeight(centerX, centerZ),
  ) + GROUND_CLEARANCE;
}

function transform(
  x: number,
  y: number,
  z: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  yaw = 0,
): VillaTransform {
  return {
    position: [x, y, z],
    scale: [scaleX, scaleY, scaleZ],
    rotation: [0, yaw, 0],
  };
}

function applyTransform(object: Object3D, value: VillaTransform): void {
  object.position.set(...value.position);
  object.rotation.set(...value.rotation);
  object.scale.set(...value.scale);
  object.updateMatrix();
}

function assertTransformInsideVisibleBounds(
  site: ArchitectureSite,
  geometry: BufferGeometry,
  value: VillaTransform,
  name: string,
): void {
  const numbers = [...value.position, ...value.scale, ...value.rotation];
  if (!numbers.every(Number.isFinite) || value.scale.some((component) => component <= 0)) {
    throw new RangeError(`Architecture component "${name}" has an invalid transform.`);
  }
  if (value.rotation[0] !== 0 || value.rotation[2] !== 0) {
    throw new RangeError(`Architecture component "${name}" may only rotate around the world Y axis.`);
  }
  if (geometry.boundingBox === null) geometry.computeBoundingBox();
  const localBounds = geometry.boundingBox;
  if (localBounds === null) {
    throw new RangeError(`Architecture component "${name}" has no measurable geometry bounds.`);
  }

  const yaw = value.rotation[1];
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const localXs = [localBounds.min.x * value.scale[0], localBounds.max.x * value.scale[0]] as const;
  const localZs = [localBounds.min.z * value.scale[2], localBounds.max.z * value.scale[2]] as const;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const localX of localXs) {
    for (const localZ of localZs) {
      const worldX = value.position[0] + localX * cosine + localZ * sine;
      const worldZ = value.position[2] - localX * sine + localZ * cosine;
      minX = Math.min(minX, worldX);
      maxX = Math.max(maxX, worldX);
      minZ = Math.min(minZ, worldZ);
      maxZ = Math.max(maxZ, worldZ);
    }
  }

  const bounds = site.visibleBounds;
  if (minX < bounds.minX - BOUNDS_EPSILON
    || maxX > bounds.maxX + BOUNDS_EPSILON
    || minZ < bounds.minZ - BOUNDS_EPSILON
    || maxZ > bounds.maxZ + BOUNDS_EPSILON) {
    throw new RangeError(`Architecture component "${name}" exceeds ${site.id} visible bounds.`);
  }
}

function geometryTriangles(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  return (index?.count ?? geometry.getAttribute('position').count) / 3;
}

function recordComponent(
  context: RecipeContext,
  kind: VillaComponentKind,
  geometry: BufferGeometry,
  instanced: boolean,
): void {
  context.counts[kind] += 1;
  context.counts.estimatedTriangles += geometryTriangles(geometry);
  if (!instanced) context.counts.directDrawCalls += 1;
}

function addDirectComponent(
  context: RecipeContext,
  kind: DirectComponentKind,
  geometryId: VillaGeometryId,
  materialId: VillaMaterialId,
  name: string,
  value: VillaTransform,
): void {
  const geometry = requireMapValue(context.geometries, geometryId, `geometry "${geometryId}"`);
  assertTransformInsideVisibleBounds(context.site, geometry, value, name);
  const material = requireMapValue(context.materials, materialId, `material "${materialId}"`);
  const mesh = new Mesh(geometry, material);
  mesh.name = `architecture:${context.site.id}:${name}`;
  applyTransform(mesh, value);
  context.root.add(mesh);
  recordComponent(context, kind, geometry, false);
}

function queueInstance(
  context: RecipeContext,
  kind: InstancedComponentKind,
  geometryId: VillaGeometryId,
  materialId: VillaMaterialId,
  name: string,
  value: VillaTransform,
): void {
  const geometry = requireMapValue(context.geometries, geometryId, `geometry "${geometryId}"`);
  assertTransformInsideVisibleBounds(context.site, geometry, value, name);
  requireMapValue(context.materials, materialId, `material "${materialId}"`);
  context.instances.push({
    kind,
    geometryId,
    materialId,
    transform: value,
    name,
    order: context.instances.length,
  });
  recordComponent(context, kind, geometry, true);
}

function createPlan(site: ArchitectureSite, widthRatio: number, depthRatio: number): Plan {
  const bounds = site.visibleBounds;
  return {
    centerX: (bounds.minX + bounds.maxX) * 0.5,
    centerZ: (bounds.minZ + bounds.maxZ) * 0.5,
    width: (bounds.maxX - bounds.minX) * widthRatio,
    depth: (bounds.maxZ - bounds.minZ) * depthRatio,
  };
}

function addWall(
  context: RecipeContext,
  name: string,
  materialId: VillaMaterialId,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  baseY = context.ground,
): void {
  addDirectComponent(
    context,
    'wall',
    'unit-wall',
    materialId,
    name,
    transform(x, baseY + height * 0.5, z, width, height, depth),
  );
}

function addRoof(
  context: RecipeContext,
  name: string,
  geometryId: 'unit-gable-roof' | 'unit-hip-roof' | 'unit-butterfly-lower-roof' | 'unit-butterfly-upper-roof',
  materialId: VillaMaterialId,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  baseY: number,
): void {
  addDirectComponent(
    context,
    'roof',
    geometryId,
    materialId,
    name,
    transform(x, baseY, z, width, height, depth),
  );
}

function addTurret(
  context: RecipeContext,
  name: string,
  materialId: VillaMaterialId,
  x: number,
  z: number,
  diameter: number,
  height: number,
  baseY = context.ground,
): void {
  addDirectComponent(
    context,
    'turret',
    'unit-turret',
    materialId,
    name,
    transform(x, baseY + height * 0.5, z, diameter, height, diameter),
  );
}

function queueWindow(
  context: RecipeContext,
  name: string,
  materialId: VillaMaterialId,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  yaw = 0,
): void {
  queueInstance(
    context,
    'window',
    'unit-window',
    materialId,
    name,
    transform(x, y, z, width, height, 0.14, yaw),
  );
}

function queueDoor(
  context: RecipeContext,
  name: string,
  x: number,
  z: number,
  width: number,
  height: number,
): void {
  queueInstance(
    context,
    'door',
    'unit-door',
    'dark-wood',
    name,
    transform(x, context.ground + height * 0.5, z, width, height, 0.2),
  );
}

function queueTrim(
  context: RecipeContext,
  name: string,
  materialId: VillaMaterialId,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  yaw = 0,
): void {
  queueInstance(
    context,
    'trim',
    'unit-trim',
    materialId,
    name,
    transform(x, y, z, width, height, depth, yaw),
  );
}

function queueBlankGatePlaque(context: RecipeContext, doorX: number, doorZ: number): void {
  queueTrim(
    context,
    'small-gate-plaque',
    'restrained-trim',
    doorX + 1.05,
    context.ground + 1.35,
    doorZ + 0.02,
    0.54,
    0.3,
    0.1,
  );
}

function distributedOffsets(count: number, span: number): readonly number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  return Array.from({ length: count }, (_, index) => -span * 0.5 + (span * index) / (count - 1));
}

function addFacadeWindows(
  context: RecipeContext,
  options: FacadeWindowsOptions,
): readonly FrontWindow[] {
  const frontWindows: FrontWindow[] = [];
  const xOffsets = distributedOffsets(
    options.columns,
    Math.max(0, options.width - options.windowWidth * 2.1),
  );
  const frontZ = options.centerZ + options.depth * 0.5 + WINDOW_PROJECTION;
  const rearZ = options.centerZ - options.depth * 0.5 - WINDOW_PROJECTION;
  for (let floor = 0; floor < options.floors; floor += 1) {
    const y = options.baseY + options.storyHeight * (floor + 0.58);
    for (let column = 0; column < xOffsets.length; column += 1) {
      const offset = xOffsets[column];
      if (offset === undefined) continue;
      const x = options.centerX + offset;
      queueWindow(
        context,
        `front-window-${floor}-${column}`,
        options.materialId,
        x,
        y,
        frontZ,
        options.windowWidth,
        options.windowHeight,
      );
      frontWindows.push({ x, y, z: frontZ, width: options.windowWidth, height: options.windowHeight });
      if (options.includeRear) {
        queueWindow(
          context,
          `rear-window-${floor}-${column}`,
          options.materialId,
          x,
          y,
          rearZ,
          options.windowWidth,
          options.windowHeight,
        );
      }
    }
  }

  const zOffsets = distributedOffsets(
    options.sideColumns,
    Math.max(0, options.depth - options.windowWidth * 2.1),
  );
  const leftX = options.centerX - options.width * 0.5 - WINDOW_PROJECTION;
  const rightX = options.centerX + options.width * 0.5 + WINDOW_PROJECTION;
  for (let floor = 0; floor < options.floors; floor += 1) {
    const y = options.baseY + options.storyHeight * (floor + 0.58);
    for (let column = 0; column < zOffsets.length; column += 1) {
      const offset = zOffsets[column];
      if (offset === undefined) continue;
      const z = options.centerZ + offset;
      queueWindow(
        context,
        `left-window-${floor}-${column}`,
        options.materialId,
        leftX,
        y,
        z,
        options.windowWidth,
        options.windowHeight,
        Math.PI * 0.5,
      );
      queueWindow(
        context,
        `right-window-${floor}-${column}`,
        options.materialId,
        rightX,
        y,
        z,
        options.windowWidth,
        options.windowHeight,
        Math.PI * 0.5,
      );
    }
  }
  return frontWindows;
}

function addPrincessCraftedWindow(
  context: RecipeContext,
  name: string,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  yaw = 0,
): void {
  const revealBand = 0.18;
  const frameThickness = 0.2;
  const mullionThickness = 0.12;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const placeTrim = (
    part: string,
    materialId: VillaMaterialId,
    lateral: number,
    centerY: number,
    outward: number,
    partWidth: number,
    partHeight: number,
    depth: number,
  ): void => {
    queueTrim(
      context,
      `${name}-${part}`,
      materialId,
      x + lateral * cosine + outward * sine,
      centerY,
      z - lateral * sine + outward * cosine,
      partWidth,
      partHeight,
      depth,
      yaw,
    );
  };

  placeTrim(
    'reveal',
    'dark-wood',
    0,
    y,
    0.1,
    width + revealBand * 2,
    height + revealBand * 2,
    0.2,
  );
  queueWindow(
    context,
    `${name}-glazing`,
    'dark-window',
    x + 0.22 * sine,
    y,
    z + 0.22 * cosine,
    width,
    height,
    yaw,
  );

  const frameOffset = 0.34;
  const frameCenter = width * 0.5 + revealBand + frameThickness * 0.5;
  const frameHeight = height + (revealBand + frameThickness) * 2;
  const frameWidth = width + (revealBand + frameThickness) * 2;
  for (const side of [-1, 1] as const) {
    placeTrim(
      side < 0 ? 'left-surround' : 'right-surround',
      'warm-timber',
      side * frameCenter,
      y,
      frameOffset,
      frameThickness,
      frameHeight,
      0.24,
    );
    placeTrim(
      side < 0 ? 'bottom-surround' : 'top-surround',
      'warm-timber',
      0,
      y + side * (height * 0.5 + revealBand + frameThickness * 0.5),
      side < 0 ? 0.38 : frameOffset,
      frameWidth,
      frameThickness,
      side < 0 ? 0.4 : 0.24,
    );
  }
  placeTrim(
    'center-mullion',
    'warm-timber',
    0,
    y,
    frameOffset + 0.01,
    mullionThickness,
    height,
    0.22,
  );
  for (const side of [-1, 1] as const) {
    placeTrim(
      side < 0 ? 'lower-crossbar' : 'upper-crossbar',
      'warm-timber',
      0,
      y + side * height * 0.22,
      frameOffset + 0.01,
      width,
      mullionThickness,
      0.22,
    );
  }
}

function addHorizontalBand(
  context: RecipeContext,
  name: string,
  materialId: VillaMaterialId,
  centerX: number,
  frontZ: number,
  width: number,
  y: number,
): void {
  queueTrim(context, name, materialId, centerX, y, frontZ + TRIM_PROJECTION, width, 0.18, 0.13);
}

function buildGermanNeoclassical(context: RecipeContext): void {
  const plan = createPlan(context.site, 0.72, 0.56);
  const storyHeight = 2.65;
  const wallHeight = context.site.stories * storyHeight;
  const frontZ = plan.centerZ + plan.depth * 0.5;
  const porticoWidth = Math.min(plan.width * 0.36, 4.9);
  const entablatureWidth = porticoWidth * 0.82;
  const porticoZ = frontZ + 0.56;
  const plinthHeight = 0.24;
  const columnHeight = 2.16;
  const capitalHeight = 0.2;
  const entablatureHeight = 0.42;
  const entablatureBaseY = context.ground + plinthHeight + columnHeight + capitalHeight;

  const addGermanDirectTrim = (
    name: string,
    materialId: VillaMaterialId,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
  ): void => {
    const geometry = requireMapValue(context.geometries, 'unit-trim', 'geometry "unit-trim"');
    const value = transform(x, y, z, width, height, depth);
    assertTransformInsideVisibleBounds(context.site, geometry, value, name);
    const material = requireMapValue(context.materials, materialId, `material "${materialId}"`);
    const mesh = new Mesh(geometry, material);
    mesh.name = `architecture:${context.site.id}:${name}`;
    applyTransform(mesh, value);
    context.root.add(mesh);
    recordComponent(context, 'trim', geometry, false);
  };

  const addGermanPedimentFace = (baseY: number): void => {
    const name = 'connected-red-brown-portico-pediment';
    const geometry = requireMapValue(
      context.geometries,
      'unit-butterfly-dormer-gable',
      'geometry "unit-butterfly-dormer-gable"',
    );
    const value = transform(plan.centerX, baseY, frontZ + 0.765, entablatureWidth, 0.86, 1);
    assertTransformInsideVisibleBounds(context.site, geometry, value, name);
    const material = requireMapValue(context.materials, 'red-brown-roof', 'material "red-brown-roof"');
    const mesh = new Mesh(geometry, material);
    mesh.name = `architecture:${context.site.id}:${name}`;
    applyTransform(mesh, value);
    context.root.add(mesh);
    recordComponent(context, 'roof', geometry, false);
  };

  addWall(
    context,
    'symmetric-main-mass',
    'muted-cream-stucco',
    plan.centerX,
    plan.centerZ,
    plan.width,
    wallHeight,
    plan.depth,
  );
  addWall(
    context,
    'connected-portico-backdrop',
    'muted-cream-stucco',
    plan.centerX,
    frontZ + 0.06,
    porticoWidth,
    entablatureBaseY - context.ground,
    0.12,
  );
  addRoof(
    context,
    'red-brown-hipped-roof',
    'unit-hip-roof',
    'red-brown-roof',
    plan.centerX,
    plan.centerZ,
    plan.width * 1.01,
    context.site.stories === 2 ? 1.65 : 1.85,
    plan.depth * 1.02,
    context.ground + wallHeight,
  );

  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'left' : 'right';
    const columnX = plan.centerX + side * porticoWidth * 0.31;
    addGermanDirectTrim(
      `connected-portico-plinth-${sideName}`,
      'medium-stone-trim',
      columnX,
      context.ground + plinthHeight * 0.5,
      porticoZ,
      0.76,
      plinthHeight,
      0.2,
    );
    addGermanDirectTrim(
      `connected-portico-column-${sideName}`,
      'medium-stone-trim',
      columnX,
      context.ground + plinthHeight + columnHeight * 0.5,
      porticoZ,
      0.56,
      columnHeight,
      0.24,
    );
    addGermanDirectTrim(
      `connected-portico-capital-${sideName}`,
      'medium-stone-trim',
      columnX,
      context.ground + plinthHeight + columnHeight + capitalHeight * 0.5,
      frontZ + 0.67,
      0.78,
      capitalHeight,
      0.18,
    );
  }
  addGermanDirectTrim(
    'connected-portico-entablature',
    'medium-stone-trim',
    plan.centerX,
    entablatureBaseY + entablatureHeight * 0.5,
    frontZ + 0.68,
    entablatureWidth,
    entablatureHeight,
    0.16,
  );
  addGermanPedimentFace(entablatureBaseY + entablatureHeight);

  addFacadeWindows(context, {
    centerX: plan.centerX,
    centerZ: plan.centerZ,
    width: plan.width,
    depth: plan.depth,
    baseY: context.ground,
    storyHeight,
    floors: context.site.stories,
    columns: 4,
    sideColumns: 1,
    windowWidth: 1.05,
    windowHeight: 1.35,
    materialId: 'dark-window',
    includeRear: true,
  });
  queueDoor(
    context,
    'central-door',
    plan.centerX,
    frontZ + 0.16,
    1.35,
    2.3,
  );
  addGermanDirectTrim(
    'small-gate-plaque',
    'restrained-trim',
    plan.centerX + porticoWidth * 0.19,
    context.ground + 1.35,
    frontZ + 0.2,
    0.34,
    0.28,
    0.08,
  );
  for (let floor = 2; floor < context.site.stories; floor += 1) {
    addHorizontalBand(
      context,
      `classical-floor-band-${floor}`,
      'restrained-trim',
      plan.centerX,
      frontZ,
      plan.width * 0.98,
      context.ground + floor * storyHeight,
    );
  }
  addGermanDirectTrim(
    'connected-classical-cornice',
    'medium-stone-trim',
    plan.centerX,
    context.ground + wallHeight - 0.16,
    frontZ + 0.09,
    plan.width * 0.98,
    0.32,
    0.18,
  );
  for (const side of [-1, 1] as const) {
    addGermanDirectTrim(
      `outer-facade-pilaster-${side < 0 ? 'left' : 'right'}`,
      'medium-stone-trim',
      plan.centerX + side * (plan.width * 0.5 - 0.2),
      context.ground + wallHeight * 0.5,
      frontZ + 0.075,
      0.36,
      wallHeight - 0.32,
      0.15,
    );
  }
}

function buildSpanish(context: RecipeContext): void {
  const plan = createPlan(context.site, 0.74, 0.62);
  const storyHeight = 2.6;
  const wallHeight = storyHeight * 2;
  const frontZ = plan.centerZ + plan.depth * 0.5;
  const balconyDepth = Math.min(0.72, plan.depth * 0.17);
  const balconyWidth = plan.width * 0.38;

  addWall(
    context,
    'warm-stucco-main-mass',
    'warm-stucco',
    plan.centerX,
    plan.centerZ,
    plan.width,
    wallHeight,
    plan.depth,
  );
  addRoof(
    context,
    'low-red-tile-roof',
    'unit-hip-roof',
    'red-tile-roof',
    plan.centerX,
    plan.centerZ,
    plan.width * 1.08,
    1.18,
    plan.depth * 1.14,
    context.ground + wallHeight,
  );
  addFacadeWindows(context, {
    centerX: plan.centerX,
    centerZ: plan.centerZ,
    width: plan.width,
    depth: plan.depth,
    baseY: context.ground,
    storyHeight,
    floors: 2,
    columns: 4,
    sideColumns: 1,
    windowWidth: 1.0,
    windowHeight: 1.3,
    materialId: 'dark-window',
    includeRear: true,
  });
  queueDoor(context, 'center-door', plan.centerX, frontZ + WINDOW_PROJECTION, 1.4, 2.25);
  queueBlankGatePlaque(context, plan.centerX, frontZ + WINDOW_PROJECTION);
  addWall(
    context,
    'restrained-balcony-slab',
    'dark-metal',
    plan.centerX,
    frontZ + balconyDepth * 0.5,
    balconyWidth,
    0.16,
    balconyDepth,
    context.ground + storyHeight + 0.38,
  );
  const railZ = frontZ + balconyDepth + 0.06;
  const railY = context.ground + storyHeight + 1.22;
  queueTrim(
    context,
    'balcony-top-rail',
    'dark-metal',
    plan.centerX,
    railY,
    railZ,
    balconyWidth,
    0.12,
    0.1,
  );
  for (const [index, offset] of distributedOffsets(5, balconyWidth * 0.88).entries()) {
    queueTrim(
      context,
      `balcony-rail-${index}`,
      'dark-metal',
      plan.centerX + offset,
      railY - 0.43,
      railZ,
      0.09,
      0.85,
      0.09,
    );
  }
  addHorizontalBand(
    context,
    'stucco-floor-band',
    'restrained-trim',
    plan.centerX,
    frontZ,
    plan.width * 0.96,
    context.ground + storyHeight,
  );
}

function buildGothicCastle(context: RecipeContext): void {
  const plan = createPlan(context.site, 0.72, 0.64);
  const storyHeight = 2.7;
  const wallHeight = storyHeight * 3;
  const mainWidth = plan.width * 0.68;
  const mainCenterX = plan.centerX - plan.width * 0.1;
  const towerDiameter = Math.min(plan.width * 0.22, plan.depth * 0.68);
  const towerHeight = wallHeight * 1.08;
  const towerX = plan.centerX + plan.width * 0.43;
  const towerZ = plan.centerZ + plan.depth * 0.04;
  const frontZ = plan.centerZ + plan.depth * 0.5;
  const mainRightX = mainCenterX + mainWidth * 0.5;
  const towerLeftX = towerX - towerDiameter * 0.5;
  const connectorWidth = towerLeftX - mainRightX + 0.5;
  const connectorCenterX = (mainRightX + towerLeftX) * 0.5;

  addWall(
    context,
    'asymmetric-gray-stone-mass',
    'gray-stone',
    mainCenterX,
    plan.centerZ,
    mainWidth,
    wallHeight,
    plan.depth,
  );
  addWall(
    context,
    'tower-link-mass',
    'gray-stone',
    connectorCenterX,
    plan.centerZ - plan.depth * 0.08,
    connectorWidth,
    wallHeight * 0.66,
    plan.depth * 0.62,
  );
  addRoof(
    context,
    'steep-charcoal-gable',
    'unit-gable-roof',
    'charcoal-roof',
    mainCenterX,
    plan.centerZ,
    mainWidth,
    4.3,
    plan.depth * 1.06,
    context.ground + wallHeight,
  );
  addTurret(
    context,
    'compact-gray-stone-tower',
    'gray-stone',
    towerX,
    towerZ,
    towerDiameter,
    towerHeight,
  );
  addTurret(
    context,
    'continuous-tower-eave-ring',
    'medium-stone-trim',
    towerX,
    towerZ,
    towerDiameter * 1.12,
    0.6,
    context.ground + towerHeight - 0.1,
  );
  addRoof(
    context,
    'compact-tower-cap',
    'unit-hip-roof',
    'charcoal-roof',
    towerX,
    towerZ,
    towerDiameter,
    2.3,
    towerDiameter,
    context.ground + towerHeight + 0.35,
  );
  addFacadeWindows(context, {
    centerX: mainCenterX,
    centerZ: plan.centerZ,
    width: mainWidth,
    depth: plan.depth,
    baseY: context.ground,
    storyHeight,
    floors: 3,
    columns: 3,
    sideColumns: 1,
    windowWidth: 0.56,
    windowHeight: 1.82,
    materialId: 'dark-window',
    includeRear: true,
  });
  for (let floor = 0; floor < 3; floor += 1) {
    queueWindow(
      context,
      `tower-window-${floor}`,
      'dark-window',
      towerX,
      context.ground + storyHeight * (floor + 0.62),
      towerZ + towerDiameter * 0.5 + WINDOW_PROJECTION,
      0.52,
      1.65,
    );
  }
  queueDoor(
    context,
    'offset-door',
    mainCenterX - mainWidth * 0.24,
    frontZ + WINDOW_PROJECTION,
    1.18,
    2.35,
  );
  queueBlankGatePlaque(
    context,
    mainCenterX - mainWidth * 0.24,
    frontZ + WINDOW_PROJECTION,
  );
  addHorizontalBand(
    context,
    'tower-line-stone-band',
    'restrained-trim',
    mainCenterX,
    frontZ,
    mainWidth * 0.96,
    context.ground + storyHeight * 2,
  );
}

function buildPrincessNordic(context: RecipeContext): void {
  const plan = createPlan(context.site, 0.7, 0.68);
  const storyHeight = 2.7;
  const wallHeight = storyHeight * 2;
  const projectionWidth = plan.width * 0.34;
  const projectionDepth = plan.depth * 0.16;
  const frontZ = plan.centerZ + plan.depth * 0.5;
  const rearZ = plan.centerZ - plan.depth * 0.5;
  const projectionCenterZ = frontZ + projectionDepth * 0.5;
  const projectionFrontZ = frontZ + projectionDepth;

  addWall(
    context,
    'pine-green-main-mass',
    'pine-green-stucco',
    plan.centerX,
    plan.centerZ,
    plan.width,
    wallHeight,
    plan.depth,
  );
  addWall(
    context,
    'nordic-front-gable-mass',
    'pine-green-stucco',
    plan.centerX,
    projectionCenterZ,
    projectionWidth,
    wallHeight * 0.88,
    projectionDepth,
  );
  addRoof(
    context,
    'dark-nordic-steep-roof',
    'unit-gable-roof',
    'charcoal-roof',
    plan.centerX,
    plan.centerZ,
    plan.width * 1.08,
    2.75,
    plan.depth * 1.08,
    context.ground + wallHeight,
  );
  addRoof(
    context,
    'front-cross-gable',
    'unit-gable-roof',
    'charcoal-roof',
    plan.centerX,
    projectionCenterZ,
    plan.width * 0.39,
    1.8,
    projectionDepth * 1.3,
    context.ground + wallHeight * 0.88,
  );

  const windowWidth = 0.92;
  const windowHeight = 1.36;
  const wingWidth = (plan.width - projectionWidth) * 0.5;
  const wingCenterOffset = (projectionWidth + wingWidth) * 0.5;
  const wingBayOffset = wingWidth * 0.235;
  for (let floor = 0; floor < 2; floor += 1) {
    const y = context.ground + storyHeight * (floor + 0.58);
    for (const wingSide of [-1, 1] as const) {
      for (const baySide of [-1, 1] as const) {
        addPrincessCraftedWindow(
          context,
          `front-${wingSide < 0 ? 'left' : 'right'}-wing-${floor}-${baySide < 0 ? 'inner' : 'outer'}`,
          plan.centerX + wingSide * wingCenterOffset + wingSide * baySide * wingBayOffset,
          y,
          frontZ,
          windowWidth,
          windowHeight,
        );
      }
    }
  }

  const sideWindowZs = distributedOffsets(2, plan.depth * 0.45);
  for (let floor = 0; floor < 2; floor += 1) {
    const y = context.ground + storyHeight * (floor + 0.58);
    for (const side of [-1, 1] as const) {
      for (let index = 0; index < sideWindowZs.length; index += 1) {
        const offset = sideWindowZs[index];
        if (offset === undefined) continue;
        addPrincessCraftedWindow(
          context,
          `${side < 0 ? 'left' : 'right'}-side-${floor}-${index}`,
          plan.centerX + side * plan.width * 0.5,
          y,
          plan.centerZ + offset,
          windowWidth,
          windowHeight,
          side * Math.PI * 0.5,
        );
      }
    }
  }

  const rearWindowXs = distributedOffsets(3, plan.width * 0.68);
  for (let floor = 0; floor < 2; floor += 1) {
    const y = context.ground + storyHeight * (floor + 0.58);
    for (let index = 0; index < rearWindowXs.length; index += 1) {
      const offset = rearWindowXs[index];
      if (offset === undefined) continue;
      addPrincessCraftedWindow(
        context,
        `rear-${floor}-${index}`,
        plan.centerX + offset,
        y,
        rearZ,
        windowWidth,
        windowHeight,
        Math.PI,
      );
    }
  }
  addPrincessCraftedWindow(
    context,
    'entry-gable-upper',
    plan.centerX,
    context.ground + 3.9,
    projectionFrontZ,
    0.94,
    0.82,
  );

  queueDoor(
    context,
    'crafted-wood-door',
    plan.centerX,
    projectionFrontZ + WINDOW_PROJECTION,
    1.32,
    2.35,
  );
  const portalZ = projectionFrontZ + 0.3;
  for (const side of [-1, 1] as const) {
    queueTrim(
      context,
      `entrance-portal-${side < 0 ? 'left' : 'right'}-post`,
      'warm-timber',
      plan.centerX + side * 0.94,
      context.ground + 1.25,
      portalZ,
      0.28,
      2.5,
      0.28,
    );
  }
  queueTrim(
    context,
    'entrance-portal-lintel',
    'warm-timber',
    plan.centerX,
    context.ground + 2.5,
    portalZ,
    2.16,
    0.28,
    0.28,
  );
  queueTrim(
    context,
    'entrance-threshold',
    'warm-timber',
    plan.centerX,
    context.ground + 0.09,
    projectionFrontZ + 0.3,
    1.72,
    0.18,
    0.56,
  );
  for (const offset of [-0.36, 0, 0.36] as const) {
    queueTrim(
      context,
      `door-vertical-slat-${offset}`,
      'warm-timber',
      plan.centerX + offset,
      context.ground + 1.18,
      projectionFrontZ + 0.26,
      0.08,
      1.8,
      0.12,
    );
  }
  for (const [index, height] of [0.5, 1.86].entries()) {
    queueTrim(
      context,
      `door-horizontal-rail-${index}`,
      'warm-timber',
      plan.centerX,
      context.ground + height,
      projectionFrontZ + 0.27,
      1.08,
      0.1,
      0.12,
    );
  }
  addRoof(
    context,
    'nordic-timber-entry-canopy',
    'unit-gable-roof',
    'warm-timber',
    plan.centerX,
    projectionFrontZ + 0.3,
    3.4,
    0.55,
    1,
    context.ground + 2.66,
  );
  queueTrim(
    context,
    'entry-canopy-front-fascia',
    'dark-wood',
    plan.centerX,
    context.ground + 2.72,
    projectionFrontZ + 0.73,
    3.56,
    0.24,
    0.14,
  );
  for (const side of [-1, 1] as const) {
    queueTrim(
      context,
      `entry-canopy-${side < 0 ? 'left' : 'right'}-bracket`,
      'dark-wood',
      plan.centerX + side * 1.18,
      context.ground + 2.4,
      projectionFrontZ + 0.28,
      0.22,
      0.52,
      0.5,
    );
  }
  addHorizontalBand(
    context,
    'nordic-timber-band',
    'warm-timber',
    plan.centerX,
    frontZ,
    plan.width * 0.94,
    context.ground + storyHeight,
  );
  for (const side of [-1, 1] as const) {
    queueTrim(
      context,
      `entry-gable-corner-${side < 0 ? 'left' : 'right'}`,
      'warm-timber',
      plan.centerX + side * (projectionWidth * 0.5 - 0.12),
      context.ground + wallHeight * 0.42,
      projectionFrontZ + 0.22,
      0.24,
      wallHeight * 0.78,
      0.24,
    );
  }
}

function buildButterflyMansard(context: RecipeContext): void {
  const plan = createPlan(context.site, 0.76, 0.72);
  const storyHeight = 2.65;
  const wallHeight = storyHeight * 2;
  const lowerMansardHeight = 2.6;
  const upperMansardHeight = 1.6;
  const lowerRoofWidth = plan.width * 1.08;
  const lowerRoofDepth = plan.depth * 1.08;
  const pitchBreakWidth = lowerRoofWidth * 0.76;
  const pitchBreakDepth = lowerRoofDepth * 0.76;
  const roofBaseY = context.ground + wallHeight;
  const pitchBreakY = roofBaseY + lowerMansardHeight;
  const frontZ = plan.centerZ + plan.depth * 0.5;

  addWall(
    context,
    'warm-brick-main-mass',
    'warm-brick',
    plan.centerX,
    plan.centerZ,
    plan.width,
    wallHeight,
    plan.depth,
  );
  addRoof(
    context,
    'connected-steep-lower-mansard',
    'unit-butterfly-lower-roof',
    'butterfly-lower-roof',
    plan.centerX,
    plan.centerZ,
    lowerRoofWidth,
    lowerMansardHeight,
    lowerRoofDepth,
    roofBaseY,
  );
  addRoof(
    context,
    'connected-shallow-upper-mansard',
    'unit-butterfly-upper-roof',
    'butterfly-upper-roof',
    plan.centerX,
    plan.centerZ,
    pitchBreakWidth,
    upperMansardHeight,
    pitchBreakDepth,
    pitchBreakY,
  );
  addDirectComponent(
    context,
    'roof',
    'unit-butterfly-roof-band',
    'butterfly-roof-band',
    'continuous-mansard-eave-ring',
    transform(
      plan.centerX,
      roofBaseY + 0.03,
      plan.centerZ,
      lowerRoofWidth + 0.28,
      0.42,
      lowerRoofDepth + 0.28,
    ),
  );
  addDirectComponent(
    context,
    'roof',
    'unit-butterfly-roof-band',
    'butterfly-roof-band',
    'continuous-mansard-pitch-break',
    transform(
      plan.centerX,
      pitchBreakY - 0.31,
      plan.centerZ,
      pitchBreakWidth + 0.6,
      0.64,
      pitchBreakDepth + 0.6,
    ),
  );
  addFacadeWindows(context, {
    centerX: plan.centerX,
    centerZ: plan.centerZ,
    width: plan.width,
    depth: plan.depth,
    baseY: context.ground,
    storyHeight,
    floors: 2,
    columns: 4,
    sideColumns: 2,
    windowWidth: 1.02,
    windowHeight: 1.4,
    materialId: 'dark-window',
    includeRear: true,
  });
  const dormerOffsets = distributedOffsets(3, plan.width * 0.46);
  const dormerWidth = 1.92;
  const dormerDepth = 2.15;
  const dormerHeight = 1.15;
  const dormerBase = roofBaseY + 0.42;
  const dormerFrontZ = plan.centerZ + lowerRoofDepth * 0.5 + 0.56;
  const dormerZ = dormerFrontZ - dormerDepth * 0.5;
  const dormerWindowY = dormerBase + 0.59;
  const dormerCapWidth = 2.7;
  const dormerCapHeight = 0.6;
  const dormerCapDepth = 2.15;
  const dormerCapBase = dormerBase + dormerHeight - 0.14;
  const dormerCapZ = dormerZ + 0.16;
  for (let index = 0; index < dormerOffsets.length; index += 1) {
    const offset = dormerOffsets[index];
    if (offset === undefined) continue;
    const dormerX = plan.centerX + offset;
    addWall(
      context,
      `embedded-mansard-dormer-${index}`,
      'warm-brick',
      dormerX,
      dormerZ,
      dormerWidth,
      dormerHeight,
      dormerDepth,
      dormerBase,
    );
    addRoof(
      context,
      `attached-mansard-dormer-cap-${index}`,
      'unit-gable-roof',
      'butterfly-upper-roof',
      dormerX,
      dormerCapZ,
      dormerCapWidth,
      dormerCapHeight,
      dormerCapDepth,
      dormerCapBase,
    );
    addDirectComponent(
      context,
      'roof',
      'unit-butterfly-dormer-gable',
      'butterfly-roof-band',
      `integrated-mansard-dormer-gable-${index}`,
      transform(
        dormerX,
        dormerCapBase,
        dormerCapZ + dormerCapDepth * 0.5 + 0.025,
        dormerCapWidth,
        dormerCapHeight,
        1,
      ),
    );
    queueTrim(
      context,
      `dormer-cap-seat-${index}`,
      'butterfly-roof-band',
      dormerX,
      dormerCapBase + 0.04,
      dormerFrontZ + 0.16,
      dormerCapWidth * 0.94,
      0.16,
      0.2,
    );
    queueWindow(
      context,
      `mansard-dormer-window-${index}`,
      'dark-window',
      dormerX,
      dormerWindowY,
      dormerFrontZ + WINDOW_PROJECTION,
      0.96,
      0.94,
    );
    const dormerFrameZ = dormerFrontZ + TRIM_PROJECTION;
    for (const side of [-1, 1] as const) {
      queueTrim(
        context,
        `dormer-frame-${index}-${side < 0 ? 'left' : 'right'}`,
        'warm-timber',
        dormerX + side * 0.56,
        dormerWindowY,
        dormerFrameZ,
        0.16,
        1.24,
        0.16,
      );
      queueTrim(
        context,
        `dormer-frame-${index}-${side < 0 ? 'bottom' : 'top'}`,
        'warm-timber',
        dormerX,
        dormerWindowY + side * 0.59,
        dormerFrameZ,
        1.28,
        0.16,
        0.16,
      );
    }
  }
  queueDoor(context, 'brick-entry-door', plan.centerX, frontZ + WINDOW_PROJECTION, 1.38, 2.35);
  for (let band = 1; band <= 2; band += 1) {
    addHorizontalBand(
      context,
      `dark-timber-band-${band}`,
      'dark-wood',
      plan.centerX,
      frontZ,
      plan.width * 0.96,
      context.ground + storyHeight * band,
    );
    for (const side of [-1, 1] as const) {
      queueTrim(
        context,
        `dark-timber-side-band-${band}-${side < 0 ? 'left' : 'right'}`,
        'dark-wood',
        plan.centerX + side * (plan.width * 0.5 + TRIM_PROJECTION),
        context.ground + storyHeight * band,
        plan.centerZ,
        plan.depth * 0.94,
        0.32,
        0.2,
        Math.PI * 0.5,
      );
    }
  }
  for (const [index, offset] of distributedOffsets(5, plan.width * 0.82).entries()) {
    queueTrim(
      context,
      `brick-timber-post-${index}`,
      'dark-wood',
      plan.centerX + offset,
      context.ground + wallHeight * 0.5,
      frontZ + TRIM_PROJECTION,
      0.16,
      wallHeight,
      0.13,
    );
  }
}

function buildHuashiCastle(context: RecipeContext): void {
  const plan = createPlan(context.site, 0.72, 0.68);
  const mainWidth = plan.width * 0.58;
  const mainHeight = 7.8;
  const mainCenterX = plan.centerX - plan.width * 0.08;
  const wingWidth = plan.width * 0.26;
  const wingCenterX = plan.centerX + plan.width * 0.33;
  const wingDepth = plan.depth * 0.78;
  const towerDiameter = Math.min(plan.width * 0.18, plan.depth * 0.52);
  const towerHeight = 9.8;
  const towerX = plan.centerX - plan.width * 0.39;
  const towerZ = plan.centerZ + plan.depth * 0.02;
  const frontZ = plan.centerZ + plan.depth * 0.5;

  addWall(
    context,
    'sculptural-main-stone-mass',
    'warm-gray-stone',
    mainCenterX,
    plan.centerZ,
    mainWidth,
    mainHeight,
    plan.depth,
  );
  addWall(
    context,
    'sculptural-side-wing',
    'warm-gray-stone',
    wingCenterX,
    plan.centerZ - plan.depth * 0.06,
    wingWidth,
    6.15,
    wingDepth,
  );
  addRoof(
    context,
    'main-castle-hip',
    'unit-hip-roof',
    'charcoal-roof',
    mainCenterX,
    plan.centerZ,
    mainWidth * 1.08,
    2.25,
    plan.depth * 1.08,
    context.ground + mainHeight,
  );
  addRoof(
    context,
    'side-wing-hip',
    'unit-hip-roof',
    'charcoal-roof',
    wingCenterX,
    plan.centerZ - plan.depth * 0.06,
    wingWidth * 1.14,
    1.65,
    wingDepth * 1.1,
    context.ground + 6.15,
  );
  addTurret(
    context,
    'compact-authored-tower-cue',
    'warm-gray-stone',
    towerX,
    towerZ,
    towerDiameter,
    towerHeight,
  );
  const towerCollarY = context.ground + towerHeight - 0.04;
  for (const side of [-1, 1] as const) {
    queueTrim(
      context,
      `shore-tower-collar-front-back-${side < 0 ? 'back' : 'front'}`,
      'restrained-trim',
      towerX,
      towerCollarY,
      towerZ + side * (towerDiameter * 0.5 + 0.05),
      towerDiameter * 1.18,
      0.36,
      0.24,
    );
    queueTrim(
      context,
      `shore-tower-collar-side-${side < 0 ? 'left' : 'right'}`,
      'restrained-trim',
      towerX + side * (towerDiameter * 0.5 + 0.05),
      towerCollarY,
      towerZ,
      towerDiameter * 1.18,
      0.36,
      0.24,
      Math.PI * 0.5,
    );
  }
  addRoof(
    context,
    'compact-tower-cap',
    'unit-hip-roof',
    'charcoal-roof',
    towerX,
    towerZ,
    towerDiameter * 1.26,
    1.8,
    towerDiameter * 1.26,
    context.ground + towerHeight - 0.18,
  );
  addFacadeWindows(context, {
    centerX: mainCenterX,
    centerZ: plan.centerZ,
    width: mainWidth,
    depth: plan.depth,
    baseY: context.ground,
    storyHeight: 2.55,
    floors: 3,
    columns: 3,
    sideColumns: 1,
    windowWidth: 0.78,
    windowHeight: 1.36,
    materialId: 'dark-window',
    includeRear: true,
  });
  for (let floor = 0; floor < 2; floor += 1) {
    queueWindow(
      context,
      `shore-wing-window-${floor}`,
      'dark-window',
      wingCenterX,
      context.ground + 2.55 * (floor + 0.62),
      plan.centerZ - plan.depth * 0.06 + wingDepth * 0.5 + WINDOW_PROJECTION,
      0.78,
      1.3,
    );
  }
  for (let floor = 0; floor < 3; floor += 1) {
    queueWindow(
      context,
      `shore-tower-window-${floor}`,
      'dark-window',
      towerX,
      context.ground + 2.55 * (floor + 0.68),
      towerZ + towerDiameter * 0.5 + WINDOW_PROJECTION,
      0.66,
      1.25,
    );
  }
  queueDoor(
    context,
    'shore-castle-door',
    mainCenterX - mainWidth * 0.2,
    frontZ + WINDOW_PROJECTION,
    1.28,
    2.38,
  );
  addHorizontalBand(
    context,
    'restrained-castle-band',
    'restrained-trim',
    mainCenterX,
    frontZ,
    mainWidth * 0.94,
    context.ground + 5.1,
  );
}

const STYLE_BUILDERS = {
  'german-neoclassical': buildGermanNeoclassical,
  spanish: buildSpanish,
  'gothic-castle': buildGothicCastle,
  'princess-nordic': buildPrincessNordic,
  'butterfly-mansard': buildButterflyMansard,
  'huashi-castle': buildHuashiCastle,
} as const satisfies Record<VillaStyle, (context: RecipeContext) => void>;

function immutableComponentMetrics(counts: MutableComponentMetrics): VillaComponentMetrics {
  const total = counts.wall
    + counts.roof
    + counts.turret
    + counts.window
    + counts.door
    + counts.trim;
  return Object.freeze({
    wall: counts.wall,
    roof: counts.roof,
    turret: counts.turret,
    window: counts.window,
    door: counts.door,
    trim: counts.trim,
    total,
    instanced: counts.window + counts.door + counts.trim,
    directDrawCalls: counts.directDrawCalls,
    estimatedTriangles: counts.estimatedTriangles,
  });
}


/** Creates a generation-scoped architecture kit with shared unit geometry and a restrained basic palette. */
export function createVillaKit(resources: ResourceRegistry, group: string): VillaKit {
  const root = new Group();
  root.name = 'architecture-root';
  const geometries = createSharedGeometries(resources, group);
  const materials = createSharedMaterials(resources, group);
  const subjects = new Map<ArchitectureSubjectId, BuiltSubject>();
  const batches = new Map<string, PendingBatch>();
  let finalized: ArchitectureBuildResult | null = null;

  const createSubject = (site: ArchitectureSite): VillaSubjectBuildResult => {
    if (finalized !== null) throw new Error('Cannot create architecture after the villa kit is finalized.');
    validateSite(site);
    if (subjects.has(site.id)) throw new Error(`Architecture subject "${site.id}" was already created.`);

    const subjectRoot = new Group();
    subjectRoot.name = `architecture:${site.id}`;
    const counts: MutableComponentMetrics = {
      wall: 0,
      roof: 0,
      turret: 0,
      window: 0,
      door: 0,
      trim: 0,
      directDrawCalls: 0,
      estimatedTriangles: 0,
    };
    const localInstances: LocalInstance[] = [];
    const context: RecipeContext = {
      site,
      root: subjectRoot,
      ground: siteGround(site),
      geometries,
      materials,
      counts,
      instances: localInstances,
    };
    STYLE_BUILDERS[site.style](context);

    const components = immutableComponentMetrics(counts);
    const metrics: ArchitectureSubjectMetrics = Object.freeze({
      subjectId: site.id,
      style: site.style,
      stories: site.stories,
      motifIds: Object.freeze(site.motifs.map(({ id }) => id)),
      siteBounds: immutableBounds(site.siteBounds),
      visibleBounds: immutableBounds(site.visibleBounds),
      collisionBounds: immutableBounds(site.collisionBounds),
      componentCount: components.total,
      instanceCount: components.instanced,
    });
    const result: VillaSubjectBuildResult = Object.freeze({
      root: subjectRoot,
      metrics,
      components,
    });

    for (const instance of localInstances) {
      const key = `${instance.geometryId}:${instance.materialId}`;
      let batch = batches.get(key);
      if (batch === undefined) {
        batch = {
          geometryId: instance.geometryId,
          materialId: instance.materialId,
          instances: [],
        };
        batches.set(key, batch);
      }
      batch.instances.push({ ...instance, subjectId: site.id });
    }
    subjects.set(site.id, { result, cameraViews: immutableCameraViews(site) });
    root.add(subjectRoot);
    return result;
  };

  const finalize = (): ArchitectureBuildResult => {
    if (finalized !== null) return finalized;
    const missing = EXPECTED_SUBJECT_IDS.filter((subjectId) => !subjects.has(subjectId));
    if (missing.length !== 0) {
      throw new Error(`Cannot finalize architecture; missing subjects: ${missing.join(', ')}.`);
    }

    let instanceCount = 0;
    let instanceBatchCount = 0;
    const transformObject = new TransformObject();
    const sortedBatches = [...batches.entries()].sort(([first], [second]) => first.localeCompare(second));
    for (const [, batch] of sortedBatches) {
      if (batch.instances.length === 0) continue;
      const instances = [...batch.instances].sort((first, second) => {
        const subjectDifference = SUBJECT_ORDER[first.subjectId] - SUBJECT_ORDER[second.subjectId];
        return subjectDifference === 0 ? first.order - second.order : subjectDifference;
      });
      const geometry = requireMapValue(geometries, batch.geometryId, `geometry "${batch.geometryId}"`);
      const material = requireMapValue(materials, batch.materialId, `material "${batch.materialId}"`);
      const mesh = resources.register(new InstancedMesh(geometry, material, instances.length), group);
      mesh.name = `architecture:instances:${batch.geometryId}:${batch.materialId}`;
      for (let index = 0; index < instances.length; index += 1) {
        const instance = instances[index];
        if (instance === undefined) continue;
        applyTransform(transformObject, instance.transform);
        mesh.setMatrixAt(index, transformObject.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      root.add(mesh);
      instanceCount += instances.length;
      instanceBatchCount += 1;
    }

    const requireSubject = (subjectId: ArchitectureSubjectId): BuiltSubject => {
      const subject = subjects.get(subjectId);
      if (subject === undefined) throw new Error(`Missing finalized architecture subject "${subjectId}".`);
      return subject;
    };
    const subjectMetrics = Object.freeze(
      EXPECTED_SUBJECT_IDS.map((subjectId) => requireSubject(subjectId).result.metrics),
    );
    const directDrawCalls = EXPECTED_SUBJECT_IDS.reduce(
      (total, subjectId) => total + requireSubject(subjectId).result.components.directDrawCalls,
      0,
    );
    const cameraViews = Object.freeze({
      'villa-west-neoclassical': requireSubject('villa-west-neoclassical').cameraViews,
      'villa-central-spanish': requireSubject('villa-central-spanish').cameraViews,
      'villa-central-gothic': requireSubject('villa-central-gothic').cameraViews,
      'villa-east-neoclassical': requireSubject('villa-east-neoclassical').cameraViews,
      'princess-inspired-landmark': requireSubject('princess-inspired-landmark').cameraViews,
      'butterfly-inspired-landmark': requireSubject('butterfly-inspired-landmark').cameraViews,
      'huashi-inspired-landmark': requireSubject('huashi-inspired-landmark').cameraViews,
    });
    const reuse = Object.freeze({
      sharedGeometryCount: GEOMETRY_IDS.length,
      sharedMaterialCount: MATERIAL_IDS.length,
      instanceBatchCount,
      instanceCount,
      estimatedInstancedDrawCalls: directDrawCalls + instanceBatchCount,
      naiveRepeatedDrawCalls: directDrawCalls + instanceCount,
    });
    finalized = Object.freeze({
      root,
      subjects: subjectMetrics,
      cameraViews,
      reuse,
      labelsVisible: false as const,
    });
    return finalized;
  };

  return Object.freeze({
    root,
    createVilla: createSubject,
    finalize,
  });
}

/** Adds one validated, complete style recipe to a shared villa kit. */
export function createVilla(kit: VillaKit, site: ArchitectureSite): VillaSubjectBuildResult {
  return kit.createVilla(site);
}
