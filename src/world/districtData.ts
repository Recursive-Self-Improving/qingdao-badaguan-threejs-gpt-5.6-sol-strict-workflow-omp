import type {
  DistrictData,
  ArchitectureSite,
  LandmarkAnchor,
  LineSegment,
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
