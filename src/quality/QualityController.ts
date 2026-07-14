import { resolveReducedMotion, type PersistedPreferencesV1 } from '../platform/preferences';
import {
  higherTier, lowerTier, qualityProfile, selectInitialAutoTier, toLandscapeSettings,
  type MotionPreference, type QualityCapabilityFacts, type QualityPreference, type QualityProfile, type QualityTier,
} from './qualityTiers';

export const AUTO_BUDGET_MS = 20 as const;
export const AUTO_HEADROOM_MS = 14 as const;
export const AUTO_DOWNSHIFT_MS = 5_000 as const;
export const AUTO_UPSHIFT_MS = 20_000 as const;
export const AUTO_COOLDOWN_MS = 30_000 as const;
export const AUTO_WINDOW_MS = 1_000 as const;
const SAMPLE_CAPACITY = 2048;

export type QualityChangeReason = 'initial' | 'user-quality' | 'user-motion' | 'system-motion' | 'auto-downshift' | 'auto-upshift';
export type QualitySampleInvalidReason = 'hidden' | 'paused' | 'context-lost' | 'rebuild' | 'warmup' | 'invalid';
export interface QualityApplication {
  readonly profile: QualityProfile;
  readonly motion: 'standard' | 'reduced';
}
export interface QualityState {
  readonly preference: QualityPreference;
  readonly activeTier: QualityTier;
  readonly motionPreference: MotionPreference;
  readonly effectiveReducedMotion: boolean;
  readonly persistence: 'available' | 'saved' | 'session-only';
  readonly transitionRevision: number;
  readonly transitionReason: QualityChangeReason;
  readonly auto: {
    readonly phase: 'manual' | 'sampling' | 'over-budget' | 'headroom' | 'cooldown' | 'suspended';
    readonly budgetMs: 20;
    readonly overloadMs: number;
    readonly headroomMs: number;
    readonly cooldownRemainingMs: number;
  };
}
export interface QualityControllerOptions {
  readonly initial: PersistedPreferencesV1 & { readonly persistence?: 'available' | 'session-only' };
  readonly capabilities: QualityCapabilityFacts;
  readonly systemReducedMotion: boolean;
  readonly now?: () => number;
  readonly apply: (next: QualityApplication, previous: QualityApplication | null, reason: QualityChangeReason) => void;
  readonly persist?: (value: PersistedPreferencesV1) => boolean;
  readonly onStateChange?: (state: QualityState) => void;
}

export class QualityController {
  readonly #capabilities: QualityCapabilityFacts;
  readonly #now: () => number;
  readonly #apply: QualityControllerOptions['apply'];
  readonly #persist: QualityControllerOptions['persist'];
  readonly #onStateChange: QualityControllerOptions['onStateChange'];
  readonly #samples = new Float64Array(SAMPLE_CAPACITY);
  readonly #scratch = new Float64Array(SAMPLE_CAPACITY);
  #sampleCount = 0;
  #windowStart: number | null = null;
  #lastTimestamp: number | null = null;
  #preference: QualityPreference;
  #activeTier: QualityTier;
  #motionPreference: MotionPreference;
  #systemReducedMotion: boolean;
  #overloadMs = 0;
  #headroomMs = 0;
  #cooldownUntil = 0;
  #suspensions = new Set<QualitySampleInvalidReason>();
  #persistence: 'available' | 'saved' | 'session-only' = 'available';
  #transitionRevision = 0;
  #transitionReason: QualityChangeReason = 'initial';
  #disposed = false;

  constructor(options: QualityControllerOptions) {
    this.#capabilities = options.capabilities;
    this.#now = options.now ?? (() => performance.now());
    this.#apply = options.apply;
    this.#persist = options.persist;
    this.#onStateChange = options.onStateChange;
    this.#preference = options.initial.quality;
    this.#motionPreference = options.initial.motion;
    this.#systemReducedMotion = options.systemReducedMotion;
    this.#persistence = options.initial.persistence ?? 'available';
    this.#activeTier = options.initial.quality === 'auto' ? selectInitialAutoTier(options.capabilities) : options.initial.quality;
  }

  get state(): QualityState {
    const now = this.#now();
    const cooldownRemainingMs = Math.max(0, this.#cooldownUntil - now);
    let phase: QualityState['auto']['phase'];
    if (this.#preference !== 'auto') phase = 'manual';
    else if (this.#suspensions.size !== 0) phase = 'suspended';
    else if (cooldownRemainingMs > 0) phase = 'cooldown';
    else if (this.#overloadMs > 0) phase = 'over-budget';
    else if (this.#headroomMs > 0) phase = 'headroom';
    else phase = 'sampling';
    return Object.freeze({
      preference: this.#preference, activeTier: this.#activeTier, motionPreference: this.#motionPreference,
      effectiveReducedMotion: resolveReducedMotion(this.#motionPreference, this.#systemReducedMotion),
      persistence: this.#persistence, transitionRevision: this.#transitionRevision, transitionReason: this.#transitionReason,
      auto: Object.freeze({ phase, budgetMs: AUTO_BUDGET_MS, overloadMs: this.#overloadMs, headroomMs: this.#headroomMs, cooldownRemainingMs }),
    });
  }

  get application(): QualityApplication {
    const reduced = resolveReducedMotion(this.#motionPreference, this.#systemReducedMotion);
    return Object.freeze({ profile: qualityProfile(this.#activeTier), motion: toLandscapeSettings(qualityProfile(this.#activeTier), reduced).motion });
  }

  setQualityPreference(value: QualityPreference): void {
    if (this.#disposed || value === this.#preference) return;
    const nextTier = value === 'auto' ? selectInitialAutoTier(this.#capabilities) : value;
    const previous = this.application;
    const next = Object.freeze({ profile: qualityProfile(nextTier), motion: previous.motion });
    this.#apply(next, previous, 'user-quality');
    this.#preference = value;
    this.#activeTier = nextTier;
    this.#commitPreference('user-quality');
    this.resetSampling();
  }

  setMotionPreference(value: MotionPreference): void {
    if (this.#disposed || value === this.#motionPreference) return;
    const previous = this.application;
    const reduced = resolveReducedMotion(value, this.#systemReducedMotion);
    const next = Object.freeze({ profile: previous.profile, motion: reduced ? 'reduced' as const : 'standard' as const });
    if (next.motion !== previous.motion) this.#apply(next, previous, 'user-motion');
    this.#motionPreference = value;
    this.#commitPreference('user-motion');
    this.resetSampling();
  }

  setSystemReducedMotion(reduced: boolean): void {
    if (this.#disposed || reduced === this.#systemReducedMotion) return;
    const previous = this.application;
    const nextReduced = resolveReducedMotion(this.#motionPreference, reduced);
    const next = Object.freeze({ profile: previous.profile, motion: nextReduced ? 'reduced' as const : 'standard' as const });
    if (next.motion !== previous.motion) {
      try { this.#apply(next, previous, 'system-motion'); }
      catch (error) { this.#onStateChange?.(this.state); throw error; }
    }
    this.#systemReducedMotion = reduced;
    if (next.motion !== previous.motion) this.#recordTransition('system-motion');
    this.resetSampling();
  }

  sampleFrame(nowMs: number): void {
    if (this.#disposed || this.#preference !== 'auto' || this.#suspensions.size !== 0 || !Number.isFinite(nowMs)) { this.resetSampling(); return; }
    if (this.#lastTimestamp === null) { this.#lastTimestamp = nowMs; this.#windowStart = nowMs; return; }
    const interval = nowMs - this.#lastTimestamp;
    this.#lastTimestamp = nowMs;
    if (!(interval > 0) || interval > AUTO_WINDOW_MS) { this.resetSampling(nowMs); return; }
    if (this.#sampleCount < SAMPLE_CAPACITY) this.#samples[this.#sampleCount++] = interval;
    if (this.#windowStart === null || nowMs - this.#windowStart < AUTO_WINDOW_MS) return;
    const elapsed = nowMs - this.#windowStart;
    for (let index = 0; index < this.#sampleCount; index += 1) this.#scratch[index] = this.#samples[index]!;
    this.#scratch.subarray(0, this.#sampleCount).sort();
    const p95 = this.#scratch[Math.max(0, Math.ceil(0.95 * this.#sampleCount) - 1)] ?? interval;
    this.#sampleCount = 0;
    this.#windowStart = nowMs;
    if (nowMs < this.#cooldownUntil) { this.#overloadMs = 0; this.#headroomMs = 0; return; }
    if (p95 > AUTO_BUDGET_MS) { this.#overloadMs += elapsed; this.#headroomMs = 0; }
    else if (p95 < AUTO_HEADROOM_MS) { this.#headroomMs += elapsed; this.#overloadMs = 0; }
    else { this.#overloadMs = 0; this.#headroomMs = 0; }
    if (this.#overloadMs >= AUTO_DOWNSHIFT_MS) this.#adapt(lowerTier(this.#activeTier), 'auto-downshift', nowMs);
    else if (this.#headroomMs >= AUTO_UPSHIFT_MS) this.#adapt(higherTier(this.#activeTier), 'auto-upshift', nowMs);
    else this.#onStateChange?.(this.state);
  }

  suspend(reason: QualitySampleInvalidReason): void { this.#suspensions.add(reason); this.resetSampling(); this.#onStateChange?.(this.state); }
  resume(reason: QualitySampleInvalidReason, nowMs = this.#now()): void { this.#suspensions.delete(reason); this.resetSampling(nowMs); this.#onStateChange?.(this.state); }
  resetSampling(nowMs?: number): void {
    this.#sampleCount = 0; this.#overloadMs = 0; this.#headroomMs = 0;
    this.#lastTimestamp = nowMs ?? null; this.#windowStart = nowMs ?? null;
  }
  dispose(): void { this.#disposed = true; this.#suspensions.clear(); this.resetSampling(); }

  #adapt(tier: QualityTier, reason: 'auto-downshift' | 'auto-upshift', nowMs: number): void {
    if (tier === this.#activeTier) { this.#overloadMs = 0; this.#headroomMs = 0; return; }
    const previous = this.application;
    const next = Object.freeze({ profile: qualityProfile(tier), motion: previous.motion });
    this.#apply(next, previous, reason);
    this.#activeTier = tier;
    this.#cooldownUntil = nowMs + AUTO_COOLDOWN_MS;
    this.resetSampling(nowMs);
    this.#recordTransition(reason);
  }

  #commitPreference(reason: 'user-quality' | 'user-motion'): void {
    const record: PersistedPreferencesV1 = Object.freeze({ version: 1, quality: this.#preference, motion: this.#motionPreference });
    this.#persistence = this.#persist?.(record) === false ? 'session-only' : 'saved';
    this.#recordTransition(reason);
  }
  #recordTransition(reason: QualityChangeReason): void {
    this.#transitionReason = reason; this.#transitionRevision += 1; this.#onStateChange?.(this.state);
  }
}
