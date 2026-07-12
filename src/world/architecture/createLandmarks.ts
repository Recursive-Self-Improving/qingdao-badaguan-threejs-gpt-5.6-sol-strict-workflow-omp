import type {
  ArchitectureBuildPart,
  ArchitectureCameraView,
  ArchitectureSite,
  Bounds2,
} from '../types';
import { createVilla, type VillaKit } from './villaKit';

const EXPECTED_LANDMARK_COUNT = 3;

type LandmarkInspiration = NonNullable<ArchitectureSite['inspiration']>;

interface LandmarkExpectation {
  readonly id: ArchitectureSite['id'];
  readonly inspiration: LandmarkInspiration;
  readonly style: ArchitectureSite['style'];
  readonly stories: ArchitectureSite['stories'];
  readonly viewpointId: string;
  readonly siteBounds: Bounds2;
  readonly materials: readonly string[];
  readonly motifs: readonly {
    readonly id: string;
    readonly sourceBound: boolean;
  }[];
}

const LANDMARK_EXPECTATIONS = Object.freeze([
  Object.freeze({
    id: 'princess-inspired-landmark',
    inspiration: 'princess',
    style: 'princess-nordic',
    stories: 2,
    viewpointId: 'princess-inspired-anchor',
    siteBounds: Object.freeze({ minX: 20, maxX: 42, minZ: -158, maxZ: -140 }),
    materials: Object.freeze([
      'pine-green-stucco',
      'dark-nordic-roof',
      'crafted-wood-window',
    ]),
    motifs: Object.freeze([
      Object.freeze({ id: 'nordic-danish-pine-green', sourceBound: true }),
      Object.freeze({ id: 'crafted-wood-window-cue', sourceBound: true }),
    ]),
  }),
  Object.freeze({
    id: 'butterfly-inspired-landmark',
    inspiration: 'butterfly',
    style: 'butterfly-mansard',
    stories: 3,
    viewpointId: 'butterfly-inspired-anchor',
    siteBounds: Object.freeze({ minX: -48, maxX: -22, minZ: -202, maxZ: -182 }),
    materials: Object.freeze([
      'warm-brick',
      'dark-timber',
      'charcoal-mansard-roof',
    ]),
    motifs: Object.freeze([
      Object.freeze({ id: 'mansard-roof', sourceBound: true }),
      Object.freeze({ id: 'brick-timber-expression', sourceBound: true }),
    ]),
  }),
  Object.freeze({
    id: 'huashi-inspired-landmark',
    inspiration: 'huashi',
    style: 'huashi-castle',
    stories: 3,
    viewpointId: 'shore-huashi-vista',
    siteBounds: Object.freeze({ minX: 22, maxX: 50, minZ: 20, maxZ: 31 }),
    materials: Object.freeze([
      'warm-gray-stone',
      'charcoal-roof',
      'restrained-castle-trim',
    ]),
    motifs: Object.freeze([
      Object.freeze({ id: 'compact-sculptural-shore-massing', sourceBound: true }),
      Object.freeze({ id: 'compact-tower-cue', sourceBound: false }),
    ]),
  }),
] as const satisfies readonly LandmarkExpectation[]);

function equalBounds(first: Bounds2, second: Bounds2): boolean {
  return first.minX === second.minX
    && first.maxX === second.maxX
    && first.minZ === second.minZ
    && first.maxZ === second.maxZ;
}

function containsBounds(container: Bounds2, candidate: Bounds2): boolean {
  return candidate.minX >= container.minX
    && candidate.maxX <= container.maxX
    && candidate.minZ >= container.minZ
    && candidate.maxZ <= container.maxZ;
}

function copyVector(
  vector: readonly [number, number, number],
): readonly [number, number, number] {
  const copy: [number, number, number] = [vector[0], vector[1], vector[2]];
  return Object.freeze(copy);
}

function copyCameraView(view: ArchitectureCameraView): ArchitectureCameraView {
  return Object.freeze({
    position: copyVector(view.position),
    target: copyVector(view.target),
    ySemantics: view.ySemantics,
  });
}

function copyCameraViews(views: ArchitectureSite['cameraViews']): ArchitectureSite['cameraViews'] {
  return Object.freeze({
    front: copyCameraView(views.front),
    'three-quarter': copyCameraView(views['three-quarter']),
    route: copyCameraView(views.route),
    low: copyCameraView(views.low),
  });
}

function selectLandmarkSite(
  sites: readonly ArchitectureSite[],
  expected: LandmarkExpectation,
): ArchitectureSite {
  const matches = sites.filter((site) => site.id === expected.id);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one architecture site for "${expected.id}".`);
  }

  const site = matches[0];
  if (site === undefined) {
    throw new Error(`Architecture site "${expected.id}" is unavailable.`);
  }
  if (
    site.kind !== 'landmark'
    || site.inspiration !== expected.inspiration
    || site.style !== expected.style
    || site.stories !== expected.stories
    || site.viewpointId !== expected.viewpointId
    || site.signage !== 'none'
  ) {
    throw new Error(`Architecture site "${expected.id}" does not match its landmark contract.`);
  }
  if (!equalBounds(site.siteBounds, expected.siteBounds)) {
    throw new Error(`Architecture site "${expected.id}" has unexpected site bounds.`);
  }
  if (!equalBounds(site.collisionBounds, site.siteBounds)) {
    throw new Error(`Architecture site "${expected.id}" must use its site bounds as its collision AABB.`);
  }
  if (!containsBounds(site.siteBounds, site.visibleBounds)) {
    throw new Error(`Architecture site "${expected.id}" has visible bounds outside its site.`);
  }

  if (site.materials.length !== expected.materials.length) {
    throw new Error(`Architecture site "${expected.id}" has unexpected landmark materials.`);
  }
  for (const material of expected.materials) {
    if (!site.materials.includes(material)) {
      throw new Error(`Architecture site "${expected.id}" is missing material "${material}".`);
    }
  }
  if (site.motifs.length !== expected.motifs.length) {
    throw new Error(`Architecture site "${expected.id}" has unexpected landmark motifs.`);
  }
  for (const expectedMotif of expected.motifs) {
    const motif = site.motifs.find((candidate) => candidate.id === expectedMotif.id);
    if (
      motif === undefined
      || motif.ownership !== 'landmark-specific'
      || motif.sourceBound !== expectedMotif.sourceBound
    ) {
      throw new Error(`Architecture site "${expected.id}" has invalid landmark motif "${expectedMotif.id}".`);
    }
  }

  return site;
}

/** Queues exactly the three source-bounded landmark compositions on the shared villa kit. */
export function createLandmarks(
  kit: VillaKit,
  sites: readonly ArchitectureSite[],
): ArchitectureBuildPart {
  const landmarkSites = sites.filter(({ kind }) => kind === 'landmark');
  if (landmarkSites.length !== EXPECTED_LANDMARK_COUNT) {
    throw new Error(
      `Landmark builder requires exactly ${EXPECTED_LANDMARK_COUNT} landmark sites; received ${landmarkSites.length}.`,
    );
  }

  const princess = selectLandmarkSite(landmarkSites, LANDMARK_EXPECTATIONS[0]);
  const butterfly = selectLandmarkSite(landmarkSites, LANDMARK_EXPECTATIONS[1]);
  const huashi = selectLandmarkSite(landmarkSites, LANDMARK_EXPECTATIONS[2]);

  const princessBuild = createVilla(kit, princess);
  const butterflyBuild = createVilla(kit, butterfly);
  const huashiBuild = createVilla(kit, huashi);

  return Object.freeze({
    root: kit.root,
    subjects: Object.freeze([
      princessBuild.metrics,
      butterflyBuild.metrics,
      huashiBuild.metrics,
    ]),
    cameraViews: Object.freeze({
      'princess-inspired-landmark': copyCameraViews(princess.cameraViews),
      'butterfly-inspired-landmark': copyCameraViews(butterfly.cameraViews),
      'huashi-inspired-landmark': copyCameraViews(huashi.cameraViews),
    }),
  });
}
