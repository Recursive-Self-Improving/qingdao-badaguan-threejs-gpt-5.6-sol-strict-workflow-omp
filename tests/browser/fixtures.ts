export type ArchitectureView = 'front' | 'three-quarter' | 'route' | 'low';

export interface LiteralBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface ArchitectureSubjectFixture {
  readonly id: string;
  readonly kind: 'ordinary' | 'landmark';
  readonly style: string;
  readonly stories: number;
  readonly site: LiteralBounds;
  readonly viewpointId: string;
}

export const ARCHITECTURE_SUBJECTS: readonly ArchitectureSubjectFixture[] = Object.freeze([
  Object.freeze({ id: 'villa-west-neoclassical', kind: 'ordinary', style: 'german-neoclassical', stories: 2, site: Object.freeze({ minX: -178, maxX: -160, minZ: -196, maxZ: -189 }), viewpointId: 'zijingguan-return' }),
  Object.freeze({ id: 'villa-central-spanish', kind: 'ordinary', style: 'spanish', stories: 2, site: Object.freeze({ minX: 24, maxX: 44, minZ: -106, maxZ: -99 }), viewpointId: 'mixed-villa-intersection' }),
  Object.freeze({ id: 'villa-central-gothic', kind: 'ordinary', style: 'gothic-castle', stories: 3, site: Object.freeze({ minX: 60, maxX: 82, minZ: -106, maxZ: -99 }), viewpointId: 'mixed-villa-intersection' }),
  Object.freeze({ id: 'villa-east-neoclassical', kind: 'ordinary', style: 'german-neoclassical', stories: 3, site: Object.freeze({ minX: 146, maxX: 168, minZ: -196, maxZ: -189 }), viewpointId: 'ginkgo-maple-corridor' }),
  Object.freeze({ id: 'princess-inspired-landmark', kind: 'landmark', style: 'princess-nordic', stories: 2, site: Object.freeze({ minX: 20, maxX: 42, minZ: -158, maxZ: -140 }), viewpointId: 'princess-inspired-anchor' }),
  Object.freeze({ id: 'butterfly-inspired-landmark', kind: 'landmark', style: 'butterfly-mansard', stories: 3, site: Object.freeze({ minX: -48, maxX: -22, minZ: -202, maxZ: -182 }), viewpointId: 'butterfly-inspired-anchor' }),
  Object.freeze({ id: 'huashi-inspired-landmark', kind: 'landmark', style: 'huashi-castle', stories: 3, site: Object.freeze({ minX: 22, maxX: 50, minZ: 20, maxZ: 31 }), viewpointId: 'shore-huashi-vista' }),
]);

export const ARCHITECTURE_CAMERA_WORLD_POSES = Object.freeze({
  'villa-west-neoclassical': Object.freeze({
    front: Object.freeze([-169, 7.5734692838324955, -171] as const),
    'three-quarter': Object.freeze([-146, 8.743469283832496, -174] as const),
    route: Object.freeze([-155, 8.123469283832496, -181.2] as const),
    low: Object.freeze([-155, 7.123469283832496, -181.2] as const),
  }),
  'villa-central-spanish': Object.freeze({
    front: Object.freeze([34, 5.918248061196391, -81] as const),
    'three-quarter': Object.freeze([58, 7.088248061196391, -84] as const),
    route: Object.freeze([44, 6.668248061196391, -87.5] as const),
    low: Object.freeze([49, 5.468248061196392, -91] as const),
  }),
  'villa-central-gothic': Object.freeze({
    front: Object.freeze([71, 7.6715139234098535, -81] as const),
    'three-quarter': Object.freeze([96, 9.361513923409852, -84] as const),
    route: Object.freeze([85.5, 8.371513923409853, -91.8] as const),
    low: Object.freeze([88, 6.021513923409853, -91] as const),
  }),
  'villa-east-neoclassical': Object.freeze({
    front: Object.freeze([157, 9.463798293472298, -171] as const),
    'three-quarter': Object.freeze([182, 11.153798293472295, -174] as const),
    route: Object.freeze([165, 9.613798293472296, -177.5] as const),
    low: Object.freeze([171, 8.413798293472297, -181.2] as const),
  }),
  'princess-inspired-landmark': Object.freeze({
    front: Object.freeze([31, 7.28296981231407, -122] as const),
    'three-quarter': Object.freeze([56, 8.58296981231407, -125] as const),
    route: Object.freeze([0, 7.78296981231407, -125] as const),
    low: Object.freeze([50, 4.982969812314071, -128] as const),
  }),
  'butterfly-inspired-landmark': Object.freeze({
    front: Object.freeze([-30, 13.267244706622837, -164] as const),
    'three-quarter': Object.freeze([-8, 11.587244706622835, -167] as const),
    route: Object.freeze([0, 10.467244706622836, -170] as const),
    low: Object.freeze([-14, 5.667244706622836, -170] as const),
  }),
  'huashi-inspired-landmark': Object.freeze({
    front: Object.freeze([36, 5.970313244439775, 49] as const),
    'three-quarter': Object.freeze([64, 7.7903132444397745, 46] as const),
    route: Object.freeze([0, 6.670313244439775, 35] as const),
    low: Object.freeze([58, 1.8703132444397754, 43] as const),
  }),
} as const);

export const ARCHITECTURE_VIEWS: readonly ArchitectureView[] = Object.freeze(['front', 'three-quarter', 'route', 'low']);

export const ROUTE_VIEWPOINTS = Object.freeze([
  Object.freeze({ id: 'zijingguan-return', position: Object.freeze({ x: 0, z: -170 }) }),
  Object.freeze({ id: 'mixed-villa-intersection', position: Object.freeze({ x: -24, z: -14 }) }),
  Object.freeze({ id: 'ginkgo-maple-corridor', position: Object.freeze({ x: 24, z: -28 }) }),
  Object.freeze({ id: 'princess-inspired-anchor', position: Object.freeze({ x: 0, z: -125 }) }),
  Object.freeze({ id: 'butterfly-inspired-anchor', position: Object.freeze({ x: 0, z: -170 }) }),
  Object.freeze({ id: 'shore-huashi-vista', position: Object.freeze({ x: 0, z: 35 }) }),
]);

export const ARCHITECTURE_EDGE_PROBES = Object.freeze([
  Object.freeze({ subjectId: 'villa-west-neoclassical', approach: Object.freeze({ x: -179, z: -192.5 }), target: Object.freeze({ x: -178, z: -192.5 }) }),
  Object.freeze({ subjectId: 'villa-west-neoclassical', approach: Object.freeze({ x: -159, z: -192.5 }), target: Object.freeze({ x: -160, z: -192.5 }) }),
  Object.freeze({ subjectId: 'villa-west-neoclassical', approach: Object.freeze({ x: -169, z: -197 }), target: Object.freeze({ x: -169, z: -196 }) }),
  Object.freeze({ subjectId: 'villa-west-neoclassical', approach: Object.freeze({ x: -169, z: -188 }), target: Object.freeze({ x: -169, z: -189 }) }),
  Object.freeze({ subjectId: 'villa-central-spanish', approach: Object.freeze({ x: 23, z: -102.5 }), target: Object.freeze({ x: 24, z: -102.5 }) }),
  Object.freeze({ subjectId: 'villa-central-spanish', approach: Object.freeze({ x: 45, z: -102.5 }), target: Object.freeze({ x: 44, z: -102.5 }) }),
  Object.freeze({ subjectId: 'villa-central-spanish', approach: Object.freeze({ x: 34, z: -106.75 }), target: Object.freeze({ x: 34, z: -106 }) }),
  Object.freeze({ subjectId: 'villa-central-spanish', approach: Object.freeze({ x: 34, z: -98 }), target: Object.freeze({ x: 34, z: -99 }) }),
  Object.freeze({ subjectId: 'villa-central-gothic', approach: Object.freeze({ x: 59, z: -102.5 }), target: Object.freeze({ x: 60, z: -102.5 }) }),
  Object.freeze({ subjectId: 'villa-central-gothic', approach: Object.freeze({ x: 83, z: -102.5 }), target: Object.freeze({ x: 82, z: -102.5 }) }),
  Object.freeze({ subjectId: 'villa-central-gothic', approach: Object.freeze({ x: 71, z: -106.75 }), target: Object.freeze({ x: 71, z: -106 }) }),
  Object.freeze({ subjectId: 'villa-central-gothic', approach: Object.freeze({ x: 71, z: -98 }), target: Object.freeze({ x: 71, z: -99 }) }),
  Object.freeze({ subjectId: 'villa-east-neoclassical', approach: Object.freeze({ x: 145, z: -192.5 }), target: Object.freeze({ x: 146, z: -192.5 }) }),
  Object.freeze({ subjectId: 'villa-east-neoclassical', approach: Object.freeze({ x: 169, z: -192.5 }), target: Object.freeze({ x: 168, z: -192.5 }) }),
  Object.freeze({ subjectId: 'villa-east-neoclassical', approach: Object.freeze({ x: 157, z: -197 }), target: Object.freeze({ x: 157, z: -196 }) }),
  Object.freeze({ subjectId: 'villa-east-neoclassical', approach: Object.freeze({ x: 157, z: -188 }), target: Object.freeze({ x: 157, z: -189 }) }),
  Object.freeze({ subjectId: 'princess-inspired-landmark', approach: Object.freeze({ x: 19, z: -149 }), target: Object.freeze({ x: 20, z: -149 }) }),
  Object.freeze({ subjectId: 'princess-inspired-landmark', approach: Object.freeze({ x: 43, z: -149 }), target: Object.freeze({ x: 42, z: -149 }) }),
  Object.freeze({ subjectId: 'princess-inspired-landmark', approach: Object.freeze({ x: 31, z: -159 }), target: Object.freeze({ x: 31, z: -158 }) }),
  Object.freeze({ subjectId: 'princess-inspired-landmark', approach: Object.freeze({ x: 31, z: -139 }), target: Object.freeze({ x: 31, z: -140 }) }),
  Object.freeze({ subjectId: 'butterfly-inspired-landmark', approach: Object.freeze({ x: -49, z: -192 }), target: Object.freeze({ x: -48, z: -192 }) }),
  Object.freeze({ subjectId: 'butterfly-inspired-landmark', approach: Object.freeze({ x: -21, z: -192 }), target: Object.freeze({ x: -22, z: -192 }) }),
  Object.freeze({ subjectId: 'butterfly-inspired-landmark', approach: Object.freeze({ x: -35, z: -203 }), target: Object.freeze({ x: -35, z: -202 }) }),
  Object.freeze({ subjectId: 'butterfly-inspired-landmark', approach: Object.freeze({ x: -35, z: -181 }), target: Object.freeze({ x: -35, z: -182 }) }),
  Object.freeze({ subjectId: 'huashi-inspired-landmark', approach: Object.freeze({ x: 21, z: 25.5 }), target: Object.freeze({ x: 22, z: 25.5 }) }),
  Object.freeze({ subjectId: 'huashi-inspired-landmark', approach: Object.freeze({ x: 51, z: 25.5 }), target: Object.freeze({ x: 50, z: 25.5 }) }),
  Object.freeze({ subjectId: 'huashi-inspired-landmark', approach: Object.freeze({ x: 36, z: 19 }), target: Object.freeze({ x: 36, z: 20 }) }),
  Object.freeze({ subjectId: 'huashi-inspired-landmark', approach: Object.freeze({ x: 36, z: 32 }), target: Object.freeze({ x: 36, z: 31 }) }),
]);

export const ORDINARY_PARCEL_EDGE_CLEARANCES = Object.freeze([
  Object.freeze({ parcelId: 'west-garden-parcel', anchorId: 'zijingguan-return', from: Object.freeze({ x: -187, z: -194 }), to: Object.freeze({ x: -187, z: -192.5 }) }),
  Object.freeze({ parcelId: 'west-garden-parcel', anchorId: 'zijingguan-return', from: Object.freeze({ x: -137, z: -194 }), to: Object.freeze({ x: -137, z: -192.5 }) }),
  Object.freeze({ parcelId: 'west-garden-parcel', anchorId: 'zijingguan-return', from: Object.freeze({ x: -185, z: -199 }), to: Object.freeze({ x: -187, z: -199 }) }),
  Object.freeze({ parcelId: 'west-garden-parcel', anchorId: 'zijingguan-return', from: Object.freeze({ x: -185, z: -186 }), to: Object.freeze({ x: -187, z: -186 }) }),
  Object.freeze({ parcelId: 'central-garden-parcel', anchorId: 'mixed-villa-intersection', from: Object.freeze({ x: 20, z: -104 }), to: Object.freeze({ x: 20, z: -102.5 }) }),
  Object.freeze({ parcelId: 'central-garden-parcel', anchorId: 'mixed-villa-intersection', from: Object.freeze({ x: 90, z: -104 }), to: Object.freeze({ x: 90, z: -102.5 }) }),
  Object.freeze({ parcelId: 'central-garden-parcel', anchorId: 'mixed-villa-intersection', from: Object.freeze({ x: 53, z: -108 }), to: Object.freeze({ x: 55, z: -108 }) }),
  Object.freeze({ parcelId: 'central-garden-parcel', anchorId: 'mixed-villa-intersection', from: Object.freeze({ x: 53, z: -97 }), to: Object.freeze({ x: 55, z: -97 }) }),
  Object.freeze({ parcelId: 'east-garden-parcel', anchorId: 'ginkgo-maple-corridor', from: Object.freeze({ x: 137, z: -194 }), to: Object.freeze({ x: 137, z: -192.5 }) }),
  Object.freeze({ parcelId: 'east-garden-parcel', anchorId: 'ginkgo-maple-corridor', from: Object.freeze({ x: 188, z: -194 }), to: Object.freeze({ x: 188, z: -192.5 }) }),
  Object.freeze({ parcelId: 'east-garden-parcel', anchorId: 'ginkgo-maple-corridor', from: Object.freeze({ x: 139, z: -199 }), to: Object.freeze({ x: 137, z: -199 }) }),
  Object.freeze({ parcelId: 'east-garden-parcel', anchorId: 'ginkgo-maple-corridor', from: Object.freeze({ x: 139, z: -186 }), to: Object.freeze({ x: 137, z: -186 }) }),
]);

export const FAMILY_CAPTURE_SUBJECT_IDS = Object.freeze(['villa-west-neoclassical', 'villa-central-spanish', 'villa-central-gothic'] as const);
export const LANDMARK_CAPTURE_SUBJECT_IDS = Object.freeze(['princess-inspired-landmark', 'butterfly-inspired-landmark', 'huashi-inspired-landmark'] as const);
export const ROUTE_CAPTURE_SUBJECT_IDS = Object.freeze(['villa-west-neoclassical', 'villa-central-spanish', 'villa-central-gothic', 'villa-east-neoclassical', 'huashi-inspired-landmark'] as const);
export const LOW_PROXY_SUBJECT_IDS = Object.freeze(['villa-west-neoclassical', 'villa-central-spanish', 'villa-central-gothic', 'villa-east-neoclassical'] as const);
