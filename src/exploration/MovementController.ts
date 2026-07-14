import type { PerspectiveCamera } from 'three';

import { DEFAULT_CAMERA_RADIUS } from './navigation';
import type {
  ExplorationNavigation,
  ExplorationPose,
  LookDelta,
  MovementAxes,
  MovementInputSource,
} from './types';

export interface MovementControllerOptions {
  readonly camera: PerspectiveCamera;
  readonly input: MovementInputSource;
  readonly navigation: ExplorationNavigation;
  readonly spawnPose: ExplorationPose;
  readonly resetPose: ExplorationPose;
  readonly eyeHeight: number;
  readonly walkSpeed: number;
  readonly cameraRadius?: number;
  readonly maxPitchRadians: number;
  readonly maxDeltaSeconds: number;
}

export interface MovementPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
}

export class MovementController {
  private readonly camera: PerspectiveCamera;
  private readonly input: MovementInputSource;
  private readonly navigation: ExplorationNavigation;
  private readonly resetPose: ExplorationPose;
  private readonly eyeHeight: number;
  private readonly walkSpeed: number;
  private readonly cameraRadius: number;
  private readonly maxPitch: number;
  private readonly maxDelta: number;
  private readonly axes: MovementAxes = { forward: 0, right: 0 };
  private readonly requested = { x: 0, z: 0 };
  private readonly previous = { x: 0, z: 0 };
  private active = false;
  private discardNextDelta = true;
  private yaw: number;
  private pitch: number;

  constructor(options: MovementControllerOptions) {
    const positiveValues = [options.eyeHeight, options.walkSpeed, options.maxPitchRadians, options.maxDeltaSeconds];
    if (!positiveValues.every((value) => Number.isFinite(value) && value > 0)) {
      throw new RangeError('Movement dimensions, speed, pitch, and delta limits must be finite positive numbers.');
    }
    const cameraRadius = options.cameraRadius ?? DEFAULT_CAMERA_RADIUS;
    if (!Number.isFinite(cameraRadius) || cameraRadius < 0) {
      throw new RangeError('Movement camera radius must be a finite non-negative number.');
    }
    this.camera = options.camera;
    this.input = options.input;
    this.navigation = options.navigation;
    this.resetPose = options.resetPose;
    this.eyeHeight = options.eyeHeight;
    this.walkSpeed = options.walkSpeed;
    this.cameraRadius = cameraRadius;
    this.maxPitch = options.maxPitchRadians;
    this.maxDelta = options.maxDeltaSeconds;

    const cameraPoseFinite = Number.isFinite(this.camera.position.x)
      && Number.isFinite(this.camera.position.z)
      && Number.isFinite(this.camera.rotation.x)
      && Number.isFinite(this.camera.rotation.y);
    this.yaw = cameraPoseFinite ? this.camera.rotation.y : options.spawnPose.yaw;
    this.pitch = cameraPoseFinite ? this.camera.rotation.x : (options.spawnPose.pitch ?? 0);
    if (!cameraPoseFinite) {
      const spawn = this.navigation.resolve(options.spawnPose.position, options.spawnPose.position, { radius: this.cameraRadius });
      this.camera.position.set(spawn.position.x, spawn.groundHeight + this.eyeHeight, spawn.position.z);
    }
    this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch));
    this.applyRotation();
  }

  get pose(): MovementPose {
    return Object.freeze({
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
    });
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.discardNextDelta = true;
  }

  invalidateResumeDelta(): void {
    this.discardNextDelta = true;
  }

  applyLook(delta: LookDelta): void {
    if (!this.active || !Number.isFinite(delta.yaw) || !Number.isFinite(delta.pitch)) return;
    this.yaw += delta.yaw;
    this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch + delta.pitch));
    if (!Number.isFinite(this.yaw) || !Number.isFinite(this.pitch)) {
      this.reset();
      return;
    }
    this.applyRotation();
  }

  update(deltaSeconds: number): void {
    if (!this.active) return;
    if (this.input.consumeReset()) {
      this.reset();
      return;
    }
    if (this.discardNextDelta) {
      this.discardNextDelta = false;
      return;
    }
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (!this.currentPoseFinite()) {
      this.reset();
      return;
    }

    this.input.readMovement(this.axes);
    if (!Number.isFinite(this.axes.forward) || !Number.isFinite(this.axes.right)) {
      this.reset();
      return;
    }
    if (this.axes.forward === 0 && this.axes.right === 0) return;

    const distance = this.walkSpeed * Math.min(deltaSeconds, this.maxDelta);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    this.requested.x = this.camera.position.x
      + (this.axes.right * cosYaw - this.axes.forward * sinYaw) * distance;
    this.requested.z = this.camera.position.z
      + (-this.axes.right * sinYaw - this.axes.forward * cosYaw) * distance;
    this.previous.x = this.camera.position.x;
    this.previous.z = this.camera.position.z;
    const resolved = this.navigation.resolve(this.previous, this.requested, { radius: this.cameraRadius });
    if (!Number.isFinite(resolved.position.x)
      || !Number.isFinite(resolved.position.z)
      || !Number.isFinite(resolved.groundHeight)) {
      this.reset();
      return;
    }
    this.camera.position.set(
      resolved.position.x,
      resolved.groundHeight + this.eyeHeight,
      resolved.position.z,
    );
    this.applyRotation();
  }

  restorePose(pose: MovementPose): void {
    if (![pose.x, pose.z, pose.yaw, pose.pitch].every(Number.isFinite)) {
      throw new TypeError('Recovery pose must contain finite horizontal position and orientation.');
    }
    const requested = { x: pose.x, z: pose.z };
    const resolved = this.navigation.resolve(requested, requested, { radius: this.cameraRadius });
    if (!Number.isFinite(resolved.position.x) || !Number.isFinite(resolved.position.z) || !Number.isFinite(resolved.groundHeight)) {
      throw new Error('Recovery pose could not be resolved against navigation.');
    }
    this.yaw = pose.yaw;
    this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, pose.pitch));
    this.camera.position.set(resolved.position.x, resolved.groundHeight + this.eyeHeight, resolved.position.z);
    this.applyRotation();
    this.discardNextDelta = true;
  }
  reset(): void {
    const resolved = this.navigation.resolve(
      this.resetPose.position,
      this.resetPose.position,
      { radius: this.cameraRadius },
    );
    if (!Number.isFinite(resolved.position.x)
      || !Number.isFinite(resolved.position.z)
      || !Number.isFinite(resolved.groundHeight)
      || !Number.isFinite(this.resetPose.yaw)) {
      throw new Error('Authored exploration reset pose is invalid.');
    }
    this.yaw = this.resetPose.yaw;
    this.pitch = 0;
    this.camera.position.set(
      resolved.position.x,
      resolved.groundHeight + this.eyeHeight,
      resolved.position.z,
    );
    this.applyRotation();
    this.discardNextDelta = true;
  }

  private currentPoseFinite(): boolean {
    return Number.isFinite(this.camera.position.x)
      && Number.isFinite(this.camera.position.z)
      && Number.isFinite(this.yaw)
      && Number.isFinite(this.pitch);
  }

  private applyRotation(): void {
    this.camera.up.set(0, 1, 0);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
