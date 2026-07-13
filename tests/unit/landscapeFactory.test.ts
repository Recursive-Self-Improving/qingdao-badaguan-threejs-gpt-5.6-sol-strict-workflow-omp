import { DynamicDrawUsage, InstancedMesh, Material, MeshStandardMaterial, Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import { ResourceRegistry } from '../../src/render/ResourceRegistry';
import { DISTRICT_DATA } from '../../src/world/districtData';
import { createLandscape } from '../../src/world/landscape/createLandscape';
import { createDetailMetrics, createDetails } from '../../src/world/landscape/createDetails';
import { createVegetationLayout } from '../../src/world/landscape/createVegetation';
import type {
  Bounds2,
  DistrictData,
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
function dynamicMatrixVersions(root: Object3D): readonly number[] {
  return instancedMeshes(root)
    .filter(({ instanceMatrix }) => instanceMatrix.usage === DynamicDrawUsage)
    .map(({ instanceMatrix }) => instanceMatrix.version);
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

function mixHexColors(from: string, to: string, amount: number): string {
  const fromValue = Number.parseInt(from.slice(1), 16);
  const toValue = Number.parseInt(to.slice(1), 16);
  const inverse = 1 - amount;
  const red = Math.round(((fromValue >>> 16) & 0xff) * inverse + ((toValue >>> 16) & 0xff) * amount);
  const green = Math.round(((fromValue >>> 8) & 0xff) * inverse + ((toValue >>> 8) & 0xff) * amount);
  const blue = Math.round((fromValue & 0xff) * inverse + (toValue & 0xff) * amount);
  return `#${((red << 16) | (green << 8) | blue).toString(16).padStart(6, '0')}`;
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

    for (const { landscape } of builds) {
      DENSITIES.forEach((density, index) => {
        const independentlyActive = builds[index]?.landscape.metrics.active;
        if (independentlyActive === undefined) {
          throw new Error(`Missing independent ${density} landscape build`);
        }
        expect(
          landscape.metrics.densityCounts[density],
          `${landscape.settings.density} prediction for ${density}`,
        ).toEqual(independentlyActive);
      });
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
    expect([high.drawCalls, medium.drawCalls, low.drawCalls]).toEqual([21, 20, 19]);
    expect(high).toMatchObject({ vegetationInstances: 105, detailInstances: 299, identityInstances: 10, triangles: 19_268 });
    expect(medium).toMatchObject({ vegetationInstances: 64, detailInstances: 149, identityInstances: 10, triangles: 9_610 });
    expect(low).toMatchObject({ vegetationInstances: 10, detailInstances: 84, identityInstances: 10, triangles: 2_824 });
    expect(builds.map(({ landscape }) => landscape.metrics.reuse.instanceCount)).toEqual([525, 285, 104]);

    for (const { resources, group } of builds) resources.disposeGroup(group);
  });

  it('keeps myrtle anchors canonical with distinct identity and ornamental crown scales', () => {
    const layouts = DENSITIES.map((density) => createVegetationLayout(DISTRICT_DATA, density));
    expect(layouts.map(({ instances }) => instances.length)).toEqual([105, 64, 10]);
    expect(layouts.map(({ activeLodBand }) => activeLodBand)).toEqual(['near', 'near', 'near']);

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

  it('keeps peach blush coherent and gives every Wusheng plane a pale raised-trunk crown', () => {
    const layouts = DENSITIES.map((density) => createVegetationLayout(DISTRICT_DATA, density));
    const peachCue = DISTRICT_DATA.roadPlantingCues.find(({ roadId }) => roadId === 'shaoguan');
    const planeCue = DISTRICT_DATA.roadPlantingCues.find(({ roadId }) => roadId === 'wushengguan');
    expect(peachCue).toBeDefined();
    expect(planeCue).toBeDefined();
    if (peachCue === undefined || planeCue === undefined) return;

    const highPeaches = layouts[0]?.instances.filter(({ roadId }) => roadId === 'shaoguan') ?? [];
    const peachIdentity = highPeaches.find(({ identity }) => identity);
    const peachInfill = highPeaches.filter(({ identity }) => !identity);
    const peachAccent = peachCue.palette.foliage.at(-1);
    expect(peachAccent).toBeDefined();
    if (peachAccent === undefined) return;
    expect(peachCue.palette.foliage).toContain(peachIdentity?.foliageColor);
    expect(new Set(peachInfill.map(({ foliageColor }) => foliageColor))).toEqual(new Set(
      [0.12, 0.22, 0.32].map((amount) => mixHexColors(peachAccent, '#eee5d6', amount)),
    ));
    const mapleCue = DISTRICT_DATA.roadPlantingCues.find(({ roadId }) => roadId === 'jiayuguan');
    expect(mapleCue).toBeDefined();
    if (mapleCue === undefined) return;
    const highMaples = layouts[0]?.instances.filter(({ roadId }) => roadId === 'jiayuguan') ?? [];
    const mapleIdentity = highMaples.find(({ identity }) => identity);
    const mapleNonidentity = highMaples.filter(({ identity }) => !identity);
    expect(mapleCue.palette.foliage).toContain(mapleIdentity?.foliageColor);
    expect(new Set(mapleNonidentity.map(({ foliageColor }) => foliageColor))).toEqual(new Set([
      '#9b4b2e',
      '#bd6b2f',
    ]));
    expect(new Set(mapleNonidentity.map(({ accentColor }) => accentColor))).toEqual(new Set(['#d08a38']));
    expect(new Set(mapleNonidentity.map(({ litterColor }) => litterColor))).toEqual(new Set(['#9b5830']));

    const highPlanes = layouts[0]?.instances.filter(({ roadId }) => roadId === 'wushengguan') ?? [];
    const planeIdentity = highPlanes.find(({ identity }) => identity);
    const planeInfill = highPlanes.filter(({ identity }) => !identity);
    expect(planeInfill).toHaveLength(6);
    const planeStart = planeCue.palette.foliage[0];
    const planeEnd = planeCue.palette.foliage.at(-1);
    expect(planeEnd).toBeDefined();
    if (planeEnd === undefined) return;
    const expectedPlaneColors = new Set(
      [0.08, 0.48, 0.84].map((amount) => mixHexColors(planeStart, planeEnd, amount)),
    );
    const activePlaneColors = new Set(highPlanes.map(({ foliageColor }) => foliageColor));
    expect(activePlaneColors.size).toBeGreaterThanOrEqual(2);
    expect([...activePlaneColors].every((color) => expectedPlaneColors.has(color))).toBe(true);
    const paleTrunk = mixHexColors(planeCue.palette.trunk, '#eee5d6', 0.72);
    expect(new Set(highPlanes.map(({ trunkColor }) => trunkColor))).toEqual(new Set([paleTrunk]));
    const identityHeightRatio = (planeIdentity?.canopyScale[1] ?? 0) / (planeIdentity?.canopyScale[0] ?? 1);
    for (const instance of highPlanes) {
      expect(instance.canopyScale[1] / instance.canopyScale[0]).toBeCloseTo(identityHeightRatio, 10);
      expect(instance.canopyScale[2] / instance.canopyScale[0]).toBeCloseTo(
        (planeIdentity?.canopyScale[2] ?? 0) / (planeIdentity?.canopyScale[0] ?? 1),
        10,
      );
      expect(instance.trunkHeight).toBeGreaterThan(5);
      expect(instance.canopyCenterHeight).toBeGreaterThan(instance.trunkHeight);
    }
    const wushengByDensity = layouts.map(({ instances }) => instances.filter(
      ({ roadId }) => roadId === 'wushengguan',
    ));
    expect(wushengByDensity.map((instances) => instances.length)).toEqual([7, 5, 1]);
    expect(new Set(wushengByDensity[0]?.map(({ id }) => id))).toEqual(new Set([
      'vegetation:wushengguan:accent:4',
      'vegetation:wushengguan:identity:0',
      'vegetation:wushengguan:infill:5',
      'vegetation:wushengguan:infill:9',
      'vegetation:wushengguan:infill:cadence-mid',
      'vegetation:wushengguan:infill:14',
      'vegetation:wushengguan:infill:cadence-north',
    ]));
    expect(new Set(wushengByDensity[1]?.map(({ id }) => id))).toEqual(new Set([
      'vegetation:wushengguan:accent:4',
      'vegetation:wushengguan:identity:0',
      'vegetation:wushengguan:infill:5',
      'vegetation:wushengguan:infill:cadence-north',
      'vegetation:wushengguan:infill:cadence-mid',
    ]));
    expect(wushengByDensity[2]?.map(({ id, identity }) => ({ id, identity }))).toEqual([
      { id: 'vegetation:wushengguan:identity:0', identity: true },
    ]);
    const highCadence = [...(wushengByDensity[0] ?? [])].sort((first, second) => first.position.z - second.position.z);
    expect(highCadence.filter(({ vergeSide }) => vergeSide === 'east')).toHaveLength(3);
    expect(highCadence.filter(({ vergeSide }) => vergeSide === 'west')).toHaveLength(4);
    expect(wushengByDensity[1]?.filter(({ vergeSide }) => vergeSide === 'east')).toHaveLength(2);
    expect(wushengByDensity[1]?.filter(({ vergeSide }) => vergeSide === 'west')).toHaveLength(3);
    const expectedStations = [
      [-135.249_342, -244.381_676],
      [-107.742_249, -195.704_078],
      [-134.593_969, -149.278_345],
      [-135.240, -107.181],
      [-105, -105],
      [-131.509, -49.434],
      [-102.962_016, -48.641_106],
    ] as const;
    highCadence.forEach((instance, index) => {
      const expected = expectedStations[index];
      expect(expected).toBeDefined();
      if (expected === undefined) return;
      expect(instance.position.x).toBeCloseTo(expected[0], 3);
      expect(instance.position.z).toBeCloseTo(expected[1], 3);
    });
    const pairAt = (firstId: string, secondId: string): readonly [number, number] => {
      const first = highCadence.find(({ id }) => id.endsWith(firstId));
      const second = highCadence.find(({ id }) => id.endsWith(secondId));
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      if (first === undefined || second === undefined) return [0, 0];
      expect(new Set([first.vergeSide, second.vergeSide])).toEqual(new Set(['east', 'west']));
      expect(Math.abs(first.position.z - second.position.z)).toBeLessThan(3);
      return [(first.position.z + second.position.z) * 0.5, Math.abs(first.position.x - second.position.x)];
    };
    const southPair = pairAt('accent:4', 'infill:5');
    const centralPair = pairAt('identity:0', 'infill:9');
    expect(southPair[1]).toBeGreaterThan(20);
    expect(centralPair[1]).toBeGreaterThan(20);
    const cadenceStations = [
      highCadence[0]?.position.z,
      highCadence[1]?.position.z,
      highCadence[2]?.position.z,
      centralPair[0],
      southPair[0],
    ].filter((station): station is number => station !== undefined);
    const cadenceGaps = cadenceStations.slice(1).map((station, index) => (
      station - (cadenceStations[index] ?? station)
    ));
    expect(cadenceGaps.every((gap) => gap >= 40 && gap <= 60)).toBe(true);
    const shanhaiByDensity = layouts.map(({ instances }) => instances.filter(
      ({ roadId }) => roadId === 'shanhaiguan',
    ));
    expect(shanhaiByDensity.map((instances) => instances.length)).toEqual([5, 3, 1]);
    expect(new Set(shanhaiByDensity[0]?.map(({ id }) => id))).toEqual(new Set([
      'vegetation:shanhaiguan:identity:0',
      'vegetation:shanhaiguan:infill:cadence-south',
      'vegetation:shanhaiguan:infill:cadence-mid-south',
      'vegetation:shanhaiguan:infill:cadence-mid-north',
      'vegetation:shanhaiguan:infill:cadence-north',
    ]));
    expect(new Set(shanhaiByDensity[1]?.map(({ id }) => id))).toEqual(new Set([
      'vegetation:shanhaiguan:identity:0',
      'vegetation:shanhaiguan:infill:cadence-south',
      'vegetation:shanhaiguan:infill:cadence-mid-south',
    ]));
    expect(shanhaiByDensity[2]?.map(({ id, identity }) => ({ id, identity }))).toEqual([
      { id: 'vegetation:shanhaiguan:identity:0', identity: true },
    ]);
    const shanhaiCadence = [...(shanhaiByDensity[0] ?? [])].sort(
      (first, second) => first.position.z - second.position.z,
    );
    expect(shanhaiCadence.filter(({ vergeSide }) => vergeSide === 'east')).toHaveLength(3);
    expect(shanhaiCadence.filter(({ vergeSide }) => vergeSide === 'west')).toHaveLength(2);
    const expectedShanhaiStations = [
      [132.242_367, -244.541_921],
      [103.814_577, -194.213_836],
      [135, -145],
      [136.310_423, -100.786_164],
      [110.011_843, -58.448_895],
    ] as const;
    shanhaiCadence.forEach((instance, index) => {
      const expected = expectedShanhaiStations[index];
      expect(expected).toBeDefined();
      if (expected === undefined) return;
      expect(instance.position.x).toBeCloseTo(expected[0], 5);
      expect(instance.position.z).toBeCloseTo(expected[1], 5);
      expect(instance.trunkColor).toBe('#cec5b4');
      expect(instance.trunkHeight).toBeGreaterThan(5);
      expect(instance.canopyCenterHeight).toBeGreaterThan(instance.trunkHeight);
    });
    const shanhaiGaps = shanhaiCadence.slice(1).map((instance, index) => (
      instance.position.z - (shanhaiCadence[index]?.position.z ?? instance.position.z)
    ));
    expect(shanhaiGaps.every((gap) => gap >= 40 && gap <= 55)).toBe(true);
    for (const avenueRoadId of ['wushengguan', 'shanhaiguan'] as const) {
      const avenueRoad = DISTRICT_DATA.roads.find(({ id }) => id === avenueRoadId);
      expect(avenueRoad).toBeDefined();
      if (avenueRoad === undefined) return;
      const avenueCenterline = [
        avenueRoad.centerline.from,
        ...avenueRoad.centerline.via,
        avenueRoad.centerline.to,
      ];
      for (const layout of layouts) {
        expect(layout.instances.filter(({ identity }) => identity)).toHaveLength(10);
        for (const instance of layout.instances) {
          if (instance.identity || instance.roadId === avenueRoadId) continue;
          expect(
            polylineIntersectsBounds(avenueCenterline, expandBounds(instance.clearanceBound, 21)),
            `${instance.id} intrudes on ${avenueRoadId} avenue hierarchy`,
          ).toBe(false);
        }
      }
    }
    for (let firstIndex = 0; firstIndex < highCadence.length; firstIndex += 1) {
      const first = highCadence[firstIndex];
      if (first === undefined) continue;
      expectValidBounds(first.clearanceBound);
      for (let secondIndex = firstIndex + 1; secondIndex < highCadence.length; secondIndex += 1) {
        const second = highCadence[secondIndex];
        if (second === undefined) continue;
        expect(
          boundsOverlap(first.clearanceBound, second.clearanceBound),
          `${first.id} overlaps ${second.id}`,
        ).toBe(false);
      }
    }

    const builds = DENSITIES.map((density) => build(density, 'standard', `landscape-cue-${density}`));
    DENSITIES.forEach((density, index) => {
      const current = builds[index];
      if (current === undefined) throw new Error(`Missing ${density} cue build`);
      expect(current.landscape.metrics.reuse.sharedMaterialCount).toBe(13);
      const attachedVegetationMaterials = new Set(materials(current.landscape.root)
        .map(({ name }) => name)
        .filter((name) => name.startsWith('vegetation:')));
      const expectedMaterials = [
        'vegetation:trunk-palette',
        'vegetation:foliage-palette',
      ];
      expectedMaterials.push('vegetation:avenue-plane-trunk-palette');
      if (density !== 'low') expectedMaterials.push('vegetation:accent-palette');
      expect(attachedVegetationMaterials).toEqual(new Set(expectedMaterials));
      const vegetationBatches = instancedMeshes(current.landscape.root)
        .filter(({ name }) => name.startsWith('vegetation:instances:'));
      expect(vegetationBatches).toHaveLength(density === 'low' ? 6 : 7);
      const paleBatch = vegetationBatches.find(
        ({ name }) => name === 'vegetation:instances:near:trunks:avenue-plane-pale',
      );
      expect(paleBatch?.count).toBe(density === 'high' ? 12 : density === 'medium' ? 8 : 2);
    });
    for (const { resources, group } of builds) resources.disposeGroup(group);
  });

  it('retargets understory to a deterministic shore-juniper reserve with exact tier workloads', () => {
    const expected = {
      high: { understory: 29, publicGreenUnderstory: 19, totalInstances: 299, triangles: 6_300, drawCalls: 14 },
      medium: { understory: 15, publicGreenUnderstory: 9, totalInstances: 149, triangles: 3_316, drawCalls: 13 },
      low: { understory: 10, publicGreenUnderstory: 6, totalInstances: 84, triangles: 2_180, drawCalls: 13 },
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
        naiveRepeatedDrawCalls: metrics.totalInstances,
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
      const reserveDistance = Math.hypot(center.x - juniper.position.x, center.z - juniper.position.z);
      expect(reserveDistance).toBeGreaterThan(4);
      expect(reserveDistance).toBeLessThan(12);
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
    const vegetationBatchNames = instancedMeshes(first.landscape.root)
      .map(({ name }) => name)
      .filter((name) => name.startsWith('vegetation:instances:'));
    expect(vegetationBatchNames.length).toBeGreaterThan(0);
    expect(vegetationBatchNames.every((name) => name.includes(':near:'))).toBe(true);
    expect(first.landscape.metrics.reuse.sharedGeometryCount).toBeGreaterThan(0);
    expect(first.landscape.metrics.reuse.sharedMaterialCount).toBeGreaterThan(0);
    expect(first.landscape.metrics.reuse.instanceBatchCount).toBeGreaterThan(0);
    expect(first.landscape.metrics.reuse.instanceCount).toBe(
      instancedMeshes(first.landscape.root).reduce((total, mesh) => total + mesh.count, 0),
    );
    expect(first.landscape.metrics.reuse.estimatedInstancedDrawCalls).toBeLessThan(
      first.landscape.metrics.reuse.naiveRepeatedDrawCalls,
    );
    expect(instancedMeshes(first.landscape.root)).toHaveLength(first.landscape.metrics.reuse.instanceBatchCount);

    expect(first.landscape.metrics.clearanceIntersections).toBe(0);
    expect(first.landscape.clearanceBounds.length).toBeGreaterThan(10);
    first.landscape.clearanceBounds.forEach(({ bounds }) => expectValidBounds(bounds));
    expect(first.landscape.cameraViews).toHaveLength(10);
    expect(first.landscape.cameraViews.map(({ roadIds }) => roadIds)).toEqual(
      EXPECTED_IDENTITIES.map(({ roadId }) => [roadId]),
    );
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
      expect(Object.isFrozen(instance)).toBe(true);
      expect(Object.isFrozen(instance.clearanceBound)).toBe(true);
      expectValidBounds(instance.clearanceBound);
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
      expect(material).toBeInstanceOf(MeshStandardMaterial);
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      expect(material.depthWrite).toBe(true);
    }
    expect(landscape.metrics.transparentObjects).toBe(0);
    expect(landscape.metrics.depthWriteDisabled).toBe(0);
    const shadowCasters: Object3D[] = [];
    landscape.root.traverse((object) => {
      if (object.castShadow) shadowCasters.push(object);
    });
    expect(shadowCasters.length).toBeGreaterThan(0);
    expect(shadowCasters.every(({ name }) => name.includes(':trunks'))).toBe(true);
    const vegetationMeshes = instancedMeshes(landscape.root)
      .filter(({ name }) => name.startsWith('vegetation:instances:'));
    const canopyMeshes = vegetationMeshes.filter(({ name }) => name.includes(':canopies:') || name.endsWith(':accents'));
    const trunkMeshes = vegetationMeshes.filter(({ name }) => name.includes(':trunks'));
    expect(canopyMeshes.length).toBeGreaterThan(0);
    expect(canopyMeshes.every(({ receiveShadow }) => !receiveShadow)).toBe(true);
    expect(trunkMeshes.length).toBeGreaterThan(0);
    expect(trunkMeshes.every(({ receiveShadow }) => receiveShadow)).toBe(true);
    const canopyMaterials = liveMaterials.filter((material): material is MeshStandardMaterial =>
      material instanceof MeshStandardMaterial
      && (material.name === 'vegetation:foliage-palette' || material.name === 'vegetation:accent-palette'));
    expect(canopyMaterials.length).toBe(2);
    expect(canopyMaterials.every((material) => material.emissive.getHex() === 0x30382a)).toBe(true);
    expect(canopyMaterials.every(({ emissiveIntensity }) => emissiveIntensity === 0.18)).toBe(true);

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

    const vegetationBounds = landscape.clearanceBounds.filter(({ kind }) => kind === 'vegetation');
    const nonLitterDetails = landscape.clearanceBounds.filter(
      ({ id, kind }) => kind === 'detail' && !id.includes('leaf-litter:'),
    );
    expect(nonLitterDetails.length).toBeGreaterThan(0);
    for (const detail of nonLitterDetails) {
      for (const vegetation of vegetationBounds) {
        expect(
          boundsOverlap(detail.bounds, vegetation.bounds),
          `${detail.id} intersects ${vegetation.id}`,
        ).toBe(false);
      }
    }

    resources.disposeGroup(group);
  });

  it('derives shore details from translated coast and promenade data', () => {
    const shiftX = 10;
    const shiftZ = 5;
    const coast = DISTRICT_DATA.coast;
    const canonicalData: DistrictData = {
      ...DISTRICT_DATA,
      roads: [],
      parcels: [],
      collisionFootprints: [],
      routeAnchors: [],
      sightlines: [],
      landscapeCameraViews: [],
      publicGreen: { ...DISTRICT_DATA.publicGreen, paths: [] },
    };
    const translatedData: DistrictData = {
      ...canonicalData,
      coast: {
        ...canonicalData.coast,
        edgeZ: coast.edgeZ + shiftZ,
        seaBounds: {
          minX: coast.seaBounds.minX + shiftX,
          maxX: coast.seaBounds.maxX + shiftX,
          minZ: coast.seaBounds.minZ + shiftZ,
          maxZ: coast.seaBounds.maxZ + shiftZ,
        },
        promenade: {
          ...coast.promenade,
          centerline: coast.promenade.centerline.map(({ x, z }) => ({ x: x + shiftX, z: z + shiftZ })),
        },
        screen: {
          ...coast.screen,
          z: coast.screen.z + shiftZ,
          openings: coast.screen.openings.map((opening) => ({
            ...opening,
            minX: opening.minX + shiftX,
            maxX: opening.maxX + shiftX,
          })),
        },
      },
    };
    const resources = new ResourceRegistry();
    const vegetationLayout = { instances: [] } as const;
    const canonical = createDetails(resources, 'details-canonical-coast', {
      density: 'low',
      data: canonicalData,
      vegetationLayout,
    });
    const translated = createDetails(resources, 'details-translated-coast', {
      density: 'low',
      data: translatedData,
      vegetationLayout,
    });
    const canonicalShore = canonical.clearanceBounds.filter(({ id }) => /shore-(?:stone|bollard):/.test(id));
    const translatedShore = translated.clearanceBounds.filter(({ id }) => /shore-(?:stone|bollard):/.test(id));
    const translatedById = new Map(translatedShore.map((bound) => [bound.id, bound]));
    expect(translatedShore.map(({ id }) => id).sort()).toEqual(canonicalShore.map(({ id }) => id).sort());
    expect(translatedShore).toHaveLength(canonicalShore.length);
    const common = canonicalShore;
    expect(common.length).toBeGreaterThan(0);
    for (const original of common) {
      const moved = translatedById.get(original.id);
      expect(moved).toBeDefined();
      if (moved === undefined) continue;
      expect(moved.bounds.minX - original.bounds.minX).toBeCloseTo(shiftX, 8);
      expect(moved.bounds.maxX - original.bounds.maxX).toBeCloseTo(shiftX, 8);
      expect(moved.bounds.minZ - original.bounds.minZ).toBeCloseTo(shiftZ, 8);
      expect(moved.bounds.maxZ - original.bounds.maxZ).toBeCloseTo(shiftZ, 8);
    }

    resources.disposeGroup('details-canonical-coast');
    resources.disposeGroup('details-translated-coast');
  });

  it('animates restrained standard motion but keeps reduced and capture-time transforms frozen', () => {
    const standard = build('medium', 'standard', 'landscape-motion-standard');
    const initialStandard = standard.landscape.metrics.motion.transformChecksum;
    const initialStandardVersions = dynamicMatrixVersions(standard.landscape.root);
    expect(initialStandardVersions.length).toBeGreaterThan(0);
    standard.landscape.update({ elapsedSeconds: 1, deltaSeconds: 1 });
    const movedStandard = standard.landscape.metrics.motion.transformChecksum;
    expect(standard.landscape.metrics.motion.amplitude).toBeGreaterThan(0);
    expect(movedStandard).not.toBe(initialStandard);
    const movedStandardVersions = dynamicMatrixVersions(standard.landscape.root);
    expect(movedStandardVersions.some((version, index) => version > (initialStandardVersions[index] ?? version))).toBe(true);

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
    const reducedVersions = dynamicMatrixVersions(reduced.landscape.root);
    expect(reducedVersions.length).toBeGreaterThan(0);
    reduced.landscape.update({ elapsedSeconds: 20, deltaSeconds: 20 });
    expect(reduced.landscape.metrics.motion.amplitude).toBe(0);
    expect(reduced.landscape.metrics.motion.transformChecksum).toBe(reducedChecksum);
    expect(matrixChecksum(reduced.landscape.root)).toBe(reducedMatrixChecksum);
    expect(dynamicMatrixVersions(reduced.landscape.root)).toEqual(reducedVersions);
    const lowStandard = build('low', 'standard', 'landscape-motion-low-standard');
    const lowVersions = dynamicMatrixVersions(lowStandard.landscape.root);
    const lowChecksum = lowStandard.landscape.metrics.motion.transformChecksum;
    expect(lowStandard.landscape.metrics.motion.amplitude).toBe(0);
    expect(lowVersions.length).toBeGreaterThan(0);
    lowStandard.landscape.update({ elapsedSeconds: 20, deltaSeconds: 20 });
    expect(lowStandard.landscape.metrics.motion.transformChecksum).toBe(lowChecksum);
    expect(dynamicMatrixVersions(lowStandard.landscape.root)).toEqual(lowVersions);
    expect(reduced.landscape.metrics.active).toEqual(standard.landscape.metrics.active);
    expect(reduced.landscape.metrics.identities).toEqual(standard.landscape.metrics.identities);

    standard.resources.disposeGroup(standard.group);
    reduced.resources.disposeGroup(reduced.group);
    lowStandard.resources.disposeGroup(lowStandard.group);
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
