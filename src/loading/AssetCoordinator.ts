import { LoadingManager } from 'three';

export type AssetKind = 'essential' | 'optional';
export type LoadFailureKind = 'http' | 'network' | 'timeout' | 'malformed' | 'aborted' | 'runtime';
export type LoadProgress =
  | { readonly kind: 'indeterminate'; readonly phase: 'preparing' | 'essential'; readonly label: string }
  | { readonly kind: 'items'; readonly phase: 'assets'; readonly loaded: number; readonly total: number; readonly currentLabel: string | null };
export interface LoadFailure { readonly assetId: string; readonly assetKind: AssetKind; readonly kind: LoadFailureKind; readonly status?: number; readonly userMessage: string; readonly cause: unknown }
export type LoadOutcome<T = void> =
  | { readonly kind: 'ready'; readonly value: T }
  | { readonly kind: 'degraded'; readonly value: T; readonly failures: readonly LoadFailure[] }
  | { readonly kind: 'failed'; readonly failure: LoadFailure }
  | { readonly kind: 'cancelled' };
export interface ManagedAssetRequest<T> { readonly id: string; readonly label: string; readonly url: string; readonly kind: 'optional'; readonly timeoutMs: number; parse(text: string): T }
export interface AssetAttempt {
  readonly generation: number;
  readonly signal: AbortSignal;
  runEssential<T>(task: (signal: AbortSignal) => T | Promise<T>): Promise<LoadOutcome<T>>;
  loadOptional<T>(request: ManagedAssetRequest<T>): Promise<LoadOutcome<T>>;
  cancel(): boolean;
}
export interface AssetCoordinatorOptions { readonly fetch?: typeof fetch; readonly onProgress?: (generation: number, progress: LoadProgress) => void }

interface AttemptState {
  readonly generation: number;
  readonly controller: AbortController;
  readonly manager: LoadingManager;
  readonly timers: Set<ReturnType<typeof setTimeout>>;
  terminal: boolean;
}

const optionalMessage = (kind: LoadFailureKind): string => kind === 'timeout'
  ? 'Route notes took too long to load. The 3D walk and controls remain available.'
  : kind === 'malformed'
    ? 'Route notes could not be read. The 3D walk and controls remain available.'
    : 'Route notes are unavailable. The 3D walk and controls remain available.';

export class AssetCoordinator {
  private generation = 0;
  private active: AttemptState | null = null;
  private disposed = false;
  private readonly fetcher: typeof fetch;
  private readonly onProgress: ((generation: number, progress: LoadProgress) => void) | undefined;

  constructor(options: AssetCoordinatorOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.onProgress = options.onProgress;
  }

  beginAttempt(): AssetAttempt {
    if (this.disposed) throw new Error('AssetCoordinator is disposed.');
    this.cancelActive();
    const generation = ++this.generation;
    const controller = new AbortController();
    const manager = new LoadingManager();
    const state: AttemptState = { generation, controller, manager, timers: new Set(), terminal: false };
    manager.onProgress = (url, loaded, total) => {
      if (!this.isCurrent(state)) return;
      this.onProgress?.(generation, { kind: 'items', phase: 'assets', loaded, total, currentLabel: url });
    };
    this.active = state;
    this.publish(state, { kind: 'indeterminate', phase: 'preparing', label: 'Preparing the interactive scene' });
    return this.publicAttempt(state);
  }

  retry(): AssetAttempt { return this.beginAttempt(); }

  cancelActive(): boolean {
    const state = this.active;
    if (state === null || state.terminal) return false;
    this.active = null;
    this.generation += 1;
    state.terminal = true;
    state.controller.abort('cancelled');
    this.clear(state);
    this.detach(state);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelActive();
    this.disposed = true;
  }

  private publicAttempt(state: AttemptState): AssetAttempt {
    return Object.freeze({
      generation: state.generation,
      signal: state.controller.signal,
      runEssential: <T>(task: (signal: AbortSignal) => T | Promise<T>) => this.runEssential(state, task),
      loadOptional: <T>(request: ManagedAssetRequest<T>) => this.loadOptional(state, request),
      cancel: () => this.cancel(state),
    });
  }

  private cancel(state: AttemptState): boolean {
    if (!this.isCurrent(state)) return false;
    return this.cancelActive();
  }

  private async runEssential<T>(state: AttemptState, task: (signal: AbortSignal) => T | Promise<T>): Promise<LoadOutcome<T>> {
    if (!this.isCurrent(state)) return { kind: 'cancelled' };
    this.publish(state, { kind: 'indeterminate', phase: 'essential', label: 'Building the procedural district' });
    try {
      const value = await task(state.controller.signal);
      if (!this.isCurrent(state)) return { kind: 'cancelled' };
      return { kind: 'ready', value };
    } catch (cause) {
      if (!this.isCurrent(state) || state.controller.signal.aborted) return { kind: 'cancelled' };
      state.terminal = true;
      state.controller.abort('essential-failed');
      this.clear(state);
      return { kind: 'failed', failure: { assetId: 'procedural-world', assetKind: 'essential', kind: 'runtime', userMessage: 'The interactive scene could not be prepared. Retry the 3D view or use the static guide.', cause } };
    }
  }

  private async loadOptional<T>(state: AttemptState, request: ManagedAssetRequest<T>): Promise<LoadOutcome<T>> {
    if (!this.isCurrent(state)) return { kind: 'cancelled' };
    const url = request.url;
    state.manager.itemStart(url);
    this.publish(state, { kind: 'items', phase: 'assets', loaded: 0, total: 1, currentLabel: request.label });
    const requestController = new AbortController();
    const abortRequest = () => requestController.abort(state.controller.signal.reason);
    state.controller.signal.addEventListener('abort', abortRequest, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; requestController.abort('timeout'); }, request.timeoutMs);
    state.timers.add(timer);
    try {
      const response = await this.fetcher(url, { signal: requestController.signal, cache: 'no-store' });
      if (!response.ok) {
        const failure = this.failure(request, 'http', response.status, response.status);
        state.manager.itemError(url); state.manager.itemEnd(url);
        return this.isCurrent(state) ? { kind: 'degraded', value: undefined as T, failures: [failure] } : { kind: 'cancelled' };
      }
      const text = await response.text();
      let value: T;
      try { value = request.parse(text); }
      catch (cause) {
        const failure = this.failure(request, 'malformed', cause);
        state.manager.itemError(url); state.manager.itemEnd(url);
        return this.isCurrent(state) ? { kind: 'degraded', value: undefined as T, failures: [failure] } : { kind: 'cancelled' };
      }
      state.manager.itemEnd(url);
      return this.isCurrent(state) ? { kind: 'ready', value } : { kind: 'cancelled' };
    } catch (cause) {
      if (!this.isCurrent(state) || (state.controller.signal.aborted && !timedOut)) return { kind: 'cancelled' };
      const kind: LoadFailureKind = timedOut ? 'timeout' : requestController.signal.aborted ? 'aborted' : 'network';
      const failure = this.failure(request, kind, cause);
      state.manager.itemError(url); state.manager.itemEnd(url);
      return { kind: 'degraded', value: undefined as T, failures: [failure] };
    } finally {
      clearTimeout(timer); state.timers.delete(timer);
      state.controller.signal.removeEventListener('abort', abortRequest);
    }
  }

  private failure<T>(request: ManagedAssetRequest<T>, kind: LoadFailureKind, cause: unknown, status?: number): LoadFailure {
    return { assetId: request.id, assetKind: 'optional', kind, ...(status === undefined ? {} : { status }), userMessage: optionalMessage(kind), cause };
  }
  private publish(state: AttemptState, progress: LoadProgress): void { if (this.isCurrent(state)) this.onProgress?.(state.generation, progress); }
  private isCurrent(state: AttemptState): boolean { return !this.disposed && this.active === state && !state.terminal && !state.controller.signal.aborted; }
  private clear(state: AttemptState): void { for (const timer of state.timers) clearTimeout(timer); state.timers.clear(); }
  private detach(state: AttemptState): void { state.manager.onLoad = () => undefined; state.manager.onProgress = () => undefined; state.manager.onError = () => undefined; }
}
