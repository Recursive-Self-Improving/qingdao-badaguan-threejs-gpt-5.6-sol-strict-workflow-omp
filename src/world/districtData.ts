import type {
  DistrictData,
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
  ['shaoguan', 'Shaoguan Road', -260],
  ['ningwuguan', 'Ningwuguan Road', -215],
  ['zijingguan', 'Zijingguan Road', -170],
  ['zhengyangguan', 'Zhengyangguan Road', -125],
  ['jiayuguan', 'Jiayuguan Road', -80],
  ['juyongguan', 'Juyongguan Road', -35],
  ['linhuaiguan', 'Linhuaiguan Road', 10],
] as const;

const northSouthRoads = [
  ['wushengguan', 'Wushengguan Road', -120],
  ['hangu-pass', 'Hangu Pass Road', 0],
  ['shanhaiguan', 'Shanhaiguan Road', 120],
] as const;

const roadInference = inference(
  'Simplified straight grid authored from the requested Badaguan road-name set; not surveyed or geospatial.',
);

const authoredRoads: readonly RoadSpec[] = [
  ...eastWestRoads.map(([id, name, z]) => ({
    id,
    name,
    orientation: 'east-west' as const,
    centerline: { from: { x: -200, z }, to: { x: 200, z } },
    width: 12,
    sidewalkWidth: 3,
    inference: roadInference,
  })),
  ...northSouthRoads.map(([id, name, x]) => ({
    id,
    name,
    orientation: 'north-south' as const,
    centerline: { from: { x, z: 38 }, to: { x, z: -290 } },
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

const authoredDistrict = {
  worldBounds: { minX: -210, maxX: 210, minZ: -300, maxZ: 60 },
  navigableBounds: { minX: -200, maxX: 200, minZ: -290, maxZ: 38 },
  roads: authoredRoads,
  parcels: [
    {
      id: 'west-garden-parcel',
      bounds: { minX: -190, maxX: -135, minZ: -155, maxZ: -95 },
      setback: 8,
      wallSegments: [
        horizontalWall(-190, -135, -155), horizontalWall(-190, -135, -95),
        verticalWall(-190, -155, -95), verticalWall(-135, -155, -95),
      ],
      gates: [{ id: 'west-garden-gate', position: { x: -135, z: -125 }, width: 4, facesRoadId: 'zhengyangguan' }],
    },
    {
      id: 'central-garden-parcel',
      bounds: { minX: 18, maxX: 92, minZ: -155, maxZ: -95 },
      setback: 10,
      wallSegments: [
        horizontalWall(18, 92, -155), horizontalWall(18, 92, -95),
        verticalWall(18, -155, -95), verticalWall(92, -155, -95),
      ],
      gates: [{ id: 'central-garden-gate', position: { x: 18, z: -125 }, width: 5, facesRoadId: 'zhengyangguan' }],
    },
    {
      id: 'east-garden-parcel',
      bounds: { minX: 135, maxX: 190, minZ: -245, maxZ: -185 },
      setback: 8,
      wallSegments: [
        horizontalWall(135, 190, -245), horizontalWall(135, 190, -185),
        verticalWall(135, -245, -185), verticalWall(190, -245, -185),
      ],
      gates: [{ id: 'east-garden-gate', position: { x: 135, z: -215 }, width: 4, facesRoadId: 'ningwuguan' }],
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
    collidable: false,
  },
  collisionFootprints: [
    { id: 'future-building-west-north', bounds: { minX: -185, maxX: -145, minZ: -240, maxZ: -190 }, purpose: 'future-building' },
    { id: 'future-building-west-south', bounds: { minX: -185, maxX: -145, minZ: -65, maxZ: -12 }, purpose: 'future-building' },
    { id: 'future-building-central', bounds: { minX: 30, maxX: 78, minZ: -145, maxZ: -105 }, purpose: 'future-building' },
    { id: 'future-building-east', bounds: { minX: 145, maxX: 185, minZ: -155, maxZ: -100 }, purpose: 'future-building' },
  ],
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
    buildingFootprints: inference('Simplified collision reservations for future buildings, without villa detail.'),
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
