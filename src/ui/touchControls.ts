import type { MovementAction } from '../exploration/types';
import type { InteractionViewportMeasurement } from '../platform/viewport';

export interface TouchControlsOptions {
  readonly root: HTMLElement;
  readonly onAction: (action: MovementAction, pressed: boolean) => void;
}

export interface TouchControlsState { readonly visible: boolean; readonly enabled: boolean }

const BUTTONS = [
  ['move-forward', 'Move forward', '↑'],
  ['move-left', 'Move left', '←'],
  ['move-right', 'Move right', '→'],
  ['move-backward', 'Move backward', '↓'],
] as const;

export class TouchControls {
  readonly #root: HTMLElement;
  readonly #onAction: (action: MovementAction, pressed: boolean) => void;
  readonly #pointers = new Map<number, MovementAction>();
  readonly #counts = new Map<MovementAction, number>();
  readonly #keyboardHeld = new Set<MovementAction>();
  #enabled = false;

  constructor(options: TouchControlsOptions) {
    this.#root = options.root;
    this.#onAction = options.onAction;
    this.#root.id = 'app-touch-controls';
    this.#root.className = 'touch-controls';
    this.#root.dataset.testid = 'touch-controls';
    this.#root.setAttribute('role', 'group');
    this.#root.setAttribute('aria-label', 'Touch movement controls');
    this.#root.setAttribute('aria-describedby', 'touch-controls-instructions');
    const instructions = document.createElement('p');
    instructions.id = 'touch-controls-instructions';
    instructions.className = 'visually-hidden';
    instructions.textContent = 'Press and hold one or two direction buttons to move. Drag one finger on the scene to look. Two-finger pinch remains available for browser zoom.';
    this.#root.append(instructions);
    for (const [action, label, glyph] of BUTTONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'touch-control-button';
      button.dataset.inputAction = action;
      button.dataset.testid = `touch-${action}`;
      button.setAttribute('aria-label', label);
      const span = document.createElement('span');
      span.setAttribute('aria-hidden', 'true');
      span.textContent = glyph;
      button.append(span);
      this.#root.append(button);
    }
    this.#root.addEventListener('pointerdown', this.#pointerDown);
    this.#root.addEventListener('pointerup', this.#pointerEnd);
    this.#root.addEventListener('pointercancel', this.#pointerEnd);
    this.#root.addEventListener('lostpointercapture', this.#pointerEnd);
    this.#root.addEventListener('keydown', this.#keyDown);
    this.#root.addEventListener('keyup', this.#keyUp);
    this.#root.addEventListener('blur', this.#blur, true);
    this.#root.hidden = true;
  }

  sync(state: TouchControlsState): void {
    if (!state.visible || !state.enabled) this.clear();
    this.#enabled = state.enabled;
    this.#root.hidden = !state.visible;
    for (const button of this.#buttons()) button.disabled = !state.enabled;
  }

  setViewport(measurement: InteractionViewportMeasurement): void {
    this.#root.dataset.layout = measurement.orientation;
  }

  clear(): void {
    for (const action of this.#counts.keys()) this.#onAction(action, false);
    for (const action of this.#keyboardHeld) this.#onAction(action, false);
    this.#pointers.clear();
    this.#counts.clear();
    this.#keyboardHeld.clear();
    for (const button of this.#buttons()) delete button.dataset.active;
  }

  destroy(): void {
    this.clear();
    this.#root.removeEventListener('pointerdown', this.#pointerDown);
    this.#root.removeEventListener('pointerup', this.#pointerEnd);
    this.#root.removeEventListener('pointercancel', this.#pointerEnd);
    this.#root.removeEventListener('lostpointercapture', this.#pointerEnd);
    this.#root.removeEventListener('keydown', this.#keyDown);
    this.#root.removeEventListener('keyup', this.#keyUp);
    this.#root.removeEventListener('blur', this.#blur, true);
    this.#root.remove();
  }

  #buttons(): HTMLButtonElement[] {
    return Array.from(this.#root.querySelectorAll<HTMLButtonElement>('button[data-input-action]'));
  }

  #actionButton(target: EventTarget | null): HTMLButtonElement | null {
    return target instanceof Element ? target.closest<HTMLButtonElement>('button[data-input-action]') : null;
  }

  #action(button: HTMLButtonElement): MovementAction {
    return button.dataset.inputAction as MovementAction;
  }

  #setButtonActive(action: MovementAction): void {
    const button = this.#root.querySelector<HTMLButtonElement>(`button[data-input-action="${action}"]`);
    if (button !== null) {
      const active = (this.#counts.get(action) ?? 0) > 0 || this.#keyboardHeld.has(action);
      if (active) button.dataset.active = 'true'; else delete button.dataset.active;
    }
  }

  readonly #pointerDown = (event: PointerEvent): void => {
    const button = this.#actionButton(event.target);
    if (!this.#enabled || button === null || event.button !== 0 || this.#pointers.has(event.pointerId)) return;
    const action = this.#action(button);
    this.#pointers.set(event.pointerId, action);
    const count = this.#counts.get(action) ?? 0;
    this.#counts.set(action, count + 1);
    if (count === 0) this.#onAction(action, true);
    this.#setButtonActive(action);
    try { button.setPointerCapture(event.pointerId); } catch { /* cancellation listeners remain */ }
    event.preventDefault();
  };

  readonly #pointerEnd = (event: PointerEvent): void => {
    const action = this.#pointers.get(event.pointerId);
    if (action === undefined) return;
    this.#pointers.delete(event.pointerId);
    const count = Math.max(0, (this.#counts.get(action) ?? 1) - 1);
    if (count === 0) {
      this.#counts.delete(action);
      if (!this.#keyboardHeld.has(action)) this.#onAction(action, false);
    } else this.#counts.set(action, count);
    this.#setButtonActive(action);
    event.preventDefault();
  };

  readonly #keyDown = (event: KeyboardEvent): void => {
    const button = this.#actionButton(event.target);
    if (!this.#enabled || button === null || event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
    const action = this.#action(button);
    if (!this.#keyboardHeld.has(action)) {
      this.#keyboardHeld.add(action);
      if (!this.#counts.has(action)) this.#onAction(action, true);
      this.#setButtonActive(action);
    }
    event.preventDefault();
  };

  readonly #keyUp = (event: KeyboardEvent): void => {
    const button = this.#actionButton(event.target);
    if (button === null || (event.key !== ' ' && event.key !== 'Enter')) return;
    const action = this.#action(button);
    if (this.#keyboardHeld.delete(action) && !this.#counts.has(action)) this.#onAction(action, false);
    this.#setButtonActive(action);
    event.preventDefault();
  };

  readonly #blur = (event: FocusEvent): void => {
    const button = this.#actionButton(event.target);
    if (button === null) return;
    const action = this.#action(button);
    if (this.#keyboardHeld.delete(action) && !this.#counts.has(action)) this.#onAction(action, false);
    this.#setButtonActive(action);
  };
}
