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
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Object3D,
} from 'three';

import { APP_CONFIG } from '../../app/config';
import { sampleGroundHeight } from '../../exploration/navigation';
import type { ResourceRegistry } from '../../render/ResourceRegistry';
import { DISTRICT_DATA, ROAD_SPECS, ROUTE_ANCHORS } from '../districtData';
import type {
  Bounds2,
  RoadSpec,
  RouteAnchor,
  SightlineSpec,
  Vec2,
  WorldDebugController,
  WorldDebugViewName,
} from '../types';

const DEBUG_LINE_SAMPLE_SPACING = 8;
const DEBUG_SURFACE_OFFSET = 0.28;
const ROUTE_LINE_OFFSET = 0.55;
const SIGHTLINE_OFFSET = 0.8;
const LABEL_CANVAS_WIDTH = 768;
const LABEL_CANVAS_HEIGHT = 144;
const EVIDENCE_CAPTURE_HEIGHT_PX = 552;
const LABEL_SCREEN_SCALE_PER_PIXEL = (
  2 * Math.tan((APP_CONFIG.camera.fov * Math.PI) / 360)
) / EVIDENCE_CAPTURE_HEIGHT_PX;
const ROAD_LABEL_TARGET_WIDTH_PX = 184;
const ROAD_LABEL_TARGET_HEIGHT_PX = 34;
const ROAD_LABEL_SCREEN_WIDTH = ROAD_LABEL_TARGET_WIDTH_PX * LABEL_SCREEN_SCALE_PER_PIXEL;
const ROAD_LABEL_SCREEN_HEIGHT = ROAD_LABEL_TARGET_HEIGHT_PX * LABEL_SCREEN_SCALE_PER_PIXEL;
const ROAD_LABEL_ALTITUDE = 10.5;
const ROAD_LABEL_COLUMN_X = 350;
const ROAD_LABEL_OUTER_NORTH_OFFSET = -2;
const ROAD_LABEL_CENTER_STAGGER = 40;
const ROAD_LABEL_TOP_ROW_OFFSET = 5;
const STRUCTURE_LABEL_TARGET_WIDTH_PX = 170;
const STRUCTURE_LABEL_TARGET_HEIGHT_PX = 34;
const STRUCTURE_LABEL_SCREEN_WIDTH = STRUCTURE_LABEL_TARGET_WIDTH_PX * LABEL_SCREEN_SCALE_PER_PIXEL;
const STRUCTURE_LABEL_SCREEN_HEIGHT = STRUCTURE_LABEL_TARGET_HEIGHT_PX * LABEL_SCREEN_SCALE_PER_PIXEL;
const WIDE_LABEL_TARGET_WIDTH_PX = 210;
const WIDE_LABEL_TARGET_HEIGHT_PX = 38;
const WIDE_LABEL_SCREEN_WIDTH = WIDE_LABEL_TARGET_WIDTH_PX * LABEL_SCREEN_SCALE_PER_PIXEL;
const WIDE_LABEL_SCREEN_HEIGHT = WIDE_LABEL_TARGET_HEIGHT_PX * LABEL_SCREEN_SCALE_PER_PIXEL;
const PUBLIC_ACCESS_LABEL_TARGET_WIDTH_PX = 160;
const PUBLIC_ACCESS_LABEL_TARGET_HEIGHT_PX = 30;
const PUBLIC_ACCESS_LABEL_SCREEN_WIDTH = PUBLIC_ACCESS_LABEL_TARGET_WIDTH_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const PUBLIC_ACCESS_LABEL_SCREEN_HEIGHT = PUBLIC_ACCESS_LABEL_TARGET_HEIGHT_PX
  * LABEL_SCREEN_SCALE_PER_PIXEL;
const PUBLIC_ACCESS_LABEL_ALTITUDE = 8.5;
const PUBLIC_ACCESS_LINE_OFFSET = 0.72;
const PUBLIC_ACCESS_CORRIDOR_HALF_WIDTH = 0.65;
const PUBLIC_ACCESS_ARROW_LENGTH = 8;
const PUBLIC_ACCESS_ARROW_WIDTH = 4;
const PUBLIC_ACCESS_THRESHOLD_HALF_WIDTH = 2.2;
const FULL_GRID_OPACITY = 0.94;
const SIGHTLINE_GRID_OPACITY = 0.42;
const STRUCTURE_LABEL_ALTITUDE = 10;
const SIGHTLINE_CORRIDOR_HALF_WIDTH = 4;
const SIGHTLINE_ARROW_LENGTH = 18;
const SIGHTLINE_ARROW_WIDTH = 10;
const LONG_SIGHTLINE_ARROW_FRACTIONS = [0.32, 0.58, 0.84] as const;
const SHORT_SIGHTLINE_ARROW_FRACTIONS = [0.92] as const;
const ROUTE_ARROW_LENGTH = 7;
const ROUTE_ARROW_WIDTH = 3.5;
const GRADE_AXIS_X = -12;
const GRADE_TICK_HALF_WIDTH = 4;
const COAST_DEBUG_HALF_SPAN = 64;
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
  collisions: 0xd96f69,
  publicGreen: 0x74b879,
  publicAccess: 0xf6f0a8,
  route: 0xebd17a,
  coast: 0x6cb0c0,
  sightlineUphill: 0xe6b562,
  sightlineGreen: 0x82c889,
  sightlineCoast: 0x71b8c9,
  marker: 0xf0e3a6,
  activeMarker: 0xf2c45f,
  labelBackground: 0x1d2421,
  labelText: 0xf2eee3,
  labelTextureTint: 0xfbf8ef,
} as const;

interface DebugLineMaterials {
  readonly roadGrid: LineBasicMaterial;
  readonly worldBounds: LineBasicMaterial;
  readonly navigableBounds: LineBasicMaterial;
  readonly parcels: LineBasicMaterial;
  readonly collisions: LineBasicMaterial;
  readonly publicGreen: LineBasicMaterial;
  readonly publicAccess: LineBasicMaterial;
  readonly route: LineBasicMaterial;
  readonly coast: LineBasicMaterial;
  readonly marker: LineBasicMaterial;
  readonly activeMarker: LineBasicMaterial;
  readonly sightlines: Readonly<Record<SightlineSpec['theme'], LineBasicMaterial>>;
}

interface DebugViewLayers {
  readonly overview: Group;
  readonly publicGreen: Group;
  readonly publicGreenLabels: Group;
  readonly sightlines: Group;
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
}

const SIGHTLINE_LABEL_CONFIG = {
  uphill: {
    text: '01  UPHILL AXIS  >>',
    fraction: 0.54,
    lateralOffset: 36,
    borderColor: COLORS.sightlineUphill,
  },
  green: {
    text: '02  GREEN VIEW  >>',
    fraction: 0.52,
    lateralOffset: -30,
    borderColor: COLORS.sightlineGreen,
  },
  coast: {
    text: '03 SELECTIVE COAST VIEW >>',
    fraction: 0.42,
    lateralOffset: 90,
    borderColor: COLORS.sightlineCoast,
  },
} as const satisfies Readonly<Record<SightlineSpec['theme'], {
  readonly text: string;
  readonly fraction: number;
  readonly lateralOffset: number;
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

function appendTerrainPolylineCorridor(
  positions: number[],
  points: readonly Vec2[],
  halfWidth: number,
  yOffset: number,
): void {
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    appendTerrainCorridor(positions, from, to, halfWidth, yOffset);
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
): Vec2 {
  const deltaX = toward.x - from.x;
  const deltaZ = toward.z - from.z;
  const length = Math.hypot(deltaX, deltaZ);
  if (length === 0) return { x: from.x, z: from.z };
  return {
    x: from.x + deltaX * fraction - (deltaZ / length) * lateralOffset,
    z: from.z + deltaZ * fraction + (deltaX / length) * lateralOffset,
  };
}

function publicAccessChain(endpoint: Vec2, road: RoadSpec): readonly [Vec2, Vec2, Vec2] {
  if (road.orientation === 'east-west') {
    const centerZ = (road.centerline.from.z + road.centerline.to.z) * 0.5;
    const side = endpoint.z >= centerZ ? 1 : -1;
    return [
      endpoint,
      { x: endpoint.x, z: centerZ + road.width * 0.5 * side },
      { x: endpoint.x, z: centerZ },
    ];
  }
  const centerX = (road.centerline.from.x + road.centerline.to.x) * 0.5;
  const side = endpoint.x >= centerX ? 1 : -1;
  return [
    endpoint,
    { x: centerX + road.width * 0.5 * side, z: endpoint.z },
    { x: centerX, z: endpoint.z },
  ];
}

function appendPublicAccessThreshold(
  positions: number[],
  roadEdge: Vec2,
  road: RoadSpec,
): void {
  if (road.orientation === 'east-west') {
    appendTerrainLine(
      positions,
      { x: roadEdge.x - PUBLIC_ACCESS_THRESHOLD_HALF_WIDTH, z: roadEdge.z },
      { x: roadEdge.x + PUBLIC_ACCESS_THRESHOLD_HALF_WIDTH, z: roadEdge.z },
      PUBLIC_ACCESS_LINE_OFFSET + 0.04,
    );
    return;
  }
  appendTerrainLine(
    positions,
    { x: roadEdge.x, z: roadEdge.z - PUBLIC_ACCESS_THRESHOLD_HALF_WIDTH },
    { x: roadEdge.x, z: roadEdge.z + PUBLIC_ACCESS_THRESHOLD_HALF_WIDTH },
    PUBLIC_ACCESS_LINE_OFFSET + 0.04,
  );
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

function createDebugLineMaterials(resources: ResourceRegistry, group: string): DebugLineMaterials {
  return {
    roadGrid: registerLineMaterial(resources, group, COLORS.roadGrid, FULL_GRID_OPACITY),
    worldBounds: registerLineMaterial(resources, group, COLORS.worldBounds, 0.78),
    navigableBounds: registerLineMaterial(resources, group, COLORS.navigableBounds, 0.72),
    parcels: registerLineMaterial(resources, group, COLORS.parcels),
    collisions: registerLineMaterial(resources, group, COLORS.collisions, 0.82),
    publicGreen: registerLineMaterial(resources, group, COLORS.publicGreen),
    publicAccess: registerLineMaterial(resources, group, COLORS.publicAccess),
    route: registerLineMaterial(resources, group, COLORS.route),
    coast: registerLineMaterial(resources, group, COLORS.coast, 0.9),
    marker: registerLineMaterial(resources, group, COLORS.marker, 0.8),
    activeMarker: registerLineMaterial(resources, group, COLORS.activeMarker, 0.9),
    sightlines: {
      uphill: registerLineMaterial(resources, group, COLORS.sightlineUphill),
      green: registerLineMaterial(resources, group, COLORS.sightlineGreen),
      coast: registerLineMaterial(resources, group, COLORS.sightlineCoast),
    },
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
  context.fillStyle = cssColor(COLORS.labelText);
  context.font = `800 ${spec.fontSize ?? 72}px "Arial Narrow", "Liberation Sans Narrow", "Aptos", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(
    spec.text,
    LABEL_CANVAS_WIDTH * 0.5,
    LABEL_CANVAS_HEIGHT * 0.52,
    LABEL_CANVAS_WIDTH - 58,
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

function roadLabelPosition(road: RoadSpec): Vec2 {
  const centerX = (road.centerline.from.x + road.centerline.to.x) * 0.5;
  const centerZ = (road.centerline.from.z + road.centerline.to.z) * 0.5;
  if (road.orientation === 'east-west') {
    const eastColumn = road.id === 'ningwuguan'
      || road.id === 'zhengyangguan'
      || road.id === 'juyongguan';
    return {
      x: eastColumn ? ROAD_LABEL_COLUMN_X : -ROAD_LABEL_COLUMN_X,
      z: centerZ + (road.id === 'shaoguan' ? ROAD_LABEL_TOP_ROW_OFFSET : 0),
    };
  }
  const northEndZ = Math.min(road.centerline.from.z, road.centerline.to.z);
  return {
    x: centerX,
    z: northEndZ + (road.id === 'hangu-pass'
      ? ROAD_LABEL_CENTER_STAGGER
      : ROAD_LABEL_OUTER_NORTH_OFFSET),
  };
}

function createRoadLabel(
  resources: ResourceRegistry,
  group: string,
  road: RoadSpec,
): Sprite {
  return createDebugLabel(resources, group, {
    name: `debug:road-label:${road.id}`,
    text: road.name.toUpperCase(),
    position: roadLabelPosition(road),
    altitude: ROAD_LABEL_ALTITUDE,
    screenWidth: ROAD_LABEL_SCREEN_WIDTH,
    screenHeight: ROAD_LABEL_SCREEN_HEIGHT,
    borderColor: COLORS.roadGrid,
    fontSize: 74,
  });
}

function createSightlineLabel(
  resources: ResourceRegistry,
  group: string,
  sightline: SightlineSpec,
): Sprite {
  const config = SIGHTLINE_LABEL_CONFIG[sightline.theme];
  return createDebugLabel(resources, group, {
    name: `debug:sightline-label:${sightline.id}`,
    text: config.text,
    position: segmentLabelPosition(
      sightline.from,
      sightline.toward,
      config.fraction,
      config.lateralOffset,
    ),
    altitude: STRUCTURE_LABEL_ALTITUDE,
    screenWidth: sightline.theme === 'coast'
      ? WIDE_LABEL_SCREEN_WIDTH
      : STRUCTURE_LABEL_SCREEN_WIDTH,
    screenHeight: sightline.theme === 'coast'
      ? WIDE_LABEL_SCREEN_HEIGHT
      : STRUCTURE_LABEL_SCREEN_HEIGHT,
    borderColor: config.borderColor,
    fontSize: sightline.theme === 'coast' ? 62 : 68,
  });
}

function appendSightlineArrow(
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
  const length = Math.hypot(
    sightline.toward.x - sightline.from.x,
    sightline.toward.z - sightline.from.z,
  );
  const fractions = length > 80
    ? LONG_SIGHTLINE_ARROW_FRACTIONS
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
  appendCross(positions, sightline.from, 1.3, SIGHTLINE_OFFSET + 0.04);
  appendCross(positions, sightline.toward, 1.6, SIGHTLINE_OFFSET + 0.04);
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
    const fullOverview = view === null || view === 'grid';
    this.layers.overview.visible = fullOverview;
    this.layers.publicGreen.visible = fullOverview || view === 'public-green';
    this.layers.publicGreenLabels.visible = view === null || view === 'public-green';
    this.layers.sightlines.visible = fullOverview || view === 'sightlines';
    this.roadGridMaterial.opacity = view === 'sightlines'
      ? SIGHTLINE_GRID_OPACITY
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
): WorldDebugController {
  const root = new Group();
  root.name = 'world-debug';
  root.visible = false;

  if (!import.meta.env.DEV) {
    return new WorldDebugControllerImplementation(root, false, null, 0, 0, false, null, null);
  }

  const materials = createDebugLineMaterials(resources, group);

  const roadGridPositions: number[] = [];
  for (const road of ROAD_SPECS) {
    appendTerrainLine(
      roadGridPositions,
      road.centerline.from,
      road.centerline.to,
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
  const gradeSamplePositions: number[] = [];
  const transverseRoads = ROAD_SPECS.filter(({ orientation }) => orientation === 'east-west');
  const northernTransverse = transverseRoads[0];
  const southernTransverse = transverseRoads[transverseRoads.length - 1];
  if (northernTransverse !== undefined && southernTransverse !== undefined) {
    const north = {
      x: GRADE_AXIS_X,
      z: (northernTransverse.centerline.from.z + northernTransverse.centerline.to.z) * 0.5,
    };
    const south = {
      x: GRADE_AXIS_X,
      z: (southernTransverse.centerline.from.z + southernTransverse.centerline.to.z) * 0.5,
    };
    appendTerrainLine(gradeSamplePositions, south, north, DEBUG_SURFACE_OFFSET + 0.04);
    appendTerrainArrowhead(
      gradeSamplePositions,
      south,
      north,
      0.94,
      DEBUG_SURFACE_OFFSET + 0.04,
      SIGHTLINE_ARROW_LENGTH,
      SIGHTLINE_ARROW_WIDTH,
    );
    for (const road of transverseRoads) {
      const z = (road.centerline.from.z + road.centerline.to.z) * 0.5;
      appendTerrainLine(
        gradeSamplePositions,
        { x: GRADE_AXIS_X - GRADE_TICK_HALF_WIDTH, z },
        { x: GRADE_AXIS_X + GRADE_TICK_HALF_WIDTH, z },
        DEBUG_SURFACE_OFFSET + 0.06,
      );
    }
    const gradeRise = sampleGroundHeight(north.x, north.z) - sampleGroundHeight(south.x, south.z);
    const gradeSign = gradeRise >= 0 ? '+' : '';
    root.add(createDebugLabel(resources, group, {
      name: 'debug:grade-label',
      text: `GRADE ${gradeSign}${gradeRise.toFixed(1)} m / NORTH UPHILL`,
      position: { x: -220, z: -215 },
      altitude: STRUCTURE_LABEL_ALTITUDE,
      screenWidth: WIDE_LABEL_SCREEN_WIDTH,
      screenHeight: WIDE_LABEL_SCREEN_HEIGHT,
      borderColor: COLORS.navigableBounds,
      fontSize: 62,
    }));
  }
  root.add(createLineObject(
    resources,
    group,
    'debug:ground-grade-samples',
    gradeSamplePositions,
    materials.navigableBounds,
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

  const collisionPositions: number[] = [];
  for (const footprint of DISTRICT_DATA.collisionFootprints) {
    appendBounds(collisionPositions, footprint.bounds, DEBUG_SURFACE_OFFSET + 0.12);
  }
  root.add(createLineObject(
    resources,
    group,
    'debug:future-building-collisions',
    collisionPositions,
    materials.collisions,
  ));

  const publicGreenPositions: number[] = [];
  appendBounds(publicGreenPositions, DISTRICT_DATA.publicGreen.bounds, DEBUG_SURFACE_OFFSET + 0.16);
  for (const path of DISTRICT_DATA.publicGreen.paths) {
    appendTerrainPolylineCorridor(
      publicGreenPositions,
      path.centerline,
      path.width * 0.5,
      DEBUG_SURFACE_OFFSET + 0.16,
    );
    const first = path.centerline[0];
    const last = path.centerline[path.centerline.length - 1];
    if (first !== undefined) appendCross(publicGreenPositions, first, 1.15, DEBUG_SURFACE_OFFSET + 0.2);
    if (last !== undefined) appendCross(publicGreenPositions, last, 1.15, DEBUG_SURFACE_OFFSET + 0.2);
  }
  root.add(createLineObject(
    resources,
    group,
    'debug:public-green',
    publicGreenPositions,
    materials.publicGreen,
  ));
  const publicAccessPositions: number[] = [];
  const publicAccessLabelGroup = new Group();
  publicAccessLabelGroup.name = 'debug:public-green-access-labels';
  const publicAccessSpecs = [
    {
      id: 'hangu',
      text: 'PUBLIC ACCESS 01',
      pathId: 'green-route-path',
      endpoint: 'first',
      roadId: 'hangu-pass',
      labelPosition: { x: -28, z: -5 },
    },
    {
      id: 'juyong',
      text: 'PUBLIC ACCESS 02',
      pathId: 'green-cross-path',
      endpoint: 'last',
      roadId: 'juyongguan',
      labelPosition: { x: 112, z: -35 },
    },
  ] as const;
  for (const access of publicAccessSpecs) {
    const path = DISTRICT_DATA.publicGreen.paths.find(({ id }) => id === access.pathId);
    const road = ROAD_SPECS.find(({ id }) => id === access.roadId);
    if (path === undefined || road === undefined) continue;
    const endpoint = access.endpoint === 'first'
      ? path.centerline[0]
      : path.centerline[path.centerline.length - 1];
    if (endpoint === undefined) continue;
    const chain = publicAccessChain(endpoint, road);
    appendTerrainPolylineCorridor(
      publicAccessPositions,
      chain,
      PUBLIC_ACCESS_CORRIDOR_HALF_WIDTH,
      PUBLIC_ACCESS_LINE_OFFSET,
    );
    appendTerrainArrowhead(
      publicAccessPositions,
      chain[0],
      chain[2],
      0.92,
      PUBLIC_ACCESS_LINE_OFFSET,
      PUBLIC_ACCESS_ARROW_LENGTH,
      PUBLIC_ACCESS_ARROW_WIDTH,
    );
    appendPublicAccessThreshold(publicAccessPositions, chain[1], road);
    publicAccessLabelGroup.add(createDebugLabel(resources, group, {
      name: `debug:public-access-label:${access.id}`,
      text: access.text,
      position: access.labelPosition,
      altitude: PUBLIC_ACCESS_LABEL_ALTITUDE,
      screenWidth: PUBLIC_ACCESS_LABEL_SCREEN_WIDTH,
      screenHeight: PUBLIC_ACCESS_LABEL_SCREEN_HEIGHT,
      borderColor: COLORS.publicAccess,
      fontSize: 58,
    }));
  }
  root.add(createLineObject(
    resources,
    group,
    'debug:public-green-access-chains',
    publicAccessPositions,
    materials.publicAccess,
  ));
  root.add(publicAccessLabelGroup);
  root.add(createDebugLabel(resources, group, {
    name: 'debug:public-green-label',
    text: 'PUBLIC GREEN / OPEN SPACE',
    position: {
      x: DISTRICT_DATA.publicGreen.bounds.maxX + 42,
      z: DISTRICT_DATA.publicGreen.bounds.maxZ + 3,
    },
    altitude: STRUCTURE_LABEL_ALTITUDE + 1.5,
    screenWidth: WIDE_LABEL_SCREEN_WIDTH,
    screenHeight: WIDE_LABEL_SCREEN_HEIGHT,
    borderColor: COLORS.publicGreen,
    fontSize: 64,
  }));

  const coastPositions: number[] = [];
  const coastSightline = DISTRICT_DATA.sightlines.find(({ theme }) => theme === 'coast');
  const selectiveCoastCenterX = coastSightline?.toward.x ?? 0;
  const selectiveCoastMinX = Math.max(
    DISTRICT_DATA.worldBounds.minX,
    selectiveCoastCenterX - COAST_DEBUG_HALF_SPAN,
  );
  const selectiveCoastMaxX = Math.min(
    DISTRICT_DATA.worldBounds.maxX,
    selectiveCoastCenterX + COAST_DEBUG_HALF_SPAN,
  );
  appendTerrainLine(
    coastPositions,
    { x: selectiveCoastMinX, z: DISTRICT_DATA.coast.edgeZ },
    { x: selectiveCoastMaxX, z: DISTRICT_DATA.coast.edgeZ },
    DEBUG_SURFACE_OFFSET + 0.2,
  );
  const promenadeZ = DISTRICT_DATA.coast.promenade.centerline[0]?.z
    ?? DISTRICT_DATA.coast.edgeZ - 4;
  appendTerrainLine(
    coastPositions,
    { x: selectiveCoastMinX, z: promenadeZ },
    { x: selectiveCoastMaxX, z: promenadeZ },
    DEBUG_SURFACE_OFFSET + 0.2,
  );
  appendCross(
    coastPositions,
    { x: selectiveCoastMinX, z: DISTRICT_DATA.coast.edgeZ },
    1.3,
    DEBUG_SURFACE_OFFSET + 0.24,
  );
  appendCross(
    coastPositions,
    { x: selectiveCoastMaxX, z: DISTRICT_DATA.coast.edgeZ },
    1.3,
    DEBUG_SURFACE_OFFSET + 0.24,
  );
  root.add(createLineObject(
    resources,
    group,
    'debug:coastal-edge-and-promenade',
    coastPositions,
    materials.coast,
  ));

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
    const positions: number[] = [];
    appendSightlineArrow(positions, sightline);
    root.add(createLineObject(
      resources,
      group,
      `debug:sightline:${sightline.id}`,
      positions,
      materials.sightlines[sightline.theme],
    ));
    sightlineLabelGroup.add(createSightlineLabel(resources, group, sightline));
  }
  root.add(sightlineLabelGroup);

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

  const labelGroup = new Group();
  labelGroup.name = 'debug:road-labels';
  for (const road of ROAD_SPECS) labelGroup.add(createRoadLabel(resources, group, road));
  root.add(labelGroup);

  const activeMarker = createActiveAnchorMarker(resources, group, materials);
  root.add(activeMarker);

  const viewLayers: DebugViewLayers = {
    overview: createDebugViewLayer(root, 'debug:view-layer:overview', [
      'debug:world-bounds',
      'debug:navigable-bounds',
      'debug:parcels-and-setbacks',
      'debug:future-building-collisions',
      'debug:ordered-route',
      'debug:route-anchors',
      'debug:route-labels',
      'debug:spawn-marker',
      'debug:reset-marker',
      'debug:camera-height-marker',
      'debug:road-labels',
      'debug:active-anchor',
    ]),
    publicGreen: createDebugViewLayer(root, 'debug:view-layer:public-green', [
      'debug:public-green-access-chains',
      'debug:public-green-label',
    ]),
    publicGreenLabels: createDebugViewLayer(root, 'debug:view-layer:public-green-labels', [
      'debug:public-green-access-labels',
    ]),
    sightlines: createDebugViewLayer(root, 'debug:view-layer:sightlines', [
      'debug:ground-grade-samples',
      'debug:grade-label',
      'debug:coastal-edge-and-promenade',
      ...DISTRICT_DATA.sightlines.map(({ id }) => `debug:sightline:${id}`),
      'debug:sightline-labels',
    ]),
  };

  return new WorldDebugControllerImplementation(
    root,
    true,
    activeMarker,
    labelGroup.children.length,
    DISTRICT_DATA.sightlines.length,
    true,
    viewLayers,
    materials.roadGrid,
  );
}
