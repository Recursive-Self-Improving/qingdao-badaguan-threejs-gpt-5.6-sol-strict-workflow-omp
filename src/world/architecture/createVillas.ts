import type {
  ArchitectureBuildPart,
  ArchitectureCameraView,
  ArchitectureFrameView,
  ArchitectureSite,
  ArchitectureSubjectId,
  ArchitectureSubjectMetrics,
} from '../types';
import { createVilla, type VillaKit } from './villaKit';

const EXPECTED_ORDINARY_VILLA_COUNT = 4;

type OrdinaryVillaStyle = 'german-neoclassical' | 'spanish' | 'gothic-castle';

function assertOrdinarySite(site: ArchitectureSite): asserts site is ArchitectureSite & {
  readonly kind: 'ordinary';
  readonly inspiration: null;
  readonly style: OrdinaryVillaStyle;
} {
  if (site.kind !== 'ordinary' || site.inspiration !== null) {
    throw new Error(`Architecture site "${site.id}" is not an ordinary villa site.`);
  }
  if (site.style !== 'german-neoclassical' && site.style !== 'spanish' && site.style !== 'gothic-castle') {
    throw new Error(`Ordinary villa site "${site.id}" uses landmark-only style "${site.style}".`);
  }
  if (site.signage !== 'small-gate-plaque') {
    throw new Error(`Ordinary villa site "${site.id}" must use only a small gate plaque.`);
  }
  if (site.motifs.some(({ ownership, sourceBound }) => ownership !== 'style-family' || sourceBound)) {
    throw new Error(`Ordinary villa site "${site.id}" contains a landmark-only motif.`);
  }
  const { siteBounds, visibleBounds, collisionBounds } = site;
  if (
    collisionBounds.minX !== siteBounds.minX
    || collisionBounds.maxX !== siteBounds.maxX
    || collisionBounds.minZ !== siteBounds.minZ
    || collisionBounds.maxZ !== siteBounds.maxZ
  ) {
    throw new Error(`Ordinary villa site "${site.id}" must use its site bounds as its collision AABB.`);
  }
  if (
    visibleBounds.minX <= siteBounds.minX
    || visibleBounds.maxX >= siteBounds.maxX
    || visibleBounds.minZ <= siteBounds.minZ
    || visibleBounds.maxZ >= siteBounds.maxZ
  ) {
    throw new Error(`Ordinary villa site "${site.id}" must preserve a visible setback inside its site.`);
  }
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

/**
 * Queues the four detached ordinary villas into the shared architecture kit.
 * Landmark sites are deliberately ignored and the shared instance batches remain
 * unfinished so the landmark builder can contribute before the integrator finalizes once.
 */
export function createVillaDistrict(
  kit: VillaKit,
  sites: readonly ArchitectureSite[],
): ArchitectureBuildPart {
  const ordinarySites = sites.filter(({ kind }) => kind === 'ordinary');
  if (ordinarySites.length !== EXPECTED_ORDINARY_VILLA_COUNT) {
    throw new Error(
      `Villa district requires exactly ${EXPECTED_ORDINARY_VILLA_COUNT} ordinary sites; received ${ordinarySites.length}.`,
    );
  }

  const seenSubjectIds = new Set<ArchitectureSubjectId>();
  let neoclassicalCount = 0;
  let spanishCount = 0;
  let gothicCount = 0;

  for (const site of ordinarySites) {
    assertOrdinarySite(site);
    if (seenSubjectIds.has(site.id)) {
      throw new Error(`Duplicate ordinary villa site "${site.id}".`);
    }
    seenSubjectIds.add(site.id);

    switch (site.style) {
      case 'german-neoclassical':
        neoclassicalCount += 1;
        break;
      case 'spanish':
        spanishCount += 1;
        break;
      case 'gothic-castle':
        gothicCount += 1;
        break;
    }
  }

  if (neoclassicalCount !== 2 || spanishCount !== 1 || gothicCount !== 1) {
    throw new Error(
      'Villa district requires two German-neoclassical variants, one Spanish villa, and one Gothic villa.',
    );
  }

  const subjects: ArchitectureSubjectMetrics[] = [];
  const cameraViews: Partial<
    Record<ArchitectureSubjectId, Readonly<Record<ArchitectureFrameView, ArchitectureCameraView>>>
  > = {};
  for (const site of ordinarySites) {
    const built = createVilla(kit, site);
    const views = site.cameraViews;
    subjects.push(built.metrics);
    cameraViews[site.id] = Object.freeze({
      front: copyCameraView(views.front),
      'three-quarter': copyCameraView(views['three-quarter']),
      route: copyCameraView(views.route),
      low: copyCameraView(views.low),
    });
  }

  return Object.freeze({
    root: kit.root,
    subjects: Object.freeze(subjects),
    cameraViews: Object.freeze(cameraViews),
  });
}
