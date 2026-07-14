import { QUALITY_PROFILES } from '../quality/qualityTiers';
import type {
  DistrictData,
  ArchitectureSite,
  LandmarkAnchor,
  LandscapeCameraView,
  LineSegment,
  PlantingZone,
  RoadPlantingCue,
  RoadSpec,
  RouteAnchor,
} from './types';

const inference = (basis: string) => ({
  status: 'authored-inference' as const,
  basis,
});

const horizontalWall = (minX: number, maxX: number, z: number): LineSegment => ({
  from: { x: minX, z },
  to: { x: maxX, z },
});

const verticalWall = (x: number, minZ: number, maxZ: number): LineSegment => ({
  from: { x, z: minZ },
  to: { x, z: maxZ },
});

const eastWestRoads = [
  ['shaoguan', 'Shaoguan Road', -260, []],
  ['ningwuguan', 'Ningwuguan Road', -215, [{ x: -70, z: -212 }, { x: 70, z: -218 }]],
  ['zijingguan', 'Zijingguan Road', -170, []],
  ['zhengyangguan', 'Zhengyangguan Road', -125, [{ x: -60, z: -129 }, { x: 70, z: -122 }]],
  ['jiayuguan', 'Jiayuguan Road', -80, []],
  ['juyongguan', 'Juyongguan Road', -35, [{ x: -80, z: -32 }, { x: 80, z: -38 }]],
  ['linhuaiguan', 'Linhuaiguan Road', 10, []],
] as const;

const northSouthRoads = [
  ['wushengguan', 'Wushengguan Road', -120, [{ x: -117, z: -70 }, { x: -123, z: -180 }]],
  ['hangu-pass', 'Hangu Pass Road', 0, []],
  ['shanhaiguan', 'Shanhaiguan Road', 120, [{ x: 124, z: -80 }, { x: 117, z: -200 }]],
] as const;

const roadInference = inference(
  'Simplified named grid with restrained terrain-led turns authored for this experience; not surveyed or geospatial.',
);

const authoredRoads: readonly RoadSpec[] = [
  ...eastWestRoads.map(([id, name, z, via]) => ({
    id,
    name,
    orientation: 'east-west' as const,
    centerline: { from: { x: -200, z }, via, to: { x: 200, z } },
    width: 12,
    sidewalkWidth: 3,
    inference: roadInference,
  })),
  ...northSouthRoads.map(([id, name, x, via]) => ({
    id,
    name,
    orientation: 'north-south' as const,
    centerline: { from: { x, z: 38 }, via, to: { x, z: -290 } },
    width: 12,
    sidewalkWidth: 3,
    inference: roadInference,
  })),
];

const anchorInference = inference(
  'Abstract route-stage metadata authored for narrative continuity; names and positions are non-geospatial and reserve no detailed villa or planting geometry.',
);

const authoredAnchors: readonly RouteAnchor[] = [
  { id: 'spawn', label: 'Safe start', kind: 'spawn', order: 0, position: { x: 0, z: 5 }, inference: anchorInference },
  { id: 'mixed-villa-intersection', label: 'Mixed-villa intersection', kind: 'landmark', inspiration: 'mixed-villa-intersection', order: 1, position: { x: -24, z: -14 }, inference: anchorInference },
  { id: 'ginkgo-maple-corridor', label: 'Ginkgo and maple corridor', kind: 'landmark', inspiration: 'ginkgo-maple-corridor', order: 2, position: { x: 24, z: -28 }, inference: anchorInference },
  { id: 'public-green-heart', label: 'Public green heart', kind: 'public-green', order: 3, position: { x: 52, z: -35 }, inference: anchorInference },
  { id: 'uphill-grid-vista', label: 'Uphill grid vista', kind: 'uphill', order: 4, position: { x: 0, z: -80 }, inference: anchorInference },
  { id: 'princess-inspired-anchor', label: 'Princess-inspired anchor', kind: 'landmark', inspiration: 'princess-inspired', order: 5, position: { x: 0, z: -125 }, inference: anchorInference },
  { id: 'butterfly-inspired-anchor', label: 'Butterfly-inspired anchor', kind: 'landmark', inspiration: 'butterfly-inspired', order: 6, position: { x: 0, z: -170 }, inference: anchorInference },
  { id: 'northern-uphill-overlook', label: 'Northern uphill overlook', kind: 'uphill', order: 7, position: { x: 0, z: -215 }, inference: anchorInference },
  { id: 'zijingguan-return', label: 'Zijingguan return', kind: 'road', order: 8, position: { x: 0, z: -170 }, inference: anchorInference },
  { id: 'zhengyangguan-return', label: 'Zhengyangguan return', kind: 'road', order: 9, position: { x: 0, z: -125 }, inference: anchorInference },
  { id: 'jiayuguan-return', label: 'Jiayuguan return', kind: 'road', order: 10, position: { x: 0, z: -80 }, inference: anchorInference },
  { id: 'juyongguan-return', label: 'Juyongguan return', kind: 'road', order: 11, position: { x: 0, z: -35 }, inference: anchorInference },
  { id: 'linhuaiguan-return', label: 'Linhuaiguan return', kind: 'road', order: 12, position: { x: 0, z: 10 }, inference: anchorInference },
  { id: 'shore-huashi-vista', label: 'Shore and Huashi-inspired vista', kind: 'landmark', inspiration: 'huashi-inspired', order: 13, position: { x: 0, z: 35 }, inference: anchorInference },
  { id: 'reset', label: 'Safe reset', kind: 'reset', order: 14, position: { x: 0, z: 5 }, inference: anchorInference },
];

const authoredLandmarkAnchors: readonly LandmarkAnchor[] = authoredAnchors.filter(
  (anchor): anchor is LandmarkAnchor => anchor.kind === 'landmark',
);

type CameraViewOverrides = Partial<ArchitectureSite['cameraViews']>;

const cameraViews = (
  bounds: ArchitectureSite['siteBounds'],
  height: number,
  routePosition: RouteAnchor['position'],
  overrides: CameraViewOverrides = {},
): ArchitectureSite['cameraViews'] => {
  const x = (bounds.minX + bounds.maxX) * 0.5;
  const z = (bounds.minZ + bounds.maxZ) * 0.5;
  const halfWidth = (bounds.maxX - bounds.minX) * 0.5;
  return {
    front: overrides.front ?? { position: [x, height * 0.45, bounds.maxZ + 18], target: [x, height * 0.42, z], ySemantics: 'site-ground-relative' },
    'three-quarter': overrides['three-quarter'] ?? { position: [x + halfWidth + 14, height * 0.58, bounds.maxZ + 15], target: [x, height * 0.4, z], ySemantics: 'site-ground-relative' },
    route: overrides.route ?? { position: [routePosition.x, height * 0.5, routePosition.z], target: [x, height * 0.38, z], ySemantics: 'site-ground-relative' },
    low: overrides.low ?? { position: [x + halfWidth + 8, 2.2, bounds.maxZ + 12], target: [x, height * 0.52, z], ySemantics: 'site-ground-relative' },
  };
};

const architectureProvenance = (
  sourcedContext: string,
  artisticInterpretation: string,
): ArchitectureSite['provenance'] => ({
  sourcedContext,
  artisticInterpretation,
  exactFacade: 'authored-inference',
  replica: false,
});

const authoredArchitectureSites = [
  {
    id: 'villa-west-neoclassical', kind: 'ordinary', style: 'german-neoclassical', stories: 2,
    siteBounds: { minX: -178, maxX: -160, minZ: -196, maxZ: -189 },
    visibleBounds: { minX: -177.5, maxX: -160.5, minZ: -195.5, maxZ: -189.5 },
    collisionBounds: { minX: -178, maxX: -160, minZ: -196, maxZ: -189 },
    viewpointId: 'zijingguan-return', inspiration: null,
    materials: ['muted-cream-stucco', 'red-brown-roof', 'restrained-stone-trim'],
    motifs: [{ id: 'symmetric-stucco-massing', ownership: 'style-family', sourceBound: false }, { id: 'hipped-gabled-red-brown-roof', ownership: 'style-family', sourceBound: false }],
    signage: 'small-gate-plaque',
    provenance: architectureProvenance('Badaguan includes varied European-influenced garden-villa families.', 'Muted cream symmetry, roof form, trim, dimensions, and exact facade are authored for this compressed district.'),
    cameraViews: cameraViews({ minX: -178, maxX: -160, minZ: -196, maxZ: -189 }, 9, { x: 0, z: -170 }, {
      route: { position: [-155, 4.6, -181.2], target: [-169, 3.6, -192.5], ySemantics: 'site-ground-relative' },
      low: { position: [-155, 3.6, -181.2], target: [-169, 3.6, -192.5], ySemantics: 'site-ground-relative' },
    }),
  },
  {
    id: 'villa-central-spanish', kind: 'ordinary', style: 'spanish', stories: 2,
    siteBounds: { minX: 24, maxX: 44, minZ: -106, maxZ: -99 },
    visibleBounds: { minX: 24.5, maxX: 43.5, minZ: -105.5, maxZ: -99.5 },
    collisionBounds: { minX: 24, maxX: 44, minZ: -106, maxZ: -99 },
    viewpointId: 'mixed-villa-intersection', inspiration: null,
    materials: ['warm-stucco', 'low-red-tile-roof', 'dark-balcony-metal'],
    motifs: [{ id: 'restrained-balcony-cue', ownership: 'style-family', sourceBound: false }],
    signage: 'small-gate-plaque',
    provenance: architectureProvenance('Spanish-influenced villas form one of the district’s broad architectural families.', 'The restrained balcony, dimensions, placement, and exact facade are authored rather than a replica.'),
    cameraViews: cameraViews({ minX: 24, maxX: 44, minZ: -106, maxZ: -99 }, 9, { x: -24, z: -14 }, {
      route: { position: [44, 4.8, -87.5], target: [34, 3.42, -102.5], ySemantics: 'site-ground-relative' },
      low: { position: [49, 3.6, -91], target: [34, 4.68, -102.5], ySemantics: 'site-ground-relative' },
    }),
  },
  {
    id: 'villa-central-gothic', kind: 'ordinary', style: 'gothic-castle', stories: 3,
    siteBounds: { minX: 60, maxX: 82, minZ: -106, maxZ: -99 },
    visibleBounds: { minX: 60.5, maxX: 81.5, minZ: -105.5, maxZ: -99.5 },
    collisionBounds: { minX: 60, maxX: 82, minZ: -106, maxZ: -99 },
    viewpointId: 'mixed-villa-intersection', inspiration: null,
    materials: ['gray-stone', 'charcoal-steep-roof', 'restrained-stone-trim'],
    motifs: [{ id: 'asymmetric-steep-gable', ownership: 'style-family', sourceBound: false }, { id: 'compact-tower', ownership: 'style-family', sourceBound: false }],
    signage: 'small-gate-plaque',
    provenance: architectureProvenance('Gothic and castle-like villas contribute to Badaguan’s varied garden-villa context.', 'Asymmetry, steep gable, compact tower, dimensions, and exact facade are authored inference.'),
    cameraViews: cameraViews({ minX: 60, maxX: 82, minZ: -106, maxZ: -99 }, 13, { x: -24, z: -14 }, {
      route: { position: [85.5, 6.55, -91.8], target: [71, 5.2, -102.5], ySemantics: 'site-ground-relative' },
      low: { position: [88, 4.2, -91], target: [71, 5.8, -102.5], ySemantics: 'site-ground-relative' },
    }),
  },
  {
    id: 'villa-east-neoclassical', kind: 'ordinary', style: 'german-neoclassical', stories: 3,
    siteBounds: { minX: 146, maxX: 168, minZ: -196, maxZ: -189 },
    visibleBounds: { minX: 146.5, maxX: 167.5, minZ: -195.5, maxZ: -189.5 },
    collisionBounds: { minX: 146, maxX: 168, minZ: -196, maxZ: -189 },
    viewpointId: 'ginkgo-maple-corridor', inspiration: null,
    materials: ['muted-cream-stucco', 'red-brown-roof', 'restrained-stone-trim'],
    motifs: [{ id: 'symmetric-stucco-massing', ownership: 'style-family', sourceBound: false }, { id: 'restrained-classical-trim', ownership: 'style-family', sourceBound: false }],
    signage: 'small-gate-plaque',
    provenance: architectureProvenance('German-influenced neoclassical villas are represented as a broad district family.', 'This taller variant, dimensions, and exact facade are authored inference.'),
    cameraViews: cameraViews({ minX: 146, maxX: 168, minZ: -196, maxZ: -189 }, 13, { x: 24, z: -28 }, {
      route: { position: [165, 6, -177.5], target: [157, 4.94, -192.5], ySemantics: 'site-ground-relative' },
      low: { position: [171, 4.8, -181.2], target: [157, 5.2, -192.5], ySemantics: 'site-ground-relative' },
    }),
  },
  {
    id: 'princess-inspired-landmark', kind: 'landmark', style: 'princess-nordic', stories: 2,
    siteBounds: { minX: 20, maxX: 42, minZ: -158, maxZ: -140 },
    visibleBounds: { minX: 20.5, maxX: 41.5, minZ: -157.5, maxZ: -140.5 },
    collisionBounds: { minX: 20, maxX: 42, minZ: -158, maxZ: -140 },
    viewpointId: 'princess-inspired-anchor', inspiration: 'princess',
    materials: ['pine-green-stucco', 'dark-nordic-roof', 'crafted-wood-window'],
    motifs: [{ id: 'nordic-danish-pine-green', ownership: 'landmark-specific', sourceBound: true }, { id: 'crafted-wood-window-cue', ownership: 'landmark-specific', sourceBound: true }],
    signage: 'none',
    provenance: architectureProvenance('Princess Building is represented by Nordic/Danish-influenced form, a pine-green exterior, and crafted wood-window cues.', 'The simplified composition, dimensions, placement, and exact facade are authored and not a replica.'),
    cameraViews: cameraViews({ minX: 20, maxX: 42, minZ: -158, maxZ: -140 }, 10, { x: 0, z: -125 }),
  },
  {
    id: 'butterfly-inspired-landmark', kind: 'landmark', style: 'butterfly-mansard', stories: 3,
    siteBounds: { minX: -48, maxX: -22, minZ: -202, maxZ: -182 },
    visibleBounds: { minX: -47.5, maxX: -22.5, minZ: -201.5, maxZ: -182.5 },
    collisionBounds: { minX: -48, maxX: -22, minZ: -202, maxZ: -182 },
    viewpointId: 'butterfly-inspired-anchor', inspiration: 'butterfly',
    materials: ['warm-brick', 'dark-timber', 'charcoal-mansard-roof'],
    motifs: [{ id: 'mansard-roof', ownership: 'landmark-specific', sourceBound: true }, { id: 'brick-timber-expression', ownership: 'landmark-specific', sourceBound: true }],
    signage: 'none',
    provenance: architectureProvenance('Butterfly Building is represented by a Mansard roof and brick-timber character.', 'The composition, dimensions, placement, silhouette, and exact facade are authored and not a replica.'),
    cameraViews: cameraViews({ minX: -48, maxX: -22, minZ: -202, maxZ: -182 }, 14, { x: 0, z: -170 }, {
      front: { position: [-30, 9.8, -164], target: [-35, 5.88, -192], ySemantics: 'site-ground-relative' },
    }),
  },
  {
    id: 'huashi-inspired-landmark', kind: 'landmark', style: 'huashi-castle', stories: 3,
    siteBounds: { minX: 22, maxX: 50, minZ: 20, maxZ: 31 },
    visibleBounds: { minX: 22.5, maxX: 49.5, minZ: 20.5, maxZ: 30.5 },
    collisionBounds: { minX: 22, maxX: 50, minZ: 20, maxZ: 31 },
    viewpointId: 'shore-huashi-vista', inspiration: 'huashi',
    materials: ['warm-gray-stone', 'charcoal-roof', 'restrained-castle-trim'],
    motifs: [{ id: 'compact-sculptural-shore-massing', ownership: 'landmark-specific', sourceBound: true }, { id: 'compact-tower-cue', ownership: 'landmark-specific', sourceBound: false }],
    signage: 'none',
    provenance: architectureProvenance('Huashi Villa is represented by compact, sculptural, castle-like shore massing.', 'The compact tower cue, dimensions, placement, and exact facade are authored and not a replica.'),
    cameraViews: cameraViews({ minX: 22, maxX: 50, minZ: 20, maxZ: 31 }, 14, { x: 0, z: 35 }),
  },
] as const satisfies readonly ArchitectureSite[];

const plantingInference = inference(
  'Representative road-specific planting cues and safe verge zones are artistic abstractions for this experience, not a claim about current tree inventory or surveyed planting positions.',
);

const authoredRoadPlantingCues = [
  { roadId: 'shaoguan', species: 'peach', category: 'flowering-deciduous', palette: { foliage: ['#8f6d3d', '#b36e5b'], trunk: '#604a38', litter: null }, identityPriority: 0, provenance: plantingInference },
  { roadId: 'ningwuguan', species: 'crabapple', category: 'flowering-deciduous', palette: { foliage: ['#7b783f', '#a85f50'], trunk: '#584638', litter: null }, identityPriority: 0, provenance: plantingInference },
  { roadId: 'zijingguan', species: 'cedar', category: 'evergreen-conifer', palette: { foliage: ['#314d3d', '#45604a'], trunk: '#514337', litter: null }, identityPriority: 0, provenance: plantingInference },
  { roadId: 'zhengyangguan', species: 'crape-myrtle', category: 'flowering-deciduous', palette: { foliage: ['#77753e', '#9b5b69'], trunk: '#665347', litter: null }, identityPriority: 0, provenance: plantingInference },
  { roadId: 'jiayuguan', species: 'maple', category: 'autumn-deciduous', palette: { foliage: ['#9b4b2e', '#bd6b2f', '#d08a38'], trunk: '#574337', litter: '#9b5830' }, identityPriority: 0, provenance: plantingInference },
  { roadId: 'juyongguan', species: 'ginkgo', category: 'autumn-deciduous', palette: { foliage: ['#b79b32', '#d0b84b'], trunk: '#5b5040', litter: '#b89c35' }, identityPriority: 0, provenance: plantingInference },
  { roadId: 'linhuaiguan', species: 'chinese-juniper', category: 'evergreen-conifer', palette: { foliage: ['#2f5143', '#466253'], trunk: '#57463a', litter: null }, identityPriority: 0, provenance: plantingInference },
  { roadId: 'wushengguan', species: 'plane-tree', category: 'deciduous-canopy', palette: { foliage: ['#687344', '#8a7840'], trunk: '#80735e', litter: null }, identityPriority: 0, provenance: plantingInference },
  { roadId: 'hangu-pass', species: 'plane-tree', category: 'deciduous-canopy', palette: { foliage: ['#697746', '#8b7c43'], trunk: '#81745f', litter: null }, identityPriority: 0, provenance: plantingInference },
  { roadId: 'shanhaiguan', species: 'plane-tree', category: 'deciduous-canopy', palette: { foliage: ['#667143', '#877940'], trunk: '#7d715d', litter: null }, identityPriority: 0, provenance: plantingInference },
] as const satisfies readonly RoadPlantingCue[];

const authoredPlantingZones = [
  { id: 'shaoguan-peach-north', roadId: 'shaoguan', bounds: { minX: -180, maxX: -150, minZ: -274, maxZ: -272 }, side: 'north', minimumRoadClearance: 12, identity: true, inference: plantingInference },
  { id: 'ningwuguan-crabapple-south', roadId: 'ningwuguan', bounds: { minX: 92, maxX: 104, minZ: -203, maxZ: -201 }, side: 'south', minimumRoadClearance: 12, identity: true, inference: plantingInference },
  { id: 'zijingguan-cedar-north', roadId: 'zijingguan', bounds: { minX: -100, maxX: -80, minZ: -184, maxZ: -182 }, side: 'north', minimumRoadClearance: 12, identity: true, inference: plantingInference },
  { id: 'zhengyangguan-myrtle-north', roadId: 'zhengyangguan', bounds: { minX: -100, maxX: -80, minZ: -143, maxZ: -141 }, side: 'north', minimumRoadClearance: 12, identity: true, inference: plantingInference },
  { id: 'jiayuguan-maple-north', roadId: 'jiayuguan', bounds: { minX: 140, maxX: 160, minZ: -94, maxZ: -92 }, side: 'north', minimumRoadClearance: 12, identity: true, inference: plantingInference },
  { id: 'juyongguan-ginkgo-north', roadId: 'juyongguan', bounds: { minX: -100, maxX: -80, minZ: -49, maxZ: -47 }, side: 'north', minimumRoadClearance: 12, identity: true, inference: plantingInference },
  { id: 'linhuaiguan-juniper-north', roadId: 'linhuaiguan', bounds: { minX: 140, maxX: 160, minZ: -4, maxZ: -2 }, side: 'north', minimumRoadClearance: 12, identity: true, inference: plantingInference },
  { id: 'wushengguan-plane-east', roadId: 'wushengguan', bounds: { minX: -106, maxX: -104, minZ: -110, maxZ: -100 }, side: 'east', minimumRoadClearance: 12, identity: true, inference: plantingInference },
  { id: 'hangu-plane-east', roadId: 'hangu-pass', bounds: { minX: 12, maxX: 14, minZ: -245, maxZ: -235 }, side: 'east', minimumRoadClearance: 12, identity: true, inference: plantingInference },
  { id: 'shanhaiguan-plane-east', roadId: 'shanhaiguan', bounds: { minX: 134, maxX: 136, minZ: -150, maxZ: -140 }, side: 'east', minimumRoadClearance: 12, identity: true, inference: plantingInference },
] as const satisfies readonly PlantingZone[];

// World-space Y is sampleGroundHeight(x, z) + the 1.68 m player eye height, encoded to six decimals.
const authoredLandscapeCameraViews = [
  { id: 'shaoguan-peach-road', position: [-195, 6.601323, -267.5], target: [-100, 6.511238, -267.5], roadIds: ['shaoguan'], clearanceBounds: { minX: -197, maxX: -193, minZ: -269.5, maxZ: -265.5 }, clearanceIntersections: 0, ySemantics: 'world' },
  { id: 'ningwuguan-crabapple-road', position: [74.826969, 5.709407, -210.386612], target: [159.826969, 5.581, -208.425073], roadIds: ['ningwuguan'], clearanceBounds: { minX: 72.826969, maxX: 76.826969, minZ: -212.386612, maxZ: -208.386612 }, clearanceIntersections: 0, ySemantics: 'world' },
  { id: 'zijingguan-cedar-road', position: [-145, 4.900335, -177.5], target: [-50, 4.88297, -177.5], roadIds: ['zijingguan'], clearanceBounds: { minX: -147, maxX: -143, minZ: -179.5, maxZ: -175.5 }, clearanceIntersections: 0, ySemantics: 'world' },
  { id: 'zhengyangguan-myrtle-road', position: [-150.214198, 4.196145, -133.925512], target: [-65.214198, 4.243663, -136.354084], roadIds: ['zhengyangguan'], clearanceBounds: { minX: -152.214198, maxX: -148.214198, minZ: -135.925512, maxZ: -131.925512 }, clearanceIntersections: 0, ySemantics: 'world' },
  { id: 'jiayuguan-maple-road', position: [-100, 3.363676, -80], target: [-20, 3.262565, -80], roadIds: ['jiayuguan'], clearanceBounds: { minX: -102, maxX: -98, minZ: -82, maxZ: -78 }, clearanceIntersections: 0, ySemantics: 'world' },
  { id: 'juyongguan-ginkgo-road', position: [-140, 2.596319, -41], target: [-55, 2.604859, -40.4375], roadIds: ['juyongguan'], clearanceBounds: { minX: -142, maxX: -138, minZ: -43, maxZ: -39 }, clearanceIntersections: 0, ySemantics: 'world' },
  { id: 'linhuaiguan-juniper-road', position: [105, 1.716736, 2.5], target: [185, 1.725409, 2.5], roadIds: ['linhuaiguan'], clearanceBounds: { minX: 103, maxX: 107, minZ: 0.5, maxZ: 4.5 }, clearanceIntersections: 0, ySemantics: 'world' },
  { id: 'wushengguan-plane-road', position: [-112, 2.309214, -25], target: [-107, 5.486047, -215], roadIds: ['wushengguan'], clearanceBounds: { minX: -114, maxX: -110, minZ: -27, maxZ: -23 }, clearanceIntersections: 0, ySemantics: 'world' },
  { id: 'hangu-pass-plane-road', position: [7.5, 6.285604, -250], target: [13, 5.801318, -222], roadIds: ['hangu-pass'], clearanceBounds: { minX: 5.5, maxX: 9.5, minZ: -252, maxZ: -248 }, clearanceIntersections: 0, ySemantics: 'world' },
  { id: 'shanhaiguan-plane-road', position: [128, 4.17913, -135], target: [135, 4.691962, -160], roadIds: ['shanhaiguan'], clearanceBounds: { minX: 126, maxX: 130, minZ: -137, maxZ: -133 }, clearanceIntersections: 0, ySemantics: 'world' },
] as const satisfies readonly LandscapeCameraView[];


const authoredDistrict = {
  worldBounds: { minX: -210, maxX: 210, minZ: -300, maxZ: 60 },
  navigableBounds: { minX: -200, maxX: 200, minZ: -290, maxZ: 38 },
  roads: authoredRoads,
  parcels: [
    {
      id: 'west-garden-parcel',
      bounds: { minX: -190, maxX: -135, minZ: -201, maxZ: -184 },
      setback: 5,
      wallSegments: [
        horizontalWall(-190, -135, -201), horizontalWall(-190, -135, -184),
        verticalWall(-190, -201, -184), verticalWall(-135, -201, -184),
      ],
      gates: [{ id: 'west-garden-gate', position: { x: -162, z: -201 }, width: 4, facesRoadId: 'ningwuguan' }],
    },
    {
      id: 'central-garden-parcel',
      bounds: { minX: 18, maxX: 92, minZ: -111, maxZ: -94 },
      setback: 5,
      wallSegments: [
        horizontalWall(18, 92, -111), horizontalWall(18, 92, -94),
        verticalWall(18, -111, -94), verticalWall(92, -111, -94),
      ],
      gates: [{ id: 'central-garden-gate', position: { x: 55, z: -111 }, width: 5, facesRoadId: 'zhengyangguan' }],
    },
    {
      id: 'east-garden-parcel',
      bounds: { minX: 135, maxX: 190, minZ: -201, maxZ: -184 },
      setback: 5,
      wallSegments: [
        horizontalWall(135, 190, -201), horizontalWall(135, 190, -184),
        verticalWall(135, -201, -184), verticalWall(190, -201, -184),
      ],
      gates: [{ id: 'east-garden-gate', position: { x: 162, z: -201 }, width: 4, facesRoadId: 'ningwuguan' }],
    },
  ],
  publicGreen: {
    id: 'badaguan-public-green',
    name: 'Badaguan Public Green',
    bounds: { minX: 18, maxX: 88, minZ: -68, maxZ: -8 },
    paths: [
      { id: 'green-route-path', centerline: [{ x: 18, z: -15 }, { x: 52, z: -35 }, { x: 18, z: -68 }], width: 4 },
      { id: 'green-cross-path', centerline: [{ x: 25, z: -60 }, { x: 78, z: -15 }], width: 3 },
    ],
    inference: inference('Compact route-integrated public green authored for the experience; not a surveyed park boundary.'),
  },
  coast: {
    edgeZ: 38,
    promenade: { id: 'coastal-promenade', centerline: [{ x: -200, z: 34 }, { x: 200, z: 34 }], width: 6 },
    seaBounds: { minX: -210, maxX: 210, minZ: 38, maxZ: 60 },
    screen: {
      z: 36,
      height: 2.6,
      openings: [
        { id: 'wushengguan-coast-opening', minX: -127, maxX: -113, alignedRoadId: 'wushengguan' },
        { id: 'hangu-pass-coast-opening', minX: -7, maxX: 7, alignedRoadId: 'hangu-pass' },
        { id: 'shanhaiguan-coast-opening', minX: 113, maxX: 127, alignedRoadId: 'shanhaiguan' },
      ],
      inference: inference('Structural coast screen and three road-aligned view openings authored for selective eye-level sea exposure; not surveyed.'),
    },
    collidable: false,
  },
  collisionFootprints: authoredArchitectureSites.map(({ id, collisionBounds }) => ({
    id: `${id}-collision`,
    subjectId: id,
    bounds: collisionBounds,
    purpose: 'architecture' as const,
  })),
  architectureSites: authoredArchitectureSites,
  spawn: { x: 0, z: 5 },
  reset: { x: 0, z: 5 },
  spawnYaw: -Math.PI / 8,
  resetYaw: -Math.PI / 8,
  routeAnchors: authoredAnchors,
  landmarkAnchors: authoredLandmarkAnchors,
  route: {
    id: 'badaguan-district-loop',
    anchorIds: authoredAnchors.map(({ id }) => id),
    inference: inference('Ordered walk authored to connect public green, uphill streets, coast, and safe reset.'),
  },
  sightlines: [
    { id: 'uphill-axis', theme: 'uphill', from: { x: 0, z: -80 }, toward: { x: 0, z: -260 } },
    { id: 'garden-view', theme: 'green', from: { x: 0, z: -35 }, toward: { x: 52, z: -35 } },
    { id: 'coast-view', theme: 'coast', from: { x: 0, z: 5 }, toward: { x: 0, z: 38 } },
  ],
  roadPlantingCues: authoredRoadPlantingCues,
  plantingZones: authoredPlantingZones,
  landscapeCameraViews: authoredLandscapeCameraViews,
  provenance: {
    coordinateSystem: 'Metres; +X east, -Z north, +Y up.',
    roadLayout: roadInference,
    publicGreen: inference('Authored public-green placement and paths; not geospatial.'),
    routeGeometry: inference('Authored route and landmark anchors; not a real-world walking itinerary.'),
    buildingFootprints: inference('Architecture sites, visible extents, and matching collision AABBs are authored for the compressed experience; not surveyed parcels or historic coordinates.'),
  },
} as const satisfies DistrictData;

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const DISTRICT_DATA: DistrictData = deepFreeze(authoredDistrict);
export const ROAD_SPECS: readonly RoadSpec[] = DISTRICT_DATA.roads;
export const ROUTE_ANCHORS: readonly RouteAnchor[] = DISTRICT_DATA.routeAnchors;
export const ARCHITECTURE_SITES: readonly ArchitectureSite[] = DISTRICT_DATA.architectureSites;
export const ROAD_PLANTING_CUES: readonly RoadPlantingCue[] = DISTRICT_DATA.roadPlantingCues;
export const PLANTING_ZONES: readonly PlantingZone[] = DISTRICT_DATA.plantingZones;
export const LANDSCAPE_CAMERA_VIEWS: readonly LandscapeCameraView[] = DISTRICT_DATA.landscapeCameraViews;
export const VEGETATION_LOD_POLICIES = Object.freeze({
  low: QUALITY_PROFILES.low.vegetation,
  medium: QUALITY_PROFILES.medium.vegetation,
  high: QUALITY_PROFILES.high.vegetation,
});
