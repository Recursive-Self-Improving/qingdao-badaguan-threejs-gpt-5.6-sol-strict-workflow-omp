import { InstancedMesh, Material, MeshBasicMaterial, Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import { ResourceRegistry } from '../../src/render/ResourceRegistry';
import { DISTRICT_DATA } from '../../src/world/districtData';
import { createLandscape } from '../../src/world/landscape/createLandscape';
import { createDetailMetrics } from '../../src/world/landscape/createDetails';
import { createVegetationLayout } from '../../src/world/landscape/createVegetation';
import type {
  Bounds2,
  LandscapeBuildResult,
  LandscapeDensity,
  LandscapeSettings,
  RoadPlantingIdentity,
  Vec2,
} from '../../src/world/types';

const EXPECTED_IDENTITIES = [
  { roadId: 'shaoguan', speciesId: 'peach' },
  { roadId: 'ningwuguan', speciesId: 'crabapple' },
  { roadId: 'zijingguan', speciesId: 'cedar' },
  { roadId: 'zhengyangguan', speciesId: 'crape-myrtle' },
  { roadId: 'jiayuguan', speciesId: 'maple' },
  { roadId: 'juyongguan', speciesId: 'ginkgo' },
  { roadId: 'linhuaiguan', speciesId: 'chinese-juniper' },
  { roadId: 'wushengguan', speciesId: 'plane-tree' },
  { roadId: 'hangu-pass', speciesId: 'plane-tree' },
  { roadId: 'shanhaiguan', speciesId: 'plane-tree' },
] as const satisfies readonly RoadPlantingIdentity[];

const DENSITIES = ['high', 'medium', 'low'] as const satisfies readonly LandscapeDensity[];

function build(
  density: LandscapeDensity,
  motion: LandscapeSettings['motion'] = 'standard',
  group = `landscape-${density}-${motion}`,
): { readonly resources: ResourceRegistry; readonly group: string; readonly landscape: LandscapeBuildResult } {
  const resources = new ResourceRegistry();
  return {
    resources,
    group,
    landscape: createLandscape(resources, group, { density, motion }, DISTRICT_DATA),
  };
}

function instancedMeshes(root: Object3D): readonly InstancedMesh[] {
  const meshes: InstancedMesh[] = [];
  root.traverse((object) => {
    if (object instanceof InstancedMesh) meshes.push(object);
  });
  return meshes;
}

function matrixChecksum(root: Object3D): number {
  let checksum = 0;
  for (const mesh of instancedMeshes(root)) {
    for (let index = 0; index < mesh.instanceMatrix.array.length; index += 1) {
      const value = mesh.instanceMatrix.array[index];
      if (value === undefined) {
        throw new Error(`Missing instance matrix value at index ${index}`);
      }
      checksum += value * (index + 1);
    }
  }
  return checksum;
}

function materials(root: Object3D): readonly Material[] {
  const found = new Set<Material>();
  root.traverse((object) => {
    if (!('material' in object)) return;
    const value = object.material;
    if (Array.isArray(value)) value.forEach((material) => found.add(material));
    else if (value instanceof Material) found.add(value);
  });
  return [...found];
}

function expectValidBounds(bounds: {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}): void {
  expect([bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)).toBe(true);
  expect(bounds.maxX).toBeGreaterThan(bounds.minX);
  expect(bounds.maxZ).toBeGreaterThan(bounds.minZ);
}

function expandBounds(bounds: Bounds2, padding: number): Bounds2 {
  return {
    minX: bounds.minX - padding,
    maxX: bounds.maxX + padding,
    minZ: bounds.minZ - padding,
    maxZ: bounds.maxZ + padding,
  };
}

function boundsOverlap(first: Bounds2, second: Bounds2): boolean {
  return first.minX < second.maxX
    && first.maxX > second.minX
    && first.minZ < second.maxZ
    && first.maxZ > second.minZ;
}

function segmentIntersectsBounds(from: Vec2, to: Vec2, bounds: Bounds2): boolean {
  let near = 0;
  let far = 1;
  for (const [origin, delta, minimum, maximum] of [
    [from.x, to.x - from.x, bounds.minX, bounds.maxX],
    [from.z, to.z - from.z, bounds.minZ, bounds.maxZ],
  ] as const) {
    if (delta === 0) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return false;
  }
  return true;
}

function polylineIntersectsBounds(points: readonly Vec2[], bounds: Bounds2): boolean {
  return points.slice(1).some((to, index) => segmentIntersectsBounds(points[index] as Vec2, to, bounds));
}

function pointToBoundsDistance(point: Vec2, bounds: Bounds2): number {
  const dx = Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX);
  const dz = Math.max(bounds.minZ - point.z, 0, point.z - bounds.maxZ);
  return Math.hypot(dx, dz);
}
describe('landscape factory', () => {
  it('preserves all ten road identities while applying exact decreasing density policies', () => {
    const builds = DENSITIES.map((density) => build(density));

    for (const { landscape } of builds) {
      expect(landscape.metrics.identities).toEqual(EXPECTED_IDENTITIES);
      const expectedDensity = landscape.metrics.densityCounts[landscape.settings.density];
      if (expectedDensity === undefined) {
        throw new Error(`Missing density metrics for ${landscape.settings.density}`);
      }
      expect(landscape.metrics.active).toEqual(expectedDensity);
      expect(landscape.metrics.active.identityInstances).toBeGreaterThanOrEqual(10);
      expect(landscape.metrics.active.vegetationInstances).toBeGreaterThan(0);
      expect(landscape.metrics.active.detailInstances).toBeGreaterThan(0);
      expect(landscape.metrics.active.drawCalls).toBeGreaterThan(0);
      expect(landscape.metrics.active.triangles).toBeGreaterThan(0);
      expect(new Set(landscape.metrics.identities.map(({ roadId }) => roadId)).size).toBe(10);
    }

    const [high, medium, low] = builds.map(({ landscape }) => landscape.metrics.active);
    if (high === undefined || medium === undefined || low === undefined) {
      throw new Error('Expected high, medium, and low density metrics');
    }
    for (const field of ['vegetationInstances', 'detailInstances', 'drawCalls', 'triangles'] as const) {
      expect(high[field]).toBeGreaterThan(medium[field]);
      expect(medium[field]).toBeGreaterThan(low[field]);
      expect(low[field]).toBeGreaterThan(0);
    }

    for (const { resources, group } of builds) resources.disposeGroup(group);
  });

  it('keeps myrtle anchors canonical with distinct identity and ornamental crown scales', () => {
    const layouts = DENSITIES.map((density) => createVegetationLayout(DISTRICT_DATA, density));
    expect(layouts.map(({ instances }) => instances.length)).toEqual([123, 74, 35]);

    const id = 'vegetation:zhengyangguan:infill:6';
    for (const layout of layouts.slice(0, 2)) {
      const instance = layout.instances.find((candidate) => candidate.id === id);
      expect(instance).toBeDefined();
      expect(instance?.position.x).toBeCloseTo(-76.037_654_861_200_35, 10);
      expect(instance?.position.z).toBeCloseTo(-142.742_634_988_537_65, 10);
      expect(instance?.canopyScale).toEqual([
        1.184_125_344_634_149_3,
        1.643_275_988_471_880_6,
        1.135_793_697_914_388_1,
      ]);
      expect(instance?.vergeOffset).toBeCloseTo(14.195_060_978_364_198, 10);
      expect(instance?.vergeSide).toBe('north');
    }
    expect(layouts[2]?.instances.some((candidate) => candidate.id === id)).toBe(false);
    for (const layout of layouts) {
      const identity = layout.instances.find(({ id: candidateId }) => candidateId === 'vegetation:zhengyangguan:identity:0');
      expect(identity?.canopyScale).toEqual([
        2.252_975_388_429_661_5,
        3.126_578_090_065_652,
        2.161_017_209_310_083_2,
      ]);
      expect(identity?.foliageColor).toBe('#9b5b69');
    }
    expect(layouts[0]?.instances
      .filter(({ species, identity }) => species === 'crape-myrtle' && !identity)
      .every(({ canopyScale }) => canopyScale[0] < 2 && canopyScale[2] < 2)).toBe(true);
  });

  it('retargets one existing understory anchor to the shore juniper without workload drift', () => {
    const expected = {
      high: { understory: 26, publicGreenUnderstory: 17, totalInstances: 321, triangles: 6_262, drawCalls: 14 },
      medium: { understory: 14, publicGreenUnderstory: 8, totalInstances: 156, triangles: 3_276, drawCalls: 13 },
      low: { understory: 10, publicGreenUnderstory: 6, totalInstances: 91, triangles: 2_194, drawCalls: 13 },
    } as const;

    for (const density of DENSITIES) {
      const layout = createVegetationLayout(DISTRICT_DATA, density);
      const metrics = createDetailMetrics({ density, vegetationLayout: layout, data: DISTRICT_DATA });
      expect(metrics.counts.roadsideUnderstory).toBe(1);
      expect(metrics.counts.gardenUnderstory + metrics.counts.publicGreenUnderstory + metrics.counts.roadsideUnderstory).toBe(metrics.counts.understory);
      expect(metrics).toMatchObject({
        counts: {
          understory: expected[density].understory,
          publicGreenUnderstory: expected[density].publicGreenUnderstory,
        },
        totalInstances: expected[density].totalInstances,
        triangles: expected[density].triangles,
        drawCalls: expected[density].drawCalls,
        sharedGeometryCount: 5,
        sharedMaterialCount: 9,
        instanceBatchCount: expected[density].drawCalls,
        naiveRepeatedDrawCalls: expected[density].totalInstances,
      });
    }

    const lowLayout = createVegetationLayout(DISTRICT_DATA, 'low');
    const juniper = lowLayout.instances.find(({ species }) => species === 'chinese-juniper');
    expect(juniper).toBeDefined();
    const low = build('low', 'standard', 'landscape-roadside-juniper');
    const shrub = low.landscape.clearanceBounds.find(
      ({ id }) => id === `detail:roadside-juniper-understory:${juniper?.id}`,
    );
    expect(shrub).toMatchObject({ roadId: 'linhuaiguan', kind: 'detail' });
    if (juniper !== undefined && shrub !== undefined) {
      const center = {
        x: (shrub.bounds.minX + shrub.bounds.maxX) * 0.5,
        z: (shrub.bounds.minZ + shrub.bounds.maxZ) * 0.5,
      };
      expect(Math.hypot(center.x - juniper.position.x, center.z - juniper.position.z)).toBeCloseTo(4, 6);
    }
    low.resources.disposeGroup(low.group);
  });

  it('publishes the representative early-autumn and evergreen species palette and categories', () => {
    expect(DISTRICT_DATA.roadPlantingCues.map(({ roadId, species }) => ({ roadId, speciesId: species }))).toEqual(
      EXPECTED_IDENTITIES,
    );

    const cueFor = (species: (typeof DISTRICT_DATA.roadPlantingCues)[number]['species']) =>
      DISTRICT_DATA.roadPlantingCues.find((cue) => cue.species === species);
    expect(cueFor('maple')?.category).toBe('autumn-deciduous');
    expect(cueFor('ginkgo')?.category).toBe('autumn-deciduous');
    expect(cueFor('cedar')?.category).toBe('evergreen-conifer');
    expect(cueFor('chinese-juniper')?.category).toBe('evergreen-conifer');
    expect(cueFor('peach')?.category).toBe('flowering-deciduous');
    expect(cueFor('plane-tree')?.category).toBe('deciduous-canopy');

    for (const cue of DISTRICT_DATA.roadPlantingCues) {
      expect(cue.palette.foliage.length).toBeGreaterThan(0);
      expect(cue.palette.foliage.every((color) => color.length > 0)).toBe(true);
      expect(cue.palette.trunk.length).toBeGreaterThan(0);
    }
    expect(cueFor('maple')?.palette.litter).not.toBeNull();
    expect(cueFor('ginkgo')?.palette.litter).not.toBeNull();
    expect(cueFor('cedar')?.palette.litter).toBeNull();
    expect(cueFor('chinese-juniper')?.palette.litter).toBeNull();
  });

  it('builds deterministic transforms, clearance records, camera frames, and reusable LOD batches', () => {
    const first = build('high', 'standard', 'landscape-deterministic-a');
    const second = build('high', 'standard', 'landscape-deterministic-b');

    expect(matrixChecksum(first.landscape.root)).toBe(matrixChecksum(second.landscape.root));
    expect(first.landscape.metrics.motion.transformChecksum).toBe(
      second.landscape.metrics.motion.transformChecksum,
    );
    expect(first.landscape.metrics.lodBands.map(({ id }) => id)).toEqual(['near', 'mid', 'far']);
    expect(first.landscape.metrics.lodBands).toEqual(second.landscape.metrics.lodBands);
    expect(first.landscape.metrics.reuse.sharedGeometryCount).toBeGreaterThan(0);
    expect(first.landscape.metrics.reuse.sharedMaterialCount).toBeGreaterThan(0);
    expect(first.landscape.metrics.reuse.instanceBatchCount).toBeGreaterThan(0);
    expect(first.landscape.metrics.reuse.instanceCount).toBe(first.landscape.metrics.active.vegetationInstances + first.landscape.metrics.active.detailInstances);
    expect(first.landscape.metrics.reuse.estimatedInstancedDrawCalls).toBeLessThan(
      first.landscape.metrics.reuse.naiveRepeatedDrawCalls,
    );
    expect(instancedMeshes(first.landscape.root)).toHaveLength(first.landscape.metrics.reuse.instanceBatchCount);

    expect(first.landscape.metrics.clearanceIntersections).toBe(0);
    expect(first.landscape.clearanceBounds.length).toBeGreaterThan(10);
    first.landscape.clearanceBounds.forEach(({ bounds }) => expectValidBounds(bounds));
    expect(first.landscape.cameraViews).toHaveLength(7);
    expect(new Set(first.landscape.cameraViews.flatMap(({ roadIds }) => roadIds))).toEqual(
      new Set(EXPECTED_IDENTITIES.map(({ roadId }) => roadId)),
    );
    for (const view of first.landscape.cameraViews) {
      expect(view.clearanceIntersections).toBe(0);
      expect(view.ySemantics).toBe('world');
      expectValidBounds(view.clearanceBounds);
      expect(view.position.every(Number.isFinite)).toBe(true);
      expect(view.target.every(Number.isFinite)).toBe(true);
    }

    first.resources.disposeGroup(first.group);
    second.resources.disposeGroup(second.group);
  });

  it('keeps every generated vegetation bound outside authored circulation and built keep-outs', () => {
    const { resources, group, landscape } = build('high', 'standard', 'landscape-clearance');
    const vegetationBounds = landscape.clearanceBounds.filter(({ kind }) => kind === 'vegetation');
    const layout = createVegetationLayout(DISTRICT_DATA, 'high');

    expect(layout.instances).toHaveLength(landscape.metrics.active.vegetationInstances);
    for (const instance of layout.instances) {
      expect(instance.vergeOffset, `${instance.id} owning-road trunk verge`).toBeGreaterThanOrEqual(12);
    }

    expect(vegetationBounds).toHaveLength(landscape.metrics.active.vegetationInstances);
    for (const vegetation of vegetationBounds) {
      const { bounds } = vegetation;
      expect(bounds.minX).toBeGreaterThanOrEqual(DISTRICT_DATA.worldBounds.minX);
      expect(bounds.maxX).toBeLessThanOrEqual(DISTRICT_DATA.worldBounds.maxX);
      expect(bounds.minZ).toBeGreaterThanOrEqual(DISTRICT_DATA.worldBounds.minZ);
      expect(bounds.maxZ).toBeLessThanOrEqual(DISTRICT_DATA.worldBounds.maxZ);

      for (const road of DISTRICT_DATA.roads) {
        if (road.id === vegetation.roadId) continue;
        const centerline = [road.centerline.from, ...road.centerline.via, road.centerline.to];
        const corridor = expandBounds(bounds, road.width * 0.5 + road.sidewalkWidth);
        expect(
          polylineIntersectsBounds(centerline, corridor),
          `${vegetation.id} intersects other-road corridor ${road.id}`,
        ).toBe(false);
      }
      for (const footprint of DISTRICT_DATA.collisionFootprints) {
        expect(
          boundsOverlap(bounds, expandBounds(footprint.bounds, 1)),
          `${vegetation.id} intersects architecture ${footprint.id}`,
        ).toBe(false);
      }
      for (const parcel of DISTRICT_DATA.parcels) {
        expect(
          boundsOverlap(bounds, parcel.bounds),
          `${vegetation.id} intersects parcel ${parcel.id}`,
        ).toBe(false);
        for (const wall of parcel.wallSegments) {
          expect(
            segmentIntersectsBounds(wall.from, wall.to, expandBounds(bounds, 1)),
            `${vegetation.id} intersects wall of ${parcel.id}`,
          ).toBe(false);
        }
        for (const gate of parcel.gates) {
          expect(
            pointToBoundsDistance(gate.position, bounds),
            `${vegetation.id} intersects gate ${gate.id}`,
          ).toBeGreaterThanOrEqual(gate.width * 0.5 + 1);
        }
      }
      for (const path of DISTRICT_DATA.publicGreen.paths) {
        expect(
          polylineIntersectsBounds(path.centerline, expandBounds(bounds, path.width * 0.5 + 1)),
          `${vegetation.id} intersects public path ${path.id}`,
        ).toBe(false);
      }
      for (const sightline of DISTRICT_DATA.sightlines) {
        expect(
          segmentIntersectsBounds(sightline.from, sightline.toward, expandBounds(bounds, 4)),
          `${vegetation.id} blocks sightline ${sightline.id}`,
        ).toBe(false);
      }
      for (const anchor of DISTRICT_DATA.routeAnchors) {
        expect(
          pointToBoundsDistance(anchor.position, bounds),
          `${vegetation.id} intersects route anchor ${anchor.id}`,
        ).toBeGreaterThanOrEqual(5.5);
      }
    }

    resources.disposeGroup(group);
  });

  it('uses only opaque, depth-writing basic materials and authentic non-collidable detail batches', () => {
    const { resources, group, landscape } = build('high');
    const liveMaterials = materials(landscape.root);
    const batchNames = instancedMeshes(landscape.root).map(({ name }) => name.toLowerCase());

    expect(liveMaterials.length).toBeGreaterThan(0);
    for (const material of liveMaterials) {
      expect(material).toBeInstanceOf(MeshBasicMaterial);
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      expect(material.depthWrite).toBe(true);
    }
    expect(landscape.metrics.transparentObjects).toBe(0);
    expect(landscape.metrics.depthWriteDisabled).toBe(0);

    for (const detail of [
      'stone-bench',
      'wood-bench',
      'lamp',
      'bollard',
      'shrub',
      'understory',
      'leaf-litter',
      'shore',
    ]) {
      expect(batchNames.some((name) => name.includes(detail))).toBe(true);
    }
    expect(batchNames.some((name) => /palm|tropical|advert|billboard/.test(name))).toBe(false);
    expect(landscape.clearanceBounds.filter(({ kind }) => kind === 'detail').length).toBeGreaterThan(0);
    expect(landscape.root.userData.collidable).not.toBe(true);

    resources.disposeGroup(group);
  });

  it('animates restrained standard motion but keeps reduced and capture-time transforms frozen', () => {
    const standard = build('medium', 'standard', 'landscape-motion-standard');
    const initialStandard = standard.landscape.metrics.motion.transformChecksum;
    standard.landscape.update({ elapsedSeconds: 1, deltaSeconds: 1 });
    const movedStandard = standard.landscape.metrics.motion.transformChecksum;
    expect(standard.landscape.metrics.motion.amplitude).toBeGreaterThan(0);
    expect(movedStandard).not.toBe(initialStandard);

    standard.landscape.setCaptureTime(2.5);
    standard.landscape.update({ elapsedSeconds: 8, deltaSeconds: 1 });
    const captured = standard.landscape.metrics.motion.transformChecksum;
    standard.landscape.update({ elapsedSeconds: 12, deltaSeconds: 4 });
    expect(standard.landscape.metrics.motion.time).toBe(2.5);
    expect(standard.landscape.metrics.motion.transformChecksum).toBe(captured);
    standard.landscape.setCaptureTime(null);
    standard.landscape.reset();
    expect(standard.landscape.metrics.motion.time).toBe(0);
    expect(standard.landscape.metrics.motion.transformChecksum).toBe(initialStandard);

    const reduced = build('medium', 'reduced', 'landscape-motion-reduced');
    const reducedChecksum = reduced.landscape.metrics.motion.transformChecksum;
    const reducedMatrixChecksum = matrixChecksum(reduced.landscape.root);
    reduced.landscape.update({ elapsedSeconds: 20, deltaSeconds: 20 });
    expect(reduced.landscape.metrics.motion.amplitude).toBe(0);
    expect(reduced.landscape.metrics.motion.transformChecksum).toBe(reducedChecksum);
    expect(matrixChecksum(reduced.landscape.root)).toBe(reducedMatrixChecksum);
    expect(reduced.landscape.metrics.active).toEqual(standard.landscape.metrics.active);
    expect(reduced.landscape.metrics.identities).toEqual(standard.landscape.metrics.identities);

    standard.resources.disposeGroup(standard.group);
    reduced.resources.disposeGroup(reduced.group);
  });

  it('registers one disposable generation group and finalizes disposal idempotently', () => {
    const { resources, group, landscape } = build('low', 'standard', 'landscape-disposal');
    const childCount = landscape.root.children.length;
    const live = resources.getCounts();

    expect(childCount).toBeGreaterThan(0);
    expect(live.resources).toBeGreaterThan(0);
    expect(live.references).toBe(live.resources);
    expect(live.groups).toBe(1);
    expect(live.disposed).toBe(0);

    expect(resources.disposeGroup(group)).toBe(live.resources);
    expect(resources.getCounts()).toEqual({
      resources: 0,
      references: 0,
      groups: 0,
      disposed: live.resources,
    });
    expect(resources.disposeGroup(group)).toBe(0);
    expect(resources.getCounts().disposed).toBe(live.resources);

    landscape.reset();
    landscape.reset();
    expect(landscape.root.children).toHaveLength(childCount);
  });
});
