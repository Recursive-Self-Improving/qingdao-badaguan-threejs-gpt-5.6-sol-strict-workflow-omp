import type { InputClearReason, MovementAction, MovementAxes, MovementInputSource } from './types';

const FORWARD_W = 1 << 0;
const FORWARD_ARROW = 1 << 1;
const BACKWARD_S = 1 << 2;
const BACKWARD_ARROW = 1 << 3;
const LEFT_A = 1 << 4;
const LEFT_ARROW = 1 << 5;
const RIGHT_D = 1 << 6;
const RIGHT_ARROW = 1 << 7;
const RESET_R = 1 << 8;

const FORWARD = FORWARD_W | FORWARD_ARROW;
const BACKWARD = BACKWARD_S | BACKWARD_ARROW;
const LEFT = LEFT_A | LEFT_ARROW;
const RIGHT = RIGHT_D | RIGHT_ARROW;
const DIAGONAL_SCALE = 1 / Math.SQRT2;

const EXTERNAL_BITS: Record<MovementAction, number> = {
  'move-forward': 1 << 0,
  'move-backward': 1 << 1,
  'move-left': 1 << 2,
  'move-right': 1 << 3,
};

interface KeyboardDocument {
  readonly hidden: boolean;
  readonly activeElement: EventTarget | null;
  readonly body: EventTarget | null;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface InputControllerOptions {
  readonly canvas: EventTarget;
  readonly keyboardTarget?: EventTarget;
  readonly lifecycleTarget?: EventTarget;
  readonly document?: KeyboardDocument;
  readonly onClear?: (reason: InputClearReason) => void;
  readonly onReset?: () => void;
}

interface KeyboardInputEvent extends Event {
  readonly code: string;
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
}

function isKeyboardInputEvent(event: Event): event is KeyboardInputEvent {
  return 'code' in event && typeof event.code === 'string'
    && 'key' in event && typeof event.key === 'string'
    && 'metaKey' in event && typeof event.metaKey === 'boolean'
    && 'ctrlKey' in event && typeof event.ctrlKey === 'boolean'
    && 'altKey' in event && typeof event.altKey === 'boolean';
}

function keyBit(event: KeyboardInputEvent): number {
  switch (event.code) {
    case 'KeyW': return FORWARD_W;
    case 'KeyS': return BACKWARD_S;
    case 'KeyA': return LEFT_A;
    case 'KeyD': return RIGHT_D;
    case 'KeyR': return RESET_R;
    default:
      switch (event.key) {
        case 'ArrowUp': return FORWARD_ARROW;
        case 'ArrowDown': return BACKWARD_ARROW;
        case 'ArrowLeft': return LEFT_ARROW;
        case 'ArrowRight': return RIGHT_ARROW;
        default: return 0;
      }
  }
}

export class InputController implements MovementInputSource {
  private readonly canvas: EventTarget;
  private readonly keyboardTarget: EventTarget;
  private readonly lifecycleTarget: EventTarget;
  private readonly documentRoot: KeyboardDocument;
  private readonly onClear: ((reason: InputClearReason) => void) | undefined;
  private readonly onReset: (() => void) | undefined;
  private keyboardHeld = 0;
  private externalHeld = 0;
  private resetLatched = false;
  private intentionalFocus = true;
  private enabled = false;
  private started = false;
  private disposed = false;

  private readonly onKeyDown = (event: Event): void => {
    if (!isKeyboardInputEvent(event) || !this.enabled || !this.acceptsKeyboardEvent(event)) return;
    const bit = keyBit(event);
    if (bit === 0 || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    if (bit === RESET_R && (this.keyboardHeld & RESET_R) === 0) {
      this.resetLatched = true;
      this.onReset?.();
    }
    this.keyboardHeld |= bit;
  };

  private readonly onKeyUp = (event: Event): void => {
    if (!isKeyboardInputEvent(event)) return;
    const bit = keyBit(event);
    if (bit !== 0) this.keyboardHeld &= ~bit;
  };

  private readonly onBlur = (): void => this.clear('blur');
  private readonly onFocus = (): void => this.clear('focus');
  private readonly onOrientationChange = (): void => this.clear('orientation');
  private readonly onVisibilityChange = (): void => {
    if (this.documentRoot.hidden) this.clear('hidden');
  };
  private readonly onFocusIn = (event: Event): void => {
    if (!this.enabled) return;
    const focused = event.target ?? this.documentRoot.activeElement;
    if (focused !== this.documentRoot.body && focused !== this.canvas) this.clear('focus');
  };

  constructor(options: InputControllerOptions) {
    this.canvas = options.canvas;
    this.keyboardTarget = options.keyboardTarget ?? window;
    this.lifecycleTarget = options.lifecycleTarget ?? window;
    this.documentRoot = options.document ?? document;
    this.onClear = options.onClear;
    this.onReset = options.onReset;
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.keyboardTarget.addEventListener('keydown', this.onKeyDown);
    this.keyboardTarget.addEventListener('keyup', this.onKeyUp);
    this.lifecycleTarget.addEventListener('blur', this.onBlur);
    this.lifecycleTarget.addEventListener('focus', this.onFocus);
    this.lifecycleTarget.addEventListener('orientationchange', this.onOrientationChange);
    this.documentRoot.addEventListener('visibilitychange', this.onVisibilityChange);
    this.documentRoot.addEventListener('focusin', this.onFocusIn);
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) this.clear('disabled');
  }

  setIntentionalFocus(active: boolean): void {
    if (this.disposed || active === this.intentionalFocus) return;
    this.intentionalFocus = active;
    if (!active) this.clear('focus');
  }

  setAction(action: MovementAction, pressed: boolean): void {
    if (this.disposed) return;
    const bit = EXTERNAL_BITS[action];
    if (pressed && this.enabled) this.externalHeld |= bit;
    else this.externalHeld &= ~bit;
  }

  readMovement(target: MovementAxes): MovementAxes {
    const forward = Number((this.keyboardHeld & FORWARD) !== 0 || (this.externalHeld & EXTERNAL_BITS['move-forward']) !== 0)
      - Number((this.keyboardHeld & BACKWARD) !== 0 || (this.externalHeld & EXTERNAL_BITS['move-backward']) !== 0);
    const right = Number((this.keyboardHeld & RIGHT) !== 0 || (this.externalHeld & EXTERNAL_BITS['move-right']) !== 0)
      - Number((this.keyboardHeld & LEFT) !== 0 || (this.externalHeld & EXTERNAL_BITS['move-left']) !== 0);
    if (forward !== 0 && right !== 0) {
      target.forward = forward * DIAGONAL_SCALE;
      target.right = right * DIAGONAL_SCALE;
    } else {
      target.forward = forward;
      target.right = right;
    }
    return target;
  }

  consumeReset(): boolean {
    const reset = this.resetLatched;
    this.resetLatched = false;
    return reset;
  }

  clear(reason: InputClearReason): void {
    this.keyboardHeld = 0;
    this.externalHeld = 0;
    this.resetLatched = false;
    this.onClear?.(reason);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    if (this.started) {
      this.keyboardTarget.removeEventListener('keydown', this.onKeyDown);
      this.keyboardTarget.removeEventListener('keyup', this.onKeyUp);
      this.lifecycleTarget.removeEventListener('blur', this.onBlur);
      this.lifecycleTarget.removeEventListener('focus', this.onFocus);
      this.lifecycleTarget.removeEventListener('orientationchange', this.onOrientationChange);
      this.documentRoot.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.documentRoot.removeEventListener('focusin', this.onFocusIn);
    }
    this.clear('dispose');
  }

  private acceptsKeyboardEvent(event: KeyboardInputEvent): boolean {
    const active = this.documentRoot.activeElement;
    if (!this.intentionalFocus) return false;
    if (active !== null && active !== this.documentRoot.body && active !== this.canvas) return false;
    const target = event.target;
    return target === null
      || target === this.keyboardTarget
      || target === this.documentRoot.body
      || target === this.canvas;
  }
}
