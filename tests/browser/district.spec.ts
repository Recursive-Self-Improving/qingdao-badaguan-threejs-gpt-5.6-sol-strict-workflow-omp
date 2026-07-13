import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { ThreeRuntimeMetrics } from '../../src/render/ThreeRuntime';
import type { Vec2 } from '../../src/world/types';

const SUPPORTED_URL = '/?capability=supported';
const METRICS_ATTRIBUTE = 'data-three-runtime-metrics';
const EYE_HEIGHT = 1.68;

const ROAD_NAMES = [
  'Shaoguan Road',
  'Ningwuguan Road',
  'Zijingguan Road',
  'Zhengyangguan Road',
  'Jiayuguan Road',
  'Juyongguan Road',
  'Linhuaiguan Road',
  'Wushengguan Road',
  'Hangu Pass Road',
  'Shanhaiguan Road',
] as const;

type ProbeMetrics = NonNullable<ThreeRuntimeMetrics['world']['debug']['lastProbe']>;

type WorldCommand =
  | { action: 'world-debug/set-visible'; visible: boolean }
  | { action: 'world-debug/visit-anchor'; anchorId: string }
  | { action: 'world-debug/probe'; x: number; z: number; radius?: number }
  | { action: 'world-debug/frame-view'; name: 'grid' | 'public-green' | 'sightlines' };

async function metrics(page: Page): Promise<ThreeRuntimeMetrics> {
  return page.locator('#app-canvas').evaluate((canvas, attribute) => {
    const value = canvas.getAttribute(attribute);
    if (value === null) throw new Error(`Missing ${attribute}`);
    return JSON.parse(value) as ThreeRuntimeMetrics;
  }, METRICS_ATTRIBUTE);
}

async function boot(page: Page): Promise<ThreeRuntimeMetrics> {
  await page.goto(SUPPORTED_URL);
  await expect(page.locator('#app-canvas')).toHaveAttribute(METRICS_ATTRIBUTE, /"world"/);
  await expect.poll(async () => (await metrics(page)).runtime.renders).toBeGreaterThan(0);
  return metrics(page);
}
async function enterExploring(page: Page): Promise<void> {
  await page.getByTestId('start-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');
}

async function dispatchCommand(
  page: Page,
  detail: WorldCommand,
): Promise<ThreeRuntimeMetrics> {
  return page.evaluate(({ attribute, payload }) => {
    const canvas = document.querySelector('#app-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #app-canvas');

    document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: payload }));

    const value = canvas.getAttribute(attribute);
    if (value === null) throw new Error(`Missing ${attribute}`);
    return JSON.parse(value) as ThreeRuntimeMetrics;
  }, { attribute: METRICS_ATTRIBUTE, payload: detail });
}

async function setDebugVisible(page: Page, visible: boolean): Promise<void> {
  const previous = (await metrics(page)).world.debug.visible;
  expect(previous).not.toBe(visible);
  const current = await dispatchCommand(page, { action: 'world-debug/set-visible', visible });
  expect(current.world.debug.visible).toBe(visible);
}

async function visitAnchor(page: Page, anchorId: string): Promise<ThreeRuntimeMetrics> {
  const before = await metrics(page);
  const visited = await dispatchCommand(page, { action: 'world-debug/visit-anchor', anchorId });
  expect(visited.world.debug.currentAnchorId).toBe(anchorId);
  expect({
    currentAnchorId: visited.world.debug.currentAnchorId,
    position: visited.camera.position,
  }).not.toEqual({
    currentAnchorId: before.world.debug.currentAnchorId,
    position: before.camera.position,
  });

  const [x, , z] = visited.camera.position;
  const lastProbe = await probe(page, { x, z });
  expect(visited.camera.position[1]).toBeCloseTo(lastProbe.groundHeight + EYE_HEIGHT, 5);
  expect(visited.camera.up).toEqual([0, 1, 0]);
  expect(visited.camera.roll).toBeCloseTo(0, 7);
  return visited;
}

async function probe(page: Page, requested: Vec2): Promise<ProbeMetrics> {
  const previous = (await metrics(page)).world.debug.lastProbe;
  const current = (await dispatchCommand(page, {
    action: 'world-debug/probe',
    ...requested,
  })).world.debug.lastProbe;
  expect(current).not.toBeNull();
  expect(current).not.toEqual(previous);
  expect(current?.requested).toEqual(requested);
  return current as ProbeMetrics;
}

async function probeFromReset(
  page: Page,
  requested: Vec2,
): Promise<ProbeMetrics> {
  await visitAnchor(page, 'reset');
  return probe(page, requested);
}

async function frameView(
  page: Page,
  name: 'grid' | 'public-green' | 'sightlines',
): Promise<void> {
  const before = await metrics(page);
  expect(before.world.debug.activeView).not.toBe(name);
  const current = await dispatchCommand(page, { action: 'world-debug/frame-view', name });
  expect(current.world.debug.activeView).toBe(name);
  expect(current.runtime.renders).toBeGreaterThan(before.runtime.renders);
  expect(current.world.debug.visible).toBe(true);
}

async function evidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.locator('#app-canvas').screenshot({
    path: `test-results/c04/${testInfo.project.name}-${name}.png`,
    animations: 'disabled',
  });
}

test('publishes the exact 7 by 3 road grid and starts with debug hidden', async ({ page }, testInfo) => {
  const value = await boot(page);

  expect(value.world.roads).toMatchObject({
    count: 10,
    transverseCount: 7,
    longitudinalCount: 3,
    names: [...ROAD_NAMES],
  });
  expect(new Set(value.world.roads.names).size).toBe(10);
  expect(value.world.roads.centerlines.filter(({ via }) => via.length > 0).map(({ id, via }) => ({ id, via }))).toEqual([
    { id: 'ningwuguan', via: [{ x: -70, z: -212 }, { x: 70, z: -218 }] },
    { id: 'zhengyangguan', via: [{ x: -60, z: -129 }, { x: 70, z: -122 }] },
    { id: 'juyongguan', via: [{ x: -80, z: -32 }, { x: 80, z: -38 }] },
    { id: 'wushengguan', via: [{ x: -117, z: -70 }, { x: -123, z: -180 }] },
    { id: 'shanhaiguan', via: [{ x: 124, z: -80 }, { x: 117, z: -200 }] },
  ]);
  for (const road of value.world.roads.centerlines) {
    expect(road.from).toEqual(road.orientation === 'east-west'
      ? { x: -200, z: road.from.z }
      : { x: road.from.x, z: 38 });
    expect(road.to).toEqual(road.orientation === 'east-west'
      ? { x: 200, z: road.to.z }
      : { x: road.to.x, z: -290 });
    for (const point of road.via) {
      const turnOffset = road.orientation === 'east-west'
        ? Math.abs(point.z - road.from.z)
        : Math.abs(point.x - road.from.x);
      expect(turnOffset).toBeGreaterThan(0);
      expect(turnOffset).toBeLessThanOrEqual(4);
    }
  }
  expect(value.world.parcels).toMatchObject([
    {
      id: 'west-garden-parcel',
      bounds: { minX: -190, maxX: -135, minZ: -201, maxZ: -184 },
      setback: 5,
      gates: [{ id: 'west-garden-gate', position: { x: -162, z: -201 }, width: 4, facesRoadId: 'ningwuguan' }],
    },
    {
      id: 'central-garden-parcel',
      bounds: { minX: 18, maxX: 92, minZ: -111, maxZ: -94 },
      setback: 5,
      gates: [{ id: 'central-garden-gate', position: { x: 55, z: -111 }, width: 5, facesRoadId: 'zhengyangguan' }],
    },
    {
      id: 'east-garden-parcel',
      bounds: { minX: 135, maxX: 190, minZ: -201, maxZ: -184 },
      setback: 5,
      gates: [{ id: 'east-garden-gate', position: { x: 162, z: -201 }, width: 4, facesRoadId: 'ningwuguan' }],
    },
  ]);
  for (const parcel of value.world.parcels) {
    expect(parcel.wallSegments).toHaveLength(4);
    for (const segment of parcel.wallSegments) {
      for (const point of [segment.from, segment.to]) {
        const onBoundary = point.x === parcel.bounds.minX || point.x === parcel.bounds.maxX ||
          point.z === parcel.bounds.minZ || point.z === parcel.bounds.maxZ;
        expect(onBoundary).toBe(true);
      }
    }
  }
  expect(value.world.coast).toEqual({
    edgeZ: 38,
    seaBounds: { minX: -210, maxX: 210, minZ: 38, maxZ: 60 },
    collidable: false,
    screen: {
      z: 36,
      height: 2.6,
      openings: [
        { id: 'wushengguan-coast-opening', minX: -127, maxX: -113, alignedRoadId: 'wushengguan' },
        { id: 'hangu-pass-coast-opening', minX: -7, maxX: 7, alignedRoadId: 'hangu-pass' },
        { id: 'shanhaiguan-coast-opening', minX: 113, maxX: 127, alignedRoadId: 'shanhaiguan' },
      ],
    },
  });
  expect(value.world.coast.screen.height).toBeGreaterThan(EYE_HEIGHT);
  expect(value.world.coast.screen.openings).toHaveLength(3);
  expect(value.world.bounds).toEqual({
    world: { minX: -210, maxX: 210, minZ: -300, maxZ: 60 },
    navigable: { minX: -200, maxX: 200, minZ: -290, maxZ: 38 },
  });
  expect(value.world.grade.spawnHeight).toBeCloseTo(0, 7);
  expect(value.world.grade.northHeight).toBeGreaterThan(value.world.grade.spawnHeight);
  expect(value.world.grade.spawnHeight).toBeGreaterThan(value.world.grade.southHeight);
  expect(value.world.spawn).toMatchObject({ x: 0, z: 5, groundHeight: 0 });
  expect(value.world.reset).toMatchObject({ x: 0, z: 5, groundHeight: 0 });
  expect(value.world.spawn.yaw).toBeCloseTo(-Math.PI / 8, 7);
  expect(value.world.reset.yaw).toBeCloseTo(-Math.PI / 8, 7);
  expect(value.world.debug.visible).toBe(false);
  expect(value.world.debug.currentAnchorId).toBeNull();
  expect(value.world.debug.lastProbe).toBeNull();
  expect(value.world.debug.activeView).toBeNull();

  await enterExploring(page);
  await setDebugVisible(page, true);
  const visible = await metrics(page);
  expect(visible.world.debug.roadLabelCount).toBe(10);
  expect(visible.world.debug.sightlineCount).toBe(3);
  expect(visible.world.debug.publicGreenVisible).toBe(true);
  expect(visible.world.publicGreen).toEqual({
    id: 'badaguan-public-green',
    name: 'Badaguan Public Green',
  });
  expect(visible.world.sightlines).toEqual(['uphill-axis', 'garden-view', 'coast-view']);
  await frameView(page, 'grid');
  await evidence(page, testInfo, 'grid');
});

test('visits the authored district route at eye height and captures green and sightlines', async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  const initial = await boot(page);
  expect(initial.world.route).toEqual([
    'spawn',
    'mixed-villa-intersection',
    'ginkgo-maple-corridor',
    'public-green-heart',
    'uphill-grid-vista',
    'princess-inspired-anchor',
    'butterfly-inspired-anchor',
    'northern-uphill-overlook',
    'zijingguan-return',
    'zhengyangguan-return',
    'jiayuguan-return',
    'juyongguan-return',
    'linhuaiguan-return',
    'shore-huashi-vista',
    'reset',
  ]);

  await enterExploring(page);
  await setDebugVisible(page, true);
  await visitAnchor(page, 'spawn');
  await visitAnchor(page, 'public-green-heart');
  await frameView(page, 'public-green');
  await evidence(page, testInfo, 'green');
  const uphill = await visitAnchor(page, 'northern-uphill-overlook');
  expect(uphill.camera.position[1]).toBeGreaterThan(initial.world.spawn.groundHeight + EYE_HEIGHT);
  await frameView(page, 'sightlines');
  await evidence(page, testInfo, 'sightlines');
  await visitAnchor(page, 'shore-huashi-vista');
  const reset = await visitAnchor(page, 'reset');
  expect(reset.camera.position[0]).toBeCloseTo(initial.world.reset.x, 7);
  expect(reset.camera.position[2]).toBeCloseTo(initial.world.reset.z, 7);
  expect(reset.camera.position[1]).toBeCloseTo(initial.world.reset.groundHeight + EYE_HEIGHT, 7);
});

test('clamps every boundary, slides collisions, preserves coast access, and samples uphill intersections', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page);

  for (const [requested, axis, edge] of [
    [{ x: -500, z: 5 }, 'x', -200],
    [{ x: 500, z: 5 }, 'x', 200],
    [{ x: 0, z: -500 }, 'z', -290],
    [{ x: 0, z: 500 }, 'z', 38],
  ] as const) {
    const result = await probeFromReset(page, requested);
    expect(result.clamped, `${axis}=${edge} request must clamp`).toBe(true);
    expect(Math.abs(result.position[axis] - edge)).toBeLessThan(1);
    expect(result.position.x).toBeGreaterThanOrEqual(-200);
    expect(result.position.x).toBeLessThanOrEqual(200);
    expect(result.position.z).toBeGreaterThanOrEqual(-290);
    expect(result.position.z).toBeLessThanOrEqual(38);
  }

  await visitAnchor(page, 'zhengyangguan-return');
  const formerlyBlockedRoad = await probe(page, { x: 50, z: -125 });
  expect(formerlyBlockedRoad.collided).toBe(false);
  expect(formerlyBlockedRoad.position).toEqual({ x: 50, z: -125 });

  await visitAnchor(page, 'zhengyangguan-return');
  const collision = await probe(page, { x: 37, z: -102.5 });
  expect(collision.collided).toBe(true);
  expect(collision.position).not.toEqual({ x: 37, z: -102.5 });
  expect(collision.position.x).toBe(37);
  expect(collision.position.z).toBe(-125);
  const insideCentralWestFootprint = collision.position.x > 24 && collision.position.x < 50
    && collision.position.z > -105 && collision.position.z < -100;
  expect(insideCentralWestFootprint).toBe(false);

  const coast = await probeFromReset(page, { x: 0, z: 37 });
  expect(coast.collided).toBe(false);
  expect(coast.clamped).toBe(false);
  expect(coast.position).toEqual({ x: 0, z: 37 });

  const heights: number[] = [];
  for (const z of [10, -35, -80, -125, -170, -215, -260]) {
    const intersection = await probeFromReset(page, { x: 0, z });
    expect(intersection.collided).toBe(false);
    expect(intersection.clamped).toBe(false);
    heights.push(intersection.groundHeight);
  }
  for (let index = 1; index < heights.length; index += 1) {
    expect(heights[index]).toBeGreaterThan(heights[index - 1] as number);
  }
});
