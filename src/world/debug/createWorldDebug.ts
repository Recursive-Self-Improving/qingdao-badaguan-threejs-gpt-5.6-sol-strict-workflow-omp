import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  PerspectiveCamera,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Object3D,
  Vector3,
} from 'three';

import { APP_CONFIG } from '../../app/config';
import { sampleGroundHeight } from '../../exploration/navigation';
import type { ResourceRegistry } from '../../render/ResourceRegistry';
import { DISTRICT_DATA, ROAD_SPECS, ROUTE_ANCHORS } from '../districtData';
import type {
  Bounds2,
  LandscapeDebugLayout,
  PlantingZone,
  RoadId,
  RoadSpec,
  RouteAnchor,
  SightlineSpec,
  Vec2,
  VegetationSpecies,
  WorldDebugController,
  WorldDebugViewName,
} from '../types';

const DEBUG_LINE_SAMPLE_SPACING = 8;
const DEBUG_SURFACE_OFFSET = 0.28;
const ROUTE_LINE_OFFSET = 0.55;
const SIGHTLINE_OFFSET = 0.8;
const PLANTING_CORRIDOR_OFFSET = 0.96;
const PLANTING_MARKER_RADIUS = 2.4;
const PLANTING_ENDPOINT_GLYPH_CANVAS_SIZE = 128;
const PLANTING_ENDPOINT_GLYPH_TARGET_SIZE_PX = 40;
const PLANTING_ENDPOINT_GLYPH_RENDER_ORDER = 1_300;
const PLANTING_LEADER_KEYLINE_HALF_WIDTH = 3.5;
const PLANTING_LEADER_STROKE_HALF_WIDTH = 1.4;
const PLANTING_LEADER_RENDER_ORDER_BASE = 1_140;
const PLANTING_LEADER_RENDER_ORDER_STRIDE = 3;
const PLANTING_BADGE_MIN_TEXT_SIZE_PX = 16;
const PLANTING_LABEL_BADGE_SIZE = 96;
const PLANTING_LABEL_BADGE_FONT_SIZE = 70;
const PLANTING_ENDPOINT_BADGE_CANVAS_SIZE = 96;
const PLANTING_ENDPOINT_BADGE_TARGET_SIZE_PX = 30;
const PLANTING_ENDPOINT_BADGE_FONT_SIZE = 72;
const PLANTING_ENDPOINT_BADGE_RENDER_ORDER = 1_310;
const PLANTING_RIGHT_TRACK_OUTSET = 18;
const PLANTING_RIGHT_TRACK_SPACING = 42;
const PLANTING_RIGHT_TRACK_MIN_SCREEN_SPACING_PX = 24;
const PLANTING_JIAYUGUAN_LATERAL_DETOUR = 30;
const PLANTING_JIAYUGUAN_SOUTH_DETOUR = 12;
const PLANTING_LABEL_APPROACH_OUTSET = 20;
const PLANTING_LABEL_ALTITUDE = 11;
const PLANTING_LABEL_COLUMN_OUTSET = 150;
const PLANTING_LABEL_NORTH_INSET = 50;
const PLANTING_LABEL_SOUTH_INSET = 10;
const PLANTING_LABEL_ROWS_PER_COLUMN = 5;
const LABEL_CANVAS_WIDTH = 768;
const LABEL_CANVAS_HEIGHT = 144;
const EVIDENCE_CAPTURE_WIDTH_PX = 1246;
const EVIDENCE_CAPTURE_HEIGHT_PX = 552;
const LABEL_SCREEN_SCALE_PER_PIXEL = (
  2 * Math.tan((APP_CONFIG.camera.fov * Math.PI) / 360)
) / EVIDENCE_CAPTURE_HEIGHT_PX;
const PLANTING_ENDPOINT_GLYPH_SCREEN_SIZE = PLANTING_ENDPOINT_GLYPH_TARGET_SIZE_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const PLANTING_ENDPOINT_BADGE_SCREEN_SIZE = PLANTING_ENDPOINT_BADGE_TARGET_SIZE_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const STATIC_LABEL_COLLISION_GAP_PX = 6;
const STATIC_LABEL_GEOMETRY_CLEARANCE_PX = 8;
const STATIC_LABEL_MIN_TEXT_HEIGHT_PX = 12;
const ROAD_LABEL_TARGET_WIDTH_PX = 184;
const ROAD_LABEL_TARGET_HEIGHT_PX = 34;
const ROAD_LABEL_SCREEN_WIDTH = ROAD_LABEL_TARGET_WIDTH_PX * LABEL_SCREEN_SCALE_PER_PIXEL;
const ROAD_LABEL_SCREEN_HEIGHT = ROAD_LABEL_TARGET_HEIGHT_PX * LABEL_SCREEN_SCALE_PER_PIXEL;
const ROAD_LABEL_ALTITUDE = 10.5;
const ROAD_LABEL_COLUMN_X = 350;
const ROAD_LABEL_OUTER_NORTH_OFFSET = -70;
const ROAD_LABEL_CENTER_NORTH_OFFSET = -30;
const ROAD_LABEL_LEADER_BOUNDARY_GAP = 6;
const ROAD_LABEL_TOP_ROW_OFFSET = 5;
const PLANTING_LABEL_TARGET_WIDTH_PX = 304;
const PLANTING_LABEL_TARGET_HEIGHT_PX = 40;
const PLANTING_LABEL_SCREEN_WIDTH = PLANTING_LABEL_TARGET_WIDTH_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const PLANTING_LABEL_SCREEN_HEIGHT = PLANTING_LABEL_TARGET_HEIGHT_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const STRUCTURE_LABEL_TARGET_WIDTH_PX = 170;
const STRUCTURE_LABEL_TARGET_HEIGHT_PX = 34;
const STRUCTURE_LABEL_SCREEN_WIDTH = STRUCTURE_LABEL_TARGET_WIDTH_PX * LABEL_SCREEN_SCALE_PER_PIXEL;
const STRUCTURE_LABEL_SCREEN_HEIGHT = STRUCTURE_LABEL_TARGET_HEIGHT_PX * LABEL_SCREEN_SCALE_PER_PIXEL;
const WIDE_LABEL_TARGET_WIDTH_PX = 210;
const WIDE_LABEL_TARGET_HEIGHT_PX = 38;
const WIDE_LABEL_SCREEN_WIDTH = WIDE_LABEL_TARGET_WIDTH_PX * LABEL_SCREEN_SCALE_PER_PIXEL;
const WIDE_LABEL_SCREEN_HEIGHT = WIDE_LABEL_TARGET_HEIGHT_PX * LABEL_SCREEN_SCALE_PER_PIXEL;
const COAST_CORRIDOR_LABEL_TARGET_WIDTH_PX = 300;
const COAST_CORRIDOR_LABEL_TARGET_HEIGHT_PX = 42;
const COAST_CORRIDOR_LABEL_SCREEN_WIDTH = COAST_CORRIDOR_LABEL_TARGET_WIDTH_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const COAST_CORRIDOR_LABEL_SCREEN_HEIGHT = COAST_CORRIDOR_LABEL_TARGET_HEIGHT_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const PUBLIC_ACCESS_LABEL_TARGET_WIDTH_PX = 160;
const PUBLIC_ACCESS_LABEL_TARGET_HEIGHT_PX = 30;
const PUBLIC_ACCESS_LABEL_SCREEN_WIDTH = PUBLIC_ACCESS_LABEL_TARGET_WIDTH_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const PUBLIC_ACCESS_LABEL_SCREEN_HEIGHT = PUBLIC_ACCESS_LABEL_TARGET_HEIGHT_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const PUBLIC_ACCESS_STAGE_LABEL_TARGET_WIDTH_PX = 42;
const PUBLIC_ACCESS_STAGE_LABEL_TARGET_HEIGHT_PX = 20;
const PUBLIC_ACCESS_STAGE_LABEL_SCREEN_WIDTH = PUBLIC_ACCESS_STAGE_LABEL_TARGET_WIDTH_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const PUBLIC_ACCESS_STAGE_LABEL_SCREEN_HEIGHT = PUBLIC_ACCESS_STAGE_LABEL_TARGET_HEIGHT_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const PUBLIC_ACCESS_SEQUENCE_LABEL_TARGET_WIDTH_PX = 360;
const PUBLIC_ACCESS_SEQUENCE_LABEL_TARGET_HEIGHT_PX = 34;
const PUBLIC_ACCESS_SEQUENCE_LABEL_SCREEN_WIDTH = PUBLIC_ACCESS_SEQUENCE_LABEL_TARGET_WIDTH_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const PUBLIC_ACCESS_SEQUENCE_LABEL_SCREEN_HEIGHT = PUBLIC_ACCESS_SEQUENCE_LABEL_TARGET_HEIGHT_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const PUBLIC_ACCESS_LABEL_ALTITUDE = 8.5;
const PUBLIC_GREEN_MASK_INSET = 1.5;
const PUBLIC_GREEN_MASK_OFFSET = 0.58;
const PUBLIC_ACCESS_RIBBON_OFFSET = 0.68;
const PUBLIC_ACCESS_LINE_OFFSET = 0.74;
const PUBLIC_ACCESS_CORRIDOR_HALF_WIDTH = 4.2;
const PUBLIC_ACCESS_DIAGRAM_HORIZONTAL_INSET = 7;
const PUBLIC_ACCESS_DIAGRAM_LANE_INSET = 16;
const PUBLIC_ACCESS_STAGE_GAP = 3;
const PUBLIC_ACCESS_LABEL_LATERAL_OUTSET = 26;
const PUBLIC_ACCESS_LEADER_START_OUTSET = 4.5;
const PUBLIC_ACCESS_ARROW_LENGTH = 1.6;
const PUBLIC_ACCESS_ARROW_WIDTH = 1;
const FULL_GRID_OPACITY = 0.94;
const SIGHTLINE_GRID_OPACITY = 0.34;
const PLANTING_GRID_OPACITY = 0.46;
const STRUCTURE_LABEL_ALTITUDE = 10;
const SIGHTLINE_RIBBON_OFFSET = 0.68;
const SIGHTLINE_CORRIDOR_HALF_WIDTH = 4;
const SIGHTLINE_ARROW_LENGTH = 14;
const SIGHTLINE_ARROW_WIDTH = 7;
const LONG_SIGHTLINE_ARROW_FRACTIONS = [0.22, 0.44, 0.66, 0.88] as const;
const MEDIUM_SIGHTLINE_ARROW_FRACTIONS = [0.3, 0.6, 0.9] as const;
const SHORT_SIGHTLINE_ARROW_FRACTIONS = [0.46, 0.86] as const;
const ROUTE_ARROW_LENGTH = 7;
const ROUTE_ARROW_WIDTH = 3.5;
const GRID_ORIENTATION_INSET = 18;
const GRID_ORIENTATION_OUTSET = 18;
const GRID_ORIENTATION_LENGTH = 28;
const GRID_ORIENTATION_ARROW_LENGTH = 8;
const GRID_ORIENTATION_ARROW_WIDTH = 4;
const GRID_ORIENTATION_ORIGIN_RADIUS = 1.1;
const GRID_ORIENTATION_LABEL_OFFSET_X = 98;
const GRID_ORIENTATION_LABEL_ALTITUDE = 7.5;
const GRADE_AXIS_X = -28;
const GRADE_TICK_HALF_WIDTH = 3.5;
const COAST_SECTOR_OFFSET = 0.62;
const COAST_SCREEN_POST_SPACING = 24;
const COAST_LABEL_LEADER_ROAD_GAP_CLEARANCE = 2;
const COAST_BAND_ID_TARGET_WIDTH_PX = 64;
const COAST_BAND_ID_TARGET_HEIGHT_PX = 30;
const COAST_BAND_ID_SCREEN_WIDTH = COAST_BAND_ID_TARGET_WIDTH_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const COAST_BAND_ID_SCREEN_HEIGHT = COAST_BAND_ID_TARGET_HEIGHT_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const COAST_BAND_ID_ALTITUDE = 8;
const COAST_BAND_SCREENED_ROW_INLAND_OFFSET = 54;
const COAST_BAND_OPEN_ROW_INLAND_OFFSET = 111;
const COAST_BAND_ID_PERSPECTIVE_X_SCALE = 0.9;
const COAST_BAND_EAST_SCREENED_ROW_X_OUTSET = 38;
const COAST_BAND_CENTER_OPEN_ROW_X_OFFSET = -48;
const COAST_BAND_EAST_OPEN_ROW_X_INSET = 26;
const COAST_BAND_LABEL_LEADER_OFFSET = COAST_SECTOR_OFFSET + 0.14;
const COAST_BAND_SCREENED_LEGEND_TARGET_WIDTH_PX = 200;
const COAST_BAND_OPEN_LEGEND_TARGET_WIDTH_PX = 240;
const COAST_BAND_LEGEND_TARGET_HEIGHT_PX = 30;
const COAST_BAND_SCREENED_LEGEND_SCREEN_WIDTH = COAST_BAND_SCREENED_LEGEND_TARGET_WIDTH_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const COAST_BAND_OPEN_LEGEND_SCREEN_WIDTH = COAST_BAND_OPEN_LEGEND_TARGET_WIDTH_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const COAST_BAND_LEGEND_SCREEN_HEIGHT = COAST_BAND_LEGEND_TARGET_HEIGHT_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const COAST_BAND_LEGEND_ALTITUDE = 8;
const COAST_BAND_LEGEND_SOUTH_OUTSET = 40;
const COAST_BAND_SCREENED_LEGEND_X_INSET = 80;
const COAST_BAND_OPEN_LEGEND_X_INSET = 75;
const COAST_BAND_ARROW_LENGTH = 6;
const COAST_BAND_ARROW_WIDTH = 3;
const GRADE_LABEL_FRACTION = 0.52;
const GRADE_LABEL_LATERAL_OFFSET = 72;
const SPAWN_MARKER_RADIUS = 1;
const RESET_MARKER_RADIUS = 1.4;
const CAMERA_MARKER_HALF_WIDTH = 0.45;
const ACTIVE_MARKER_HEIGHT = 2.8;
const ACTIVE_RING_INNER_RADIUS = 0.85;
const ACTIVE_RING_OUTER_RADIUS = 1.3;
const ACTIVE_RING_SEGMENTS = 32;

const COLORS = {
  roadGrid: 0xe0c36d,
  worldBounds: 0xc27662,
  navigableBounds: 0x72a8b5,
  parcels: 0xd4a16b,
  architectureCollisions: 0xd96f69,
  publicGreen: 0x74b879,
  publicGreenMask: 0x315f3d,
  publicAccess01: 0xf4cf57,
  publicAccess02: 0x6fc9f1,
  route: 0xebd17a,
  coastScreened: 0xe46d5f,
  coastOpen: 0x4fd2bd,
  sightlineUphill: 0xe6b562,
  sightlineGreen: 0x82c889,
  sightlineCoast: 0x71b8c9,
  planting: 0xa8c86f,
  plantingLeaderKeyline: 0x0f1511,
  plantingLeaderHighlight: 0xd9f07a,
  grade: 0xaec7c1,
  marker: 0xf0e3a6,
  activeMarker: 0xf2c45f,
  labelBackground: 0x1d2421,
  labelText: 0xf2eee3,
  labelTextureTint: 0xfbf8ef,
} as const;

type PublicAccessTheme = 'access01' | 'access02';

interface DebugLineMaterials {
  readonly roadGrid: LineBasicMaterial;
  readonly worldBounds: LineBasicMaterial;
  readonly navigableBounds: LineBasicMaterial;
  readonly parcels: LineBasicMaterial;
  readonly architectureCollisions: LineBasicMaterial;
  readonly publicGreen: LineBasicMaterial;
  readonly publicAccess: Readonly<Record<PublicAccessTheme, LineBasicMaterial>>;
  readonly route: LineBasicMaterial;
  readonly coastScreened: LineBasicMaterial;
  readonly coastOpen: LineBasicMaterial;
  readonly grade: LineBasicMaterial;
  readonly marker: LineBasicMaterial;
  readonly activeMarker: LineBasicMaterial;
  readonly sightlines: Readonly<Record<SightlineSpec['theme'], LineBasicMaterial>>;
  readonly planting: LineBasicMaterial;
}

interface DebugRibbonMaterials {
  readonly sightlines: Readonly<Record<SightlineSpec['theme'], MeshBasicMaterial>>;
  readonly publicGreenMask: MeshBasicMaterial;
  readonly publicAccess: Readonly<Record<PublicAccessTheme, MeshBasicMaterial>>;
  readonly coastScreened: MeshBasicMaterial;
  readonly coastOpen: MeshBasicMaterial;
}

interface DebugViewLayers {
  readonly roadContext: Group;
  readonly grid: Group;
  readonly overview: Group;
  readonly publicGreen: Group;
  readonly sightlines: Group;
  readonly planting: Group;
}

interface DebugLabelSpec {
  readonly name: string;
  readonly text: string;
  readonly position: Vec2;
  readonly altitude: number;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly borderColor: number;
  readonly fontSize?: number;
  readonly badgeText?: string;
}

const SIGHTLINE_LABEL_CONFIG = {
  uphill: {
    text: '01  UPHILL AXIS  >>',
    fraction: 0.54,
    lateralOffset: 75,
    longitudinalOffset: 0,
    borderColor: COLORS.sightlineUphill,
  },
  green: {
    text: '02  GREEN VIEW  >>',
    fraction: 0.5,
    lateralOffset: -60,
    longitudinalOffset: 364,
    borderColor: COLORS.sightlineGreen,
  },
  coast: {
    text: '03 SELECTIVE COAST CORRIDOR >>',
    fraction: 0.28,
    lateralOffset: 400,
    longitudinalOffset: 0,
    borderColor: COLORS.sightlineCoast,
  },
} as const satisfies Readonly<Record<SightlineSpec['theme'], {
  readonly text: string;
  readonly fraction: number;
  readonly lateralOffset: number;
  readonly longitudinalOffset: number;
  readonly borderColor: number;
}>>;

function appendLine(
  positions: number[],
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): void {
  positions.push(...from, ...to);
}


function debugPoint(point: Vec2, yOffset: number): readonly [number, number, number] {
  return [point.x, sampleGroundHeight(point.x, point.z) + yOffset, point.z];
}

function appendTerrainLine(
  positions: number[],
  from: Vec2,
  to: Vec2,
  yOffset: number,
): void {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  const length = Math.hypot(deltaX, deltaZ);
  const sections = Math.max(1, Math.ceil(length / DEBUG_LINE_SAMPLE_SPACING));
  for (let section = 0; section < sections; section += 1) {
    const start = section / sections;
    const end = (section + 1) / sections;
    appendLine(
      positions,
      debugPoint({ x: from.x + deltaX * start, z: from.z + deltaZ * start }, yOffset),
      debugPoint({ x: from.x + deltaX * end, z: from.z + deltaZ * end }, yOffset),
    );
  }
}

function appendTerrainPolyline(
  positions: number[],
  points: readonly Vec2[],
  yOffset: number,
): void {
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    appendTerrainLine(positions, from, to, yOffset);
  }
}

function appendTerrainRibbon(
  positions: number[],
  from: Vec2,
  to: Vec2,
  halfWidth: number,
  yOffset: number,
): void {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  const length = Math.hypot(deltaX, deltaZ);
  if (length === 0) return;
  const normalX = (-deltaZ / length) * halfWidth;
  const normalZ = (deltaX / length) * halfWidth;
  const sections = Math.max(1, Math.ceil(length / DEBUG_LINE_SAMPLE_SPACING));
  for (let section = 0; section < sections; section += 1) {
    const start = section / sections;
    const end = (section + 1) / sections;
    const startCenter = { x: from.x + deltaX * start, z: from.z + deltaZ * start };
    const endCenter = { x: from.x + deltaX * end, z: from.z + deltaZ * end };
    const startLeft = debugPoint({ x: startCenter.x + normalX, z: startCenter.z + normalZ }, yOffset);
    const startRight = debugPoint({ x: startCenter.x - normalX, z: startCenter.z - normalZ }, yOffset);
    const endLeft = debugPoint({ x: endCenter.x + normalX, z: endCenter.z + normalZ }, yOffset);
    const endRight = debugPoint({ x: endCenter.x - normalX, z: endCenter.z - normalZ }, yOffset);
    positions.push(...startLeft, ...endLeft, ...startRight);
    positions.push(...startRight, ...endLeft, ...endRight);
  }
}

function createRibbonFootprint(
  from: Vec2,
  to: Vec2,
  halfWidth: number,
): readonly [Vec2, Vec2, Vec2, Vec2] {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  const length = Math.hypot(deltaX, deltaZ);
  if (length === 0) return [from, to, to, from];
  const normalX = (-deltaZ / length) * halfWidth;
  const normalZ = (deltaX / length) * halfWidth;
  return [
    { x: from.x + normalX, z: from.z + normalZ },
    { x: to.x + normalX, z: to.z + normalZ },
    { x: to.x - normalX, z: to.z - normalZ },
    { x: from.x - normalX, z: from.z - normalZ },
  ];
}

function createBoundsFootprint(bounds: Bounds2): readonly [Vec2, Vec2, Vec2, Vec2] {
  return [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.maxZ },
    { x: bounds.minX, z: bounds.maxZ },
  ];
}
function appendTerrainBoundsSurface(
  positions: number[],
  bounds: Bounds2,
  yOffset: number,
): void {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (width <= 0 || depth <= 0) return;
  const xSections = Math.max(1, Math.ceil(width / DEBUG_LINE_SAMPLE_SPACING));
  const zSections = Math.max(1, Math.ceil(depth / DEBUG_LINE_SAMPLE_SPACING));
  for (let zSection = 0; zSection < zSections; zSection += 1) {
    const minZ = bounds.minZ + (depth * zSection) / zSections;
    const maxZ = bounds.minZ + (depth * (zSection + 1)) / zSections;
    for (let xSection = 0; xSection < xSections; xSection += 1) {
      const minX = bounds.minX + (width * xSection) / xSections;
      const maxX = bounds.minX + (width * (xSection + 1)) / xSections;
      const northWest = debugPoint({ x: minX, z: minZ }, yOffset);
      const northEast = debugPoint({ x: maxX, z: minZ }, yOffset);
      const southWest = debugPoint({ x: minX, z: maxZ }, yOffset);
      const southEast = debugPoint({ x: maxX, z: maxZ }, yOffset);
      positions.push(...northWest, ...southWest, ...northEast);
      positions.push(...northEast, ...southWest, ...southEast);
    }
  }
}



function roadCenterlinePoints(road: RoadSpec): readonly [Vec2, ...Vec2[]] {
  return [road.centerline.from, ...road.centerline.via, road.centerline.to];
}

function horizontalPolylineIntersectionX(
  points: readonly [Vec2, ...Vec2[]],
  z: number,
): number | null {
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    const deltaZ = to.z - from.z;
    if (deltaZ === 0) continue;
    const fraction = (z - from.z) / deltaZ;
    if (fraction < 0 || fraction > 1) continue;
    return from.x + (to.x - from.x) * fraction;
  }
  return null;
}

function pointOnPolyline(points: readonly [Vec2, ...Vec2[]], fraction: number): Vec2 {
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    totalLength += Math.hypot(to.x - from.x, to.z - from.z);
  }
  if (totalLength === 0) return points[0];

  const targetLength = Math.min(1, Math.max(0, fraction)) * totalLength;
  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    const segmentLength = Math.hypot(to.x - from.x, to.z - from.z);
    if (segmentLength === 0) continue;
    if (traversed + segmentLength >= targetLength) {
      const segmentFraction = (targetLength - traversed) / segmentLength;
      return {
        x: from.x + (to.x - from.x) * segmentFraction,
        z: from.z + (to.z - from.z) * segmentFraction,
      };
    }
    traversed += segmentLength;
  }
  return points[points.length - 1] ?? points[0];
}

interface PolylineProjection {
  readonly point: Vec2;
  readonly tangent: Vec2;
  readonly distanceSquared: number;
}

function projectPointToPolyline(
  query: Vec2,
  points: readonly [Vec2, ...Vec2[]],
): PolylineProjection | null {
  let closest: PolylineProjection | null = null;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    const deltaX = to.x - from.x;
    const deltaZ = to.z - from.z;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (lengthSquared === 0) continue;
    const fraction = Math.min(1, Math.max(0, (
      (query.x - from.x) * deltaX + (query.z - from.z) * deltaZ
    ) / lengthSquared));
    const point = { x: from.x + deltaX * fraction, z: from.z + deltaZ * fraction };
    const distanceSquared = (query.x - point.x) ** 2 + (query.z - point.z) ** 2;
    if (closest === null || distanceSquared < closest.distanceSquared) {
      const length = Math.sqrt(lengthSquared);
      closest = {
        point,
        tangent: { x: deltaX / length, z: deltaZ / length },
        distanceSquared,
      };
    }
  }
  return closest;
}

function appendBounds(
  positions: number[],
  bounds: Bounds2,
  yOffset: number,
): void {
  const corners = [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.minX, z: bounds.maxZ },
    { x: bounds.maxX, z: bounds.maxZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.minX, z: bounds.minZ },
  ] as const;
  appendTerrainPolyline(positions, corners, yOffset);
}

function appendCross(
  positions: number[],
  point: Vec2,
  radius: number,
  yOffset: number,
): void {
  appendLine(
    positions,
    debugPoint({ x: point.x - radius, z: point.z }, yOffset),
    debugPoint({ x: point.x + radius, z: point.z }, yOffset),
  );
  appendLine(
    positions,
    debugPoint({ x: point.x, z: point.z - radius }, yOffset),
    debugPoint({ x: point.x, z: point.z + radius }, yOffset),
  );
}

function appendTerrainCorridor(
  positions: number[],
  from: Vec2,
  to: Vec2,
  halfWidth: number,
  yOffset: number,
): void {
  appendTerrainLine(positions, from, to, yOffset);
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  const length = Math.hypot(deltaX, deltaZ);
  if (length === 0) return;
  const normalX = -deltaZ / length;
  const normalZ = deltaX / length;
  for (const side of [-1, 1] as const) {
    const offsetX = normalX * halfWidth * side;
    const offsetZ = normalZ * halfWidth * side;
    appendTerrainLine(
      positions,
      { x: from.x + offsetX, z: from.z + offsetZ },
      { x: to.x + offsetX, z: to.z + offsetZ },
      yOffset,
    );
  }
}


function appendTerrainArrowhead(
  positions: number[],
  from: Vec2,
  toward: Vec2,
  fraction: number,
  yOffset: number,
  maximumLength: number,
  maximumWidth: number,
): void {
  const deltaX = toward.x - from.x;
  const deltaZ = toward.z - from.z;
  const segmentLength = Math.hypot(deltaX, deltaZ);
  if (segmentLength === 0) return;
  const directionX = deltaX / segmentLength;
  const directionZ = deltaZ / segmentLength;
  const normalX = -directionZ;
  const normalZ = directionX;
  const arrowLength = Math.min(maximumLength, segmentLength * 0.5);
  const arrowWidth = Math.min(maximumWidth, segmentLength * 0.32);
  const tip = {
    x: from.x + deltaX * fraction,
    z: from.z + deltaZ * fraction,
  };
  const back = {
    x: tip.x - directionX * arrowLength,
    z: tip.z - directionZ * arrowLength,
  };
  appendTerrainLine(positions, tip, {
    x: back.x + normalX * arrowWidth,
    z: back.z + normalZ * arrowWidth,
  }, yOffset);
  appendTerrainLine(positions, tip, {
    x: back.x - normalX * arrowWidth,
    z: back.z - normalZ * arrowWidth,
  }, yOffset);
}

function segmentLabelPosition(
  from: Vec2,
  toward: Vec2,
  fraction: number,
  lateralOffset: number,
  longitudinalOffset: number,
): Vec2 {
  const deltaX = toward.x - from.x;
  const deltaZ = toward.z - from.z;
  const length = Math.hypot(deltaX, deltaZ);
  if (length === 0) return { x: from.x, z: from.z };
  const directionX = deltaX / length;
  const directionZ = deltaZ / length;
  return {
    x: from.x + deltaX * fraction
      + directionX * longitudinalOffset - directionZ * lateralOffset,
    z: from.z + deltaZ * fraction
      + directionZ * longitudinalOffset + directionX * lateralOffset,
  };
}


function insetBounds(bounds: Bounds2, inset: number): Bounds2 | null {
  const value = {
    minX: bounds.minX + inset,
    maxX: bounds.maxX - inset,
    minZ: bounds.minZ + inset,
    maxZ: bounds.maxZ - inset,
  };
  return value.minX < value.maxX && value.minZ < value.maxZ ? value : null;
}

function createLineObject(
  resources: ResourceRegistry,
  group: string,
  name: string,
  positions: readonly number[],
  material: LineBasicMaterial,
): LineSegments {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  resources.register(geometry, group);
  const lines = new LineSegments(geometry, material);
  lines.name = name;
  lines.renderOrder = 1_000;
  return lines;
}

function createRibbonObject(
  resources: ResourceRegistry,
  group: string,
  name: string,
  positions: readonly number[],
  material: MeshBasicMaterial,
  renderOrder = 990,
): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  resources.register(geometry, group);
  const ribbon = new Mesh(geometry, material);
  ribbon.name = name;
  ribbon.renderOrder = renderOrder;
  return ribbon;
}

function registerLineMaterial(
  resources: ResourceRegistry,
  group: string,
  color: number,
  opacity = 0.94,
): LineBasicMaterial {
  return resources.register(new LineBasicMaterial({
    color: new Color(color),
    depthTest: false,
    depthWrite: false,
    transparent: opacity < 1,
    opacity,
  }), group);
}

function registerRibbonMaterial(
  resources: ResourceRegistry,
  group: string,
  color: number,
  opacity: number,
): MeshBasicMaterial {
  return resources.register(new MeshBasicMaterial({
    color: new Color(color),
    depthTest: false,
    depthWrite: false,
    opacity,
    side: DoubleSide,
    transparent: true,
  }), group);
}

function createDebugLineMaterials(resources: ResourceRegistry, group: string): DebugLineMaterials {
  return {
    roadGrid: registerLineMaterial(resources, group, COLORS.roadGrid, FULL_GRID_OPACITY),
    worldBounds: registerLineMaterial(resources, group, COLORS.worldBounds, 0.78),
    navigableBounds: registerLineMaterial(resources, group, COLORS.navigableBounds, 0.72),
    parcels: registerLineMaterial(resources, group, COLORS.parcels),
    architectureCollisions: registerLineMaterial(resources, group, COLORS.architectureCollisions, 0.82),
    publicGreen: registerLineMaterial(resources, group, COLORS.publicGreen),
    publicAccess: {
      access01: registerLineMaterial(resources, group, COLORS.publicAccess01),
      access02: registerLineMaterial(resources, group, COLORS.publicAccess02),
    },
    route: registerLineMaterial(resources, group, COLORS.route),
    coastScreened: registerLineMaterial(resources, group, COLORS.coastScreened),
    coastOpen: registerLineMaterial(resources, group, COLORS.coastOpen),
    grade: registerLineMaterial(resources, group, COLORS.grade, 0.9),
    marker: registerLineMaterial(resources, group, COLORS.marker, 0.8),
    activeMarker: registerLineMaterial(resources, group, COLORS.activeMarker, 0.9),
    sightlines: {
      uphill: registerLineMaterial(resources, group, COLORS.sightlineUphill),
      green: registerLineMaterial(resources, group, COLORS.sightlineGreen),
      coast: registerLineMaterial(resources, group, COLORS.sightlineCoast),
    },
    planting: registerLineMaterial(resources, group, COLORS.planting),
  };
}

function createDebugRibbonMaterials(resources: ResourceRegistry, group: string): DebugRibbonMaterials {
  return {
    publicGreenMask: registerRibbonMaterial(resources, group, COLORS.publicGreenMask, 0.9),
    publicAccess: {
      access01: registerRibbonMaterial(resources, group, COLORS.publicAccess01, 0.9),
      access02: registerRibbonMaterial(resources, group, COLORS.publicAccess02, 0.9),
    },
    sightlines: {
      uphill: registerRibbonMaterial(resources, group, COLORS.sightlineUphill, 0.16),
      green: registerRibbonMaterial(resources, group, COLORS.sightlineGreen, 0.18),
      coast: registerRibbonMaterial(resources, group, COLORS.sightlineCoast, 0.18),
    },
    coastScreened: registerRibbonMaterial(resources, group, COLORS.coastScreened, 0.82),
    coastOpen: registerRibbonMaterial(resources, group, COLORS.coastOpen, 0.86),
  };
}

function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function cssColorWithAlpha(color: number, alpha: number): string {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function createDebugLabel(
  resources: ResourceRegistry,
  group: string,
  spec: DebugLabelSpec,
): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_CANVAS_WIDTH;
  canvas.height = LABEL_CANVAS_HEIGHT;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('World debug labels require a 2D canvas context.');

  context.clearRect(0, 0, LABEL_CANVAS_WIDTH, LABEL_CANVAS_HEIGHT);
  context.fillStyle = cssColorWithAlpha(COLORS.labelBackground, 0.94);
  context.fillRect(4, 4, LABEL_CANVAS_WIDTH - 8, LABEL_CANVAS_HEIGHT - 8);
  context.strokeStyle = cssColor(spec.borderColor);
  context.lineWidth = 6;
  context.strokeRect(7, 7, LABEL_CANVAS_WIDTH - 14, LABEL_CANVAS_HEIGHT - 14);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  let textCenterX = LABEL_CANVAS_WIDTH * 0.5;
  let textMaximumWidth = LABEL_CANVAS_WIDTH - 58;
  if (spec.badgeText !== undefined) {
    const badgeLeft = 20;
    const badgeTop = (LABEL_CANVAS_HEIGHT - PLANTING_LABEL_BADGE_SIZE) * 0.5;
    context.fillStyle = cssColor(COLORS.plantingLeaderHighlight);
    context.fillRect(
      badgeLeft,
      badgeTop,
      PLANTING_LABEL_BADGE_SIZE,
      PLANTING_LABEL_BADGE_SIZE,
    );
    context.strokeStyle = cssColor(COLORS.labelText);
    context.lineWidth = 5;
    context.strokeRect(
      badgeLeft + 2.5,
      badgeTop + 2.5,
      PLANTING_LABEL_BADGE_SIZE - 5,
      PLANTING_LABEL_BADGE_SIZE - 5,
    );
    context.fillStyle = cssColor(COLORS.plantingLeaderKeyline);
    context.font = `800 ${PLANTING_LABEL_BADGE_FONT_SIZE}px "DejaVu Sans Mono", "Liberation Mono", monospace`;
    context.fillText(
      spec.badgeText,
      badgeLeft + PLANTING_LABEL_BADGE_SIZE * 0.5,
      LABEL_CANVAS_HEIGHT * 0.52,
      PLANTING_LABEL_BADGE_SIZE - 12,
    );
    const textLeft = badgeLeft + PLANTING_LABEL_BADGE_SIZE + 18;
    const textRight = LABEL_CANVAS_WIDTH - 29;
    textCenterX = (textLeft + textRight) * 0.5;
    textMaximumWidth = textRight - textLeft;
  }
  context.fillStyle = cssColor(COLORS.labelText);
  context.font = `800 ${spec.fontSize ?? 72}px "Arial Narrow", "Liberation Sans Narrow", "Aptos", sans-serif`;
  context.fillText(
    spec.text,
    textCenterX,
    LABEL_CANVAS_HEIGHT * 0.52,
    textMaximumWidth,
  );

  const texture = resources.register(new CanvasTexture(canvas), group);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  const material = resources.register(new SpriteMaterial({
    map: texture,
    color: new Color(COLORS.labelTextureTint),
    depthTest: false,
    depthWrite: false,
    transparent: true,
    sizeAttenuation: false,
    toneMapped: false,
  }), group);
  const label = new Sprite(material);
  label.name = spec.name;
  label.position.set(
    spec.position.x,
    sampleGroundHeight(spec.position.x, spec.position.z) + spec.altitude,
    spec.position.z,
  );
  label.scale.set(spec.screenWidth, spec.screenHeight, 1);
  label.renderOrder = 1_200;
  return label;
}

function createPlantingEndpointMaterial(
  resources: ResourceRegistry,
  group: string,
): SpriteMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = PLANTING_ENDPOINT_GLYPH_CANVAS_SIZE;
  canvas.height = PLANTING_ENDPOINT_GLYPH_CANVAS_SIZE;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Planting endpoint glyphs require a 2D canvas context.');

  const center = PLANTING_ENDPOINT_GLYPH_CANVAS_SIZE * 0.5;
  context.clearRect(0, 0, PLANTING_ENDPOINT_GLYPH_CANVAS_SIZE, PLANTING_ENDPOINT_GLYPH_CANVAS_SIZE);
  context.lineCap = 'round';
  context.strokeStyle = cssColor(COLORS.labelBackground);
  context.lineWidth = 24;
  context.beginPath();
  context.arc(center, center, 43, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = cssColor(COLORS.activeMarker);
  context.lineWidth = 12;
  context.beginPath();
  context.arc(center, center, 43, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = cssColor(COLORS.labelBackground);
  context.beginPath();
  context.arc(center, center, 18, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = cssColor(COLORS.labelText);
  context.beginPath();
  context.arc(center, center, 9, 0, Math.PI * 2);
  context.fill();

  const texture = resources.register(new CanvasTexture(canvas), group);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return resources.register(new SpriteMaterial({
    map: texture,
    color: new Color(COLORS.labelTextureTint),
    depthTest: false,
    depthWrite: false,
    transparent: true,
    sizeAttenuation: false,
    toneMapped: false,
  }), group);
}


function createPlantingEndpointGlyph(
  entry: PlantingDebugEntry,
  material: SpriteMaterial,
): Sprite {
  const glyph = new Sprite(material);
  glyph.name = `debug:planting-endpoint:${entry.roadId}:${entry.speciesId}`;
  glyph.position.set(
    entry.marker.x,
    sampleGroundHeight(entry.marker.x, entry.marker.z) + PLANTING_CORRIDOR_OFFSET + 0.18,
    entry.marker.z,
  );
  glyph.scale.set(
    PLANTING_ENDPOINT_GLYPH_SCREEN_SIZE,
    PLANTING_ENDPOINT_GLYPH_SCREEN_SIZE,
    1,
  );
  glyph.renderOrder = PLANTING_ENDPOINT_GLYPH_RENDER_ORDER;
  return glyph;
}

function createPlantingEndpointBadgeMaterial(
  resources: ResourceRegistry,
  group: string,
  badgeText: string,
): SpriteMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = PLANTING_ENDPOINT_BADGE_CANVAS_SIZE;
  canvas.height = PLANTING_ENDPOINT_BADGE_CANVAS_SIZE;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Planting endpoint badges require a 2D canvas context.');

  const center = PLANTING_ENDPOINT_BADGE_CANVAS_SIZE * 0.5;
  context.clearRect(0, 0, PLANTING_ENDPOINT_BADGE_CANVAS_SIZE, PLANTING_ENDPOINT_BADGE_CANVAS_SIZE);
  context.fillStyle = cssColor(COLORS.plantingLeaderKeyline);
  context.beginPath();
  context.arc(center, center, center - 3, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = cssColor(COLORS.plantingLeaderHighlight);
  context.lineWidth = 8;
  context.stroke();
  context.fillStyle = cssColor(COLORS.labelText);
  context.font = `800 ${PLANTING_ENDPOINT_BADGE_FONT_SIZE}px "DejaVu Sans Mono", "Liberation Mono", monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(badgeText, center, center + 2, PLANTING_ENDPOINT_BADGE_CANVAS_SIZE - 16);

  const texture = resources.register(new CanvasTexture(canvas), group);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return resources.register(new SpriteMaterial({
    map: texture,
    color: new Color(COLORS.labelTextureTint),
    depthTest: false,
    depthWrite: false,
    transparent: true,
    sizeAttenuation: false,
    toneMapped: false,
  }), group);
}

function createPlantingEndpointBadge(
  entry: PlantingDebugEntry,
  badgeText: string,
  material: SpriteMaterial,
): Sprite {
  const badge = new Sprite(material);
  badge.name = `debug:planting-endpoint-badge:${entry.roadId}:${badgeText}`;
  badge.position.set(
    entry.marker.x,
    sampleGroundHeight(entry.marker.x, entry.marker.z) + PLANTING_CORRIDOR_OFFSET + 0.2,
    entry.marker.z,
  );
  badge.scale.set(
    PLANTING_ENDPOINT_BADGE_SCREEN_SIZE,
    PLANTING_ENDPOINT_BADGE_SCREEN_SIZE,
    1,
  );
  badge.renderOrder = PLANTING_ENDPOINT_BADGE_RENDER_ORDER;
  return badge;
}
type StaticCaptureViewName = Exclude<WorldDebugViewName, 'grid'>;

interface StaticProjectedBounds {
  readonly name: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface StaticProjectedLabel extends StaticProjectedBounds {
  readonly textHeight: number;
}

interface StaticCaptureGeometrySpec {
  readonly name: string;
  readonly footprint: readonly Vec2[];
  readonly altitude: number;
}

function staticProjectedBoundsSeparated(
  first: StaticProjectedBounds,
  second: StaticProjectedBounds,
  clearance: number,
): boolean {
  return first.right + clearance <= second.left
    || second.right + clearance <= first.left
    || first.bottom + clearance <= second.top
    || second.bottom + clearance <= first.top;
}

function createStaticCaptureCamera(view: StaticCaptureViewName): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    APP_CONFIG.camera.fov,
    EVIDENCE_CAPTURE_WIDTH_PX / EVIDENCE_CAPTURE_HEIGHT_PX,
    APP_CONFIG.camera.near,
    APP_CONFIG.camera.far,
  );
  camera.up.set(...APP_CONFIG.camera.worldUp);
  if (view === 'public-green') {
    const bounds = DISTRICT_DATA.publicGreen.bounds;
    const x = (bounds.minX + bounds.maxX) * 0.5;
    const z = (bounds.minZ + bounds.maxZ) * 0.5;
    const groundHeight = sampleGroundHeight(x, z);
    camera.position.set(x, groundHeight + 125, z);
    camera.lookAt(x, groundHeight, z);
  } else if (view === 'planting') {
    const bounds = DISTRICT_DATA.worldBounds;
    const x = (bounds.minX + bounds.maxX) * 0.5;
    const z = (bounds.minZ + bounds.maxZ) * 0.5;
    const groundHeight = sampleGroundHeight(x, z);
    camera.position.set(x, groundHeight + 430, z);
    camera.lookAt(x, groundHeight, z);
  } else {
    const bounds = DISTRICT_DATA.worldBounds;
    const x = (bounds.minX + bounds.maxX) * 0.5;
    const northZ = bounds.minZ - 35;
    const targetZ = -65;
    camera.position.set(x, sampleGroundHeight(x, northZ) + 240, northZ);
    camera.lookAt(x, sampleGroundHeight(x, targetZ), targetZ);
  }
  camera.rotation.z = APP_CONFIG.camera.roll;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function assertStaticCaptureLabelLayout(
  view: StaticCaptureViewName,
  specs: readonly DebugLabelSpec[],
  geometrySpecs: readonly StaticCaptureGeometrySpec[] = [],
): void {
  const camera = createStaticCaptureCamera(view);
  const worldPosition = new Vector3();
  const projected = specs.map((spec): StaticProjectedLabel => {
    worldPosition.set(
      spec.position.x,
      sampleGroundHeight(spec.position.x, spec.position.z) + spec.altitude,
      spec.position.z,
    ).project(camera);
    const centerX = ((worldPosition.x + 1) * EVIDENCE_CAPTURE_WIDTH_PX) * 0.5;
    const centerY = ((1 - worldPosition.y) * EVIDENCE_CAPTURE_HEIGHT_PX) * 0.5;
    const targetHeight = spec.screenHeight / LABEL_SCREEN_SCALE_PER_PIXEL;
    const halfWidth = (spec.screenWidth / LABEL_SCREEN_SCALE_PER_PIXEL) * 0.5;
    const halfHeight = targetHeight * 0.5;
    return {
      name: spec.name,
      left: centerX - halfWidth,
      right: centerX + halfWidth,
      top: centerY - halfHeight,
      bottom: centerY + halfHeight,
      textHeight: targetHeight * ((spec.fontSize ?? 72) / LABEL_CANVAS_HEIGHT),
    };
  });
  const projectedGeometry = geometrySpecs.map((geometry): StaticProjectedBounds => {
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const point of geometry.footprint) {
      worldPosition.set(
        point.x,
        sampleGroundHeight(point.x, point.z) + geometry.altitude,
        point.z,
      ).project(camera);
      const x = ((worldPosition.x + 1) * EVIDENCE_CAPTURE_WIDTH_PX) * 0.5;
      const y = ((1 - worldPosition.y) * EVIDENCE_CAPTURE_HEIGHT_PX) * 0.5;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    if (!Number.isFinite(left) || !Number.isFinite(right)
      || !Number.isFinite(top) || !Number.isFinite(bottom)) {
      throw new Error(`Static ${view} geometry ${geometry.name} has no projection footprint.`);
    }
    return { name: geometry.name, left, right, top, bottom };
  });
  for (const label of projected) {
    if (label.textHeight < STATIC_LABEL_MIN_TEXT_HEIGHT_PX) {
      throw new Error(
        `Static ${view} label ${label.name} renders below ${STATIC_LABEL_MIN_TEXT_HEIGHT_PX}px text.`,
      );
    }
    if (label.left < 0 || label.right > EVIDENCE_CAPTURE_WIDTH_PX
      || label.top < 0 || label.bottom > EVIDENCE_CAPTURE_HEIGHT_PX) {
      throw new Error(`Static ${view} label ${label.name} falls outside 1246x552 capture.`);
    }
  }
  for (let firstIndex = 0; firstIndex < projected.length; firstIndex += 1) {
    const first = projected[firstIndex];
    if (first === undefined) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < projected.length; secondIndex += 1) {
      const second = projected[secondIndex];
      if (second === undefined) continue;
      const separated = staticProjectedBoundsSeparated(
        first,
        second,
        STATIC_LABEL_COLLISION_GAP_PX,
      );
      if (!separated) {
        throw new Error(
          `Static ${view} labels ${first.name} and ${second.name} collide at 1246x552.`,
        );
      }
    }
  }
  for (const label of projected) {
    for (const geometry of projectedGeometry) {
      if (!staticProjectedBoundsSeparated(
        label,
        geometry,
        STATIC_LABEL_GEOMETRY_CLEARANCE_PX,
      )) {
        throw new Error(
          `Static ${view} label ${label.name} occludes ${geometry.name} at 1246x552.`,
        );
      }
    }
  }
}

function assertPlantingLeaderLaneSpacing(): void {
  const camera = createStaticCaptureCamera('planting');
  const centerZ = (DISTRICT_DATA.worldBounds.minZ + DISTRICT_DATA.worldBounds.maxZ) * 0.5;
  const worldPosition = new Vector3();
  let previousScreenX: number | null = null;
  for (const laneIndex of [0, 1, 2, 3]) {
    const trackX = plantingRightTrackX(laneIndex);
    worldPosition.set(
      trackX,
      sampleGroundHeight(trackX, centerZ) + PLANTING_CORRIDOR_OFFSET,
      centerZ,
    ).project(camera);
    const screenX = ((worldPosition.x + 1) * EVIDENCE_CAPTURE_WIDTH_PX) * 0.5;
    if (previousScreenX !== null
      && screenX - previousScreenX < PLANTING_RIGHT_TRACK_MIN_SCREEN_SPACING_PX) {
      throw new Error(
        `Planting leader lanes must remain at least ${PLANTING_RIGHT_TRACK_MIN_SCREEN_SPACING_PX}px apart.`,
      );
    }
    previousScreenX = screenX;
  }
  const rightLabelX = plantingLabelPosition(PLANTING_LABEL_ROWS_PER_COLUMN).x;
  if (plantingRightTrackX(3) >= rightLabelX) {
    throw new Error('Planting leader lanes must retain independent horizontal label lead-ins.');
  }
}


interface PlantingDebugEntry {
  readonly roadId: RoadId;
  readonly roadName: string;
  readonly speciesId: VegetationSpecies;
  readonly speciesLabel: string;
  readonly marker: Vec2;
  readonly zone: PlantingZone;
}

function plantingSpeciesLabel(species: VegetationSpecies): string {
  switch (species) {
    case 'peach': return 'Peach';
    case 'crabapple': return 'Crabapple';
    case 'cedar': return 'Cedar';
    case 'crape-myrtle': return 'Crape myrtle';
    case 'maple': return 'Maple';
    case 'ginkgo': return 'Ginkgo';
    case 'chinese-juniper': return 'Chinese juniper';
    case 'plane-tree': return 'Plane tree';
  }
}

function assertFinitePlantingPoint(point: Vec2, name: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    throw new Error(`Planting debug ${name} must contain finite coordinates.`);
  }
}

function sameBounds(first: Bounds2, second: Bounds2): boolean {
  return first.minX === second.minX && first.maxX === second.maxX
    && first.minZ === second.minZ && first.maxZ === second.maxZ;
}

function boundsContainPoint(bounds: Bounds2, point: Vec2): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX
    && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

function assertPlantingDebugLayout(layout: LandscapeDebugLayout): readonly PlantingDebugEntry[] {
  if (layout.markers.length !== ROAD_SPECS.length || layout.zones.length !== ROAD_SPECS.length) {
    throw new Error(
      `Planting debug layout must contain exactly ${ROAD_SPECS.length} road markers and corridors.`,
    );
  }
  const markersByRoadId = new Map<string, LandscapeDebugLayout['markers'][number]>();
  for (const marker of layout.markers) {
    if (markersByRoadId.has(marker.roadId)) {
      throw new Error(`Planting debug layout repeats marker identity ${marker.roadId}.`);
    }
    markersByRoadId.set(marker.roadId, marker);
  }
  const zonesByRoadId = new Map<string, PlantingZone>();
  for (const zone of layout.zones) {
    if (zonesByRoadId.has(zone.roadId)) {
      throw new Error(`Planting debug layout repeats corridor identity ${zone.roadId}.`);
    }
    zonesByRoadId.set(zone.roadId, zone);
  }

  return ROAD_SPECS.map((road) => {
    const marker = markersByRoadId.get(road.id);
    const zone = zonesByRoadId.get(road.id);
    const cue = DISTRICT_DATA.roadPlantingCues.find(({ roadId }) => roadId === road.id);
    const canonicalZone = DISTRICT_DATA.plantingZones.find(({ roadId }) => roadId === road.id);
    if (marker === undefined || zone === undefined || cue === undefined || canonicalZone === undefined) {
      throw new Error(`Planting debug layout is missing the canonical identity for ${road.id}.`);
    }
    if (marker.speciesId !== cue.species || zone.id !== canonicalZone.id
      || !sameBounds(zone.bounds, canonicalZone.bounds)) {
      throw new Error(`Planting debug identity ${road.id} does not match its canonical road/species cue.`);
    }
    assertFinitePlantingPoint(marker.position, `${road.id} marker`);
    assertFinitePlantingPoint({ x: zone.bounds.minX, z: zone.bounds.minZ }, `${road.id} corridor`);
    assertFinitePlantingPoint({ x: zone.bounds.maxX, z: zone.bounds.maxZ }, `${road.id} corridor`);
    if (zone.bounds.minX >= zone.bounds.maxX || zone.bounds.minZ >= zone.bounds.maxZ) {
      throw new Error(`Planting debug corridor ${road.id} must have positive area.`);
    }
    if (!boundsContainPoint(zone.bounds, marker.position)) {
      throw new Error(`Planting debug marker ${road.id} must fall inside its authored corridor.`);
    }
    return {
      roadId: marker.roadId,
      roadName: road.name,
      speciesId: marker.speciesId,
      speciesLabel: plantingSpeciesLabel(marker.speciesId),
      marker: marker.position,
      zone,
    };
  });
}

function plantingLabelPosition(index: number): Vec2 {
  const bounds = DISTRICT_DATA.worldBounds;
  const rightColumn = index >= PLANTING_LABEL_ROWS_PER_COLUMN;
  const row = index % PLANTING_LABEL_ROWS_PER_COLUMN;
  const usableDepth = bounds.maxZ - bounds.minZ
    - PLANTING_LABEL_NORTH_INSET - PLANTING_LABEL_SOUTH_INSET;
  return {
    x: rightColumn
      ? bounds.maxX + PLANTING_LABEL_COLUMN_OUTSET
      : bounds.minX - PLANTING_LABEL_COLUMN_OUTSET,
    z: bounds.minZ + PLANTING_LABEL_NORTH_INSET
      + (usableDepth * row) / (PLANTING_LABEL_ROWS_PER_COLUMN - 1),
  };
}

function createPlantingLabelSpec(entry: PlantingDebugEntry, index: number): DebugLabelSpec {
  return {
    name: `debug:planting-label:${entry.roadId}:${entry.speciesId}`,
    text: `${entry.roadName.toUpperCase()} / ${entry.speciesLabel.toUpperCase()}`,
    badgeText: String(index + 1).padStart(2, '0'),
    position: plantingLabelPosition(index),
    altitude: PLANTING_LABEL_ALTITUDE,
    screenWidth: PLANTING_LABEL_SCREEN_WIDTH,
    screenHeight: PLANTING_LABEL_SCREEN_HEIGHT,
    borderColor: COLORS.planting,
    fontSize: 54,
  };
}

function assertPlantingBadgeLayout(
  specs: readonly DebugLabelSpec[],
  endpointBadgeCount: number,
  badgeCodes: ReadonlySet<string>,
): void {
  const labelBadgeTextSize = PLANTING_LABEL_TARGET_HEIGHT_PX
    * (PLANTING_LABEL_BADGE_FONT_SIZE / LABEL_CANVAS_HEIGHT);
  const endpointBadgeTextSize = PLANTING_ENDPOINT_BADGE_TARGET_SIZE_PX
    * (PLANTING_ENDPOINT_BADGE_FONT_SIZE / PLANTING_ENDPOINT_BADGE_CANVAS_SIZE);
  if (labelBadgeTextSize < PLANTING_BADGE_MIN_TEXT_SIZE_PX
    || endpointBadgeTextSize < PLANTING_BADGE_MIN_TEXT_SIZE_PX) {
    throw new Error(`Planting road badges must render at least ${PLANTING_BADGE_MIN_TEXT_SIZE_PX}px text.`);
  }
  if (specs.length !== ROAD_SPECS.length
    || endpointBadgeCount !== ROAD_SPECS.length
    || badgeCodes.size !== ROAD_SPECS.length) {
    throw new Error(`Planting debug view must create exactly ${ROAD_SPECS.length} unique label and endpoint badges.`);
  }
  for (let index = 0; index < ROAD_SPECS.length; index += 1) {
    const expectedCode = String(index + 1).padStart(2, '0');
    if (specs[index]?.badgeText !== expectedCode || !badgeCodes.has(expectedCode)) {
      throw new Error(`Planting road badge ${expectedCode} must match its label and endpoint.`);
    }
  }
}

function plantingRightTrackX(index: number): number {
  return DISTRICT_DATA.worldBounds.maxX
    + PLANTING_RIGHT_TRACK_OUTSET
    + index * PLANTING_RIGHT_TRACK_SPACING;
}

function plantingLeaderWaypoints(
  entry: PlantingDebugEntry,
  labelPosition: Vec2,
): readonly Vec2[] | undefined {
  const rightTrack = (index: number): readonly Vec2[] => {
    const trackX = plantingRightTrackX(index);
    return [
      { x: trackX, z: entry.marker.z },
      { x: trackX, z: labelPosition.z },
    ];
  };

  switch (entry.roadId) {
    case 'linhuaiguan': return rightTrack(0);
    case 'wushengguan': return rightTrack(1);
    case 'hangu-pass': return rightTrack(2);
    case 'shanhaiguan': return rightTrack(3);
    case 'jiayuguan': {
      const detourX = entry.marker.x - PLANTING_JIAYUGUAN_LATERAL_DETOUR;
      const detourZ = DISTRICT_DATA.worldBounds.maxZ + PLANTING_JIAYUGUAN_SOUTH_DETOUR;
      const approachX = labelPosition.x - PLANTING_LABEL_APPROACH_OUTSET;
      return [
        { x: detourX, z: entry.marker.z },
        { x: detourX, z: detourZ },
        { x: approachX, z: detourZ },
        { x: approachX, z: labelPosition.z },
      ];
    }
    default: return undefined;
  }
}

interface PlantingLeaderPathSpec {
  readonly roadId: RoadId;
  readonly vertices: readonly Vec2[];
}

function assertPlantingLeaderPathVertices(paths: readonly PlantingLeaderPathSpec[]): void {
  for (let firstIndex = 0; firstIndex < paths.length; firstIndex += 1) {
    const first = paths[firstIndex];
    if (first === undefined) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < paths.length; secondIndex += 1) {
      const second = paths[secondIndex];
      if (second === undefined) continue;
      for (const firstVertex of first.vertices) {
        for (const secondVertex of second.vertices) {
          if (firstVertex.x === secondVertex.x && firstVertex.z === secondVertex.z) {
            throw new Error(
              `Planting leaders ${first.roadId} and ${second.roadId} must not share path vertices.`,
            );
          }
        }
      }
    }
  }
}


function roadNorthEnd(road: RoadSpec): Vec2 {
  const points = roadCenterlinePoints(road);
  let northEnd = points[0];
  for (const point of points) {
    if (point.z < northEnd.z) northEnd = point;
  }
  return northEnd;
}


function roadLabelPosition(road: RoadSpec): Vec2 {
  const points = roadCenterlinePoints(road);
  const center = pointOnPolyline(points, 0.5);
  if (road.orientation === 'east-west') {
    const eastColumn = road.id === 'ningwuguan'
      || road.id === 'zhengyangguan'
      || road.id === 'juyongguan';
    return {
      x: eastColumn ? ROAD_LABEL_COLUMN_X : -ROAD_LABEL_COLUMN_X,
      z: center.z + (road.id === 'shaoguan' ? ROAD_LABEL_TOP_ROW_OFFSET : 0),
    };
  }
  const northEnd = roadNorthEnd(road);
  return {
    x: northEnd.x,
    z: northEnd.z + (road.id === 'hangu-pass'
      ? ROAD_LABEL_CENTER_NORTH_OFFSET
      : ROAD_LABEL_OUTER_NORTH_OFFSET),
  };
}

function createRoadLabel(
  resources: ResourceRegistry,
  group: string,
  road: RoadSpec,
  position: Vec2,
): Sprite {
  return createDebugLabel(resources, group, {
    name: `debug:road-label:${road.id}`,
    text: road.name.toUpperCase(),
    position,
    altitude: ROAD_LABEL_ALTITUDE,
    screenWidth: ROAD_LABEL_SCREEN_WIDTH,
    screenHeight: ROAD_LABEL_SCREEN_HEIGHT,
    borderColor: COLORS.roadGrid,
    fontSize: 74,
  });
}

function roadLabelLeaderAnchor(road: RoadSpec, labelPosition: Vec2): Vec2 | null {
  if (road.orientation === 'east-west') return null;
  return {
    x: labelPosition.x,
    z: DISTRICT_DATA.worldBounds.minZ - ROAD_LABEL_LEADER_BOUNDARY_GAP,
  };
}

interface SightlineLabelLayout {
  readonly anchor: Vec2;
  readonly position: Vec2;
}

function sightlineLabelLayout(sightline: SightlineSpec): SightlineLabelLayout {
  const config = SIGHTLINE_LABEL_CONFIG[sightline.theme];
  const anchor = {
    x: sightline.from.x + (sightline.toward.x - sightline.from.x) * config.fraction,
    z: sightline.from.z + (sightline.toward.z - sightline.from.z) * config.fraction,
  };
  return {
    anchor,
    position: segmentLabelPosition(
      sightline.from,
      sightline.toward,
      config.fraction,
      config.lateralOffset,
      config.longitudinalOffset,
    ),
  };
}

function createSightlineLabelSpec(sightline: SightlineSpec): DebugLabelSpec {
  const config = SIGHTLINE_LABEL_CONFIG[sightline.theme];
  const layout = sightlineLabelLayout(sightline);
  return {
    name: `debug:sightline-label:${sightline.id}`,
    text: config.text,
    position: layout.position,
    altitude: STRUCTURE_LABEL_ALTITUDE,
    screenWidth: sightline.theme === 'coast'
      ? COAST_CORRIDOR_LABEL_SCREEN_WIDTH
      : STRUCTURE_LABEL_SCREEN_WIDTH,
    screenHeight: sightline.theme === 'coast'
      ? COAST_CORRIDOR_LABEL_SCREEN_HEIGHT
      : STRUCTURE_LABEL_SCREEN_HEIGHT,
    borderColor: config.borderColor,
    fontSize: sightline.theme === 'coast' ? 58 : 68,
  };
}

function appendSightlineGeometry(
  positions: number[],
  sightline: SightlineSpec,
): void {
  appendTerrainCorridor(
    positions,
    sightline.from,
    sightline.toward,
    SIGHTLINE_CORRIDOR_HALF_WIDTH,
    SIGHTLINE_OFFSET,
  );
  const deltaX = sightline.toward.x - sightline.from.x;
  const deltaZ = sightline.toward.z - sightline.from.z;
  const length = Math.hypot(deltaX, deltaZ);
  if (length === 0) return;
  const normalX = (-deltaZ / length) * SIGHTLINE_CORRIDOR_HALF_WIDTH;
  const normalZ = (deltaX / length) * SIGHTLINE_CORRIDOR_HALF_WIDTH;
  for (const endpoint of [sightline.from, sightline.toward]) {
    appendTerrainLine(
      positions,
      { x: endpoint.x - normalX, z: endpoint.z - normalZ },
      { x: endpoint.x + normalX, z: endpoint.z + normalZ },
      SIGHTLINE_OFFSET + 0.03,
    );
  }
  const fractions = length > 120
    ? LONG_SIGHTLINE_ARROW_FRACTIONS
    : length > 55
      ? MEDIUM_SIGHTLINE_ARROW_FRACTIONS
      : SHORT_SIGHTLINE_ARROW_FRACTIONS;
  for (const fraction of fractions) {
    appendTerrainArrowhead(
      positions,
      sightline.from,
      sightline.toward,
      fraction,
      SIGHTLINE_OFFSET,
      SIGHTLINE_ARROW_LENGTH,
      SIGHTLINE_ARROW_WIDTH,
    );
  }
  appendCross(positions, sightline.from, 1.5, SIGHTLINE_OFFSET + 0.05);
  appendCross(positions, sightline.toward, 1.8, SIGHTLINE_OFFSET + 0.05);
}

function appendElevatedLabelLeader(
  positions: number[],
  anchor: Vec2,
  labelPosition: Vec2,
  groundOffset: number,
  labelAltitude: number,
  gap?: {
    readonly before: Vec2;
    readonly after: Vec2;
  },
  waypoints?: readonly Vec2[],
): void {
  if (waypoints !== undefined) {
    let segmentFrom = anchor;
    for (const waypoint of waypoints) {
      appendTerrainLine(positions, segmentFrom, waypoint, groundOffset);
      segmentFrom = waypoint;
    }
    appendTerrainLine(positions, segmentFrom, labelPosition, groundOffset);
  } else if (gap === undefined) {
    appendTerrainLine(positions, anchor, labelPosition, groundOffset);
  } else {
    appendTerrainLine(positions, anchor, gap.before, groundOffset);
    appendTerrainLine(positions, gap.after, labelPosition, groundOffset);
  }
  const labelGround = sampleGroundHeight(labelPosition.x, labelPosition.z);
  appendLine(
    positions,
    debugPoint(labelPosition, groundOffset),
    [labelPosition.x, labelGround + labelAltitude - 1.2, labelPosition.z],
  );
  appendCross(positions, anchor, 0.7, groundOffset + 0.03);
}

function appendPlantingLeaderRibbon(
  positions: number[],
  anchor: Vec2,
  labelPosition: Vec2,
  groundOffset: number,
  halfWidth: number,
  waypoints?: readonly Vec2[],
): void {
  let segmentFrom = anchor;
  if (waypoints !== undefined) {
    for (const waypoint of waypoints) {
      appendTerrainRibbon(
        positions,
        segmentFrom,
        waypoint,
        halfWidth,
        groundOffset,
      );
      segmentFrom = waypoint;
    }
  }
  appendTerrainRibbon(
    positions,
    segmentFrom,
    labelPosition,
    halfWidth,
    groundOffset,
  );
}

function appendSightlineLabelLeader(positions: number[], sightline: SightlineSpec): void {
  const layout = sightlineLabelLayout(sightline);
  const leaderWaypoints = sightline.theme === 'green'
    ? [{ x: layout.anchor.x, z: layout.position.z }]
    : undefined;
  let gap: { readonly before: Vec2; readonly after: Vec2 } | undefined;
  if (sightline.theme === 'coast') {
    const crossingRoad = ROAD_SPECS.find(({ id }) => id === 'wushengguan');
    const crossingX = crossingRoad === undefined
      ? null
      : horizontalPolylineIntersectionX(roadCenterlinePoints(crossingRoad), layout.anchor.z);
    const direction = Math.sign(layout.position.x - layout.anchor.x);
    const minimumX = Math.min(layout.anchor.x, layout.position.x);
    const maximumX = Math.max(layout.anchor.x, layout.position.x);
    if (crossingRoad !== undefined && crossingX !== null && direction !== 0
      && crossingX > minimumX && crossingX < maximumX) {
      const halfWidth = crossingRoad.width * 0.5 + crossingRoad.sidewalkWidth
        + COAST_LABEL_LEADER_ROAD_GAP_CLEARANCE;
      gap = {
        before: { x: crossingX - direction * halfWidth, z: layout.anchor.z },
        after: { x: crossingX + direction * halfWidth, z: layout.anchor.z },
      };
    }
  }
  appendElevatedLabelLeader(
    positions,
    layout.anchor,
    layout.position,
    SIGHTLINE_OFFSET + 0.12,
    STRUCTURE_LABEL_ALTITUDE,
    gap,
    leaderWaypoints,
  );
}

interface CoastScreenedSector {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
}

function createCoastScreenedSectors(): readonly CoastScreenedSector[] {
  const { minX, maxX } = DISTRICT_DATA.coast.seaBounds;
  const openings = [...DISTRICT_DATA.coast.screen.openings]
    .sort((first, second) => first.minX - second.minX);
  const sectors: CoastScreenedSector[] = [];
  let cursor = minX;
  for (const opening of openings) {
    const openingMinX = Math.max(minX, opening.minX);
    const openingMaxX = Math.min(maxX, opening.maxX);
    if (openingMinX > cursor) {
      sectors.push({
        id: `S${sectors.length + 1}`,
        minX: cursor,
        maxX: openingMinX,
      });
    }
    cursor = Math.max(cursor, openingMaxX);
  }
  if (cursor < maxX) {
    sectors.push({
      id: `S${sectors.length + 1}`,
      minX: cursor,
      maxX,
    });
  }
  return sectors;
}

function appendCoastScreenSectorLines(
  positions: number[],
  sector: CoastScreenedSector,
): void {
  appendBounds(positions, {
    minX: sector.minX,
    maxX: sector.maxX,
    minZ: DISTRICT_DATA.coast.screen.z,
    maxZ: DISTRICT_DATA.coast.seaBounds.maxZ,
  }, COAST_SECTOR_OFFSET + 0.04);
  const { z, height } = DISTRICT_DATA.coast.screen;
  const from = { x: sector.minX, z };
  const to = { x: sector.maxX, z };
  appendTerrainLine(positions, from, to, COAST_SECTOR_OFFSET);
  appendTerrainLine(positions, from, to, COAST_SECTOR_OFFSET + height);
  const postSections = Math.max(1, Math.ceil((sector.maxX - sector.minX) / COAST_SCREEN_POST_SPACING));
  for (let section = 0; section <= postSections; section += 1) {
    const x = sector.minX + ((sector.maxX - sector.minX) * section) / postSections;
    const ground = sampleGroundHeight(x, z) + COAST_SECTOR_OFFSET;
    appendLine(positions, [x, ground, z], [x, ground + height, z]);
  }
}

function appendCoastOpenViewLines(
  positions: number[],
  minX: number,
  maxX: number,
): void {
  const from = {
    x: (minX + maxX) * 0.5,
    z: DISTRICT_DATA.coast.screen.z,
  };
  const toward = {
    x: from.x,
    z: DISTRICT_DATA.coast.seaBounds.maxZ,
  };
  appendBounds(positions, {
    minX,
    maxX,
    minZ: from.z,
    maxZ: toward.z,
  }, COAST_SECTOR_OFFSET + 0.04);
  appendTerrainLine(positions, from, toward, COAST_SECTOR_OFFSET + 0.07);
  for (const fraction of SHORT_SIGHTLINE_ARROW_FRACTIONS) {
    appendTerrainArrowhead(
      positions,
      from,
      toward,
      fraction,
      COAST_SECTOR_OFFSET + 0.09,
      COAST_BAND_ARROW_LENGTH,
      COAST_BAND_ARROW_WIDTH,
    );
  }
}

function createActiveAnchorMarker(
  resources: ResourceRegistry,
  group: string,
  materials: DebugLineMaterials,
): Object3D {
  const marker = new Group();
  marker.name = 'debug:active-anchor';
  marker.visible = false;

  const beaconPositions: number[] = [];
  appendLine(beaconPositions, [0, 0, 0], [0, ACTIVE_MARKER_HEIGHT, 0]);
  appendLine(beaconPositions, [-1, ACTIVE_MARKER_HEIGHT, 0], [1, ACTIVE_MARKER_HEIGHT, 0]);
  appendLine(beaconPositions, [0, ACTIVE_MARKER_HEIGHT, -1], [0, ACTIVE_MARKER_HEIGHT, 1]);
  marker.add(createLineObject(
    resources,
    group,
    'debug:active-anchor-beacon',
    beaconPositions,
    materials.activeMarker,
  ));

  const ringGeometry = resources.register(new RingGeometry(
    ACTIVE_RING_INNER_RADIUS,
    ACTIVE_RING_OUTER_RADIUS,
    ACTIVE_RING_SEGMENTS,
  ), group);
  const ringMaterial = resources.register(new MeshBasicMaterial({
    color: new Color(COLORS.activeMarker),
    depthTest: false,
    depthWrite: false,
    opacity: 0.92,
    side: DoubleSide,
    transparent: true,
  }), group);
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.name = 'debug:active-anchor-ring';
  ring.rotation.x = -Math.PI * 0.5;
  ring.renderOrder = 1_050;
  marker.add(ring);
  return marker;
}

function createDebugViewLayer(
  root: Object3D,
  name: string,
  objectNames: readonly string[],
): Group {
  const layer = new Group();
  layer.name = name;
  for (const objectName of objectNames) {
    const object = root.getObjectByName(objectName);
    if (object !== undefined) layer.add(object);
  }
  root.add(layer);
  return layer;
}

class WorldDebugControllerImplementation implements WorldDebugController {
  private activeAnchor: RouteAnchor | null = null;
  private selectedView: WorldDebugViewName | null = null;

  constructor(
    readonly root: Object3D,
    private readonly developmentEnabled: boolean,
    private readonly activeMarker: Object3D | null,
    readonly roadLabelCount: number,
    readonly plantingLabelCount: number,
    readonly sightlineCount: number,
    private readonly includesPublicGreen: boolean,
    private readonly layers: DebugViewLayers | null,
    private readonly roadGridMaterial: LineBasicMaterial | null,
  ) {}

  get visible(): boolean {
    return this.developmentEnabled && this.root.visible;
  }

  get currentAnchorId(): string | null {
    return this.activeAnchor?.id ?? null;
  }

  get currentView(): WorldDebugViewName | null {
    return this.developmentEnabled ? this.selectedView : null;
  }

  get publicGreenVisible(): boolean {
    return this.developmentEnabled && this.includesPublicGreen && this.root.visible;
  }

  setVisible(visible: boolean): void {
    if (!this.developmentEnabled) return;
    this.root.visible = visible;
  }

  setView(view: WorldDebugViewName | null): void {
    if (!this.developmentEnabled || this.layers === null || this.roadGridMaterial === null) return;
    this.selectedView = view;
    const unfiltered = view === null;
    this.layers.roadContext.visible = unfiltered
      || view === 'grid' || view === 'sightlines' || view === 'planting';
    this.layers.grid.visible = unfiltered || view === 'grid';
    this.layers.overview.visible = unfiltered;
    this.layers.publicGreen.visible = unfiltered || view === 'public-green';
    this.layers.sightlines.visible = unfiltered || view === 'sightlines';
    this.layers.planting.visible = unfiltered || view === 'planting';
    this.roadGridMaterial.opacity = view === 'sightlines'
      ? SIGHTLINE_GRID_OPACITY
      : view === 'planting'
        ? PLANTING_GRID_OPACITY
        : FULL_GRID_OPACITY;
  }

  visitAnchor(anchorId: string): RouteAnchor | null {
    if (!this.developmentEnabled || this.activeMarker === null) return null;
    const anchor = ROUTE_ANCHORS.find(({ id }) => id === anchorId) ?? null;
    this.activeAnchor = anchor;
    this.activeMarker.visible = anchor !== null;
    if (anchor !== null) {
      this.activeMarker.position.set(
        anchor.position.x,
        sampleGroundHeight(anchor.position.x, anchor.position.z) + DEBUG_SURFACE_OFFSET,
        anchor.position.z,
      );
    }
    return anchor;
  }
}

/** Builds a default-hidden DEV-only structural overlay without allocating production debug resources. */
export function createWorldDebug(
  resources: ResourceRegistry,
  group: string,
  plantingLayout?: LandscapeDebugLayout,
): WorldDebugController {
  const root = new Group();
  root.name = 'world-debug';
  root.visible = false;

  if (!import.meta.env.DEV) {
    return new WorldDebugControllerImplementation(root, false, null, 0, 0, 0, false, null, null);
  }

  const materials = createDebugLineMaterials(resources, group);
  const ribbonMaterials = createDebugRibbonMaterials(resources, group);
  const publicGreenProjectionLabels: DebugLabelSpec[] = [];
  const sightlineProjectionLabels: DebugLabelSpec[] = [];
  const sightlineProjectionGeometry: StaticCaptureGeometrySpec[] = [];

  const roadGridPositions: number[] = [];
  for (const road of ROAD_SPECS) {
    appendTerrainPolyline(
      roadGridPositions,
      roadCenterlinePoints(road),
      DEBUG_SURFACE_OFFSET,
    );
  }
  root.add(createLineObject(
    resources,
    group,
    'debug:terrain-conforming-road-grid',
    roadGridPositions,
    materials.roadGrid,
  ));
  const gridOrientationPositions: number[] = [];
  const gridOrientationSouth = {
    x: DISTRICT_DATA.worldBounds.minX + GRID_ORIENTATION_INSET,
    z: DISTRICT_DATA.worldBounds.maxZ + GRID_ORIENTATION_OUTSET + GRID_ORIENTATION_LENGTH,
  };
  const gridOrientationNorth = {
    x: gridOrientationSouth.x,
    z: gridOrientationSouth.z - GRID_ORIENTATION_LENGTH,
  };
  appendTerrainLine(
    gridOrientationPositions,
    gridOrientationSouth,
    gridOrientationNorth,
    DEBUG_SURFACE_OFFSET + 0.08,
  );
  appendTerrainArrowhead(
    gridOrientationPositions,
    gridOrientationSouth,
    gridOrientationNorth,
    0.98,
    DEBUG_SURFACE_OFFSET + 0.08,
    GRID_ORIENTATION_ARROW_LENGTH,
    GRID_ORIENTATION_ARROW_WIDTH,
  );
  appendCross(
    gridOrientationPositions,
    gridOrientationSouth,
    GRID_ORIENTATION_ORIGIN_RADIUS,
    DEBUG_SURFACE_OFFSET + 0.1,
  );
  root.add(createLineObject(
    resources,
    group,
    'debug:grid-grade-orientation',
    gridOrientationPositions,
    materials.grade,
  ));
  root.add(createDebugLabel(resources, group, {
    name: 'debug:grid-orientation-label',
    text: 'NORTH / UPHILL',
    position: {
      x: gridOrientationSouth.x + GRID_ORIENTATION_LABEL_OFFSET_X,
      z: (gridOrientationSouth.z + gridOrientationNorth.z) * 0.5,
    },
    altitude: GRID_ORIENTATION_LABEL_ALTITUDE,
    screenWidth: PUBLIC_ACCESS_LABEL_SCREEN_WIDTH,
    screenHeight: PUBLIC_ACCESS_LABEL_SCREEN_HEIGHT,
    borderColor: COLORS.grade,
    fontSize: 60,
  }));

  const gradeSamplePositions: number[] = [];
  const transverseSamples = ROAD_SPECS
    .filter(({ orientation }) => orientation === 'east-west')
    .map((road) => {
      const centerline = roadCenterlinePoints(road);
      const midpoint = pointOnPolyline(centerline, 0.5);
      return projectPointToPolyline({ x: GRADE_AXIS_X, z: midpoint.z }, centerline)?.point ?? midpoint;
    })
    .sort((first, second) => first.z - second.z);
  const north = transverseSamples[0];
  const south = transverseSamples[transverseSamples.length - 1];
  if (north !== undefined && south !== undefined) {
    appendTerrainLine(gradeSamplePositions, south, north, SIGHTLINE_OFFSET + 0.04);
    for (const fraction of MEDIUM_SIGHTLINE_ARROW_FRACTIONS) {
      appendTerrainArrowhead(
        gradeSamplePositions,
        south,
        north,
        fraction,
        SIGHTLINE_OFFSET + 0.04,
        SIGHTLINE_ARROW_LENGTH,
        SIGHTLINE_ARROW_WIDTH,
      );
    }
    for (const sample of transverseSamples) {
      appendTerrainLine(
        gradeSamplePositions,
        { x: sample.x - GRADE_TICK_HALF_WIDTH, z: sample.z },
        { x: sample.x + GRADE_TICK_HALF_WIDTH, z: sample.z },
        SIGHTLINE_OFFSET + 0.06,
      );
    }
    appendCross(gradeSamplePositions, north, 1.3, SIGHTLINE_OFFSET + 0.08);
    appendCross(gradeSamplePositions, south, 1.3, SIGHTLINE_OFFSET + 0.08);
    const gradeRise = sampleGroundHeight(north.x, north.z) - sampleGroundHeight(south.x, south.z);
    const gradeSign = gradeRise >= 0 ? '+' : '';
    const gradeDistance = Math.hypot(north.x - south.x, north.z - south.z);
    const gradeAnchor = pointOnPolyline([south, north], GRADE_LABEL_FRACTION);
    const gradeLabelPosition = { x: GRADE_AXIS_X - GRADE_LABEL_LATERAL_OFFSET, z: gradeAnchor.z };
    appendElevatedLabelLeader(
      gradeSamplePositions,
      gradeAnchor,
      gradeLabelPosition,
      SIGHTLINE_OFFSET + 0.12,
      STRUCTURE_LABEL_ALTITUDE,
    );
    const gradeLabelSpec: DebugLabelSpec = {
      name: 'debug:grade-label',
      text: `GRADE ${gradeSign}${gradeRise.toFixed(1)} m / ${gradeDistance.toFixed(0)} m / NORTH UPHILL`,
      position: gradeLabelPosition,
      altitude: STRUCTURE_LABEL_ALTITUDE,
      screenWidth: WIDE_LABEL_SCREEN_WIDTH,
      screenHeight: WIDE_LABEL_SCREEN_HEIGHT,
      borderColor: COLORS.grade,
      fontSize: 56,
    };
    sightlineProjectionLabels.push(gradeLabelSpec);
    root.add(createDebugLabel(resources, group, gradeLabelSpec));
  }
  root.add(createLineObject(
    resources,
    group,
    'debug:sightline-grade-profile',
    gradeSamplePositions,
    materials.grade,
  ));

  const worldBoundsPositions: number[] = [];
  appendBounds(worldBoundsPositions, DISTRICT_DATA.worldBounds, DEBUG_SURFACE_OFFSET);
  root.add(createLineObject(
    resources,
    group,
    'debug:world-bounds',
    worldBoundsPositions,
    materials.worldBounds,
  ));

  const navigableBoundsPositions: number[] = [];
  appendBounds(navigableBoundsPositions, DISTRICT_DATA.navigableBounds, DEBUG_SURFACE_OFFSET + 0.04);
  root.add(createLineObject(
    resources,
    group,
    'debug:navigable-bounds',
    navigableBoundsPositions,
    materials.navigableBounds,
  ));

  const parcelPositions: number[] = [];
  for (const parcel of DISTRICT_DATA.parcels) {
    appendBounds(parcelPositions, parcel.bounds, DEBUG_SURFACE_OFFSET + 0.08);
    const setback = insetBounds(parcel.bounds, parcel.setback);
    if (setback !== null) appendBounds(parcelPositions, setback, DEBUG_SURFACE_OFFSET + 0.08);
  }
  root.add(createLineObject(
    resources,
    group,
    'debug:parcels-and-setbacks',
    parcelPositions,
    materials.parcels,
  ));

  const architectureCollisionPositions: number[] = [];
  for (const footprint of DISTRICT_DATA.collisionFootprints) {
    appendBounds(architectureCollisionPositions, footprint.bounds, DEBUG_SURFACE_OFFSET + 0.12);
  }
  root.add(createLineObject(
    resources,
    group,
    'debug:architecture-collisions',
    architectureCollisionPositions,
    materials.architectureCollisions,
  ));

  const publicGreenBounds = DISTRICT_DATA.publicGreen.bounds;
  const publicGreenPositions: number[] = [];
  appendBounds(publicGreenPositions, publicGreenBounds, DEBUG_SURFACE_OFFSET + 0.16);
  root.add(createLineObject(
    resources,
    group,
    'debug:public-green',
    publicGreenPositions,
    materials.publicGreen,
  ));

  const publicGreenMaskPositions: number[] = [];
  const publicGreenMaskBounds = insetBounds(publicGreenBounds, PUBLIC_GREEN_MASK_INSET);
  if (publicGreenMaskBounds !== null) {
    appendTerrainBoundsSurface(
      publicGreenMaskPositions,
      publicGreenMaskBounds,
      PUBLIC_GREEN_MASK_OFFSET,
    );
  }
  root.add(createRibbonObject(
    resources,
    group,
    'debug:public-green-schematic-mask',
    publicGreenMaskPositions,
    ribbonMaterials.publicGreenMask,
    980,
  ));

  const publicAccessRibbonGroup = new Group();
  publicAccessRibbonGroup.name = 'debug:public-green-access-ribbons';
  const publicAccessChainGroup = new Group();
  publicAccessChainGroup.name = 'debug:public-green-access-chains';
  const publicAccessLeaderGroup = new Group();
  publicAccessLeaderGroup.name = 'debug:public-green-access-leaders';
  const publicAccessLabelGroup = new Group();
  publicAccessLabelGroup.name = 'debug:public-green-access-labels';
  const publicAccessStages = [
    { id: 'path', marker: 'P' },
    { id: 'apron', marker: 'A' },
    { id: 'crosswalk', marker: 'C' },
    { id: 'street', marker: 'S' },
  ] as const;
  const publicAccessSpecs = [
    {
      id: 'hangu',
      text: 'ACCESS 01',
      theme: 'access01',
      laneZ: publicGreenBounds.maxZ - PUBLIC_ACCESS_DIAGRAM_LANE_INSET,
    },
    {
      id: 'juyong',
      text: 'ACCESS 02',
      theme: 'access02',
      laneZ: publicGreenBounds.minZ + PUBLIC_ACCESS_DIAGRAM_LANE_INSET,
    },
  ] as const;
  const publicAccessDiagramMinX = publicGreenBounds.minX + PUBLIC_ACCESS_DIAGRAM_HORIZONTAL_INSET;
  const publicAccessDiagramMaxX = publicGreenBounds.maxX - PUBLIC_ACCESS_DIAGRAM_HORIZONTAL_INSET;
  const publicAccessStageWidth = (
    publicAccessDiagramMaxX - publicAccessDiagramMinX
    - PUBLIC_ACCESS_STAGE_GAP * (publicAccessStages.length - 1)
  ) / publicAccessStages.length;
  for (const access of publicAccessSpecs) {
    const chainColor = access.theme === 'access01' ? COLORS.publicAccess01 : COLORS.publicAccess02;
    const chainRibbonPositions: number[] = [];
    const chainLinePositions: number[] = [];
    const leaderPositions: number[] = [];
    const labelPosition = {
      x: publicGreenBounds.minX - PUBLIC_ACCESS_LABEL_LATERAL_OUTSET,
      z: access.laneZ,
    };
    const leaderFrom = {
      x: publicGreenBounds.minX - PUBLIC_ACCESS_LEADER_START_OUTSET,
      z: access.laneZ,
    };
    const leaderToward = { x: publicAccessDiagramMinX, z: access.laneZ };
    appendTerrainLine(leaderPositions, leaderFrom, leaderToward, PUBLIC_ACCESS_LINE_OFFSET);
    appendTerrainArrowhead(
      leaderPositions,
      leaderFrom,
      leaderToward,
      0.94,
      PUBLIC_ACCESS_LINE_OFFSET + 0.02,
      PUBLIC_ACCESS_ARROW_LENGTH,
      PUBLIC_ACCESS_ARROW_WIDTH,
    );

    const accessLabelSpec: DebugLabelSpec = {
      name: `debug:public-access-label:${access.id}`,
      text: access.text,
      position: labelPosition,
      altitude: PUBLIC_ACCESS_LABEL_ALTITUDE,
      screenWidth: PUBLIC_ACCESS_LABEL_SCREEN_WIDTH,
      screenHeight: PUBLIC_ACCESS_LABEL_SCREEN_HEIGHT,
      borderColor: chainColor,
      fontSize: 58,
    };
    publicGreenProjectionLabels.push(accessLabelSpec);
    publicAccessLabelGroup.add(createDebugLabel(resources, group, accessLabelSpec));

    for (let stageIndex = 0; stageIndex < publicAccessStages.length; stageIndex += 1) {
      const stage = publicAccessStages[stageIndex];
      if (stage === undefined) continue;
      const stageMinX = publicAccessDiagramMinX
        + stageIndex * (publicAccessStageWidth + PUBLIC_ACCESS_STAGE_GAP);
      const stageMaxX = stageMinX + publicAccessStageWidth;
      const stageFrom = { x: stageMinX, z: access.laneZ };
      const stageToward = { x: stageMaxX, z: access.laneZ };
      appendTerrainRibbon(
        chainRibbonPositions,
        stageFrom,
        stageToward,
        PUBLIC_ACCESS_CORRIDOR_HALF_WIDTH,
        PUBLIC_ACCESS_RIBBON_OFFSET,
      );
      appendTerrainCorridor(
        chainLinePositions,
        stageFrom,
        stageToward,
        PUBLIC_ACCESS_CORRIDOR_HALF_WIDTH,
        PUBLIC_ACCESS_LINE_OFFSET,
      );
      for (const endpointX of [stageMinX, stageMaxX]) {
        appendTerrainLine(
          chainLinePositions,
          { x: endpointX, z: access.laneZ - PUBLIC_ACCESS_CORRIDOR_HALF_WIDTH },
          { x: endpointX, z: access.laneZ + PUBLIC_ACCESS_CORRIDOR_HALF_WIDTH },
          PUBLIC_ACCESS_LINE_OFFSET,
        );
      }
      if (stageIndex < publicAccessStages.length - 1) {
        const connectorToward = {
          x: stageMaxX + PUBLIC_ACCESS_STAGE_GAP,
          z: access.laneZ,
        };
        appendTerrainLine(
          chainLinePositions,
          stageToward,
          connectorToward,
          PUBLIC_ACCESS_LINE_OFFSET,
        );
        appendTerrainArrowhead(
          chainLinePositions,
          stageToward,
          connectorToward,
          0.94,
          PUBLIC_ACCESS_LINE_OFFSET + 0.02,
          PUBLIC_ACCESS_ARROW_LENGTH,
          PUBLIC_ACCESS_ARROW_WIDTH,
        );
      }
      const stageLabelSpec: DebugLabelSpec = {
        name: `debug:public-access-stage:${access.id}:${stage.id}`,
        text: stage.marker,
        position: { x: (stageMinX + stageMaxX) * 0.5, z: access.laneZ },
        altitude: PUBLIC_ACCESS_LABEL_ALTITUDE,
        screenWidth: PUBLIC_ACCESS_STAGE_LABEL_SCREEN_WIDTH,
        screenHeight: PUBLIC_ACCESS_STAGE_LABEL_SCREEN_HEIGHT,
        borderColor: chainColor,
        fontSize: 92,
      };
      publicGreenProjectionLabels.push(stageLabelSpec);
      publicAccessLabelGroup.add(createDebugLabel(resources, group, stageLabelSpec));
    }

    publicAccessRibbonGroup.add(createRibbonObject(
      resources,
      group,
      `debug:public-green-access-ribbon:${access.id}`,
      chainRibbonPositions,
      ribbonMaterials.publicAccess[access.theme],
    ));
    publicAccessChainGroup.add(createLineObject(
      resources,
      group,
      `debug:public-green-access-chain:${access.id}`,
      chainLinePositions,
      materials.publicAccess[access.theme],
    ));
    publicAccessLeaderGroup.add(createLineObject(
      resources,
      group,
      `debug:public-green-access-leader:${access.id}`,
      leaderPositions,
      materials.publicAccess[access.theme],
    ));
  }

  const publicAccessLegendSpec: DebugLabelSpec = {
    name: 'debug:public-access-sequence-legend',
    text: 'P PATH  ·  A APRON  ·  C CROSSWALK  ·  S STREET',
    position: {
      x: (publicGreenBounds.minX + publicGreenBounds.maxX) * 0.5,
      z: publicGreenBounds.maxZ + 7,
    },
    altitude: PUBLIC_ACCESS_LABEL_ALTITUDE,
    screenWidth: PUBLIC_ACCESS_SEQUENCE_LABEL_SCREEN_WIDTH,
    screenHeight: PUBLIC_ACCESS_SEQUENCE_LABEL_SCREEN_HEIGHT,
    borderColor: COLORS.publicGreen,
    fontSize: 58,
  };
  publicGreenProjectionLabels.push(publicAccessLegendSpec);
  publicAccessLabelGroup.add(createDebugLabel(resources, group, publicAccessLegendSpec));
  root.add(
    publicAccessRibbonGroup,
    publicAccessChainGroup,
    publicAccessLeaderGroup,
    publicAccessLabelGroup,
  );

  const publicGreenLabelSpec: DebugLabelSpec = {
    name: 'debug:public-green-label',
    text: 'PUBLIC GREEN / OPEN SPACE',
    position: {
      x: (publicGreenBounds.minX + publicGreenBounds.maxX) * 0.5,
      z: publicGreenBounds.minZ - 14,
    },
    altitude: STRUCTURE_LABEL_ALTITUDE + 1.5,
    screenWidth: WIDE_LABEL_SCREEN_WIDTH,
    screenHeight: WIDE_LABEL_SCREEN_HEIGHT,
    borderColor: COLORS.publicGreen,
    fontSize: 64,
  };
  publicGreenProjectionLabels.push(publicGreenLabelSpec);
  root.add(createDebugLabel(resources, group, publicGreenLabelSpec));

  const coastScreenedLinePositions: number[] = [];
  const coastScreenedRibbonPositions: number[] = [];
  const coastOpenLinePositions: number[] = [];
  const coastOpenRibbonPositions: number[] = [];
  const coastScreenedBandLabelLeaderPositions: number[] = [];
  const coastOpenBandLabelLeaderPositions: number[] = [];
  const coastSectorLabelGroup = new Group();
  coastSectorLabelGroup.name = 'debug:coast-sector-labels';

  const coastScreenedSectors = createCoastScreenedSectors();
  const coastOpenings = [...DISTRICT_DATA.coast.screen.openings]
    .sort((first, second) => first.minX - second.minX);
  const coastBands = [
    ...coastScreenedSectors.map((sector) => ({ ...sector, kind: 'screened' as const })),
    ...coastOpenings.map((opening, index) => ({
      id: `O${index + 1}`,
      kind: 'open' as const,
      minX: opening.minX,
      maxX: opening.maxX,
    })),
  ].sort((first, second) => first.minX - second.minX);
  for (const band of coastBands) {
    const bandBounds = {
      minX: band.minX,
      maxX: band.maxX,
      minZ: DISTRICT_DATA.coast.screen.z,
      maxZ: DISTRICT_DATA.coast.seaBounds.maxZ,
    };
    const ribbonPositions = band.kind === 'screened'
      ? coastScreenedRibbonPositions
      : coastOpenRibbonPositions;
    appendTerrainBoundsSurface(ribbonPositions, bandBounds, COAST_SECTOR_OFFSET - 0.05);
    sightlineProjectionGeometry.push({
      name: `debug:coast-band-ribbon:${band.id}`,
      footprint: createBoundsFootprint(bandBounds),
      altitude: COAST_SECTOR_OFFSET - 0.05,
    });
    if (band.kind === 'screened') {
      appendCoastScreenSectorLines(coastScreenedLinePositions, band);
    } else {
      appendCoastOpenViewLines(coastOpenLinePositions, band.minX, band.maxX);
    }
    const bandCenter = {
      x: (band.minX + band.maxX) * 0.5,
      z: (bandBounds.minZ + bandBounds.maxZ) * 0.5,
    };
    let bandLabelX = bandCenter.x * COAST_BAND_ID_PERSPECTIVE_X_SCALE;
    if (band.kind === 'screened' && bandCenter.x > 0) {
      bandLabelX += COAST_BAND_EAST_SCREENED_ROW_X_OUTSET;
    } else if (band.kind === 'open' && bandCenter.x === 0) {
      bandLabelX += COAST_BAND_CENTER_OPEN_ROW_X_OFFSET;
    } else if (band.kind === 'open' && bandCenter.x > 0) {
      bandLabelX -= COAST_BAND_EAST_OPEN_ROW_X_INSET;
    }
    const bandLabelPosition = {
      x: bandLabelX,
      z: DISTRICT_DATA.coast.screen.z - (band.kind === 'screened'
        ? COAST_BAND_SCREENED_ROW_INLAND_OFFSET
        : COAST_BAND_OPEN_ROW_INLAND_OFFSET),
    };
    appendElevatedLabelLeader(
      band.kind === 'screened'
        ? coastScreenedBandLabelLeaderPositions
        : coastOpenBandLabelLeaderPositions,
      bandCenter,
      bandLabelPosition,
      COAST_BAND_LABEL_LEADER_OFFSET,
      COAST_BAND_ID_ALTITUDE,
    );
    const bandLabelSpec: DebugLabelSpec = {
      name: `debug:coast-band-label:${band.id}`,
      text: band.id,
      position: bandLabelPosition,
      altitude: COAST_BAND_ID_ALTITUDE,
      screenWidth: COAST_BAND_ID_SCREEN_WIDTH,
      screenHeight: COAST_BAND_ID_SCREEN_HEIGHT,
      borderColor: band.kind === 'screened' ? COLORS.coastScreened : COLORS.coastOpen,
      fontSize: 104,
    };
    sightlineProjectionLabels.push(bandLabelSpec);
    coastSectorLabelGroup.add(createDebugLabel(resources, group, bandLabelSpec));
  }
  coastSectorLabelGroup.add(
    createLineObject(
      resources,
      group,
      'debug:coast-screened-band-label-leaders',
      coastScreenedBandLabelLeaderPositions,
      materials.coastScreened,
    ),
    createLineObject(
      resources,
      group,
      'debug:coast-open-band-label-leaders',
      coastOpenBandLabelLeaderPositions,
      materials.coastOpen,
    ),
  );

  const coastLegendZ = DISTRICT_DATA.coast.seaBounds.maxZ + COAST_BAND_LEGEND_SOUTH_OUTSET;
  const coastLegendSpecs: readonly DebugLabelSpec[] = [
    {
      name: 'debug:coast-screened-legend',
      text: `S = SCREENED (${coastScreenedSectors.length})`,
      position: {
        x: DISTRICT_DATA.coast.seaBounds.minX + COAST_BAND_SCREENED_LEGEND_X_INSET,
        z: coastLegendZ,
      },
      altitude: COAST_BAND_LEGEND_ALTITUDE,
      screenWidth: COAST_BAND_SCREENED_LEGEND_SCREEN_WIDTH,
      screenHeight: COAST_BAND_LEGEND_SCREEN_HEIGHT,
      borderColor: COLORS.coastScreened,
      fontSize: 60,
    },
    {
      name: 'debug:coast-open-legend',
      text: `O = OPEN ROAD VIEW (${coastOpenings.length})`,
      position: {
        x: DISTRICT_DATA.coast.seaBounds.maxX - COAST_BAND_OPEN_LEGEND_X_INSET,
        z: coastLegendZ,
      },
      altitude: COAST_BAND_LEGEND_ALTITUDE,
      screenWidth: COAST_BAND_OPEN_LEGEND_SCREEN_WIDTH,
      screenHeight: COAST_BAND_LEGEND_SCREEN_HEIGHT,
      borderColor: COLORS.coastOpen,
      fontSize: 58,
    },
  ];
  for (const coastLegendSpec of coastLegendSpecs) {
    sightlineProjectionLabels.push(coastLegendSpec);
    coastSectorLabelGroup.add(createDebugLabel(resources, group, coastLegendSpec));
  }
  root.add(
    createRibbonObject(
      resources,
      group,
      'debug:coast-screened-ribbons',
      coastScreenedRibbonPositions,
      ribbonMaterials.coastScreened,
    ),
    createLineObject(
      resources,
      group,
      'debug:coast-screened-sectors',
      coastScreenedLinePositions,
      materials.coastScreened,
    ),
    createRibbonObject(
      resources,
      group,
      'debug:coast-open-view-ribbons',
      coastOpenRibbonPositions,
      ribbonMaterials.coastOpen,
    ),
    createLineObject(
      resources,
      group,
      'debug:coast-open-view-sectors',
      coastOpenLinePositions,
      materials.coastOpen,
    ),
    coastSectorLabelGroup,
  );

  const routePositions: number[] = [];
  for (let index = 1; index < ROUTE_ANCHORS.length; index += 1) {
    const from = ROUTE_ANCHORS[index - 1];
    const to = ROUTE_ANCHORS[index];
    if (from === undefined || to === undefined) continue;
    appendTerrainLine(routePositions, from.position, to.position, ROUTE_LINE_OFFSET);
    appendTerrainArrowhead(
      routePositions,
      from.position,
      to.position,
      0.72,
      ROUTE_LINE_OFFSET,
      ROUTE_ARROW_LENGTH,
      ROUTE_ARROW_WIDTH,
    );
  }
  root.add(createLineObject(
    resources,
    group,
    'debug:ordered-route',
    routePositions,
    materials.route,
  ));

  const routeAnchorPositions: number[] = [];
  for (const anchor of ROUTE_ANCHORS) {
    appendCross(routeAnchorPositions, anchor.position, 0.55, ROUTE_LINE_OFFSET + 0.04);
  }
  root.add(createLineObject(
    resources,
    group,
    'debug:route-anchors',
    routeAnchorPositions,
    materials.route,
  ));
  const routeLabelGroup = new Group();
  routeLabelGroup.name = 'debug:route-labels';
  const routeLabels = [
    { id: 'ordered', text: 'ORDERED ROUTE 00 > 14', position: { x: 350, z: -170 } },
  ] as const;
  for (const routeLabel of routeLabels) {
    routeLabelGroup.add(createDebugLabel(resources, group, {
      name: `debug:route-label:${routeLabel.id}`,
      text: routeLabel.text,
      position: routeLabel.position,
      altitude: STRUCTURE_LABEL_ALTITUDE,
      screenWidth: WIDE_LABEL_SCREEN_WIDTH,
      screenHeight: WIDE_LABEL_SCREEN_HEIGHT,
      borderColor: COLORS.route,
      fontSize: 62,
    }));
  }
  root.add(routeLabelGroup);

  const sightlineLabelGroup = new Group();
  sightlineLabelGroup.name = 'debug:sightline-labels';
  for (const sightline of DISTRICT_DATA.sightlines) {
    const ribbonPositions: number[] = [];
    appendTerrainRibbon(
      ribbonPositions,
      sightline.from,
      sightline.toward,
      SIGHTLINE_CORRIDOR_HALF_WIDTH,
      SIGHTLINE_RIBBON_OFFSET,
    );
    sightlineProjectionGeometry.push(
      {
        name: `debug:sightline-ribbon:${sightline.id}`,
        footprint: createRibbonFootprint(
          sightline.from,
          sightline.toward,
          SIGHTLINE_CORRIDOR_HALF_WIDTH,
        ),
        altitude: SIGHTLINE_RIBBON_OFFSET,
      },
      {
        name: `debug:sightline-corridor:${sightline.id}`,
        footprint: createRibbonFootprint(
          sightline.from,
          sightline.toward,
          Math.max(SIGHTLINE_CORRIDOR_HALF_WIDTH, SIGHTLINE_ARROW_WIDTH),
        ),
        altitude: SIGHTLINE_OFFSET + 0.05,
      },
    );
    root.add(createRibbonObject(
      resources,
      group,
      `debug:sightline-ribbon:${sightline.id}`,
      ribbonPositions,
      ribbonMaterials.sightlines[sightline.theme],
    ));

    const corridorPositions: number[] = [];
    appendSightlineGeometry(corridorPositions, sightline);
    root.add(createLineObject(
      resources,
      group,
      `debug:sightline:${sightline.id}`,
      corridorPositions,
      materials.sightlines[sightline.theme],
    ));

    const leaderPositions: number[] = [];
    appendSightlineLabelLeader(leaderPositions, sightline);
    root.add(createLineObject(
      resources,
      group,
      `debug:sightline-label-leader:${sightline.id}`,
      leaderPositions,
      materials.sightlines[sightline.theme],
    ));
    const sightlineLabelSpec = createSightlineLabelSpec(sightline);
    sightlineProjectionLabels.push(sightlineLabelSpec);
    sightlineLabelGroup.add(createDebugLabel(resources, group, sightlineLabelSpec));
  }
  root.add(sightlineLabelGroup);
  assertStaticCaptureLabelLayout('public-green', publicGreenProjectionLabels);
  assertStaticCaptureLabelLayout(
    'sightlines',
    sightlineProjectionLabels,
    sightlineProjectionGeometry,
  );

  const spawnPositions: number[] = [];
  appendCross(
    spawnPositions,
    DISTRICT_DATA.spawn,
    SPAWN_MARKER_RADIUS,
    DEBUG_SURFACE_OFFSET + 0.24,
  );
  const spawnGround = sampleGroundHeight(DISTRICT_DATA.spawn.x, DISTRICT_DATA.spawn.z);
  appendLine(
    spawnPositions,
    [DISTRICT_DATA.spawn.x, spawnGround + DEBUG_SURFACE_OFFSET, DISTRICT_DATA.spawn.z],
    [DISTRICT_DATA.spawn.x, spawnGround + DEBUG_SURFACE_OFFSET + 0.6, DISTRICT_DATA.spawn.z],
  );
  root.add(createLineObject(
    resources,
    group,
    'debug:spawn-marker',
    spawnPositions,
    materials.marker,
  ));
  const resetPositions: number[] = [];
  const resetMarkerPoints = [
    { x: DISTRICT_DATA.reset.x, z: DISTRICT_DATA.reset.z - RESET_MARKER_RADIUS },
    { x: DISTRICT_DATA.reset.x + RESET_MARKER_RADIUS, z: DISTRICT_DATA.reset.z },
    { x: DISTRICT_DATA.reset.x, z: DISTRICT_DATA.reset.z + RESET_MARKER_RADIUS },
    { x: DISTRICT_DATA.reset.x - RESET_MARKER_RADIUS, z: DISTRICT_DATA.reset.z },
    { x: DISTRICT_DATA.reset.x, z: DISTRICT_DATA.reset.z - RESET_MARKER_RADIUS },
  ] as const;
  appendTerrainPolyline(resetPositions, resetMarkerPoints, DEBUG_SURFACE_OFFSET + 0.32);
  root.add(createLineObject(
    resources,
    group,
    'debug:reset-marker',
    resetPositions,
    materials.activeMarker,
  ));

  const cameraHeightPositions: number[] = [];
  appendLine(
    cameraHeightPositions,
    [DISTRICT_DATA.spawn.x, spawnGround + DEBUG_SURFACE_OFFSET, DISTRICT_DATA.spawn.z],
    [DISTRICT_DATA.spawn.x, spawnGround + APP_CONFIG.camera.eyeHeight, DISTRICT_DATA.spawn.z],
  );
  appendLine(
    cameraHeightPositions,
    [
      DISTRICT_DATA.spawn.x - CAMERA_MARKER_HALF_WIDTH,
      spawnGround + APP_CONFIG.camera.eyeHeight,
      DISTRICT_DATA.spawn.z,
    ],
    [
      DISTRICT_DATA.spawn.x + CAMERA_MARKER_HALF_WIDTH,
      spawnGround + APP_CONFIG.camera.eyeHeight,
      DISTRICT_DATA.spawn.z,
    ],
  );
  appendLine(
    cameraHeightPositions,
    [
      DISTRICT_DATA.spawn.x,
      spawnGround + APP_CONFIG.camera.eyeHeight,
      DISTRICT_DATA.spawn.z - CAMERA_MARKER_HALF_WIDTH,
    ],
    [
      DISTRICT_DATA.spawn.x,
      spawnGround + APP_CONFIG.camera.eyeHeight,
      DISTRICT_DATA.spawn.z + CAMERA_MARKER_HALF_WIDTH,
    ],
  );
  root.add(createLineObject(
    resources,
    group,
    'debug:camera-height-marker',
    cameraHeightPositions,
    materials.marker,
  ));

  const roadLabelLeaderPositions: number[] = [];
  const labelGroup = new Group();
  labelGroup.name = 'debug:road-labels';
  for (const road of ROAD_SPECS) {
    const labelPosition = roadLabelPosition(road);
    const leaderAnchor = roadLabelLeaderAnchor(road, labelPosition);
    if (leaderAnchor !== null) {
      appendElevatedLabelLeader(
        roadLabelLeaderPositions,
        leaderAnchor,
        labelPosition,
        DEBUG_SURFACE_OFFSET + 0.12,
        ROAD_LABEL_ALTITUDE,
      );
    }
    labelGroup.add(createRoadLabel(resources, group, road, labelPosition));
  }
  root.add(
    createLineObject(
      resources,
      group,
      'debug:road-label-leaders',
      roadLabelLeaderPositions,
      materials.roadGrid,
    ),
    labelGroup,
  );

  const plantingLayerObjectNames: string[] = [];
  let plantingLabelCount = 0;
  if (plantingLayout !== undefined) {
    const plantingEntries = assertPlantingDebugLayout(plantingLayout);
    const plantingCorridorGroup = new Group();
    plantingCorridorGroup.name = 'debug:planting-corridors';
    const plantingMarkerGroup = new Group();
    plantingMarkerGroup.name = 'debug:planting-markers';
    const plantingEndpointGroup = new Group();
    plantingEndpointGroup.name = 'debug:planting-endpoints';
    const plantingLeaderKeylineGroup = new Group();
    plantingLeaderKeylineGroup.name = 'debug:planting-label-leader-keylines';
    const plantingEndpointBadgeGroup = new Group();
    plantingEndpointBadgeGroup.name = 'debug:planting-endpoint-badges';
    const plantingLeaderGroup = new Group();
    plantingLeaderGroup.name = 'debug:planting-label-leaders';
    const plantingLabelGroup = new Group();
    plantingLabelGroup.name = 'debug:planting-labels';
    const plantingProjectionLabels: DebugLabelSpec[] = [];
    const plantingEndpointMaterial = createPlantingEndpointMaterial(resources, group);
    const plantingLeaderMaterial = resources.register(new LineBasicMaterial({
      color: new Color(COLORS.plantingLeaderHighlight),
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }), group);
    const plantingLeaderKeylineMaterial = resources.register(new MeshBasicMaterial({
      color: new Color(COLORS.plantingLeaderKeyline),
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    }), group);
    const plantingLeaderStrokeMaterial = resources.register(new MeshBasicMaterial({
      color: new Color(COLORS.plantingLeaderHighlight),
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    }), group);
    const plantingLeaderPaths: PlantingLeaderPathSpec[] = [];
    const plantingBadgeCodes = new Set<string>();

    for (let index = 0; index < plantingEntries.length; index += 1) {
      const entry = plantingEntries[index];
      if (entry === undefined) {
        throw new Error('Planting debug layout failed to resolve all ten canonical road identities.');
      }
      const corridorPositions: number[] = [];
      appendBounds(corridorPositions, entry.zone.bounds, PLANTING_CORRIDOR_OFFSET);
      plantingCorridorGroup.add(createLineObject(
        resources,
        group,
        `debug:planting-corridor:${entry.roadId}`,
        corridorPositions,
        materials.planting,
      ));

      const markerPositions: number[] = [];
      appendCross(markerPositions, entry.marker, PLANTING_MARKER_RADIUS, PLANTING_CORRIDOR_OFFSET + 0.08);
      plantingMarkerGroup.add(createLineObject(
        resources,
        group,
        `debug:planting-marker:${entry.roadId}:${entry.speciesId}`,
        markerPositions,
        materials.planting,
      ));
      plantingEndpointGroup.add(createPlantingEndpointGlyph(entry, plantingEndpointMaterial));

      const labelSpec = createPlantingLabelSpec(entry, index);
      const badgeText = labelSpec.badgeText;
      if (badgeText === undefined || plantingBadgeCodes.has(badgeText)) {
        throw new Error(`Planting debug badge ${badgeText ?? 'missing'} must be unique.`);
      }
      plantingBadgeCodes.add(badgeText);
      const endpointBadgeMaterial = createPlantingEndpointBadgeMaterial(
        resources,
        group,
        badgeText,
      );
      plantingEndpointBadgeGroup.add(createPlantingEndpointBadge(
        entry,
        badgeText,
        endpointBadgeMaterial,
      ));
      const leaderWaypoints = plantingLeaderWaypoints(entry, labelSpec.position);
      const leaderKeylinePositions: number[] = [];
      const leaderStrokePositions: number[] = [];
      const leaderPositions: number[] = [];
      const leaderPathVertices = [
        entry.marker,
        ...(leaderWaypoints ?? []),
        labelSpec.position,
      ];
      plantingLeaderPaths.push({ roadId: entry.roadId, vertices: leaderPathVertices });
      appendPlantingLeaderRibbon(
        leaderKeylinePositions,
        entry.marker,
        labelSpec.position,
        PLANTING_CORRIDOR_OFFSET + 0.12,
        PLANTING_LEADER_KEYLINE_HALF_WIDTH,
        leaderWaypoints,
      );
      appendPlantingLeaderRibbon(
        leaderStrokePositions,
        entry.marker,
        labelSpec.position,
        PLANTING_CORRIDOR_OFFSET + 0.12,
        PLANTING_LEADER_STROKE_HALF_WIDTH,
        leaderWaypoints,
      );
      appendElevatedLabelLeader(
        leaderPositions,
        entry.marker,
        labelSpec.position,
        PLANTING_CORRIDOR_OFFSET + 0.12,
        PLANTING_LABEL_ALTITUDE,
        undefined,
        leaderWaypoints,
      );
      const bridgeRenderOrder = PLANTING_LEADER_RENDER_ORDER_BASE
        + index * PLANTING_LEADER_RENDER_ORDER_STRIDE;
      plantingLeaderKeylineGroup.add(
        createRibbonObject(
          resources,
          group,
          `debug:planting-label-leader-keyline:${entry.roadId}`,
          leaderKeylinePositions,
          plantingLeaderKeylineMaterial,
          bridgeRenderOrder,
        ),
        createRibbonObject(
          resources,
          group,
          `debug:planting-label-leader-stroke:${entry.roadId}`,
          leaderStrokePositions,
          plantingLeaderStrokeMaterial,
          bridgeRenderOrder + 1,
        ),
      );
      const leader = createLineObject(
        resources,
        group,
        `debug:planting-label-leader:${entry.roadId}`,
        leaderPositions,
        plantingLeaderMaterial,
      );
      leader.renderOrder = bridgeRenderOrder + 2;
      plantingLeaderGroup.add(leader);
      plantingProjectionLabels.push(labelSpec);
      plantingLabelGroup.add(createDebugLabel(resources, group, labelSpec));
    }


    assertStaticCaptureLabelLayout('planting', plantingProjectionLabels);
    assertPlantingLeaderLaneSpacing();
    assertPlantingLeaderPathVertices(plantingLeaderPaths);
    assertPlantingBadgeLayout(
      plantingProjectionLabels,
      plantingEndpointBadgeGroup.children.length,
      plantingBadgeCodes,
    );
    plantingLabelCount = plantingLabelGroup.children.length;
    const plantingEndpointCount = plantingEndpointGroup.children.length;
    if (plantingLabelCount !== ROAD_SPECS.length
      || plantingEndpointCount !== ROAD_SPECS.length
      || plantingLeaderKeylineGroup.children.length !== ROAD_SPECS.length * 2) {
      throw new Error(
        `Planting debug view must create exactly ${ROAD_SPECS.length} readable labels, endpoints, badges, and leader pairs.`,
      );
    }
    root.add(
      plantingCorridorGroup,
      plantingMarkerGroup,
      plantingEndpointGroup,
      plantingEndpointBadgeGroup,
      plantingLeaderKeylineGroup,
      plantingLeaderGroup,
      plantingLabelGroup,
    );
    plantingLayerObjectNames.push(
      plantingCorridorGroup.name,
      plantingMarkerGroup.name,
      plantingEndpointGroup.name,
      plantingEndpointBadgeGroup.name,
      plantingLeaderKeylineGroup.name,
      plantingLeaderGroup.name,
      plantingLabelGroup.name,
    );
  }

  const activeMarker = createActiveAnchorMarker(resources, group, materials);
  root.add(activeMarker);

  const viewLayers: DebugViewLayers = {
    roadContext: createDebugViewLayer(root, 'debug:view-layer:road-context', [
      'debug:terrain-conforming-road-grid',
    ]),
    grid: createDebugViewLayer(root, 'debug:view-layer:grid', [
      'debug:world-bounds',
      'debug:navigable-bounds',
      'debug:grid-grade-orientation',
      'debug:grid-orientation-label',
      'debug:road-label-leaders',
      'debug:road-labels',
    ]),
    overview: createDebugViewLayer(root, 'debug:view-layer:overview', [
      'debug:parcels-and-setbacks',
      'debug:architecture-collisions',
      'debug:ordered-route',
      'debug:route-anchors',
      'debug:route-labels',
      'debug:spawn-marker',
      'debug:reset-marker',
      'debug:camera-height-marker',
      'debug:active-anchor',
    ]),
    publicGreen: createDebugViewLayer(root, 'debug:view-layer:public-green', [
      'debug:public-green',
      'debug:public-green-schematic-mask',
      'debug:public-green-access-chains',
      'debug:public-green-access-ribbons',
      'debug:public-green-access-leaders',
      'debug:public-green-access-labels',
      'debug:public-green-label',
    ]),
    sightlines: createDebugViewLayer(root, 'debug:view-layer:sightlines', [
      'debug:sightline-grade-profile',
      'debug:grade-label',
      'debug:coast-screened-ribbons',
      'debug:coast-screened-sectors',
      'debug:coast-open-view-ribbons',
      'debug:coast-open-view-sectors',
      'debug:coast-sector-labels',
      ...DISTRICT_DATA.sightlines.flatMap(({ id }) => [
        `debug:sightline-ribbon:${id}`,
        `debug:sightline:${id}`,
        `debug:sightline-label-leader:${id}`,
      ]),
      'debug:sightline-labels',
    ]),
    planting: createDebugViewLayer(root, 'debug:view-layer:planting', plantingLayerObjectNames),
  };

  return new WorldDebugControllerImplementation(
    root,
    true,
    activeMarker,
    labelGroup.children.length,
    plantingLabelCount,
    DISTRICT_DATA.sightlines.length,
    true,
    viewLayers,
    materials.roadGrid,
  );
}
