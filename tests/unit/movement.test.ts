import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { APP_CONFIG } from '../../src/app/config';
import { MovementController } from '../../src/exploration/MovementController';
import { DEFAULT_CAMERA_RADIUS, resolveNavigation, sampleGroundHeight } from '../../src/exploration/navigation';
import type { ExplorationNavigation, InputClearReason, MovementAxes, MovementInputSource } from '../../src/exploration/types';
import { DISTRICT_DATA } from '../../src/world/districtData';

class InputDouble implements MovementInputSource {
  readonly axes: MovementAxes = { forward: 0, right: 0 };
  resetPending = false;

  readMovement(target: MovementAxes): MovementAxes {
    target.forward = this.axes.forward;
    target.right = this.axes.right;
    return target;
  }

  consumeReset(): boolean {
    const pending = this.resetPending;
    this.resetPending = false;
    return pending;
  }

  clear(_reason: InputClearReason): void {}
}

const realNavigation: ExplorationNavigation = {
  resolve: resolveNavigation,
  sampleGroundHeight,
  bounds: DISTRICT_DATA.navigableBounds,
  spawn: DISTRICT_DATA.spawn,
  reset: DISTRICT_DATA.reset,
};

function createController(options: {
  readonly input?: InputDouble;
  readonly navigation?: ExplorationNavigation;
  readonly yaw?: number;
} = {}): { controller: MovementController; camera: PerspectiveCamera; input: InputDouble } {
  const camera = new PerspectiveCamera();
  camera.position.set(DISTRICT_DATA.spawn.x, APP_CONFIG.camera.eyeHeight, DISTRICT_DATA.spawn.z);
  camera.rotation.set(0, options.yaw ?? DISTRICT_DATA.spawnYaw, 0, 'YXZ');
  const input = options.input ?? new InputDouble();
  const controller = new MovementController({
    camera,
    input,
    navigation: options.navigation ?? realNavigation,
    spawnPose: { position: DISTRICT_DATA.spawn, yaw: options.yaw ?? DISTRICT_DATA.spawnYaw },
    resetPose: { position: DISTRICT_DATA.reset, yaw: DISTRICT_DATA.resetYaw },
    eyeHeight: APP_CONFIG.camera.eyeHeight,
    walkSpeed: APP_CONFIG.controls.walkSpeed,
    cameraRadius: DEFAULT_CAMERA_RADIUS,
    maxPitchRadians: APP_CONFIG.controls.maxPitchRadians,
    maxDeltaSeconds: APP_CONFIG.controls.maxDeltaSeconds,
  });
  controller.setActive(true);
  controller.update(0);
  return { controller, camera, input };
}

function travelAtRate(rate: number): number {
  const { controller, camera, input } = createController({ yaw: 0 });
  input.axes.forward = 1;
  for (let frame = 0; frame < rate; frame += 1) controller.update(1 / rate);
  return DISTRICT_DATA.spawn.z - camera.position.z;
}

describe('MovementController', () => {
  it('integrates 3.2 m/s equivalently at 30, 60, and 120 Hz', () => {
    const distances = [30, 60, 120].map(travelAtRate);
    for (const distance of distances) expect(distance).toBeCloseTo(3.2, 10);
    expect(distances[0]).toBeCloseTo(distances[1]!, 12);
    expect(distances[1]).toBeCloseTo(distances[2]!, 12);
  });

  it('preserves speed for normalized diagonals and rotates local axes by yaw', () => {
    const diagonal = createController({ yaw: 0 });
    diagonal.input.axes.forward = 1 / Math.SQRT2;
    diagonal.input.axes.right = 1 / Math.SQRT2;
    for (let frame = 0; frame < 60; frame += 1) diagonal.controller.update(1 / 60);
    expect(Math.hypot(
      diagonal.camera.position.x - DISTRICT_DATA.spawn.x,
      diagonal.camera.position.z - DISTRICT_DATA.spawn.z,
    )).toBeCloseTo(3.2, 10);

    const turned = createController({ yaw: Math.PI / 2 });
    turned.input.axes.forward = 1;
    turned.controller.update(1);
    expect(turned.camera.position.x).toBeCloseTo(DISTRICT_DATA.spawn.x - 0.32, 10);
    expect(turned.camera.position.z).toBeCloseTo(DISTRICT_DATA.spawn.z, 10);
  });

  it('accumulates continuous yaw, clamps pitch to ±85 degrees, and holds roll at zero', () => {
    const { controller, camera } = createController({ yaw: 0 });
    controller.applyLook({ yaw: Math.PI * 3, pitch: Math.PI });
    expect(camera.rotation.y).toBeCloseTo(Math.PI * 3, 12);
    expect(camera.rotation.x).toBeCloseTo(APP_CONFIG.controls.maxPitchRadians, 12);
    expect(camera.rotation.z).toBe(0);
    expect(camera.rotation.order).toBe('YXZ');
    controller.applyLook({ yaw: Math.PI * 2, pitch: -Math.PI * 2 });
    expect(camera.rotation.y).toBeCloseTo(Math.PI * 5, 12);
    expect(camera.rotation.x).toBeCloseTo(-APP_CONFIG.controls.maxPitchRadians, 12);
    expect(camera.rotation.z).toBe(0);
  });

  it('rejects invalid deltas, caps oversized frames, and guards interruption resumes', () => {
    const { controller, camera, input } = createController({ yaw: 0 });
    input.axes.forward = 1;
    const start = camera.position.z;
    for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) controller.update(delta);
    expect(camera.position.z).toBe(start);
    controller.update(10);
    expect(start - camera.position.z).toBeCloseTo(0.32, 12);
    controller.invalidateResumeDelta();
    controller.update(10);
    expect(start - camera.position.z).toBeCloseTo(0.32, 12);
    controller.update(1 / 60);
    expect(start - camera.position.z).toBeCloseTo(0.32 + 3.2 / 60, 12);
    controller.setActive(false);
    controller.setActive(true);
    controller.update(1);
    expect(start - camera.position.z).toBeCloseTo(0.32 + 3.2 / 60, 12);
  });

  it('passes every move through navigation and applies resolved slide/ground output', () => {
    const input = new InputDouble();
    const resolve = vi.fn<ExplorationNavigation['resolve']>(() => ({
      position: { x: 7, z: -8 },
      groundHeight: 4.25,
      collided: true,
      clamped: false,
      reset: false,
    }));
    const navigation: ExplorationNavigation = {
      ...realNavigation,
      resolve,
    };
    const { controller, camera } = createController({ input, navigation, yaw: 0 });
    input.axes.forward = 1;
    controller.update(0.5);
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve.mock.calls[0]?.[2]).toEqual({ radius: DEFAULT_CAMERA_RADIUS });
    expect(camera.position.toArray()).toEqual([7, 4.25 + APP_CONFIG.camera.eyeHeight, -8]);
  });

  it('resets as a safe teleport with authored yaw and clears the following delta', () => {
    const input = new InputDouble();
    const resolve = vi.fn(resolveNavigation);
    const { controller, camera } = createController({ input, navigation: { ...realNavigation, resolve }, yaw: 0 });
    input.axes.forward = 1;
    input.resetPending = true;
    controller.update(1 / 60);
    expect(resolve).toHaveBeenLastCalledWith(DISTRICT_DATA.reset, DISTRICT_DATA.reset, { radius: DEFAULT_CAMERA_RADIUS });
    expect(camera.position.x).toBe(DISTRICT_DATA.reset.x);
    expect(camera.position.z).toBe(DISTRICT_DATA.reset.z);
    expect(camera.position.y).toBeCloseTo(sampleGroundHeight(DISTRICT_DATA.reset.x, DISTRICT_DATA.reset.z) + APP_CONFIG.camera.eyeHeight, 12);
    expect(camera.rotation.y).toBe(DISTRICT_DATA.resetYaw);
    expect(camera.rotation.x).toBe(0);
    expect(camera.rotation.z).toBe(0);
    controller.update(1);
    expect(camera.position.z).toBe(DISTRICT_DATA.reset.z);
  });

  it('fails closed to reset for non-finite camera state and stays safe around real bounds and collisions', () => {
    const { controller, camera, input } = createController({ yaw: 0 });
    input.axes.forward = 1;
    camera.position.x = Number.NaN;
    controller.update(1 / 60);
    expect(camera.position.x).toBe(DISTRICT_DATA.reset.x);
    expect(camera.position.z).toBe(DISTRICT_DATA.reset.z);

    const edge = DISTRICT_DATA.navigableBounds.minZ + DEFAULT_CAMERA_RADIUS;
    camera.position.set(0, camera.position.y, edge + 0.01);
    controller.applyLook({ yaw: 0, pitch: 0 });
    controller.invalidateResumeDelta();
    controller.update(0.1);
    controller.update(0.1);
    expect(camera.position.z).toBeGreaterThanOrEqual(edge);
    expect(Number.isFinite(camera.position.y)).toBe(true);
  });

  it('restores a finite grounded YXZ pose and rejects invalid recovery data', () => {
    const { controller, camera, input } = createController({ yaw: 0 });
    controller.restorePose({ x: 18, y: 999, z: -28, yaw: 1.25, pitch: Math.PI });
    expect(camera.position.x).toBeCloseTo(18, 6);
    expect(camera.position.z).toBeCloseTo(-28, 6);
    expect(camera.position.y).toBeCloseTo(realNavigation.sampleGroundHeight(camera.position.x, camera.position.z) + APP_CONFIG.camera.eyeHeight, 6);
    expect(camera.rotation.y).toBeCloseTo(1.25, 6);
    expect(camera.rotation.x).toBeCloseTo(APP_CONFIG.controls.maxPitchRadians, 6);
    expect(camera.rotation.z).toBe(0);
    expect(camera.rotation.order).toBe('YXZ');
    input.axes.forward = 1;
    const restoredZ = camera.position.z;
    controller.update(1);
    expect(camera.position.z).toBe(restoredZ);
    expect(() => controller.restorePose({ x: Number.NaN, y: 0, z: 0, yaw: 0, pitch: 0 })).toThrow(/finite/i);
  });
});
