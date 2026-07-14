import {
  INITIAL_APP_STATE,
  getAppStateInvariant,
  normalizeRestorableProjection,
  reduceAppState,
  type AppEvent,
  type AppState,
} from './appState';
import { detectCapabilities, detectGraphicsCapabilityFacts, type CapabilityDetectionOptions } from '../platform/capabilities';
import { detectPreferences, loadPersistedPreferences, observeReducedMotion, savePersistedPreferences, type PreferenceSnapshot } from '../platform/preferences';
import { InteractionViewportObserver } from '../platform/viewport';
import { createAppUI, type AppUI, type AppUIAction } from '../ui/AppUI';
import { ThreeRuntime } from '../render/ThreeRuntime';
import { APP_CONFIG } from './config';
import { DEFAULT_CAMERA_RADIUS } from '../exploration/navigation';
import { InputController } from '../exploration/InputController';
import { MovementController } from '../exploration/MovementController';
import { PointerLockLook, type PointerLockOutcome } from '../exploration/PointerLockLook';
import { DragLook } from '../exploration/DragLook';
import { TouchLook } from '../exploration/TouchLook';
import type { InputClearReason } from '../exploration/types';
import { AssetCoordinator, type AssetAttempt, type LoadOutcome } from '../loading/AssetCoordinator';
import { neutralRouteGuideFallback, optionalFallback, requiredFailureMessage } from '../loading/fallbacks';
import { parseRouteGuide, ROUTE_GUIDE_ASSET_ID, ROUTE_GUIDE_URL, type RouteGuide } from '../loading/routeGuide';
import { ContextRecovery, type ContextToken } from '../render/contextRecovery';
import type { MovementPose } from '../exploration/MovementController';
import { QualityController, type QualityApplication, type QualityState } from '../quality/QualityController';
import { qualityProfile, type QualityCapabilityFacts } from '../quality/qualityTiers';

type DevelopmentScenario =
  | 'unsupported'
  | 'locked'
  | 'denied'
  | 'error'
  | 'unlocked'
  | 'paused'
  | 'degraded'
  | 'context-lost'
  | 'fatal';

const DEVELOPMENT_SCENARIOS: Record<DevelopmentScenario, true> = {
  unsupported: true,
  locked: true,
  denied: true,
  error: true,
  unlocked: true,
  paused: true,
  degraded: true,
  'context-lost': true,
  fatal: true,
};

function readDevelopmentScenario(location: Location): DevelopmentScenario | null {
  if (!import.meta.env.DEV) return null;
  const candidate = new URLSearchParams(location.search).get('lifecycle');
  return candidate !== null && Object.hasOwn(DEVELOPMENT_SCENARIOS, candidate)
    ? (candidate as DevelopmentScenario)
    : null;
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function waitForDevelopmentHold(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export interface AppControllerConfig {
  readonly capabilityOptions?: CapabilityDetectionOptions;
}

export function installPageHideHandler(
  controller: Pick<AppController, 'handlePageHide'>,
  target: Window = window,
): () => void {
  const onPageHide = (event: PageTransitionEvent): void => controller.handlePageHide(event);
  target.addEventListener('pagehide', onPageHide);
  return () => target.removeEventListener('pagehide', onPageHide);
}

interface QueuedOptionalOutcome {
  readonly source: 'startup' | 'retry';
  readonly attempt: number;
  readonly outcome: LoadOutcome<RouteGuide>;
}
export function respondToDevelopmentQualityState(
  detail: unknown,
  getState: () => QualityState,
  development = import.meta.env.DEV,
): boolean {
  if (!development || typeof detail !== 'object' || detail === null) return false;
  const request = detail as Record<string, unknown>;
  if (request.action !== 'quality/state' || typeof request.respond !== 'function') return false;
  (request.respond as (state: QualityState) => void)(getState());
  return true;
}


export class AppController {
  private state: AppState = INITIAL_APP_STATE;

  private readonly scenario: DevelopmentScenario | null;
  private readonly capabilityOptions: CapabilityDetectionOptions | undefined;
  private readonly preferences: PreferenceSnapshot;
  private readonly ui: AppUI;
  private readonly qualityController: QualityController;
  private readonly stopMotionObservation: () => void;
  private runtime: ThreeRuntime | null = null;
  private inputController: InputController | null = null;
  private pointerLockLook: PointerLockLook | null = null;
  private dragLook: DragLook | null = null;
  private touchLook: TouchLook | null = null;
  private interactionViewportObserver: InteractionViewportObserver | null = null;
  private movementController: MovementController | null = null;
  private destroyed = false;
  private hasConfirmedPointerLock = false;
  private pointerLockTerminalFallback = false;
  private developmentRuntimeCleanup: (() => void) | null = null;
  private readonly assetCoordinator = new AssetCoordinator({
    onProgress: (attempt, progress) => this.dispatch({ type: 'LOAD_PROGRESS', attempt, progress, canCancel: progress.phase !== 'essential' }),
  });
  private activeAssetAttempt: AssetAttempt | null = null;
  private contextRecovery: ContextRecovery | null = null;
  private recoveryPose: MovementPose | null = null;
  private recoveryToken: ContextToken | null = null;
  private recoveryAbort: AbortController | null = null;
  private recoveryQuality: QualityApplication | null = null;
  private recoveryRuntime: ThreeRuntime | null = null;
  private queuedOptionalOutcome: QueuedOptionalOutcome | null = null;
  private readonly routeTimeoutMs: number;
  private readonly recoveryTimeoutMs: number;
  private readonly failRuntimeBuild: boolean;
  private readonly failRecoveryBuild: boolean;
  private readonly recoveryHoldMs: number;
  private readonly loadingHoldMs: number;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return;
    }

    const isExploring =
      this.state.kind === 'exploring' ||
      (this.state.kind === 'degraded' && this.state.underlying?.kind === 'exploring');
    if (isExploring) {
      event.preventDefault();
      this.dispatch({ type: 'PAUSE' });
    }
  };

  constructor(location: Location = window.location, config: AppControllerConfig = {}) {
    this.scenario = readDevelopmentScenario(location);
    this.capabilityOptions = import.meta.env.DEV ? config.capabilityOptions : undefined;
    const developmentParameters = new URLSearchParams(location.search);
    const requestedRecoveryTimeout = import.meta.env.DEV ? Number(developmentParameters.get('recoveryTimeoutMs')) : Number.NaN;
    this.recoveryTimeoutMs = Number.isFinite(requestedRecoveryTimeout) && requestedRecoveryTimeout > 0 ? requestedRecoveryTimeout : 10_000;
    const requestedRecoveryHold = import.meta.env.DEV ? Number(developmentParameters.get('recoveryHoldMs')) : Number.NaN;
    this.recoveryHoldMs = Number.isFinite(requestedRecoveryHold) && requestedRecoveryHold > 0 ? requestedRecoveryHold : 0;
    const requestedTimeout = import.meta.env.DEV ? Number(developmentParameters.get('routeTimeoutMs')) : Number.NaN;
    this.routeTimeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : 60_000;
    this.failRuntimeBuild = import.meta.env.DEV && developmentParameters.get('failRuntime') === '1';
    this.failRecoveryBuild = import.meta.env.DEV && developmentParameters.get('failRecovery') === '1';
    const requestedHold = import.meta.env.DEV ? Number(developmentParameters.get('loadingHoldMs')) : Number.NaN;
    this.loadingHoldMs = Number.isFinite(requestedHold) && requestedHold > 0 ? requestedHold : 0;
    this.preferences = detectPreferences();
    const graphics = detectGraphicsCapabilityFacts();
    const qualityFacts: QualityCapabilityFacts = Object.freeze({
      acceleration: graphics.acceleration, deviceMemoryGiB: graphics.deviceMemoryGiB,
      primaryPointerCoarse: this.preferences.primaryPointerCoarse, anyPointerFine: this.preferences.anyPointerFine,
      hoverCapable: this.preferences.hoverCapable, maxTextureSize: graphics.maxTextureSize, maxAnisotropy: graphics.maxAnisotropy,
      cssWidth: window.innerWidth, cssHeight: window.innerHeight, devicePixelRatio: window.devicePixelRatio,
    });
    const persisted = loadPersistedPreferences();
    let ui: AppUI | null = null; let announcedRevision = 0;
    this.qualityController = new QualityController({
      initial: persisted, capabilities: qualityFacts, systemReducedMotion: this.preferences.prefersReducedMotion,
      apply: (next) => this.applyQualityApplication(next), persist: (value) => savePersistedPreferences(value),
      onStateChange: (state) => {
        ui?.updateSettings(state);
        if (ui !== null && state.transitionRevision > announcedRevision) {
          announcedRevision = state.transitionRevision;
          this.announceQualityTransition(state);
        }
      },
    });
    this.qualityController.suspend('paused');
    ui = createAppUI({
      preferences: this.preferences, settings: this.qualityController.state,
      onAction: (action) => this.handleUIAction(action),
      onInputAction: (action, pressed) => this.inputController?.setAction(action, pressed),
    });
    this.ui = ui;
    document.documentElement.dataset.motion = this.qualityController.state.effectiveReducedMotion ? 'reduced' : 'standard';
    this.stopMotionObservation = observeReducedMotion((reduced) => this.qualityController.setSystemReducedMotion(reduced));
  }

  start(): void {
    this.render();
    this.interactionViewportObserver = new InteractionViewportObserver(this.ui.interactionViewportElement, {
      onChange: (measurement) => this.ui.setInteractionViewport(measurement),
      onInterrupt: () => this.handleInteractionViewportInterrupt(),
    });
    this.interactionViewportObserver.start();
    window.addEventListener('keydown', this.onKeyDown);
    if (import.meta.env.DEV) this.installDevelopmentRuntimeSurface();
    const attempt = this.assetCoordinator.beginAttempt();
    this.activeAssetAttempt = attempt;
    this.dispatch({ type: 'BOOT', attempt: attempt.generation });
    void this.beginLoadAttempt(attempt);
  }

  handlePageHide(event: PageTransitionEvent): void {
    if (!event.persisted) this.destroy();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const errors: unknown[] = [];
    const cleanup = (stage: () => void): void => {
      try {
        stage();
      } catch (error) {
        errors.push(error);
      }
    };
    cleanup(() => window.removeEventListener('keydown', this.onKeyDown));
    cleanup(() => this.assetCoordinator.dispose());
    cleanup(() => this.stopMotionObservation());
    cleanup(() => this.qualityController.dispose());
    cleanup(() => this.clearContextRecovery());
    cleanup(() => this.developmentRuntimeCleanup?.());
    this.developmentRuntimeCleanup = null;
    cleanup(() => this.interactionViewportObserver?.dispose());
    this.interactionViewportObserver = null;
    cleanup(() => this.disposeRuntime());
    cleanup(() => this.ui.destroy());
    if (errors.length !== 0) throw new AggregateError(errors, 'AppController destruction failed.');
  }

  private handleUIAction(action: AppUIAction): void {
    if (action.type === 'QUALITY_PREFERENCE_CHANGED') {
      try { this.qualityController.setQualityPreference(action.preference); }
      catch { this.ui.updateSettings(this.qualityController.state); this.ui.announce(`quality:failed:${Date.now()}`, `${action.preference[0]!.toUpperCase()}${action.preference.slice(1)} could not be applied. ${this.qualityController.state.activeTier[0]!.toUpperCase()}${this.qualityController.state.activeTier.slice(1)} is still active.`); }
      return;
    }
    if (action.type === 'MOTION_PREFERENCE_CHANGED') {
      try { this.qualityController.setMotionPreference(action.preference); }
      catch { this.ui.updateSettings(this.qualityController.state); this.ui.announce(`motion:failed:${Date.now()}`, 'Motion preference could not be applied. Previous settings were kept.'); }
      return;
    }
    if (action.type === 'RESET') { this.resetExploration(); return; }
    if (action.type === 'CANCEL_LOADING') {
      const attempt = this.activeAssetAttempt;
      if (attempt?.cancel()) {
        this.activeAssetAttempt = null;
        this.dispatch({ type: 'LOAD_CANCELLED', attempt: attempt.generation });
        this.ui.focusPrimary('retry');
      }
      return;
    }
    if (action.type === 'RELOAD') { window.location.reload(); return; }
    if (action.type === 'RETURN_TO_STATIC') {
      const replaceCanvas = this.state.kind === 'context-lost' || this.state.kind === 'recovery-failed';
      if (this.dispatch(action)) {
        this.clearContextRecovery(); this.disposeRuntime();
        if (replaceCanvas) this.ui.replaceCanvas();
        this.ui.focusHeading();
      }
      return;
    }
    if (action.type === 'RETRY_OPTIONAL') {
      if (import.meta.env.DEV) document.documentElement.dataset.optionalRetryActivated = 'true';
      if (this.dispatch({ type: 'RETRY_OPTIONAL', assetId: ROUTE_GUIDE_ASSET_ID })) void this.retryOptionalGuide();
      return;
    }
    if (action.type === 'RETRY') {
      const replaceCanvas = this.state.kind === 'context-lost' || this.state.kind === 'recovery-failed' || (this.state.kind === 'static' && this.state.reason === 'recovery-failed');
      const next = this.assetCoordinator.retry();
      if (this.dispatch({ type: 'RETRY', attempt: next.generation })) {
        this.clearContextRecovery(); this.disposeRuntime();
        if (replaceCanvas) this.ui.replaceCanvas();
        this.activeAssetAttempt = next;
        void this.beginLoadAttempt(next);
        this.ui.focusPrimary('cancel-loading');
      } else next.cancel();
      return;
    }
    const transitioned = this.dispatch(action);
    if (!transitioned) return;
    if (action.type === 'START_EXPLORING' || action.type === 'RESUME') {
      this.ui.focusCanvas();
      this.inputController?.setIntentionalFocus(true);
      const mayRequestInitialLock = action.type === 'START_EXPLORING';
      const mayReacquireOwnedLock = action.type === 'RESUME' && this.hasConfirmedPointerLock && !this.pointerLockTerminalFallback;
      if (this.scenario === null && this.hasFinePointer() && (mayRequestInitialLock || mayReacquireOwnedLock)) this.pointerLockLook?.requestLock();
      this.applyExplorationScenario();
    }
  }

  private async beginLoadAttempt(attempt: AssetAttempt): Promise<void> {
    const options: CapabilityDetectionOptions = this.scenario === 'unsupported' ? { result: false } : (this.capabilityOptions ?? {});
    const capabilities = detectCapabilities(options);
    if (capabilities.status === 'unsupported') {
      this.dispatch({ type: 'CAPABILITY_UNSUPPORTED', reason: capabilities.reason });
      return;
    }
    if (this.loadingHoldMs > 0) await waitForDevelopmentHold(this.loadingHoldMs);
    await waitForPaint();
    if (attempt.signal.aborted || this.destroyed) return;
    const optionalPromise = attempt.loadOptional({ id: ROUTE_GUIDE_ASSET_ID, label: 'Route guide', url: ROUTE_GUIDE_URL, kind: 'optional', timeoutMs: this.routeTimeoutMs, parse: parseRouteGuide });
    if (this.loadingHoldMs > 0) await waitForDevelopmentHold(this.loadingHoldMs);
    await waitForPaint();
    if (attempt.signal.aborted || this.destroyed) return;
    this.dispatch({ type: 'LOAD_PROGRESS', attempt: attempt.generation, progress: { kind: 'indeterminate', phase: 'essential', label: 'Building the procedural district' }, canCancel: false });
    const essential = await attempt.runEssential(() => {
      if (this.failRuntimeBuild) throw new Error('Forced DEV runtime build failure.');
      if (!this.createRuntime()) throw new Error('Runtime construction failed.');
    });
    if (essential.kind === 'cancelled') return;
    if (essential.kind === 'failed') {
      this.dispatch({ type: 'LOAD_FAILED', attempt: attempt.generation, reason: requiredFailureMessage(essential.failure) });
      this.ui.focusPrimary('retry');
      return;
    }
    this.activeAssetAttempt = null;
    this.dispatch({ type: 'LOAD_ESSENTIAL_READY', attempt: attempt.generation });
    this.installContextRecovery();
    this.applyPostCapabilityScenario();
    this.applyOptionalOutcome(attempt.generation, await optionalPromise);
  }

  private applyOptionalOutcome(attempt: number, outcome: LoadOutcome<RouteGuide>): void {
    if (this.state.kind === 'context-lost') {
      this.queuedOptionalOutcome = { source: 'startup', attempt, outcome };
      return;
    }
    if (outcome.kind === 'ready') {
      this.ui.setRouteGuide(outcome.value);
      return;
    }
    if (outcome.kind === 'degraded') {
      if (import.meta.env.DEV) {
        document.documentElement.dataset.optionalFailure = outcome.failures[0]?.kind ?? 'unknown';
        document.documentElement.dataset.optionalCause = String(outcome.failures[0]?.cause);
      }
      this.ui.setRouteGuide(neutralRouteGuideFallback());
      this.dispatch({ type: 'LOAD_OPTIONAL_FAILED', attempt, failure: optionalFallback(outcome.failures[0]!) });
      this.ui.announce(`optional:${attempt}:failed`, 'Route guide unavailable. The 3D scene and controls still work.');
    }
  }

  private async retryOptionalGuide(): Promise<void> {
    this.ui.announce('optional:retrying', 'Retrying the route guide.');
    const attempt = this.assetCoordinator.retry();
    const outcome = await attempt.loadOptional({ id: ROUTE_GUIDE_ASSET_ID, label: 'Route guide', url: ROUTE_GUIDE_URL, kind: 'optional', timeoutMs: this.routeTimeoutMs, parse: parseRouteGuide });
    if (this.state.kind === 'context-lost') {
      this.queuedOptionalOutcome = { source: 'retry', attempt: attempt.generation, outcome };
      return;
    }
    this.applyRetriedOptionalOutcome(attempt.generation, outcome);
  }

  private applyRetriedOptionalOutcome(attempt: number, outcome: LoadOutcome<RouteGuide>): void {
    if (outcome.kind === 'ready') {
      this.ui.setRouteGuide(outcome.value);
      this.dispatch({ type: 'LOAD_OPTIONAL_RECOVERED', assetId: ROUTE_GUIDE_ASSET_ID });
      this.ui.announce(`optional:${attempt}:restored`, 'Route guide restored.');
      this.focusOperationalState();
    } else if (outcome.kind === 'degraded') {
      this.ui.setRouteGuide(neutralRouteGuideFallback());
      this.dispatch({ type: 'LOAD_OPTIONAL_FAILED', failure: optionalFallback(outcome.failures[0]!) });
      this.ui.announce(`optional:${attempt}:failed`, 'Route guide is still unavailable. The 3D scene and controls still work.');
    }
  }

  private applyPostCapabilityScenario(): void {
    switch (this.scenario) {
      case 'degraded':
        this.dispatch({ type: 'DEGRADED', reason: 'Forced reduced-mode scenario.' });
        break;
      case 'context-lost':
        this.dispatch({ type: 'CONTEXT_LOST' });
        break;
      case 'fatal':
        this.dispatch({ type: 'FATAL', reason: 'Forced fatal scenario.' });
        break;
      case 'paused':
        if (this.dispatch({ type: 'START_EXPLORING' })) {
          this.dispatch({ type: 'PAUSE' });
        }
        break;
      default:
        break;
    }
  }

  private applyExplorationScenario(): void {
    switch (this.scenario) {
      case 'locked':
        this.dispatch({ type: 'POINTER_LOCK_CONFIRMED' });
        break;
      case 'denied':
        this.dispatch({ type: 'POINTER_LOCK_DENIED' });
        break;
      case 'error':
        this.dispatch({ type: 'POINTER_LOCK_ERROR' });
        break;
      case 'unlocked':
        this.dispatch({ type: 'POINTER_LOCK_CONFIRMED' });
        this.dispatch({ type: 'POINTER_UNLOCKED' });
        break;
      default:
        break;
    }
  }

  private installDevelopmentRuntimeSurface(): void {
    if (!import.meta.env.DEV) return;
    const eventName = 'three-runtime:command';
    const listener = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as Record<string, unknown> | null;
      if (respondToDevelopmentQualityState(detail, () => this.qualityController.state)) return;
      if (detail?.action === 'rebuild') { this.runtime?.rebuildScene(); return; }
      if (detail?.action === 'quality/set-preference') {
        const preference = detail.preference;
        if (preference === 'auto' || preference === 'low' || preference === 'medium' || preference === 'high') this.qualityController.setQualityPreference(preference);
        return;
      }
      if (detail?.action === 'quality/set-motion') {
        const preference = detail.preference;
        if (preference === 'system' || preference === 'reduced') this.qualityController.setMotionPreference(preference);
        return;
      }
      if (detail?.action === 'quality/sample' && typeof detail.nowMs === 'number') { this.qualityController.sampleFrame(detail.nowMs); return; }
      if (detail?.action === 'quality/metrics-snapshot') { this.runtime?.publishMetricsNow(); return; }
      if (detail?.action === 'quality/metrics-reset') { this.runtime?.resetPerformanceMetrics(); return; }
      if (detail?.action === 'quality/metrics-stream' && typeof detail.enabled === 'boolean') { this.runtime?.setDevelopmentMetricsStreaming(detail.enabled); return; }
      if (detail?.action === 'landscape/set-settings') {
        const settings = detail.settings;
        if (typeof settings === 'object' && settings !== null) {
          const { density, motion } = settings as Record<string, unknown>;
          if ((density === 'high' || density === 'medium' || density === 'low') && (motion === 'standard' || motion === 'reduced')) {
            this.runtime?.applyQuality(Object.freeze({ profile: qualityProfile(density), motion }));
          }
        }
        return;
      }
      if (detail?.action === 'landscape/freeze-time') { if (typeof detail.time === 'number' && Number.isFinite(detail.time) && detail.time >= 0) this.runtime?.setLandscapeCaptureTime(detail.time); return; }
      if (detail?.action === 'landscape/unfreeze') { this.runtime?.setLandscapeCaptureTime(null); return; }
      if (detail?.action === 'landscape/reset') { this.runtime?.resetLandscape(); return; }
      if (detail?.action === 'landscape/frame') { if (typeof detail.view === 'string') this.runtime?.frameLandscape(detail.view); return; }
      if (detail?.action === 'environment/probe') {
        const position = detail.position;
        const target = detail.target;
        if (Array.isArray(position) && position.length === 3 && position.every((value) => typeof value === 'number' && Number.isFinite(value)) && Array.isArray(target) && target.length === 3 && target.every((value) => typeof value === 'number' && Number.isFinite(value))) this.runtime?.frameEnvironmentProbe(position as unknown as readonly [number, number, number], target as unknown as readonly [number, number, number], typeof detail.id === 'string' ? detail.id : 'probe');
        return;
      }
      if (detail?.action === 'environment/frame') { if (typeof detail.view === 'string') this.runtime?.frameEnvironment(detail.view); return; }
      if (detail?.action === 'environment/set-camera-pose') {
        const position = detail.position; const target = detail.target;
        if (Array.isArray(position) && position.length === 3 && position.every((value) => typeof value === 'number' && Number.isFinite(value))
          && Array.isArray(target) && target.length === 3 && target.every((value) => typeof value === 'number' && Number.isFinite(value))) {
          this.runtime?.setEnvironmentCameraPose(position as unknown as readonly [number, number, number], target as unknown as readonly [number, number, number]);
        }
        return;
      }
      if (detail?.action === 'world-debug/set-visible') { if (typeof detail.visible === 'boolean') this.runtime?.setWorldDebugVisible(detail.visible); return; }
      if (detail?.action === 'world-debug/visit-anchor') { if (typeof detail.anchorId === 'string') this.runtime?.visitWorldAnchor(detail.anchorId); return; }
      if (detail?.action === 'world-debug/frame-view') { if (detail.name === 'grid' || detail.name === 'public-green' || detail.name === 'sightlines' || detail.name === 'planting') this.runtime?.frameWorldDebugView(detail.name); return; }
      if (detail?.action === 'world-debug/probe') {
        if (typeof detail.x === 'number' && Number.isFinite(detail.x) && typeof detail.z === 'number' && Number.isFinite(detail.z)) {
          const radius = typeof detail.radius === 'number' && Number.isFinite(detail.radius) ? detail.radius : undefined;
          const candidate = detail.from as Record<string, unknown> | null;
          const from = candidate !== null && typeof candidate === 'object' && typeof candidate.x === 'number' && Number.isFinite(candidate.x) && typeof candidate.z === 'number' && Number.isFinite(candidate.z) ? { x: candidate.x, z: candidate.z } : undefined;
          this.runtime?.probeWorldNavigation({ x: detail.x, z: detail.z }, radius, from);
        }
        return;
      }
      if (detail?.action === 'architecture/frame') { if (typeof detail.subjectId === 'string' && (detail.view === 'front' || detail.view === 'three-quarter' || detail.view === 'route' || detail.view === 'low')) this.runtime?.frameArchitecture(detail.subjectId, detail.view); return; }
      if (detail?.action !== 'cycle' || this.runtime === null) return;
      const count = Math.min(100, Math.max(1, typeof detail.count === 'number' ? Math.floor(detail.count) : 10));
      for (let index = 0; index < count; index += 1) { this.disposeRuntime(); if (!this.createRuntime()) break; }
    };
    document.addEventListener(eventName, listener);
    this.developmentRuntimeCleanup = () => document.removeEventListener(eventName, listener);
  }

  private applyQualityApplication(next: QualityApplication): void {
    if (this.runtime === null) return;
    const pose = this.movementController?.pose ?? null;
    this.qualityController.suspend('rebuild');
    this.inputController?.clear('viewport'); this.dragLook?.cancel(); this.touchLook?.cancel(); this.ui.clearTouchControls();
    try {
      this.runtime.applyQuality(next);
      if (pose !== null) this.movementController?.restorePose(pose);
      this.movementController?.invalidateResumeDelta();
    } finally { this.qualityController.resume('rebuild'); }
  }

  private announceQualityTransition(state: QualityState): void {
    const tier = state.activeTier[0]!.toUpperCase() + state.activeTier.slice(1);
    const saved = state.persistence === 'saved';
    let message: string;
    if (state.transitionReason === 'auto-downshift') message = `Auto changed quality to ${tier} to keep movement smooth.`;
    else if (state.transitionReason === 'auto-upshift') message = `Auto changed quality to ${tier} after sustained smooth performance.`;
    else if (state.transitionReason === 'user-quality') message = state.preference === 'auto'
      ? `Auto selected${saved ? ' and saved' : ''}. Currently using ${tier}.`
      : `${tier} is active${saved ? ' and saved on this device' : ' for this visit, but this browser could not save the choice'}.`;
    else if (state.transitionReason === 'user-motion') message = state.motionPreference === 'reduced'
      ? `Reduced motion is on${saved ? ' and saved on this device' : ' for this visit, but this browser could not save the choice'}.`
      : state.effectiveReducedMotion ? 'Following your device setting. Reduced motion remains on.' : 'Following your device setting. Standard motion is now allowed.';
    else message = state.effectiveReducedMotion ? 'Device motion preference changed. Reduced motion is now on.' : 'Device motion preference changed. Standard motion is now allowed.';
    if (state.transitionReason === 'auto-downshift' || state.transitionReason === 'auto-upshift') this.ui.announceAuto(`settings:${state.transitionRevision}`, message);
    else this.ui.announce(`settings:${state.transitionRevision}`, message);
  }

  private createRuntime(application: QualityApplication = this.qualityController.application): boolean {
    if (this.destroyed || this.runtime !== null) return this.runtime !== null;
    const canvas = document.querySelector<HTMLCanvasElement>('#app-canvas');
    if (canvas === null) return false;
    let runtime: ThreeRuntime | null = null;
    let input: InputController | null = null;
    let look: PointerLockLook | null = null;
    let drag: DragLook | null = null;
    let touch: TouchLook | null = null;
    let movement: MovementController | null = null;
    try {
      runtime = new ThreeRuntime(canvas, { onUpdate: (frame) => this.movementController?.update(frame.deltaSeconds), onPerformanceSample: (timestamp) => this.qualityController.sampleFrame(timestamp), qualityApplication: application });
      const world = runtime.worldBuildResult;
      if (world === null) throw new Error('The graphics world was not initialized.');
      input = new InputController({ canvas, onClear: (reason) => this.handleInputClear(reason), onReset: () => this.announceExplorationReset() });
      movement = new MovementController({ camera: runtime.camera, input, navigation: world.navigation, spawnPose: { position: world.navigation.spawn, yaw: world.data.spawnYaw }, resetPose: { position: world.navigation.reset, yaw: world.data.resetYaw }, eyeHeight: APP_CONFIG.camera.eyeHeight, walkSpeed: APP_CONFIG.controls.walkSpeed, cameraRadius: DEFAULT_CAMERA_RADIUS, maxPitchRadians: APP_CONFIG.controls.maxPitchRadians, maxDeltaSeconds: APP_CONFIG.controls.maxDeltaSeconds });
      look = new PointerLockLook({ target: canvas, sensitivityRadiansPerPixel: APP_CONFIG.controls.lookSensitivityRadiansPerPixel, onLook: (delta) => this.movementController?.applyLook(delta), onOutcome: (outcome) => this.handlePointerLockOutcome(outcome) });
      drag = new DragLook({ target: canvas, sensitivityRadiansPerPixel: APP_CONFIG.controls.lookSensitivityRadiansPerPixel, onLook: (delta) => this.movementController?.applyLook(delta) });
      touch = new TouchLook({ target: canvas, sensitivityRadiansPerPixel: APP_CONFIG.controls.lookSensitivityRadiansPerPixel, onLook: (delta) => this.movementController?.applyLook(delta) });
      this.runtime = runtime; this.inputController = input; this.movementController = movement; this.pointerLockLook = look; this.dragLook = drag; this.touchLook = touch;
      input.start(); look.start(); drag.start(); touch.start(); this.syncExplorationControllers();
      return true;
    } catch {
      this.runtime = null; this.inputController = null; this.movementController = null; this.pointerLockLook = null; this.dragLook = null; this.touchLook = null;
      drag?.dispose(); touch?.dispose(); look?.dispose(); input?.dispose(); movement?.setActive(false); runtime?.dispose();
      return false;
    }
  }

  private disposeRuntime(): void {
    const runtime = this.runtime; const input = this.inputController; const movement = this.movementController; const look = this.pointerLockLook; const drag = this.dragLook; const touch = this.touchLook;
    this.runtime = null; this.inputController = null; this.movementController = null; this.pointerLockLook = null; this.dragLook = null; this.touchLook = null; this.hasConfirmedPointerLock = false; this.pointerLockTerminalFallback = false;
    look?.releaseLock(); look?.dispose(); drag?.dispose(); touch?.dispose(); input?.dispose(); movement?.setActive(false); runtime?.dispose();
  }

  private installContextRecovery(): void {
    if (this.contextRecovery !== null || this.runtime === null) return;
    this.contextRecovery = new ContextRecovery(this.runtime.renderer.domElement, { onLost: (token) => this.handleContextLost(token), onRestoreRequested: (token) => void this.handleContextRestore(token), onRestoreTimeout: (token) => this.handleContextRecoveryFailure(token) }, this.recoveryTimeoutMs);
    this.contextRecovery.start();
  }

  private handleContextLost(token: ContextToken): void {
    if (this.runtime === null || this.movementController === null || this.destroyed) return;
    const canvasOwnedFocus = document.activeElement === this.runtime.renderer.domElement || this.hasConfirmedPointerLock;
    this.recoveryAbort?.abort(); this.recoveryAbort = new AbortController(); this.recoveryToken = token; this.recoveryPose = this.movementController.pose; this.recoveryQuality = this.runtime.currentQuality; this.recoveryRuntime = this.runtime;
    this.qualityController.suspend('context-lost');
    this.inputController?.clear('context-lost'); this.dragLook?.cancel(); this.touchLook?.cancel(); this.pointerLockLook?.releaseLock(); this.ui.clearTouchControls(); this.movementController.invalidateResumeDelta(); this.runtime.suspend('context-lost');
    this.dispatch({ type: 'CONTEXT_LOST' });
    if (canvasOwnedFocus) this.ui.focusHeading();
  }

  private async handleContextRestore(token: ContextToken): Promise<void> {
    if (!this.isCurrentRecovery(token) || this.recoveryPose === null || this.recoveryQuality === null) return;
    const projection = this.state.kind === 'context-lost' ? this.state.restore : undefined;
    if (!this.dispatch({ type: 'CONTEXT_RECOVERY_STARTED' })) return;
    if (this.recoveryHoldMs > 0) await waitForDevelopmentHold(this.recoveryHoldMs);
    await Promise.resolve();
    if (!this.isCurrentRecovery(token)) return;
    try {
      if (this.failRecoveryBuild) throw new Error('Forced DEV recovery build failure.');
      const pose = this.recoveryPose;
      const application = this.recoveryQuality;
      this.contextRecovery?.dispose(); this.contextRecovery = null; this.disposeRuntime();
      if (!this.isCurrentRecovery(token, false)) return;
      if (!this.createRuntime(application) || this.movementController === null || this.runtime === null) throw new Error('Recovery runtime could not be created.');
      this.movementController.restorePose(pose); this.runtime.validateFrame();
      if (!this.isCurrentRecovery(token, false)) throw new Error('Recovery generation was superseded.');
      const restored = projection === undefined ? undefined : normalizeRestorableProjection(projection);
      this.recoveryAbort?.abort(); this.recoveryAbort = null; this.recoveryToken = null; this.recoveryPose = null; this.recoveryQuality = null; this.recoveryRuntime = null;
      this.dispatch(restored === undefined ? { type: 'CONTEXT_RESTORED' } : { type: 'CONTEXT_RESTORED', projection: restored });
      this.installContextRecovery();
      this.ui.announce(`context:${token.generation}:restored`, 'Graphics restored. Your position and settings were kept.');
      this.qualityController.resume('context-lost');
      this.focusOperationalState();
      const queued = this.queuedOptionalOutcome;
      this.queuedOptionalOutcome = null;
      if (queued !== null) {
        if (queued.source === 'startup') this.applyOptionalOutcome(queued.attempt, queued.outcome);
        else this.applyRetriedOptionalOutcome(queued.attempt, queued.outcome);
      }
    } catch {
      this.handleContextRecoveryFailure(token);
    }
  }

  private handleContextRecoveryFailure(token: ContextToken): void {
    if (!this.isCurrentRecovery(token, false)) return;
    this.contextRecovery?.fail(token); this.clearContextRecovery(); this.disposeRuntime(); this.dispatch({ type: 'CONTEXT_RECOVERY_FAILED', reason: 'This session cannot safely continue with the current graphics context.' }); this.ui.focusPrimary('reload');
  }

  private isCurrentRecovery(token: ContextToken, requireOriginalRuntime = true): boolean {
    return !this.destroyed && this.recoveryToken?.generation === token.generation && this.recoveryAbort?.signal.aborted === false && this.state.kind === 'context-lost' && (!requireOriginalRuntime || this.runtime === this.recoveryRuntime);
  }

  private clearContextRecovery(): void {
    this.contextRecovery?.dispose(); this.contextRecovery = null; this.recoveryAbort?.abort(); this.recoveryAbort = null; this.recoveryToken = null; this.recoveryPose = null; this.recoveryQuality = null; this.recoveryRuntime = null; this.queuedOptionalOutcome = null;
  }

  private focusOperationalState(): void {
    const operational = this.state.kind === 'degraded' ? this.state.underlying : this.state;
    if (operational?.kind === 'onboarding') this.ui.focusStart(); else if (operational?.kind === 'paused') this.ui.focusResume(); else if (operational?.kind === 'exploring') this.ui.focusCanvas();
  }
  private dispatch(event: AppEvent): boolean {
    const wasExploring = getAppStateInvariant(this.state).isExploring;
    const transition = reduceAppState(this.state, event);
    if (!transition.transitioned) return false;
    this.state = transition.state;
    this.syncExplorationControllers();
    this.ui.render({ state: transition.state, invariant: transition.invariant });
    if (wasExploring && (transition.state.kind === 'paused' || (transition.state.kind === 'degraded' && transition.state.underlying?.kind === 'paused'))) this.ui.focusResume();
    return true;
  }

  private syncExplorationControllers(): void {
    const invariant = getAppStateInvariant(this.state);
    const exploring = invariant.isExploring;
    if (exploring) this.qualityController.resume('paused'); else this.qualityController.suspend('paused');
    const fallbackActive = exploring && invariant.control === 'drag' && invariant.panel === 'none';
    this.inputController?.setEnabled(exploring);
    this.inputController?.setIntentionalFocus(exploring && invariant.panel === 'none');
    this.movementController?.setActive(exploring);
    this.pointerLockLook?.setEnabled(exploring);
    this.dragLook?.setEnabled(fallbackActive);
    this.touchLook?.setEnabled(fallbackActive);
    if (!exploring) this.pointerLockLook?.releaseLock();
    if (!fallbackActive) this.ui.clearTouchControls();
  }

  private handleInputClear(reason: InputClearReason): void {
    this.movementController?.invalidateResumeDelta();
    if ((reason === 'blur' || reason === 'hidden') && getAppStateInvariant(this.state).isExploring) {
      this.dispatch({ type: 'PAUSE' });
    }
  }

  private handlePointerLockOutcome(outcome: PointerLockOutcome): void {
    switch (outcome) {
      case 'locked':
        this.hasConfirmedPointerLock = true;
        this.pointerLockTerminalFallback = false;
        this.dispatch({ type: 'POINTER_LOCK_CONFIRMED' });
        return;
      case 'unlocked':
        if (!getAppStateInvariant(this.state).isExploring) return;
        this.inputController?.clear('lock-exit');
        this.dispatch({ type: 'PAUSE' });
        return;
      case 'denied':
        this.pointerLockTerminalFallback = true;
        this.inputController?.clear('lock-exit');
        this.dispatch({ type: 'POINTER_LOCK_DENIED' });
        return;
      case 'error':
        this.pointerLockTerminalFallback = true;
        this.inputController?.clear('lock-exit');
        this.dispatch({ type: 'POINTER_LOCK_ERROR' });
    }
  }

  private handleInteractionViewportInterrupt(): void {
    this.inputController?.clear('viewport');
    this.dragLook?.cancel();
    this.touchLook?.cancel();
    this.ui.clearTouchControls();
    this.movementController?.invalidateResumeDelta();
  }

  private resetExploration(): void {
    this.inputController?.clear('viewport');
    this.dragLook?.cancel();
    this.touchLook?.cancel();
    this.ui.clearTouchControls();
    this.movementController?.reset();
    this.movementController?.invalidateResumeDelta();
    this.announceExplorationReset();
  }
  private announceExplorationReset(): void {
    this.qualityController.resetSampling();
    this.ui.announceReset();
  }
  private hasFinePointer(): boolean {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  private render(): void {
    this.ui.render({ state: this.state, invariant: getAppStateInvariant(this.state) });
  }
}
