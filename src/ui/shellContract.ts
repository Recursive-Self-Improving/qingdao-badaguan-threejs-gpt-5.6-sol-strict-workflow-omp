export type ShellState = 'ready' | 'disabled';

export interface ShellPresentation {
  readonly state: ShellState;
  readonly statusText: string | null;
  readonly disabledExplanation: string | null;
  readonly canvasTabIndex: null;
  readonly liveRegion: 'status';
}

export interface ShellElement {
  textContent: string | null;
  hidden: HTMLElement['hidden'];
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface ShellElements {
  readonly root: ShellElement & { readonly dataset: DOMStringMap };
  readonly canvas: ShellElement;
  readonly status: ShellElement;
  readonly controls: ShellElement;
}

const DISABLED_EXPLANATION =
  'JavaScript is disabled, so the 3D walk cannot start. The Badaguan overview remains available.';

const PRESENTATIONS: Readonly<Record<ShellState, ShellPresentation>> = {
  ready: {
    state: 'ready',
    statusText: 'The application shell is ready. The interactive landscape will begin here.',
    disabledExplanation: null,
    canvasTabIndex: null,
    liveRegion: 'status',
  },
  disabled: {
    state: 'disabled',
    statusText: null,
    disabledExplanation: DISABLED_EXPLANATION,
    canvasTabIndex: null,
    liveRegion: 'status',
  },
};

export function getShellPresentation(state: ShellState): ShellPresentation {
  return PRESENTATIONS[state];
}

export function applyShellPresentation(
  { root, canvas, status, controls }: ShellElements,
  presentation: ShellPresentation,
): void {
  root.dataset.appState = presentation.state;
  canvas.removeAttribute('tabindex');

  status.textContent = presentation.statusText;
  status.hidden = presentation.statusText === null;
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  controls.removeAttribute('aria-live');
  controls.removeAttribute('aria-busy');
}
