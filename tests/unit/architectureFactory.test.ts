import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';

import { ResourceRegistry } from '../../src/render/ResourceRegistry';
import { createLandmarks } from '../../src/world/architecture/createLandmarks';
import { createVillaDistrict } from '../../src/world/architecture/createVillas';
import { createVillaKit } from '../../src/world/architecture/villaKit';
import { DISTRICT_DATA } from '../../src/world/districtData';
import type { ArchitectureSite } from '../../src/world/types';

const SUBJECT_IDS = [
  'villa-west-neoclassical',
  'villa-central-spanish',
  'villa-central-gothic',
  'villa-east-neoclassical',
  'princess-inspired-landmark',
  'butterfly-inspired-landmark',
  'huashi-inspired-landmark',
] as const;

const VIEW_IDS = ['front', 'three-quarter', 'route', 'low'] as const;

function buildArchitecture(resources: ResourceRegistry, group: string) {
  const kit = createVillaKit(resources, group);
  const ordinary = createVillaDistrict(kit, DISTRICT_DATA.architectureSites);
  const landmarks = createLandmarks(kit, DISTRICT_DATA.architectureSites);
  const architecture = kit.finalize();
  return { kit, ordinary, landmarks, architecture };
}

describe('architecture factories', () => {
  it('constructs the complete ordered district and landmark runtime from one shared kit', () => {
    const resources = new ResourceRegistry();
    const group = 'architecture-unit';

    const { kit, ordinary, landmarks, architecture } = buildArchitecture(resources, group);

    expect(ordinary.subjects).toHaveLength(4);
    expect(landmarks.subjects).toHaveLength(3);
    expect(architecture.subjects.map(({ subjectId }) => subjectId)).toEqual(SUBJECT_IDS);
    expect(architecture.subjects).toHaveLength(7);
    expect(architecture.labelsVisible).toBe(false);
    expect(architecture.root).toBe(kit.root);
    expect(architecture.root.name).toBe('architecture-root');
    expect(architecture.root.children.length).toBeGreaterThan(7);

    for (const subject of architecture.subjects) {
      expect(subject.componentCount).toBeGreaterThan(0);
      expect(subject.instanceCount).toBeGreaterThan(0);
      expect(subject.motifIds.length).toBeGreaterThan(0);
      expect(subject.siteBounds.maxX).toBeGreaterThan(subject.siteBounds.minX);
      expect(subject.siteBounds.maxZ).toBeGreaterThan(subject.siteBounds.minZ);
      expect(subject.visibleBounds.maxX).toBeGreaterThan(subject.visibleBounds.minX);
      expect(subject.visibleBounds.maxZ).toBeGreaterThan(subject.visibleBounds.minZ);
      expect(subject.collisionBounds.maxX).toBeGreaterThan(subject.collisionBounds.minX);
      expect(subject.collisionBounds.maxZ).toBeGreaterThan(subject.collisionBounds.minZ);

      const views = architecture.cameraViews[subject.subjectId];
      expect(Object.keys(views)).toEqual(VIEW_IDS);
      for (const viewId of VIEW_IDS) {
        const view = views[viewId];
        expect(view.ySemantics).toBe('site-ground-relative');
        expect(view.position).toHaveLength(3);
        expect(view.target).toHaveLength(3);
        expect(view.position.every(Number.isFinite)).toBe(true);
        expect(view.target.every(Number.isFinite)).toBe(true);
      }
    }

    expect(architecture.reuse.sharedGeometryCount).toBeGreaterThan(0);
    expect(architecture.reuse.sharedMaterialCount).toBeGreaterThan(0);
    expect(architecture.reuse.instanceBatchCount).toBeGreaterThan(0);
    expect(architecture.reuse.instanceCount).toBeGreaterThan(0);
    expect(architecture.reuse.estimatedInstancedDrawCalls).toBeGreaterThan(
      architecture.reuse.instanceBatchCount,
    );
    expect(architecture.reuse.estimatedInstancedDrawCalls).toBeLessThan(
      architecture.reuse.naiveRepeatedDrawCalls,
    );

    const childCount = architecture.root.children.length;
    const instanceBatchCount = architecture.root.children.filter(({ name }) =>
      name.startsWith('architecture:instances:'),
    ).length;
    expect(instanceBatchCount).toBe(architecture.reuse.instanceBatchCount);

    const finalizedAgain = kit.finalize();
    expect(finalizedAgain).toBe(architecture);
    expect(finalizedAgain.root).toBe(architecture.root);
    expect(finalizedAgain.root.children).toHaveLength(childCount);
    expect(finalizedAgain.root.children.filter(({ name }) =>
      name.startsWith('architecture:instances:'),
    )).toHaveLength(instanceBatchCount);

    const live = resources.getCounts();
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
  });

  it.each([
    {
      name: 'missing ordinary site',
      sites: DISTRICT_DATA.architectureSites.filter(({ id }) => id !== 'villa-east-neoclassical'),
      message: 'Villa district requires exactly 4 ordinary sites; received 3.',
    },
    {
      name: 'duplicate ordinary site',
      sites: [
        ...DISTRICT_DATA.architectureSites.filter(({ id }) => id !== 'villa-east-neoclassical'),
        DISTRICT_DATA.architectureSites[0],
      ] as readonly ArchitectureSite[],
      message: 'Duplicate ordinary villa site "villa-west-neoclassical".',
    },
  ])('rejects $name before finalization', ({ sites, message }) => {
    const resources = new ResourceRegistry();
    const group = 'architecture-invalid-input';
    const kit = createVillaKit(resources, group);

    expect(() => createVillaDistrict(kit, sites)).toThrow(message);

    const live = resources.getCounts();
    expect(live.resources).toBeGreaterThan(0);
    expect(resources.disposeGroup(group)).toBe(live.resources);
  });
  it('keeps the Huashi tower tangent to rather than embedded in the main mass', () => {
    const resources = new ResourceRegistry();
    const group = 'architecture-huashi-tangent';
    const { architecture } = buildArchitecture(resources, group);
    architecture.root.updateMatrixWorld(true);
    const tower = architecture.root.getObjectByName('architecture:huashi-inspired-landmark:compact-authored-tower-cue');
    const main = architecture.root.getObjectByName('architecture:huashi-inspired-landmark:sculptural-main-stone-mass');
    expect(tower).toBeDefined();
    expect(main).toBeDefined();
    const towerBounds = new Box3().setFromObject(tower!);
    const mainBounds = new Box3().setFromObject(main!);
    expect(towerBounds.max.x).toBeCloseTo(mainBounds.min.x, 5);
    resources.disposeGroup(group);
  });

});
