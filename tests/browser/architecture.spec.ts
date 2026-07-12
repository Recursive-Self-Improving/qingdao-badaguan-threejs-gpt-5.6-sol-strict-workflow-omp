import { expect, test, type Page } from '@playwright/test';
import type { ThreeRuntimeMetrics } from '../../src/render/ThreeRuntime';
import {
  ARCHITECTURE_CAMERA_WORLD_POSES,
  ARCHITECTURE_EDGE_PROBES,
  ARCHITECTURE_SUBJECTS,
  ARCHITECTURE_VIEWS,
  ORDINARY_PARCEL_EDGE_CLEARANCES,
  ROUTE_VIEWPOINTS,
} from './fixtures';

const SUPPORTED_URL = '/?capability=supported';
const METRICS_ATTRIBUTE = 'data-three-runtime-metrics';

type ArchitectureMetrics = NonNullable<ThreeRuntimeMetrics['world']['architecture']>;
type RuntimeCommand =
  | { readonly action: 'architecture/frame'; readonly subjectId: string; readonly view: string }
  | { readonly action: 'world-debug/visit-anchor'; readonly anchorId: string }
  | { readonly action: 'world-debug/probe'; readonly x: number; readonly z: number; readonly from?: { readonly x: number; readonly z: number } }
  | { readonly action: 'rebuild' };

async function readMetrics(page: Page): Promise<ThreeRuntimeMetrics> {
  return page.locator('#app-canvas').evaluate((canvas, attribute) => {
    const serialized = canvas.getAttribute(attribute);
    if (serialized === null) throw new Error(`Missing ${attribute}`);
    return JSON.parse(serialized) as ThreeRuntimeMetrics;
  }, METRICS_ATTRIBUTE);
}

async function boot(page: Page): Promise<ThreeRuntimeMetrics> {
  await page.goto(SUPPORTED_URL);
  await expect(page.locator('#app-canvas')).toHaveAttribute(METRICS_ATTRIBUTE, /"architecture"/);
  await expect.poll(async () => (await readMetrics(page)).runtime.renders).toBeGreaterThan(0);
  return readMetrics(page);
}

async function command(page: Page, detail: RuntimeCommand): Promise<ThreeRuntimeMetrics> {
  return page.evaluate(({ attribute, payload }) => {
    const canvas = document.querySelector('#app-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #app-canvas');
    document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: payload }));
    const serialized = canvas.getAttribute(attribute);
    if (serialized === null) throw new Error(`Missing ${attribute}`);
    return JSON.parse(serialized) as ThreeRuntimeMetrics;
  }, { attribute: METRICS_ATTRIBUTE, payload: detail });
}

function architecture(value: ThreeRuntimeMetrics): ArchitectureMetrics {
  expect(value.world.architecture).toBeDefined();
  return value.world.architecture as ArchitectureMetrics;
}

function expectCameraAtLiteralPose(
  actual: ThreeRuntimeMetrics['camera']['position'],
  expected: readonly [number, number, number],
): void {
  expect(actual[0]).toBeCloseTo(expected[0], 6);
  expect(actual[1]).toBeCloseTo(expected[1], 6);
  expect(actual[2]).toBeCloseTo(expected[2], 6);
}

test('publishes seven literal architecture subjects, hidden labels, and reuse savings', async ({ page }) => {
  const value = architecture(await boot(page));
  expect(value.labelsVisible).toBe(false);
  expect(value.subjects).toHaveLength(7);
  expect(value.subjects.map(({ subjectId }) => subjectId)).toEqual(
    ARCHITECTURE_SUBJECTS.map(({ id }) => id),
  );

  for (const fixture of ARCHITECTURE_SUBJECTS) {
    const subject = value.subjects.find(({ subjectId }) => subjectId === fixture.id);
    expect(subject, fixture.id).toBeDefined();
    expect(subject).toMatchObject({
      subjectId: fixture.id,
      style: fixture.style,
      stories: fixture.stories,
      siteBounds: fixture.site,
      collisionBounds: fixture.site,
    });
    expect(subject?.visibleBounds.minX).toBeGreaterThanOrEqual(fixture.site.minX);
    expect(subject?.visibleBounds.maxX).toBeLessThanOrEqual(fixture.site.maxX);
    expect(subject?.visibleBounds.minZ).toBeGreaterThanOrEqual(fixture.site.minZ);
    expect(subject?.visibleBounds.maxZ).toBeLessThanOrEqual(fixture.site.maxZ);
    expect(subject?.motifIds.length).toBeGreaterThan(0);
    expect(subject?.componentCount).toBeGreaterThan(0);
    expect(subject?.instanceCount).toBeGreaterThan(0);
  }

  const ordinaryStyles = ARCHITECTURE_SUBJECTS
    .filter(({ kind }) => kind === 'ordinary')
    .map(({ style }) => style);
  expect(ordinaryStyles).toEqual(expect.arrayContaining(['german-neoclassical', 'spanish', 'gothic-castle']));
  expect(ARCHITECTURE_SUBJECTS.filter(({ kind }) => kind === 'ordinary').every(({ stories }) => stories <= 3)).toBe(true);
  expect(value.renderInfo.calls).toBeGreaterThan(0);
  expect(value.renderInfo.triangles).toBeGreaterThan(0);
  expect(value.reuse).toMatchObject({
    sharedGeometryCount: expect.any(Number),
    sharedMaterialCount: expect.any(Number),
    instanceBatchCount: expect.any(Number),
    instanceCount: expect.any(Number),
    estimatedInstancedDrawCalls: expect.any(Number),
    naiveRepeatedDrawCalls: expect.any(Number),
  });
  expect(value.reuse.sharedGeometryCount).toBeGreaterThan(0);
  expect(value.reuse.sharedMaterialCount).toBeGreaterThan(0);
  expect(value.reuse.instanceBatchCount).toBeGreaterThan(0);
  expect(value.reuse.instanceCount).toBeGreaterThan(0);
  expect(value.reuse.estimatedInstancedDrawCalls).toBeLessThan(value.reuse.naiveRepeatedDrawCalls);
});

test('frames every subject in every immutable architecture view', async ({ page }) => {
  test.setTimeout(60_000);
  await boot(page);
  for (const subject of ARCHITECTURE_SUBJECTS) {
    for (const view of ARCHITECTURE_VIEWS) {
      const before = await readMetrics(page);
      const after = await command(page, { action: 'architecture/frame', subjectId: subject.id, view });
      const frame = architecture(after).activeFrame;
      expect(frame).toMatchObject({ subjectId: subject.id, view });
      expect(frame?.rendererCalls).toBeGreaterThan(0);
      expect(frame?.rendererTriangles).toBeGreaterThan(0);
      expect(after.runtime.renders).toBeGreaterThan(before.runtime.renders);
      expect(after.camera.position).not.toEqual(before.camera.position);
      const expectedPose = ARCHITECTURE_CAMERA_WORLD_POSES[
        subject.id as keyof typeof ARCHITECTURE_CAMERA_WORLD_POSES
      ][view];
      expectCameraAtLiteralPose(after.camera.position, expectedPose);
      expect(after.world.debug.visible).toBe(false);
    }
  }
});

test('invalid architecture subjects and views are inert', async ({ page }) => {
  await boot(page);
  const valid = await command(page, {
    action: 'architecture/frame',
    subjectId: 'villa-west-neoclassical',
    view: 'front',
  });
  const baseline = architecture(valid).activeFrame;
  const baselineCamera = valid.camera;
  const invalidSubject = await command(page, {
    action: 'architecture/frame',
    subjectId: 'not-an-architecture-subject',
    view: 'front',
  });
  expect(architecture(invalidSubject).activeFrame).toEqual(baseline);
  expect(invalidSubject.camera).toEqual(baselineCamera);

  const invalidView = await command(page, {
    action: 'architecture/frame',
    subjectId: 'villa-west-neoclassical',
    view: 'overhead',
  });
  expect(architecture(invalidView).activeFrame).toEqual(baseline);
  expect(invalidView.camera).toEqual(baselineCamera);
});

test('keeps all four approaches to every architecture collision AABB active', async ({ page }) => {
  await boot(page);
  expect(ARCHITECTURE_EDGE_PROBES).toHaveLength(28);
  for (const edge of ARCHITECTURE_EDGE_PROBES) {
    const subject = ARCHITECTURE_SUBJECTS.find(({ id }) => id === edge.subjectId);
    expect(subject, edge.subjectId).toBeDefined();
    if (subject === undefined) continue;
    const approachMetrics = await command(page, {
      action: 'world-debug/probe',
      ...edge.approach,
      from: edge.approach,
    });
    expect(approachMetrics.world.debug.lastProbe, edge.subjectId).toMatchObject({
      requested: edge.approach,
      start: edge.approach,
      position: edge.approach,
      collided: false,
      clamped: false,
    });
    const value = await command(page, {
      action: 'world-debug/probe',
      ...edge.target,
      from: edge.approach,
    });
    const probe = value.world.debug.lastProbe;
    expect(probe?.requested, edge.subjectId).toEqual(edge.target);
    expect(probe?.start, edge.subjectId).toEqual(edge.approach);
    expect(probe?.collided, edge.subjectId).toBe(true);
    expect(probe?.position, edge.subjectId).not.toEqual(edge.target);
    const position = probe?.position;
    expect(position, edge.subjectId).toBeDefined();
    if (position !== undefined) {
      const inside = position.x >= subject.site.minX
        && position.x <= subject.site.maxX
        && position.z >= subject.site.minZ
        && position.z <= subject.site.maxZ;
      expect(inside, edge.subjectId).toBe(false);
    }
  }
});

test('traverses every ordinary parcel edge pair without unintended clipping', async ({ page }) => {
  await boot(page);
  expect(ORDINARY_PARCEL_EDGE_CLEARANCES).toHaveLength(12);
  for (const clearance of ORDINARY_PARCEL_EDGE_CLEARANCES) {
    const traversal = await command(page, {
      action: 'world-debug/probe',
      ...clearance.to,
      from: clearance.from,
    });
    expect(traversal.world.debug.lastProbe, clearance.parcelId).toMatchObject({
      requested: clearance.to,
      start: clearance.from,
      position: clearance.to,
      collided: false,
      clamped: false,
    });
  }
});

test('route frames retain named viewpoint provenance while using literal readable camera poses', async ({ page }) => {
  await boot(page);
  for (const viewpoint of ROUTE_VIEWPOINTS) {
    const value = await command(page, { action: 'world-debug/visit-anchor', anchorId: viewpoint.id });
    expect(value.world.debug.currentAnchorId).toBe(viewpoint.id);
    expect({ x: value.camera.position[0], z: value.camera.position[2] }).toEqual(viewpoint.position);
    for (const subject of ARCHITECTURE_SUBJECTS.filter(({ viewpointId }) => viewpointId === viewpoint.id)) {
      const center = {
        x: (subject.site.minX + subject.site.maxX) / 2,
        z: (subject.site.minZ + subject.site.maxZ) / 2,
      };
      expect(viewpoint.position).not.toEqual(center);
      const framedMetrics = await command(page, {
        action: 'architecture/frame',
        subjectId: subject.id,
        view: 'route',
      });
      expect(architecture(framedMetrics).activeFrame).toMatchObject({ subjectId: subject.id, view: 'route' });
      const expectedPose = ARCHITECTURE_CAMERA_WORLD_POSES[
        subject.id as keyof typeof ARCHITECTURE_CAMERA_WORLD_POSES
      ].route;
      expectCameraAtLiteralPose(framedMetrics.camera.position, expectedPose);
    }
  }
});

test('ten architecture rebuilds preserve resources, reuse, and a single live runtime', async ({ page }) => {
  const baseline = await boot(page);
  const baselineArchitecture = architecture(baseline);
  for (let cycle = 0; cycle < 10; cycle += 1) {
    await command(page, { action: 'rebuild' });
  }
  const after = await readMetrics(page);
  const afterArchitecture = architecture(after);
  expect(after.runtime.rebuilds - baseline.runtime.rebuilds).toBe(10);
  expect(after.runtime.created - after.runtime.disposed).toBe(1);
  expect(after.resources.resources).toBe(baseline.resources.resources);
  expect(after.resources.references).toBe(baseline.resources.references);
  expect(after.resources.groups).toBe(baseline.resources.groups);
  expect(after.resources.disposed - baseline.resources.disposed).toBe(
    baseline.resources.resources * 10,
  );
  expect(afterArchitecture.reuse).toEqual(baselineArchitecture.reuse);
  expect(afterArchitecture.subjects).toEqual(baselineArchitecture.subjects);
  expect(afterArchitecture.labelsVisible).toBe(false);
});
