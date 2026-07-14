import type { WorldBuildResult, Vec2 } from '../world/types';

export type InputAction =
  | 'move-forward'
  | 'move-backward'
  | 'move-left'
  | 'move-right'
  | 'reset';
export type MovementAction = Exclude<InputAction, 'reset'>;

export type InputClearReason =
  | 'disabled'
  | 'blur'
  | 'hidden'
  | 'focus'
  | 'orientation'
  | 'viewport'
  | 'lock-exit'
  | 'context-lost'
  | 'dispose';

export interface MovementAxes {
  forward: number;
  right: number;
}

export interface MovementInputSource {
  readMovement(target: MovementAxes): MovementAxes;
  consumeReset(): boolean;
  clear(reason: InputClearReason): void;
}

export interface LookDelta {
  readonly yaw: number;
  readonly pitch: number;
}

export interface ExplorationPose {
  readonly position: Vec2;
  readonly yaw: number;
  readonly pitch?: number;
}

export type ExplorationNavigation = Pick<
  WorldBuildResult['navigation'],
  'resolve' | 'sampleGroundHeight' | 'bounds' | 'spawn' | 'reset'
>;
