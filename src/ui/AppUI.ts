import { APP_CONFIG, APP_COPY } from '../app/config';
import type {
  AppEvent,
  AppPanel,
  AppState,
  AppStateInvariant,
  PointerFallbackReason,
} from '../app/appState';
import { shouldOfferTouchControls, type PreferenceSnapshot } from '../platform/preferences';
import type { MovementAction } from '../exploration/types';
import type { InteractionViewportMeasurement } from '../platform/viewport';
import { TouchControls } from './touchControls';
import type { RouteGuide } from '../loading/routeGuide';
import type { MotionPreference, QualityPreference } from '../quality/qualityTiers';
import type { QualityState } from '../quality/QualityController';
import { AnnouncementBroker } from './AnnouncementBroker';

export type AppUIAction = Extract<
  AppEvent,
  {
    readonly type:
      | 'START_EXPLORING'
      | 'PAUSE'
      | 'RESUME'
      | 'RETRY'
      | 'RETRY_OPTIONAL'
      | 'RETURN_TO_STATIC'
      | 'RELOAD'
      | 'OPEN_PANEL'
      | 'CLOSE_PANEL';
  }
> | { readonly type: 'RESET' } | { readonly type: 'CANCEL_LOADING' }
  | { readonly type: 'QUALITY_PREFERENCE_CHANGED'; readonly preference: QualityPreference }
  | { readonly type: 'MOTION_PREFERENCE_CHANGED'; readonly preference: MotionPreference };

export type AppUIActionHandler = (action: AppUIAction) => void;

export interface AppUIProjection {
  readonly state: AppState;
  readonly invariant: AppStateInvariant;
}

export interface AppUIOptions {
  readonly onAction: AppUIActionHandler;
  readonly preferences: PreferenceSnapshot;
  readonly settings: QualityState;
  readonly onInputAction: (action: MovementAction, pressed: boolean) => void;
}

type UICommand =
  | 'start'
  | 'pause'
  | 'resume'
  | 'reset'
  | 'retry'
  | 'cancel-loading'
  | 'retry-optional'
  | 'return-to-static'
  | 'reload'
  | 'open-help'
  | 'open-settings'
  | 'close-panel';

type ReturnFocusCommand = Extract<UICommand, 'open-help' | 'open-settings'>;
type PanelTone = 'default' | 'success' | 'caution' | 'danger';
type ButtonVariant = 'primary' | 'secondary';

interface AppUIElements {
  readonly root: HTMLElement;
  readonly experience: HTMLElement;
  canvas: HTMLCanvasElement;
  readonly interfaceLayer: HTMLElement;
  readonly overlay: HTMLElement;
  readonly kicker: HTMLParagraphElement;
  readonly heading: HTMLHeadingElement;
  readonly description: HTMLParagraphElement;
  readonly detail: HTMLParagraphElement;
  readonly notice: HTMLParagraphElement;
  readonly guide: HTMLUListElement;
  readonly actions: HTMLDivElement;
  readonly progressRegion: HTMLElement;
  readonly progress: HTMLProgressElement;
  readonly progressLabel: HTMLParagraphElement;
  readonly degradedNotice: HTMLElement;
  readonly degradedActions: HTMLDivElement;
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
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
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
  { input: 'R', purpose: 'Return to the safe reset point' },
  { input: 'Escape', purpose: 'Pause or release the mouse' },
];

const NO_GUIDE: readonly ControlGuideItem[] = [];

const HELP_ITEMS = [
  ['Move', 'Use WASD or the arrow keys.'],
  ['Look', 'Use the mouse when mouse control is confirmed, or drag/touch with the cursor available.'],
  ['Reset', 'Press R to return to the safe reset point.'],
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
    progressRegion: requireElement(documentRoot, '#app-progress-region', HTMLElement),
    progress: requireElement(documentRoot, '#app-progress', HTMLProgressElement),
    progressLabel: requireElement(documentRoot, '#app-progress-label', HTMLParagraphElement),
    degradedNotice: requireElement(documentRoot, '#app-degraded-notice', HTMLElement),
    degradedActions: requireElement(documentRoot, '#app-degraded-actions', HTMLDivElement),
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
    case 'reset':
    case 'cancel-loading':
    case 'retry-optional':
    case 'return-to-static':
    case 'reload':
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
    case 'reset':
      return { type: 'RESET' };
    case 'retry':
      return { type: 'RETRY' };
    case 'cancel-loading':
      return { type: 'CANCEL_LOADING' };
    case 'retry-optional':
      return { type: 'RETRY_OPTIONAL' };
    case 'return-to-static':
      return { type: 'RETURN_TO_STATIC' };
    case 'reload':
      return { type: 'RELOAD' };
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


function announcementKey(state: AppState): string {
  switch (state.kind) {
    case 'boot': return 'boot';
    case 'loading': return `loading:${state.attempt ?? 0}:${state.phase ?? 'legacy'}`;
    case 'onboarding': return 'onboarding';
    case 'exploring': return `${state.kind}:${state.control}:${state.fallbackReason ?? 'none'}`;
    case 'paused': return `${state.kind}:${state.resumeControl}`;
    case 'degraded': return `degraded:${(state.failures ?? []).map(({ assetId, status }) => `${assetId}:${status}`).join(',') || state.reason || 'legacy'}`;
    case 'context-lost': return `context-lost:${state.phase ?? 'legacy'}`;
    case 'load-cancelled':
    case 'unsupported':
    case 'fatal':
    case 'recovery-failed': return `${state.kind}:${state.reason}`;
    case 'static': return `static:${state.reason}`;
  }
}

function degradedView(state: Extract<AppState, { readonly kind: 'degraded' }>, invariant: AppStateInvariant): ViewProjection {
  const underlying = state.underlying ?? { kind: 'onboarding' as const };
  const visibleOutput = underlying.kind === 'onboarding'
    ? APP_COPY.onboarding
    : underlying.kind === 'exploring'
      ? (underlying.control === 'locked' ? APP_COPY.exploringLocked : APP_COPY.exploringDrag)
      : APP_COPY.paused;
  return viewForState(underlying, { ...invariant, visibleOutput });
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
        kicker: 'Experience setup', title: 'Loading Badaguan',
        detail: state.phase === 'items' ? 'Loading experience items.' : 'Preparing the interactive landscape.',
        status: state.phase === 'items' ? 'Loading experience items.' : 'Loading Badaguan.',
        notice: null, guide: NO_GUIDE, showDescription: true, compact: false, tone: 'default',
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
        kicker: state.phase === 'rebuilding' ? 'Graphics recovery' : 'Graphics interrupted',
        title: 'Restoring the 3D view', detail: invariant.visibleOutput,
        status: state.phase === 'rebuilding' ? 'Restoring the 3D view.' : 'Graphics interrupted. Movement is paused while the view recovers.',
        notice: null, guide: NO_GUIDE, showDescription: true, compact: false, tone: 'caution',
      };
    case 'load-cancelled':
      return { kicker: 'Loading stopped', title: 'The 3D view did not finish loading', detail: state.reason, status: 'Loading cancelled. Retry or use the static guide.', notice: 'Retry when you are ready, or use the static Badaguan guide.', guide: NO_GUIDE, showDescription: true, compact: false, tone: 'default' };
    case 'recovery-failed':
      return { kicker: 'Graphics recovery failed', title: 'The 3D view could not be restored', detail: state.reason, status: 'Graphics recovery failed. Reload or use the static guide.', notice: 'Reload to start a new 3D session, or use the static guide.', guide: NO_GUIDE, showDescription: true, compact: false, tone: 'danger' };
    case 'static':
      return { kicker: 'Static guide', title: 'Badaguan without the 3D view', detail: invariant.visibleOutput, status: 'Static Badaguan guide opened.', notice: null, guide: NO_GUIDE, showDescription: true, compact: false, tone: 'default' };
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
        kicker: 'Experience unavailable',
        title: 'The Badaguan walk could not start',
        detail: invariant.visibleOutput,
        status: 'The 3D view could not be loaded. Retry or use the static guide.',
        notice: 'Retry, or continue with the static Badaguan guide.',
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
  if (invariant.canStart) actions.push({ command: 'start', label: 'Start', variant: 'primary', testId: 'start-button' });
  else if (hasResumeAction(state)) actions.push({ command: 'resume', label: 'Resume', variant: 'primary', testId: 'resume-button' });
  else if (invariant.isExploring) actions.push({ command: 'pause', label: 'Pause', variant: 'secondary', testId: 'pause-button' });
  if (invariant.canCancel) actions.push({ command: 'cancel-loading', label: 'Cancel', ariaLabel: 'Cancel loading', variant: 'secondary', testId: 'cancel-loading-button' });
  if (invariant.canRetry) actions.push({ command: 'retry', label: state.kind === 'static' ? 'Retry 3D' : 'Retry', variant: 'primary', testId: 'retry-button' });
  if (invariant.canReload) actions.push({ command: 'reload', label: 'Reload', variant: 'primary', testId: 'reload-button' });
  if (invariant.canReturn) actions.push({ command: 'return-to-static', label: 'Use static guide', variant: 'secondary', testId: 'static-guide-button' });
  return actions;
}


function updateButton(button: HTMLButtonElement, spec: ActionSpec, className: string): void {
  button.type = 'button';
  button.className = className;
  button.dataset.uiAction = spec.command;
  button.dataset.variant = spec.variant;
  button.dataset.testid = spec.testId;
  button.textContent = spec.label;
  button.disabled = spec.disabled === true;
  if (spec.ariaLabel === undefined) button.removeAttribute('aria-label');
  else button.setAttribute('aria-label', spec.ariaLabel);
  if (spec.command === 'reset') {
    button.setAttribute('aria-label', 'Reset position to the safe point');
    button.removeAttribute('aria-keyshortcuts');
  } else if (spec.command === 'pause') {
    button.setAttribute('aria-keyshortcuts', 'Escape');
  } else {
    button.removeAttribute('aria-keyshortcuts');
  }

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

function createHelpPanel(documentRoot: Document, routeGuide: RouteGuide | null): DocumentFragment {
  const fragment = documentRoot.createDocumentFragment();
  const content = documentRoot.createElement('div');
  const intro = documentRoot.createElement('p');
  const controlsSection = documentRoot.createElement('section');
  const controlsHeading = documentRoot.createElement('h3');
  const controls = documentRoot.createElement('ul');

  content.className = 'drawer-scroll-region';
  content.dataset.testid = 'help-disclosure';
  content.tabIndex = 0;
  content.setAttribute('aria-label', 'Help content');
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
  if (routeGuide !== null) {
    content.append(createDisclosureSection(
      documentRoot,
      'app-help-suggested-walk-title',
      'Suggested walk',
      routeGuide.stops.map(({ title, summary }) => `${title}: ${summary}`),
      'help-suggested-walk',
    ));
  }
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

function createRadioOption(documentRoot: Document, name: string, id: string, value: string, labelText: string, description: string): HTMLLabelElement {
  const label = documentRoot.createElement('label');
  const input = documentRoot.createElement('input');
  const copy = documentRoot.createElement('span');
  const title = documentRoot.createElement('strong');
  const help = documentRoot.createElement('small');
  label.className = 'setting-option'; input.type = 'radio'; input.name = name; input.id = id; input.value = value; input.dataset.testid = id;
  title.textContent = labelText; help.textContent = description; copy.append(title, help); label.append(input, copy);
  return label;
}

function qualityStatus(state: QualityState): string {
  const tier = state.activeTier[0]!.toUpperCase() + state.activeTier.slice(1);
  if (state.preference !== 'auto') return `${tier} is active. Auto adjustments are off.`;
  if (state.transitionReason === 'auto-downshift') return `Auto is using ${tier} after a sustained slowdown.`;
  if (state.transitionReason === 'auto-upshift') return `Auto is using ${tier} after sustained smooth performance.`;
  return `Auto is using ${tier}.`;
}

function createSettingsPanel(documentRoot: Document, preferences: PreferenceSnapshot): DocumentFragment {
  const fragment = documentRoot.createDocumentFragment();
  const content = documentRoot.createElement('div');
  const intro = documentRoot.createElement('p');
  const quality = documentRoot.createElement('fieldset'); const qualityLegend = documentRoot.createElement('legend');
  const qualityExplanation = documentRoot.createElement('p'); const qualityState = documentRoot.createElement('p');
  const autoExplanation = documentRoot.createElement('p');
  const motion = documentRoot.createElement('fieldset'); const motionLegend = documentRoot.createElement('legend');
  const motionExplanation = documentRoot.createElement('p'); const motionState = documentRoot.createElement('p');
  const persistence = documentRoot.createElement('p');
  const controlsHeading = documentRoot.createElement('h3'); const controls = documentRoot.createElement('dl');
  const inputValue = preferences.primaryPointerCoarse ? 'Touch-first controls' : preferences.anyPointerFine ? 'Mouse and keyboard available' : preferences.touchCapable ? 'Touch controls available' : 'Keyboard fallback available';
  content.className = 'drawer-scroll-region settings-content'; content.tabIndex = 0; content.setAttribute('aria-label', 'Settings content'); content.dataset.testid = 'settings-content';
  intro.className = 'disclosure-intro'; intro.textContent = 'Choose how this visit balances detail and smooth movement.';
  quality.className = 'settings-fieldset'; quality.dataset.testid = 'quality-fieldset'; quality.setAttribute('aria-describedby', 'quality-explanation quality-auto-explanation quality-status');
  qualityLegend.textContent = 'Visual quality';
  quality.append(qualityLegend,
    createRadioOption(documentRoot, 'quality-preference', 'quality-auto', 'auto', 'Auto', 'Adjusts cautiously to keep movement smooth.'),
    createRadioOption(documentRoot, 'quality-preference', 'quality-low', 'low', 'Low', 'Lower resolution and reduced distant detail.'),
    createRadioOption(documentRoot, 'quality-preference', 'quality-medium', 'medium', 'Medium', 'Balanced image quality and scene detail.'),
    createRadioOption(documentRoot, 'quality-preference', 'quality-high', 'high', 'High', 'Sharpest image and fullest distant detail.'));
  qualityExplanation.id = 'quality-explanation'; qualityExplanation.textContent = 'Quality may change image sharpness, shadows, and distant detail, but keeps your position and the places along the route.';
  autoExplanation.id = 'quality-auto-explanation'; autoExplanation.textContent = 'Auto favors smooth walking. It lowers detail after a sustained slowdown and raises it only after a longer stable period.';
  qualityState.id = 'quality-status'; qualityState.className = 'setting-status';
  motion.className = 'settings-fieldset'; motion.dataset.testid = 'motion-fieldset'; motion.setAttribute('aria-describedby', 'motion-explanation motion-status'); motionLegend.textContent = 'Motion';
  motion.append(motionLegend,
    createRadioOption(documentRoot, 'motion-preference', 'motion-system', 'system', 'Follow device setting', 'Uses your browser or operating-system motion preference.'),
    createRadioOption(documentRoot, 'motion-preference', 'motion-reduced', 'reduced', 'Reduce motion', 'Always reduces non-essential motion for this visit.'));
  motionExplanation.id = 'motion-explanation'; motionExplanation.textContent = 'Reduced motion quiets wind, water, and non-essential interface transitions. Walking and looking remain immediate.';
  motionState.id = 'motion-status'; motionState.className = 'setting-status';
  persistence.id = 'settings-persistence-note'; persistence.className = 'setting-persistence';
  controlsHeading.textContent = 'Controls available'; controls.className = 'setting-list';
  controls.append(createSetting(documentRoot, 'Primary input', inputValue, preferences.hoverCapable ? 'Hover and fine-pointer feedback are available.' : 'Touch-sized controls and drag look remain available.'), createSetting(documentRoot, 'Keyboard', 'WASD and arrow keys', 'Keyboard movement remains available alongside mouse, drag, or touch look.'));
  content.append(intro, quality, qualityExplanation, autoExplanation, qualityState, motion, motionExplanation, motionState, persistence, controlsHeading, controls);
  fragment.append(createDrawerHeader(documentRoot, 'app-settings-title', 'Experience settings', 'close-settings-button'), content);
  return fragment;
}

function syncSettingsPanel(container: HTMLElement, state: QualityState): void {
  for (const input of container.querySelectorAll<HTMLInputElement>('input[name="quality-preference"]')) input.checked = input.value === state.preference;
  for (const input of container.querySelectorAll<HTMLInputElement>('input[name="motion-preference"]')) input.checked = input.value === state.motionPreference;
  const quality = container.querySelector('#quality-status'); if (quality !== null) quality.textContent = qualityStatus(state);
  const motion = container.querySelector('#motion-status');
  if (motion !== null) motion.textContent = state.motionPreference === 'reduced' ? 'Reduced motion is on.' : state.effectiveReducedMotion ? 'Your device requests reduced motion.' : 'Using your device setting: standard motion.';
  const persistence = container.querySelector('#settings-persistence-note');
  if (persistence !== null) persistence.textContent = state.persistence === 'saved' ? 'Changes are saved on this device.' : state.persistence === 'available' ? 'Choices can be saved on this device.' : 'Changes last only for this visit because browser storage is unavailable.';
  document.documentElement.dataset.motion = state.effectiveReducedMotion ? 'reduced' : 'standard';
}

export class AppUI {
  private readonly elements: AppUIElements;
  private readonly documentRoot: Document;
  private readonly onAction: AppUIActionHandler;
  private readonly preferences: PreferenceSnapshot;
  private settingsState: QualityState;
  private currentPanel: AppPanel = 'none';
  private readonly touchControls: TouchControls;
  private canFocusStart = false;
  private canFocusResume = false;
  private readonly announcements: AnnouncementBroker;
  private returnFocusCommand: ReturnFocusCommand | null = null;
  private destroyed = false;
  private routeGuide: RouteGuide | null = null;

  constructor(options: AppUIOptions) {
    this.documentRoot = document;
    this.elements = collectElements(this.documentRoot);
    this.announcements = new AnnouncementBroker((text) => {
      this.elements.status.hidden = false;
      this.elements.status.textContent = text;
    });
    this.onAction = options.onAction;
    this.preferences = options.preferences;
    this.settingsState = options.settings;
    const touchRoot = this.documentRoot.createElement('div');
    this.elements.interfaceLayer.append(touchRoot);
    this.touchControls = new TouchControls({ root: touchRoot, onAction: options.onInputAction });
    this.elements.interfaceLayer.addEventListener('click', this.handleClick);
    this.elements.settings.addEventListener('change', this.handleSettingsChange);
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
    this.renderProgress(state);
    this.renderDegradedNotice(state);
    this.renderUtilityControls(state, invariant.panel);
    this.renderPanels(invariant.panel, previousPanel);
    this.renderDrawerIsolation(invariant.panel);
    const touchVisible = invariant.isExploring && invariant.control === 'drag' && invariant.panel === 'none'
      && shouldOfferTouchControls(this.preferences);
    this.touchControls.sync({ visible: touchVisible, enabled: touchVisible });
    const settingsPanelTransition = invariant.panel === 'settings'
      || (previousPanel === 'settings' && invariant.panel === 'none'
        && (state.kind === 'onboarding' || state.kind === 'exploring' || state.kind === 'paused' || state.kind === 'degraded'));
    if (!settingsPanelTransition) this.renderStatus(view.status, stateAnnouncementKey);
    this.applyFocus(previousPanel, previouslyReady, focusedCommand);
  }

  focusStart(): boolean {
    return this.currentPanel === 'none' && this.canFocusStart && this.focusCommand('start');
  }

  focusResume(): boolean {
    return this.currentPanel === 'none' && this.canFocusResume && this.focusCommand('resume');
  }

  focusCanvas(): boolean {
    if (this.currentPanel !== 'none' || this.elements.canvas.tabIndex !== 0) return false;
    this.elements.canvas.focus({ preventScroll: true });
    return this.documentRoot.activeElement === this.elements.canvas;
  }

  focusPrimary(command: 'retry' | 'reload' | 'cancel-loading'): boolean {
    return this.focusCommand(command);
  }

  focusHeading(): void {
    this.elements.heading.tabIndex = -1;
    this.elements.heading.focus({ preventScroll: true });
  }

  setRouteGuide(routeGuide: RouteGuide | null): void {
    this.routeGuide = routeGuide;
    if (this.currentPanel === 'help') this.elements.help.replaceChildren(createHelpPanel(this.documentRoot, routeGuide));
  }

  updateSettings(state: QualityState): void {
    this.settingsState = state;
    syncSettingsPanel(this.elements.settings, state);
  }

  replaceCanvas(): HTMLCanvasElement {
    const replacement = this.elements.canvas.cloneNode(false) as HTMLCanvasElement;
    this.elements.canvas.replaceWith(replacement);
    this.elements.canvas = replacement;
    return replacement;
  }

  clearTouchControls(): void { this.touchControls.clear(); }

  get interactionViewportElement(): HTMLElement { return this.elements.experience; }

  setInteractionViewport(measurement: InteractionViewportMeasurement): void {
    const style = this.elements.experience.style;
    style.setProperty('--interaction-visible-left', `${measurement.visibleLeft}px`);
    style.setProperty('--interaction-visible-top', `${measurement.visibleTop}px`);
    style.setProperty('--interaction-visible-right', `${measurement.visibleRight}px`);
    style.setProperty('--interaction-visible-bottom', `${measurement.visibleBottom}px`);
    style.setProperty('--interaction-visible-width', `${measurement.visibleWidth}px`);
    style.setProperty('--interaction-visible-height', `${measurement.visibleHeight}px`);
    this.elements.experience.dataset.interactionOrientation = measurement.orientation;
    this.touchControls.setViewport(measurement);
  }

  announceReset(): void {
    this.announcements.announceReset('Position reset to the safe point.');
  }

  announceAuto(id: string, text: string): void {
    this.announcements.announceAuto(id, text);
  }

  announce(id: string, text: string): void {
    this.announcements.announcePriority(id, text);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.elements.interfaceLayer.removeEventListener('click', this.handleClick);
    this.elements.settings.removeEventListener('change', this.handleSettingsChange);
    this.documentRoot.removeEventListener('keydown', this.handleKeydown);
    this.touchControls.destroy();
    this.announcements.destroy();
    this.destroyed = true;
  }

  private readonly handleSettingsChange = (event: Event): void => {
    if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'radio' || !event.target.checked) return;
    if (event.target.name === 'quality-preference' && (event.target.value === 'auto' || event.target.value === 'low' || event.target.value === 'medium' || event.target.value === 'high')) {
      this.onAction({ type: 'QUALITY_PREFERENCE_CHANGED', preference: event.target.value });
    } else if (event.target.name === 'motion-preference' && (event.target.value === 'system' || event.target.value === 'reduced')) {
      this.onAction({ type: 'MOTION_PREFERENCE_CHANGED', preference: event.target.value });
    }
  };

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
    const describedBy = new Set((this.elements.canvas.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
    if (state.kind === 'degraded') describedBy.add('app-degraded-text');
    else describedBy.delete('app-degraded-text');
    this.elements.canvas.setAttribute('aria-describedby', [...describedBy].join(' '));
    this.elements.root.dataset.appState = state.kind;
    this.elements.root.dataset.panel = invariant.panel;
    if (invariant.control === null) {
      delete this.elements.root.dataset.controlMode;
    } else {
      this.elements.root.dataset.controlMode = invariant.control;
    }

    const busy = state.kind === 'boot' || state.kind === 'loading' || state.kind === 'context-lost';
    this.elements.experience.removeAttribute('aria-busy');
    if (busy) {
      this.elements.overlay.setAttribute('aria-busy', 'true');
    } else {
      this.elements.overlay.removeAttribute('aria-busy');
    }
    this.elements.canvas.hidden = state.kind === 'static';
    if (invariant.isExploring && invariant.panel === 'none') {
      this.elements.canvas.tabIndex = 0;
      this.elements.canvas.dataset.lookActive = invariant.control === 'drag' ? 'true' : 'false';
    } else {
      this.elements.canvas.removeAttribute('tabindex');
      delete this.elements.canvas.dataset.lookActive;
    }
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

  private renderProgress(state: AppState): void {
    const blocking = state.kind === 'loading' || state.kind === 'context-lost';
    this.elements.progressRegion.hidden = !blocking;
    if (!blocking) {
      this.elements.progress.removeAttribute('value');
      this.elements.progress.removeAttribute('aria-valuetext');
      this.elements.progressLabel.textContent = '';
      return;
    }
    if (state.kind === 'loading' && state.progress?.kind === 'items') {
      const { loaded, total } = state.progress;
      this.elements.progress.max = total;
      this.elements.progress.value = loaded;
      this.elements.progress.setAttribute('aria-valuetext', `${loaded} of ${total} items loaded`);
      this.elements.progressLabel.textContent = `Loaded ${loaded} of ${total} items.`;
      return;
    }
    this.elements.progress.removeAttribute('value');
    this.elements.progress.removeAttribute('aria-valuetext');
    this.elements.progressLabel.textContent = state.kind === 'context-lost'
      ? (state.phase === 'rebuilding' ? 'Restoring graphics.' : 'Waiting for graphics to return.')
      : state.phase === 'items'
        ? 'Loading items. Total item count is not yet known.'
        : 'Preparing required resources. Item total not yet known.';
  }

  private renderDegradedNotice(state: AppState): void {
    const visible = state.kind === 'degraded';
    this.elements.degradedNotice.hidden = !visible;
    this.elements.degradedNotice.inert = !visible || (state.panel ?? 'none') !== 'none';
    if (!visible) {
      this.elements.degradedActions.replaceChildren();
      return;
    }
    const pending = (state.failures ?? []).some(({ status }) => status === 'retrying');
    reconcileButtons(this.documentRoot, this.elements.degradedActions, [{ command: 'retry-optional', label: pending ? 'Retrying…' : 'Retry guide', variant: 'secondary', testId: 'retry-optional-button', disabled: pending }], 'action-button');
  }

  private renderActions(specs: readonly ActionSpec[]): void {
    reconcileButtons(this.documentRoot, this.elements.actions, specs, 'action-button');
  }

  private renderUtilityControls(state: AppState, panel: AppPanel): void {
    const specs: ActionSpec[] = [];
    const operational = state.kind === 'exploring' || state.kind === 'paused'
      || (state.kind === 'degraded' && (state.underlying?.kind === 'exploring' || state.underlying?.kind === 'paused'));
    if (operational) {
      specs.push({ command: 'reset', label: 'Reset', variant: 'secondary', testId: 'reset-button' });
    }
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
      this.elements.help.replaceChildren(createHelpPanel(this.documentRoot, this.routeGuide));
      this.elements.settings.replaceChildren();
    } else if (panel === 'settings') {
      this.elements.settings.replaceChildren(createSettingsPanel(this.documentRoot, this.preferences));
      syncSettingsPanel(this.elements.settings, this.settingsState);
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
    this.elements.canvas.inert = covered;
  }

  private renderStatus(status: string, key: string): void {
    this.announcements.announcePriority(key, status);
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
