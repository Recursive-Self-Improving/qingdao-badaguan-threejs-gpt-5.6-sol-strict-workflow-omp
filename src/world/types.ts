import type { Object3D, Texture } from 'three';

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface Bounds2 {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export type RoadOrientation = 'east-west' | 'north-south';

export interface LineSegment {
  readonly from: Vec2;
  readonly to: Vec2;
}

export interface RoadCenterline extends LineSegment {
  readonly via: readonly Vec2[];
}

export interface AuthoredInference {
  readonly status: 'authored-inference';
  readonly basis: string;
}

export interface CoastOpeningSector {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly alignedRoadId: string;
}

export interface CoastScreenSpec {
  readonly z: number;
  readonly height: number;
  readonly openings: readonly CoastOpeningSector[];
  readonly inference: AuthoredInference;
}

export interface RoadSpec {
  readonly id: string;
  readonly name: string;
  readonly orientation: RoadOrientation;
  readonly centerline: RoadCenterline;
  readonly width: number;
  readonly sidewalkWidth: number;
  readonly inference: AuthoredInference;
}

export interface GateSpec {
  readonly id: string;
  readonly position: Vec2;
  readonly width: number;
  readonly facesRoadId: string;
}

export interface ParcelSpec {
  readonly id: string;
  readonly bounds: Bounds2;
  readonly setback: number;
  readonly wallSegments: readonly LineSegment[];
  readonly gates: readonly GateSpec[];
}

export interface PathSpec {
  readonly id: string;
  readonly centerline: readonly Vec2[];
  readonly width: number;
}

export interface PublicGreenSpec {
  readonly id: string;
  readonly name: string;
  readonly bounds: Bounds2;
  readonly paths: readonly PathSpec[];
  readonly inference: AuthoredInference;
}

export interface CoastSpec {
  readonly edgeZ: number;
  readonly promenade: PathSpec;
  readonly seaBounds: Bounds2;
  readonly screen: CoastScreenSpec;
  readonly collidable: false;
}

export interface CollisionFootprint {
  readonly id: string;
  readonly bounds: Bounds2;
  readonly purpose: 'architecture';
  readonly subjectId: ArchitectureSubjectId;
}

export type StandardRouteAnchorKind = 'spawn' | 'road' | 'public-green' | 'uphill' | 'coast' | 'reset';

interface RouteAnchorBase {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly position: Vec2;
  readonly inference: AuthoredInference;
}

export interface StandardRouteAnchor extends RouteAnchorBase {
  readonly kind: StandardRouteAnchorKind;
}

export type LandmarkInspiration =
  | 'mixed-villa-intersection'
  | 'ginkgo-maple-corridor'
  | 'princess-inspired'
  | 'butterfly-inspired'
  | 'huashi-inspired';

export interface LandmarkAnchor extends RouteAnchorBase {
  readonly kind: 'landmark';
  readonly inspiration: LandmarkInspiration;
}

export type RouteAnchor = StandardRouteAnchor | LandmarkAnchor;

export type RoadId =
  | 'shaoguan'
  | 'ningwuguan'
  | 'zijingguan'
  | 'zhengyangguan'
  | 'jiayuguan'
  | 'juyongguan'
  | 'linhuaiguan'
  | 'wushengguan'
  | 'hangu-pass'
  | 'shanhaiguan';

export type VegetationSpecies =
  | 'peach'
  | 'crabapple'
  | 'cedar'
  | 'crape-myrtle'
  | 'maple'
  | 'ginkgo'
  | 'chinese-juniper'
  | 'plane-tree';

export type VegetationCategory =
  | 'flowering-deciduous'
  | 'autumn-deciduous'
  | 'evergreen-conifer'
  | 'deciduous-canopy';

export interface VegetationPalette {
  readonly foliage: readonly [string, ...string[]];
  readonly trunk: string;
  readonly litter: string | null;
}

export interface RoadPlantingCue {
  readonly roadId: RoadId;
  readonly species: VegetationSpecies;
  readonly category: VegetationCategory;
  readonly palette: VegetationPalette;
  readonly identityPriority: 0;
  readonly provenance: AuthoredInference;
}

export interface RoadPlantingIdentity {
  readonly roadId: RoadId;
  readonly speciesId: VegetationSpecies;
}

export interface PlantingZone {
  readonly id: string;
  readonly roadId: RoadId;
  readonly bounds: Bounds2;
  readonly side: 'north' | 'south' | 'east' | 'west';
  readonly minimumRoadClearance: 12;
  readonly identity: true;
  readonly inference: AuthoredInference;
}

export type LandscapeDensity = 'high' | 'medium' | 'low';
export type LandscapeMotion = 'standard' | 'reduced';

export interface LandscapeSettings {
  readonly density: LandscapeDensity;
  readonly motion: LandscapeMotion;
}

export interface VegetationLodBand {
  readonly id: 'near' | 'mid' | 'far';
  readonly maximumDistance: number;
  readonly canopySegments: number;
}

export interface VegetationLodPolicy {
  readonly density: LandscapeDensity;
  readonly identityInstancesPerRoad: number;
  readonly infillFraction: number;
  readonly accentFraction: number;
  readonly bands: readonly VegetationLodBand[];
}

export interface LandscapeCameraView {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly roadIds: readonly RoadId[];
  readonly clearanceBounds: Bounds2;
  readonly clearanceIntersections: number;
  readonly ySemantics: 'world';
}

export interface LandscapeClearanceBound {
  readonly id: string;
  readonly roadId: RoadId | null;
  readonly kind: 'vegetation' | 'detail' | 'camera';
  readonly bounds: Bounds2;
}

export interface LandscapeReuseMetrics {
  readonly sharedGeometryCount: number;
  readonly sharedMaterialCount: number;
  readonly instanceBatchCount: number;
  readonly instanceCount: number;
  readonly estimatedInstancedDrawCalls: number;
  readonly naiveRepeatedDrawCalls: number;
}

export interface LandscapeMotionMetrics {
  readonly time: number;
  readonly amplitude: number;
  readonly transformChecksum: number;
}

export interface LandscapeDensityMetrics {
  readonly vegetationInstances: number;
  readonly identityInstances: number;
  readonly detailInstances: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

export interface LandscapeBuildMetrics {
  readonly settings: LandscapeSettings;
  readonly densityCounts: Readonly<Record<LandscapeDensity, LandscapeDensityMetrics>>;
  readonly active: LandscapeDensityMetrics;
  readonly identities: readonly RoadPlantingIdentity[];
  readonly lodBands: readonly VegetationLodBand[];
  readonly reuse: LandscapeReuseMetrics;
  readonly motion: LandscapeMotionMetrics;
  readonly clearanceIntersections: number;
  readonly transparentObjects: number;
  readonly depthWriteDisabled: number;
}

export interface LandscapeUpdateFrame {
  readonly elapsedSeconds: number;
  readonly deltaSeconds: number;
}

export interface LandscapeDebugMarker {
  readonly roadId: RoadId;
  readonly speciesId: VegetationSpecies;
  readonly position: Vec2;
}

export interface LandscapeDebugLayout {
  readonly markers: readonly LandscapeDebugMarker[];
  readonly zones: readonly PlantingZone[];
}

export interface LandscapeController {
  readonly root: Object3D;
  readonly settings: LandscapeSettings;
  readonly metrics: LandscapeBuildMetrics;
  readonly cameraViews: readonly LandscapeCameraView[];
  readonly clearanceBounds: readonly LandscapeClearanceBound[];
  readonly debugLayout: LandscapeDebugLayout;
  update(frame: LandscapeUpdateFrame): void;
  reset(): void;
  setCaptureTime(time: number | null): void;
}

export type LandscapeBuildResult = LandscapeController;

export interface RouteSpec {
  readonly id: string;
  readonly anchorIds: readonly string[];
  readonly inference: AuthoredInference;
}

export interface SightlineSpec {
  readonly id: string;
  readonly theme: 'uphill' | 'green' | 'coast';
  readonly from: Vec2;
  readonly toward: Vec2;
}

export type ArchitectureSubjectId =
  | 'villa-west-neoclassical'
  | 'villa-central-spanish'
  | 'villa-central-gothic'
  | 'villa-east-neoclassical'
  | 'princess-inspired-landmark'
  | 'butterfly-inspired-landmark'
  | 'huashi-inspired-landmark';

export type ArchitectureStyle =
  | 'german-neoclassical'
  | 'spanish'
  | 'gothic-castle'
  | 'princess-nordic'
  | 'butterfly-mansard'
  | 'huashi-castle';

export type ArchitectureKind = 'ordinary' | 'landmark';
export type ArchitectureFrameView = 'front' | 'three-quarter' | 'route' | 'low';
export type ArchitectureCameraView = {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly ySemantics: 'site-ground-relative';
};

export interface ArchitectureMotif {
  readonly id: string;
  readonly ownership: 'style-family' | 'landmark-specific';
  readonly sourceBound: boolean;
}

export interface ArchitectureProvenance {
  readonly sourcedContext: string;
  readonly artisticInterpretation: string;
  readonly exactFacade: 'authored-inference';
  readonly replica: false;
}

export interface ArchitectureSite {
  readonly id: ArchitectureSubjectId;
  readonly kind: ArchitectureKind;
  readonly style: ArchitectureStyle;
  readonly stories: 2 | 3;
  readonly siteBounds: Bounds2;
  readonly visibleBounds: Bounds2;
  readonly collisionBounds: Bounds2;
  readonly viewpointId: string;
  readonly inspiration: 'princess' | 'butterfly' | 'huashi' | null;
  readonly materials: readonly string[];
  readonly motifs: readonly ArchitectureMotif[];
  readonly signage: 'none' | 'small-gate-plaque';
  readonly provenance: ArchitectureProvenance;
  readonly cameraViews: Readonly<Record<ArchitectureFrameView, ArchitectureCameraView>>;
}

export interface ArchitectureSubjectMetrics {
  readonly subjectId: ArchitectureSubjectId;
  readonly style: ArchitectureStyle;
  readonly stories: 2 | 3;
  readonly motifIds: readonly string[];
  readonly siteBounds: Bounds2;
  readonly visibleBounds: Bounds2;
  readonly collisionBounds: Bounds2;
  readonly componentCount: number;
  readonly instanceCount: number;
}

export interface ArchitectureReuseMetrics {
  readonly sharedGeometryCount: number;
  readonly sharedMaterialCount: number;
  readonly instanceBatchCount: number;
  readonly instanceCount: number;
  readonly estimatedInstancedDrawCalls: number;
  readonly naiveRepeatedDrawCalls: number;
}

export interface ArchitectureBuildPart {
  readonly root: Object3D;
  readonly subjects: readonly ArchitectureSubjectMetrics[];
  readonly cameraViews: Readonly<Partial<Record<ArchitectureSubjectId, Readonly<Record<ArchitectureFrameView, ArchitectureCameraView>>>>>;
}

export interface ArchitectureBuildResult {
  readonly root: Object3D;
  readonly subjects: readonly ArchitectureSubjectMetrics[];
  readonly cameraViews: Readonly<Record<ArchitectureSubjectId, Readonly<Record<ArchitectureFrameView, ArchitectureCameraView>>>>;
  readonly reuse: ArchitectureReuseMetrics;
  readonly labelsVisible: false;
}

export interface DistrictProvenance {
  readonly coordinateSystem: string;
  readonly roadLayout: AuthoredInference;
  readonly publicGreen: AuthoredInference;
  readonly routeGeometry: AuthoredInference;
  readonly buildingFootprints: AuthoredInference;
}

export interface DistrictData {
  readonly worldBounds: Bounds2;
  readonly navigableBounds: Bounds2;
  readonly roads: readonly RoadSpec[];
  readonly parcels: readonly ParcelSpec[];
  readonly publicGreen: PublicGreenSpec;
  readonly coast: CoastSpec;
  readonly collisionFootprints: readonly CollisionFootprint[];
  readonly architectureSites: readonly ArchitectureSite[];
  readonly spawn: Vec2;
  readonly reset: Vec2;
  readonly routeAnchors: readonly RouteAnchor[];
  readonly route: RouteSpec;
  readonly sightlines: readonly SightlineSpec[];
  readonly landmarkAnchors: readonly LandmarkAnchor[];
  readonly spawnYaw: number;
  readonly resetYaw: number;
  readonly roadPlantingCues: readonly RoadPlantingCue[];
  readonly plantingZones: readonly PlantingZone[];
  readonly landscapeCameraViews: readonly LandscapeCameraView[];
  readonly provenance: DistrictProvenance;
}

export interface NavigationOptions {
  readonly radius?: number;
}

export interface NavigationResult {
  readonly position: Vec2;
  readonly groundHeight: number;
  readonly collided: boolean;
  readonly clamped: boolean;
  readonly reset: boolean;
}

export type NavigationResolver = (
  previous: Vec2,
  requested: Vec2,
  options?: NavigationOptions,
) => NavigationResult;

export type GroundHeightSampler = (x: number, z: number) => number;
export type WorldDebugViewName = 'grid' | 'public-green' | 'sightlines' | 'planting';

export interface WorldDebugController {
  readonly root: Object3D;
  readonly visible: boolean;
  readonly currentAnchorId: string | null;
  readonly currentView: WorldDebugViewName | null;
  readonly roadLabelCount: number;
  readonly plantingLabelCount: number;
  readonly sightlineCount: number;
  readonly publicGreenVisible: boolean;
  setVisible(visible: boolean): void;
  setView(view: WorldDebugViewName | null): void;
  visitAnchor(anchorId: string): RouteAnchor | null;
}

export type EnvironmentViewId = 'spawn' | 'deep-shade' | 'uphill-vista' | 'landmark' | 'shore';

export interface EnvironmentCameraView {
  readonly id: EnvironmentViewId;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}


export interface CoastConfig {
  readonly waterColor: number;
  readonly shallowWaterColor: number;
  readonly midWaterColor: number;
  readonly beachColor: number;
  readonly wetSandColor: number;
  readonly foamColor: number;
  readonly shoreBlendDistance: number;
  readonly shoreFoamStart: number;
  readonly shoreFoamEnd: number;
  /** Matches the sky horizon at full fade so the water converges without a hard seam. */
  readonly horizonColor: number;
  readonly horizonFadeStart: number;
  readonly horizonFadeEnd: number;
  /** Deterministic world-space depth retention and tonal ripple, independent of motion/time. */
  readonly staticDetailStrength: number;
  readonly standardMotionAmplitude: number;
  readonly reducedMotionAmplitude: number;
}

export interface AtmosphereConfig {
  readonly sky: { readonly zenith: number; readonly horizon: number; readonly ground: number };
  readonly fog: { readonly color: number; readonly near: number; readonly far: number };
  readonly hemisphere: { readonly skyColor: number; readonly groundColor: number; readonly intensity: number };
  readonly sun: {
    readonly color: number;
    readonly intensity: number;
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
  };
  readonly cameraViews: readonly EnvironmentCameraView[];
  readonly coast: CoastConfig;
}

export interface EnvironmentMetrics {
  readonly quality: LandscapeDensity;
  readonly motion: LandscapeMotion;
  readonly sunDirection: readonly [number, number, number];
  readonly fogNear: number;
  readonly fogFar: number;
  readonly exposure: number;
  readonly ambientIntensity: number;
  readonly skyGradientRows: number;
  readonly shadowMapSize: number;
  readonly shadowBias: number;
  readonly shadowNormalBias: number;
  readonly contactGrounding: true;
}

export interface EnvironmentController {
  readonly root: Object3D;
  readonly config: AtmosphereConfig;
  readonly metrics: EnvironmentMetrics;
  readonly cameraViews: readonly EnvironmentCameraView[];
  readonly backgroundColor: number;
  readonly backgroundTexture: Texture;
  readonly fogColor: number;
  readonly fogNear: number;
  readonly fogFar: number;
  update(frame: LandscapeUpdateFrame): void;
  reset(): void;
  setCaptureTime(time: number | null): void;
}


export interface CoastMetrics {
  readonly quality: LandscapeDensity;
  readonly motion: LandscapeMotion;
  readonly waterMotionAmplitude: number;
  readonly waterTransformChecksum: number;
  readonly waterStaticDetailStrength: number;
  readonly waterSegments: number;
  readonly horizonFadeStart: number;
  readonly horizonFadeEnd: number;
  readonly shoreBlendDistance: number;
  readonly shoreFoamStart: number;
  readonly shoreFoamEnd: number;
  readonly beachLayers: number;
  readonly horizonLayers: number;
  readonly openingCount: number;
  readonly clearanceIntersections: 0;
  readonly collidable: false;
}

export interface CoastController {
  readonly root: Object3D;
  readonly config: AtmosphereConfig;
  readonly metrics: CoastMetrics;
  update(frame: LandscapeUpdateFrame): void;
  reset(): void;
  setCaptureTime(time: number | null): void;
}

export interface WorldBuildResult {
  readonly root: Object3D;
  readonly data: DistrictData;
  readonly debug: WorldDebugController;
  readonly architecture: ArchitectureBuildResult;
  readonly landscape: LandscapeBuildResult;
  readonly environment: EnvironmentController;
  readonly coast: CoastController;
  readonly navigation: {
    readonly resolve: NavigationResolver;
    readonly sampleGroundHeight: GroundHeightSampler;
    readonly bounds: Bounds2;
    readonly spawn: Vec2;
    readonly reset: Vec2;
  };
  readonly recipe: {
    readonly id: 'badaguan-district-procedural';
    readonly version: 1;
  };
  readonly degradationNotices: readonly string[];
}
