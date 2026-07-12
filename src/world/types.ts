import type { Object3D } from 'three';

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

export interface PlantingZone {
  readonly id: string;
  readonly bounds: Bounds2;
  readonly futureTheme: 'ginkgo' | 'maple' | 'mixed';
  readonly inference: AuthoredInference;
}

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

export type WorldDebugViewName = 'grid' | 'public-green' | 'sightlines';

export interface WorldDebugController {
  readonly root: Object3D;
  readonly visible: boolean;
  readonly currentAnchorId: string | null;
  readonly currentView: WorldDebugViewName | null;
  readonly roadLabelCount: number;
  readonly sightlineCount: number;
  readonly publicGreenVisible: boolean;
  setVisible(visible: boolean): void;
  setView(view: WorldDebugViewName | null): void;
  visitAnchor(anchorId: string): RouteAnchor | null;
}

export interface WorldBuildResult {
  readonly root: Object3D;
  readonly data: DistrictData;
  readonly debug: WorldDebugController;
  readonly architecture: ArchitectureBuildResult;
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
