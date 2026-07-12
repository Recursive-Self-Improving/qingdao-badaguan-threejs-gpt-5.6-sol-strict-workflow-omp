import { APP_CONFIG, APP_COPY } from '../app/config';
import type {
  AppEvent,
  AppOperationalProjection,
  AppPanel,
  AppState,
  AppStateInvariant,
  PointerFallbackReason,
} from '../app/appState';
import type { PreferenceSnapshot } from '../platform/preferences';

export type AppUIAction = Extract<
  AppEvent,
  {
    readonly type:
      | 'START_EXPLORING'
      | 'PAUSE'
      | 'RESUME'
      | 'RETRY'
      | 'OPEN_PANEL'
      | 'CLOSE_PANEL';
  }
>;

export type AppUIActionHandler = (action: AppUIAction) => void;

export interface AppUIProjection {
  readonly state: AppState;
  readonly invariant: AppStateInvariant;
}

export interface AppUIOptions {
  readonly onAction: AppUIActionHandler;
  readonly preferences: PreferenceSnapshot;
}

type UICommand =
  | 'start'
  | 'pause'
  | 'resume'
  | 'retry'
  | 'open-help'
  | 'open-settings'
  | 'close-panel';

type ReturnFocusCommand = Extract<UICommand, 'open-help' | 'open-settings'>;
type PanelTone = 'default' | 'success' | 'caution' | 'danger';
type ButtonVariant = 'primary' | 'secondary';

interface AppUIElements {
  readonly root: HTMLElement;
  readonly experience: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly interfaceLayer: HTMLElement;
  readonly overlay: HTMLElement;
  readonly kicker: HTMLParagraphElement;
  readonly heading: HTMLHeadingElement;
  readonly description: HTMLParagraphElement;
  readonly detail: HTMLParagraphElement;
  readonly notice: HTMLParagraphElement;
  readonly guide: HTMLUListElement;
  readonly actions: HTMLDivElement;
  readonly controls: HTMLElement;
  readonly help: HTMLElement;
  readonly settings: HTMLElement;
  readonly status: HTMLParagraphElement;
}

interface ControlGuideItem {
  readonly input: string;
  readonly purpose: string;
}

interface ActionSpec {
  readonly command: UICommand;
  readonly label: string;
  readonly variant: ButtonVariant;
  readonly testId: string;
  readonly ariaControls?: string;
  readonly ariaExpanded?: boolean;
}

interface ViewProjection {
  readonly kicker: string;
  readonly title: string;
  readonly detail: string;
  readonly status: string;
  readonly notice: string | null;
  readonly guide: readonly ControlGuideItem[];
  readonly showDescription: boolean;
  readonly compact: boolean;
  readonly tone: PanelTone;
}

const ONBOARDING_GUIDE: readonly ControlGuideItem[] = [
  { input: 'WASD / arrows', purpose: 'Move along the garden roads' },
  { input: 'Mouse', purpose: 'Look around when mouse control is confirmed' },
  { input: 'Drag / touch', purpose: 'Look around with the cursor available' },
  { input: 'Escape', purpose: 'Pause or release the mouse' },
];

const NO_GUIDE: readonly ControlGuideItem[] = [];

const HELP_ITEMS = [
  ['Move', 'Use WASD or the arrow keys.'],
  ['Look', 'Use the mouse when mouse control is confirmed, or drag/touch with the cursor available.'],
  ['Pause', 'Press Escape to pause or release the mouse.'],
  ['Fallback', 'If mouse lock is denied or fails, drag and keyboard or touch exploration remains available.'],
] as const;

const SOURCED_CONTEXT_ITEMS = [
  'Badaguan is a coastal garden-villa district in Qingdao, associated with tree-lined, pass-named roads, varied low-rise architecture, sloping ground, and framed views toward the sea.',
  'Broad sourced architectural cues include German neoclassical, Gothic-castle, and Spanish villa families, plus a restrained palette of stone, brick/tile, stucco, timber, muted green, and red-brown roofs.',
  'The Princess Building’s source-bounded motif vocabulary includes Nordic/Danish, pine-green, and crafted wood-window cues.',
  'The Butterfly Building’s source-bounded motif vocabulary includes Mansard and brick-timber cues.',
  'The Huashi Building’s broad source cue is compact, sculptural, castle-like shore massing.',
] as const;

const ARTISTIC_INTERPRETATION_ITEMS = [
  'Scale, geometry, road lengths, and walking distances are compressed or rearranged for a legible, navigable experience.',
  'Parcel placement and landmark adjacency are authored; on-screen proximity does not claim real-world adjacency or measured distance.',
  'Exact façades and procedural silhouettes—including the Princess-, Butterfly-, and Huashi-inspired compositions—are artistic inference, not measured replicas or exact reconstructions.',
  'Traditional planting cues are representative garden motifs, not a survey of the current planting or tree inventory.',
  'The Nordic/Danish, pine-green, and crafted wood-window source cues are confined to the Princess-inspired composition; its exact arrangement is authored.',
  'The Mansard and brick-timber source cues are confined to the Butterfly-inspired composition; its exact arrangement is authored.',
  'Wider reuse of either landmark-specific motif family would be artistic inference, not sourced fact.',
  'Any Huashi-inspired tower detail is authored rather than source-bound.',
  'The early-autumn morning light, haze, atmosphere, and weather are authored for this walk, not a report of current conditions.',
] as const;

class AppUIElementError extends Error {
  constructor(selector: string) {
    super(`Required application UI element is missing or invalid: ${selector}`);
    this.name = 'AppUIElementError';
  }
}

function requireElement<T extends Element>(
  documentRoot: Document,
  selector: string,
  expectedType: abstract new (...args: never[]) => T,
): T {
  const element = documentRoot.querySelector(selector);

  if (element === null || !(element instanceof expectedType)) {
    throw new AppUIElementError(selector);
  }

  return element;
}

function collectElements(documentRoot: Document): AppUIElements {
  return {
    root: requireElement(documentRoot, '#app', HTMLElement),
    experience: requireElement(documentRoot, '#experience', HTMLElement),
    canvas: requireElement(documentRoot, '#app-canvas', HTMLCanvasElement),
    interfaceLayer: requireElement(documentRoot, '.interface-layer', HTMLElement),
    overlay: requireElement(documentRoot, '#app-overlay', HTMLElement),
    kicker: requireElement(documentRoot, '#app-kicker', HTMLParagraphElement),
    heading: requireElement(documentRoot, '#experience-title', HTMLHeadingElement),
    description: requireElement(documentRoot, '#canvas-description', HTMLParagraphElement),
    detail: requireElement(documentRoot, '#app-detail', HTMLParagraphElement),
    notice: requireElement(documentRoot, '#app-notice', HTMLParagraphElement),
    guide: requireElement(documentRoot, '#app-control-guide', HTMLUListElement),
    actions: requireElement(documentRoot, '#app-actions', HTMLDivElement),
    controls: requireElement(documentRoot, '#app-controls', HTMLElement),
    help: requireElement(documentRoot, '#app-help', HTMLElement),
    settings: requireElement(documentRoot, '#app-settings', HTMLElement),
    status: requireElement(documentRoot, '#app-status', HTMLParagraphElement),
  };
}

function isUICommand(value: string | undefined): value is UICommand {
  switch (value) {
    case 'start':
    case 'pause':
    case 'resume':
    case 'retry':
    case 'open-help':
    case 'open-settings':
    case 'close-panel':
      return true;
    default:
      return false;
  }
}

function actionForCommand(command: UICommand): AppUIAction {
  switch (command) {
    case 'start':
      return { type: 'START_EXPLORING' };
    case 'pause':
      return { type: 'PAUSE' };
    case 'resume':
      return { type: 'RESUME' };
    case 'retry':
      return { type: 'RETRY' };
    case 'open-help':
      return { type: 'OPEN_PANEL', panel: 'help' };
    case 'open-settings':
      return { type: 'OPEN_PANEL', panel: 'settings' };
    case 'close-panel':
      return { type: 'CLOSE_PANEL' };
  }
}

function fallbackInstruction(reason: PointerFallbackReason | undefined): string {
  switch (reason) {
    case 'denied':
      return 'Mouse lock was denied. Drag and use the keyboard, or use touch, to explore Badaguan.';
    case 'error':
      return 'Mouse lock could not start. Drag and use the keyboard, or use touch, to explore Badaguan.';
    case 'unlocked':
      return 'The mouse is released. Drag and use the keyboard, or use touch, to explore Badaguan.';
    case 'initial':
    case undefined:
      return APP_CONFIG.fallbackInstruction;
  }
}

function pausedInstruction(control: AppStateInvariant['control']): string {
  return control === 'drag'
    ? 'Exploration is paused. Resume for drag and keyboard, or touch, exploration.'
    : APP_COPY.paused;
}

function operationalKey(projection: AppOperationalProjection): string {
  switch (projection.kind) {
    case 'onboarding':
      return projection.kind;
    case 'exploring':
      return `${projection.kind}:${projection.control}:${projection.fallbackReason ?? 'none'}`;
    case 'paused':
      return `${projection.kind}:${projection.resumeControl}`;
  }
}

function announcementKey(state: AppState): string {
  switch (state.kind) {
    case 'boot':
    case 'loading':
    case 'onboarding':
    case 'context-lost':
      return state.kind;
    case 'exploring':
      return `${state.kind}:${state.control}:${state.fallbackReason ?? 'none'}`;
    case 'paused':
      return `${state.kind}:${state.resumeControl}`;
    case 'degraded':
      return `${state.kind}:${state.reason}:${state.underlying === null ? 'none' : operationalKey(state.underlying)}`;
    case 'unsupported':
    case 'fatal':
      return `${state.kind}:${state.reason}`;
  }
}

function degradationNotice(reason: string): string {
  const detail = reason.trim();
  return detail === ''
    ? 'Some optional visual detail is unavailable. The current controls remain usable.'
    : `Some optional visual detail is unavailable: ${detail}`;
}

function degradedView(state: Extract<AppState, { readonly kind: 'degraded' }>, invariant: AppStateInvariant): ViewProjection {
  const notice = degradationNotice(state.reason);
  const underlying = state.underlying;

  if (underlying === null) {
    return {
      kicker: 'Reduced mode',
      title: 'Badaguan is available with less detail',
      detail: invariant.visibleOutput,
      status: invariant.visibleOutput,
      notice,
      guide: NO_GUIDE,
      showDescription: true,
      compact: false,
      tone: 'caution',
    };
  }

  switch (underlying.kind) {
    case 'onboarding':
      return {
        kicker: 'Reduced mode · Ready',
        title: 'Begin the Badaguan walk',
        detail: APP_COPY.onboarding,
        status: `${invariant.visibleOutput} ${APP_COPY.onboarding}`,
        notice,
        guide: ONBOARDING_GUIDE,
        showDescription: true,
        compact: false,
        tone: 'caution',
      };
    case 'exploring': {
      const detail =
        underlying.control === 'locked'
          ? APP_CONFIG.lockedInstruction
          : fallbackInstruction(underlying.fallbackReason);
      return {
        kicker: 'Reduced mode · Exploring',
        title: 'Continue through Badaguan',
        detail,
        status: `${invariant.visibleOutput} ${detail}`,
        notice,
        guide: NO_GUIDE,
        showDescription: false,
        compact: true,
        tone: 'caution',
      };
    }
    case 'paused': {
      const detail = pausedInstruction(underlying.resumeControl);
      return {
        kicker: 'Reduced mode · Paused',
        title: 'Badaguan walk paused',
        detail,
        status: `${invariant.visibleOutput} ${detail}`,
        notice,
        guide: NO_GUIDE,
        showDescription: false,
        compact: true,
        tone: 'caution',
      };
    }
  }
}

function viewForState(state: AppState, invariant: AppStateInvariant): ViewProjection {
  switch (state.kind) {
    case 'boot':
      return {
        kicker: 'Experience setup',
        title: 'Preparing Badaguan',
        detail: invariant.visibleOutput,
        status: invariant.visibleOutput,
        notice: null,
        guide: NO_GUIDE,
        showDescription: true,
        compact: false,
        tone: 'default',
      };
    case 'loading':
      return {
        kicker: 'Experience setup',
        title: 'Checking 3D support',
        detail: invariant.visibleOutput,
        status: invariant.visibleOutput,
        notice: null,
        guide: NO_GUIDE,
        showDescription: true,
        compact: false,
        tone: 'default',
      };
    case 'onboarding':
      return {
        kicker: 'Ready to explore',
        title: 'Explore Badaguan',
        detail: invariant.visibleOutput,
        status: invariant.visibleOutput,
        notice: null,
        guide: ONBOARDING_GUIDE,
        showDescription: true,
        compact: false,
        tone: 'success',
      };
    case 'exploring': {
      const locked = state.control === 'locked';
      const detail = locked ? APP_CONFIG.lockedInstruction : fallbackInstruction(state.fallbackReason);
      return {
        kicker: locked ? 'Mouse control active' : 'Cursor available',
        title: locked ? 'Exploring Badaguan' : 'Explore with drag, keyboard, or touch',
        detail,
        status: detail,
        notice: null,
        guide: NO_GUIDE,
        showDescription: false,
        compact: true,
        tone: locked ? 'success' : 'default',
      };
    }
    case 'paused': {
      const detail = pausedInstruction(state.resumeControl);
      return {
        kicker: 'Exploration paused',
        title: 'Badaguan walk paused',
        detail,
        status: detail,
        notice: null,
        guide: NO_GUIDE,
        showDescription: false,
        compact: true,
        tone: 'default',
      };
    }
    case 'degraded':
      return degradedView(state, invariant);
    case 'context-lost':
      return {
        kicker: 'Graphics context lost',
        title: 'Restart required',
        detail: invariant.visibleOutput,
        status: invariant.visibleOutput,
        notice:
          'Movement and rendering have stopped. Retry starts a fresh capability check and rebuilds the experience.',
        guide: NO_GUIDE,
        showDescription: true,
        compact: false,
        tone: 'caution',
      };
    case 'unsupported':
      return {
        kicker: 'Static Badaguan guide',
        title: 'Badaguan without the 3D view',
        detail: invariant.visibleOutput,
        status: invariant.visibleOutput,
        notice:
          'WebGL2 is required for the interactive walk. The district description remains available, and Retry checks browser support again.',
        guide: NO_GUIDE,
        showDescription: true,
        compact: false,
        tone: 'caution',
      };
    case 'fatal':
      return {
        kicker: 'Experience stopped',
        title: 'The Badaguan walk could not continue',
        detail: invariant.visibleOutput,
        status: invariant.visibleOutput,
        notice:
          'The static Badaguan description remains available. Retry starts a clean capability check instead of continuing a failed session.',
        guide: NO_GUIDE,
        showDescription: true,
        compact: false,
        tone: 'danger',
      };
  }
}

function hasResumeAction(state: AppState): boolean {
  return (
    state.kind === 'paused' ||
    (state.kind === 'degraded' && state.underlying?.kind === 'paused')
  );
}

function actionSpecs(state: AppState, invariant: AppStateInvariant): readonly ActionSpec[] {
  const actions: ActionSpec[] = [];

  if (invariant.canStart) {
    actions.push({ command: 'start', label: 'Start', variant: 'primary', testId: 'start-button' });
  } else if (hasResumeAction(state)) {
    actions.push({ command: 'resume', label: 'Resume', variant: 'primary', testId: 'resume-button' });
  } else if (invariant.isExploring) {
    actions.push({ command: 'pause', label: 'Pause', variant: 'secondary', testId: 'pause-button' });
  }

  if (invariant.canRetry) {
    actions.push({
      command: 'retry',
      label: 'Retry',
      variant: actions.length === 0 ? 'primary' : 'secondary',
      testId: 'retry-button',
    });
  }

  return actions;
}


function updateButton(button: HTMLButtonElement, spec: ActionSpec, className: string): void {
  button.type = 'button';
  button.className = className;
  button.dataset.uiAction = spec.command;
  button.dataset.variant = spec.variant;
  button.dataset.testid = spec.testId;
  button.textContent = spec.label;

  if (spec.ariaControls === undefined) {
    button.removeAttribute('aria-controls');
  } else {
    button.setAttribute('aria-controls', spec.ariaControls);
  }

  if (spec.ariaExpanded === undefined) {
    button.removeAttribute('aria-expanded');
  } else {
    button.setAttribute('aria-expanded', String(spec.ariaExpanded));
  }
}

function createButton(
  documentRoot: Document,
  spec: ActionSpec,
  className: string,
): HTMLButtonElement {
  const button = documentRoot.createElement('button');
  updateButton(button, spec, className);
  return button;
}

function reconcileButtons(
  documentRoot: Document,
  container: HTMLElement,
  specs: readonly ActionSpec[],
  className: string,
): void {
  const reusable = new Map<string, HTMLButtonElement>();
  for (const child of Array.from(container.children)) {
    if (child instanceof HTMLButtonElement && child.dataset.testid !== undefined) {
      reusable.set(child.dataset.testid, child);
    }
  }

  const buttons: HTMLButtonElement[] = [];
  for (const spec of specs) {
    const button = reusable.get(spec.testId) ?? createButton(documentRoot, spec, className);
    reusable.delete(spec.testId);
    updateButton(button, spec, className);
    buttons.push(button);
  }

  for (const [index, button] of buttons.entries()) {
    const current = container.children.item(index);
    if (current !== button) {
      container.insertBefore(button, current);
    }
  }

  while (container.children.length > buttons.length) {
    container.lastElementChild?.remove();
  }
}

function appendControlGuide(
  documentRoot: Document,
  container: HTMLUListElement,
  items: readonly ControlGuideItem[],
): void {
  const fragment = documentRoot.createDocumentFragment();

  for (const item of items) {
    const listItem = documentRoot.createElement('li');
    const input = documentRoot.createElement('kbd');
    const purpose = documentRoot.createElement('span');
    input.textContent = item.input;
    purpose.textContent = item.purpose;
    listItem.append(input, purpose);
    fragment.append(listItem);
  }

  container.replaceChildren(fragment);
  container.hidden = items.length === 0;
}

function createDrawerHeader(
  documentRoot: Document,
  headingId: string,
  title: string,
  closeTestId: string,
): HTMLDivElement {
  const header = documentRoot.createElement('div');
  const heading = documentRoot.createElement('h2');
  const close = createButton(
    documentRoot,
    {
      command: 'close-panel',
      label: 'Close',
      variant: 'secondary',
      testId: closeTestId,
    },
    'drawer-close',
  );

  header.className = 'drawer-heading';
  heading.id = headingId;
  heading.dataset.panelHeading = 'true';
  heading.tabIndex = -1;
  heading.textContent = title;
  close.setAttribute('aria-label', `Close ${title.toLowerCase()}`);
  header.append(heading, close);
  return header;
}

function createDisclosureSection(
  documentRoot: Document,
  headingId: string,
  title: string,
  items: readonly string[],
  testId: string,
): HTMLElement {
  const section = documentRoot.createElement('section');
  const heading = documentRoot.createElement('h3');
  const list = documentRoot.createElement('ul');

  section.className = 'disclosure-section';
  section.dataset.testid = testId;
  section.setAttribute('aria-labelledby', headingId);
  heading.id = headingId;
  heading.textContent = title;
  list.className = 'disclosure-list';

  for (const text of items) {
    const item = documentRoot.createElement('li');
    item.textContent = text;
    list.append(item);
  }

  section.append(heading, list);
  return section;
}

function createHelpPanel(documentRoot: Document): DocumentFragment {
  const fragment = documentRoot.createDocumentFragment();
  const content = documentRoot.createElement('div');
  const intro = documentRoot.createElement('p');
  const controlsSection = documentRoot.createElement('section');
  const controlsHeading = documentRoot.createElement('h3');
  const controls = documentRoot.createElement('ul');

  content.className = 'drawer-scroll-region';
  content.dataset.testid = 'help-disclosure';
  intro.className = 'disclosure-intro';
  intro.textContent =
    'Use the controls below to explore. This disclosure separates source-backed context from artistic interpretation. Only the broad cues listed as sourced context are treated as source-bounded; exact composition choices are authored.';
  controlsSection.className = 'help-controls';
  controlsSection.setAttribute('aria-labelledby', 'app-help-controls-title');
  controlsHeading.id = 'app-help-controls-title';
  controlsHeading.textContent = 'Controls';
  controls.className = 'help-list';

  for (const [label, description] of HELP_ITEMS) {
    const item = documentRoot.createElement('li');
    const name = documentRoot.createElement('strong');
    const detail = documentRoot.createElement('span');
    name.textContent = label;
    detail.textContent = description;
    item.append(name, detail);
    controls.append(item);
  }

  controlsSection.append(controlsHeading, controls);
  content.append(
    intro,
    controlsSection,
    createDisclosureSection(
      documentRoot,
      'app-help-sourced-context-title',
      'Sourced context',
      SOURCED_CONTEXT_ITEMS,
      'help-sourced-context',
    ),
    createDisclosureSection(
      documentRoot,
      'app-help-artistic-interpretation-title',
      'Artistic interpretation',
      ARTISTIC_INTERPRETATION_ITEMS,
      'help-artistic-interpretation',
    ),
  );
  fragment.append(
    createDrawerHeader(documentRoot, 'app-help-title', 'Help', 'close-help-button'),
    content,
  );
  return fragment;
}

function createSetting(
  documentRoot: Document,
  label: string,
  value: string,
  explanation: string,
): HTMLDivElement {
  const field = documentRoot.createElement('div');
  const term = documentRoot.createElement('dt');
  const description = documentRoot.createElement('dd');
  const currentValue = documentRoot.createElement('strong');
  const help = documentRoot.createElement('small');

  field.className = 'setting-field';
  term.textContent = label;
  currentValue.textContent = value;
  help.textContent = explanation;
  description.append(currentValue, help);
  field.append(term, description);
  return field;
}

function createSettingsPanel(
  documentRoot: Document,
  preferences: PreferenceSnapshot,
): DocumentFragment {
  const fragment = documentRoot.createDocumentFragment();
  const intro = documentRoot.createElement('p');
  const settings = documentRoot.createElement('dl');
  const motionValue = preferences.prefersReducedMotion
    ? 'Reduced motion requested'
    : 'Standard motion permitted';
  const inputValue = preferences.primaryPointerCoarse
    ? 'Touch-first controls'
    : preferences.anyPointerFine
      ? 'Mouse and keyboard available'
      : preferences.touchCapable
        ? 'Touch controls available'
        : 'Keyboard fallback available';

  intro.textContent =
    'This visit follows your browser and device preferences. Controls remain available without changing system settings.';
  settings.className = 'setting-list';
  settings.append(
    createSetting(
      documentRoot,
      'Motion',
      motionValue,
      'Non-essential interface motion follows the system reduced-motion preference.',
    ),
    createSetting(
      documentRoot,
      'Primary input',
      inputValue,
      preferences.hoverCapable
        ? 'Hover and fine-pointer feedback are available.'
        : 'Touch-sized controls and drag look remain available.',
    ),
    createSetting(
      documentRoot,
      'Keyboard',
      'WASD and arrow keys',
      'Keyboard movement remains available alongside mouse, drag, or touch look.',
    ),
    createSetting(
      documentRoot,
      'Graphics',
      'Automatic capability check',
      'Retry always begins a fresh WebGL2 capability evaluation.',
    ),
  );
  fragment.append(
    createDrawerHeader(documentRoot, 'app-settings-title', 'Experience settings', 'close-settings-button'),
    intro,
    settings,
  );
  return fragment;
}

export class AppUI {
  private readonly elements: AppUIElements;
  private readonly documentRoot: Document;
  private readonly onAction: AppUIActionHandler;
  private readonly preferences: PreferenceSnapshot;
  private currentPanel: AppPanel = 'none';
  private canFocusStart = false;
  private canFocusResume = false;
  private lastAnnouncementKey: string | null = null;
  private returnFocusCommand: ReturnFocusCommand | null = null;
  private destroyed = false;

  constructor(options: AppUIOptions) {
    this.documentRoot = document;
    this.elements = collectElements(this.documentRoot);
    this.onAction = options.onAction;
    this.preferences = options.preferences;
    this.elements.interfaceLayer.addEventListener('click', this.handleClick);
    this.documentRoot.addEventListener('keydown', this.handleKeydown);
  }

  render({ state, invariant }: AppUIProjection): void {
    if (this.destroyed) {
      throw new Error('Cannot render a destroyed AppUI instance.');
    }

    const view = viewForState(state, invariant);
    const stateAnnouncementKey = announcementKey(state);
    const previousPanel = this.currentPanel;
    const previouslyReady = this.canFocusStart;
    const focusedCommand = this.focusedActionOrUtilityCommand();

    this.currentPanel = invariant.panel;
    this.canFocusStart = invariant.canStart;
    this.canFocusResume = hasResumeAction(state);

    this.renderShellState(state, invariant);
    this.renderView(view);
    this.renderActions(actionSpecs(state, invariant));
    this.renderUtilityControls(state, invariant.panel);
    this.renderPanels(invariant.panel, previousPanel);
    this.renderDrawerIsolation(invariant.panel);
    this.renderStatus(view.status, stateAnnouncementKey);
    this.applyFocus(previousPanel, previouslyReady, focusedCommand);
  }

  focusStart(): boolean {
    return this.currentPanel === 'none' && this.canFocusStart && this.focusCommand('start');
  }

  focusResume(): boolean {
    return this.currentPanel === 'none' && this.canFocusResume && this.focusCommand('resume');
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.elements.interfaceLayer.removeEventListener('click', this.handleClick);
    this.documentRoot.removeEventListener('keydown', this.handleKeydown);
    this.destroyed = true;
  }

  private readonly handleClick = (event: Event): void => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const button = event.target.closest<HTMLButtonElement>('button[data-ui-action]');
    if (
      button === null ||
      !this.elements.interfaceLayer.contains(button) ||
      button.disabled ||
      !isUICommand(button.dataset.uiAction)
    ) {
      return;
    }

    if (
      this.currentPanel !== 'none' &&
      (this.elements.overlay.contains(button) || this.elements.controls.contains(button))
    ) {
      return;
    }

    const command = button.dataset.uiAction;
    if (command === 'open-help' || command === 'open-settings') {
      this.returnFocusCommand = command;
    }
    this.onAction(actionForCommand(command));
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (
      event.key !== 'Escape' ||
      event.repeat ||
      event.defaultPrevented ||
      this.currentPanel === 'none'
    ) {
      return;
    }

    event.preventDefault();
    this.onAction({ type: 'CLOSE_PANEL' });
  };

  private renderShellState(state: AppState, invariant: AppStateInvariant): void {
    this.elements.root.dataset.appState = state.kind;
    this.elements.root.dataset.panel = invariant.panel;
    if (invariant.control === null) {
      delete this.elements.root.dataset.controlMode;
    } else {
      this.elements.root.dataset.controlMode = invariant.control;
    }

    const busy = state.kind === 'boot' || state.kind === 'loading';
    this.elements.experience.removeAttribute('aria-busy');
    if (busy) {
      this.elements.overlay.setAttribute('aria-busy', 'true');
    } else {
      this.elements.overlay.removeAttribute('aria-busy');
    }
    this.elements.canvas.removeAttribute('tabindex');
    if (this.elements.status.getAttribute('role') !== 'status') {
      this.elements.status.setAttribute('role', 'status');
    }
    if (this.elements.status.getAttribute('aria-live') !== 'polite') {
      this.elements.status.setAttribute('aria-live', 'polite');
    }
    if (this.elements.status.getAttribute('aria-atomic') !== 'true') {
      this.elements.status.setAttribute('aria-atomic', 'true');
    }
    this.elements.controls.removeAttribute('aria-live');
    this.elements.controls.removeAttribute('aria-busy');
    this.elements.help.removeAttribute('aria-live');
    this.elements.settings.removeAttribute('aria-live');
  }

  private renderView(view: ViewProjection): void {
    this.elements.overlay.hidden = false;
    this.elements.overlay.dataset.compact = String(view.compact);
    this.elements.overlay.dataset.tone = view.tone;
    this.elements.kicker.textContent = view.kicker;
    this.elements.heading.textContent = view.title;
    this.elements.description.hidden = !view.showDescription;
    this.elements.detail.textContent = view.detail;
    this.elements.notice.textContent = view.notice;
    this.elements.notice.hidden = view.notice === null;
    appendControlGuide(this.documentRoot, this.elements.guide, view.guide);
  }

  private renderActions(specs: readonly ActionSpec[]): void {
    reconcileButtons(this.documentRoot, this.elements.actions, specs, 'action-button');
  }

  private renderUtilityControls(state: AppState, panel: AppPanel): void {
    const specs: ActionSpec[] = [];
    const helpAvailable = state.kind !== 'boot' && state.kind !== 'loading';
    const settingsAvailable =
      state.kind === 'onboarding' ||
      state.kind === 'exploring' ||
      state.kind === 'paused' ||
      state.kind === 'degraded';

    if (helpAvailable) {
      const active = panel === 'help';
      specs.push({
        command: active ? 'close-panel' : 'open-help',
        label: 'Help',
        variant: 'secondary',
        testId: 'help-button',
        ariaControls: 'app-help',
        ariaExpanded: active,
      });
    }

    if (settingsAvailable) {
      const active = panel === 'settings';
      specs.push({
        command: active ? 'close-panel' : 'open-settings',
        label: 'Settings',
        variant: 'secondary',
        testId: 'settings-button',
        ariaControls: 'app-settings',
        ariaExpanded: active,
      });
    }

    this.elements.controls.hidden = !helpAvailable && !settingsAvailable;
    reconcileButtons(this.documentRoot, this.elements.controls, specs, 'utility-button');
  }

  private renderPanels(panel: AppPanel, previousPanel: AppPanel): void {
    if (panel === previousPanel) {
      return;
    }

    this.elements.help.hidden = panel !== 'help';
    this.elements.settings.hidden = panel !== 'settings';

    if (panel === 'help') {
      this.elements.help.replaceChildren(createHelpPanel(this.documentRoot));
      this.elements.settings.replaceChildren();
    } else if (panel === 'settings') {
      this.elements.settings.replaceChildren(
        createSettingsPanel(this.documentRoot, this.preferences),
      );
      this.elements.help.replaceChildren();
    } else {
      this.elements.help.replaceChildren();
      this.elements.settings.replaceChildren();
    }
  }

  private renderDrawerIsolation(panel: AppPanel): void {
    const covered = panel !== 'none';
    this.elements.overlay.inert = covered;
    this.elements.controls.inert = covered;
  }

  private renderStatus(status: string, key: string): void {
    if (this.elements.status.hidden) {
      this.elements.status.hidden = false;
    }
    if (this.lastAnnouncementKey === key) {
      return;
    }

    this.elements.status.textContent = status;
    this.lastAnnouncementKey = key;
  }

  private applyFocus(
    previousPanel: AppPanel,
    previouslyReady: boolean,
    focusedCommand: UICommand | null,
  ): void {
    if (this.currentPanel !== previousPanel) {
      if (this.currentPanel !== 'none') {
        this.focusPanelHeading(this.currentPanel);
        return;
      }

      if (previousPanel !== 'none') {
        const fallbackCommand: ReturnFocusCommand =
          previousPanel === 'help' ? 'open-help' : 'open-settings';
        this.focusCommand(this.returnFocusCommand ?? fallbackCommand);
        this.returnFocusCommand = null;
        return;
      }
    }

    if (
      this.currentPanel === 'none' &&
      focusedCommand !== null &&
      this.focusCommand(focusedCommand)
    ) {
      return;
    }

    if (!previouslyReady && this.canFocusStart && this.currentPanel === 'none') {
      this.focusStart();
    }
  }

  private focusedActionOrUtilityCommand(): UICommand | null {
    const active = this.documentRoot.activeElement;
    if (
      !(active instanceof HTMLButtonElement) ||
      (!this.elements.actions.contains(active) && !this.elements.controls.contains(active)) ||
      !isUICommand(active.dataset.uiAction)
    ) {
      return null;
    }

    return active.dataset.uiAction;
  }

  private focusPanelHeading(panel: Exclude<AppPanel, 'none'>): void {
    const container = panel === 'help' ? this.elements.help : this.elements.settings;
    container.querySelector<HTMLElement>('[data-panel-heading="true"]')?.focus({
      preventScroll: true,
    });
  }

  private focusCommand(command: UICommand): boolean {
    const buttons = this.elements.interfaceLayer.querySelectorAll<HTMLButtonElement>(
      `button[data-ui-action="${command}"]`,
    );

    for (const button of buttons) {
      if (button.disabled || button.closest('[hidden], [inert]') !== null) {
        continue;
      }

      button.focus({ preventScroll: true });
      if (this.documentRoot.activeElement === button) {
        return true;
      }
    }

    return false;
  }
}

export function createAppUI(options: AppUIOptions): AppUI {
  return new AppUI(options);
}
