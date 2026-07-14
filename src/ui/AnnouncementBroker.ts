export const RESET_FEEDBACK_LEASE_MS = 2_000;

interface Announcement {
  readonly id: string;
  readonly text: string;
}

export class AnnouncementBroker {
  readonly #publish: (text: string) => void;
  #lastId: string | null = null;
  #leaseTimer: ReturnType<typeof setTimeout> | null = null;
  #queuedAuto: Announcement | null = null;
  #destroyed = false;

  constructor(publish: (text: string) => void) {
    this.#publish = publish;
  }

  announcePriority(id: string, text: string): void {
    if (this.#destroyed) return;
    this.#clearLease();
    this.#publishOnce(id, text);
  }

  announceReset(text: string): void {
    if (this.#destroyed) return;
    this.#clearLease();
    this.#lastId = null;
    this.#publishOnce('reset', text);
    this.#leaseTimer = setTimeout(() => {
      this.#leaseTimer = null;
      const queued = this.#queuedAuto;
      this.#queuedAuto = null;
      if (queued !== null) this.#publishOnce(queued.id, queued.text);
    }, RESET_FEEDBACK_LEASE_MS);
  }

  announceAuto(id: string, text: string): void {
    if (this.#destroyed) return;
    if (this.#leaseTimer !== null) {
      this.#queuedAuto = Object.freeze({ id, text });
      return;
    }
    this.#publishOnce(id, text);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#clearLease();
    this.#destroyed = true;
  }

  #publishOnce(id: string, text: string): void {
    if (this.#lastId === id) return;
    this.#publish(text);
    this.#lastId = id;
  }

  #clearLease(): void {
    if (this.#leaseTimer !== null) clearTimeout(this.#leaseTimer);
    this.#leaseTimer = null;
    this.#queuedAuto = null;
  }
}
