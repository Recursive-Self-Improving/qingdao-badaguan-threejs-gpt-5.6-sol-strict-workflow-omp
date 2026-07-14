import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementBroker, RESET_FEEDBACK_LEASE_MS } from '../../src/ui/AnnouncementBroker';

afterEach(() => vi.useRealTimers());

describe('reset feedback announcement broker', () => {
  it('retains reset immediately and publishes only the latest queued Auto shift once after the lease', () => {
    vi.useFakeTimers();
    const published: string[] = [];
    const broker = new AnnouncementBroker((text) => published.push(text));
    broker.announceReset('Position reset to the safe point.');
    broker.announceAuto('auto:1', 'Auto changed quality to Medium.');
    broker.announceAuto('auto:2', 'Auto changed quality to Low.');
    expect(published).toEqual(['Position reset to the safe point.']);
    vi.advanceTimersByTime(RESET_FEEDBACK_LEASE_MS - 1);
    expect(published).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(published).toEqual(['Position reset to the safe point.', 'Auto changed quality to Low.']);
    vi.runOnlyPendingTimers();
    expect(published).toHaveLength(2);
  });

  it('lets priority feedback preempt the lease and destroy clears queued work', () => {
    vi.useFakeTimers();
    const published: string[] = [];
    const broker = new AnnouncementBroker((text) => published.push(text));
    broker.announceReset('reset'); broker.announceAuto('auto:1', 'queued');
    broker.announcePriority('fatal:1', 'fatal');
    vi.runOnlyPendingTimers();
    expect(published).toEqual(['reset', 'fatal']);
    broker.announceReset('reset'); broker.announceAuto('auto:2', 'never'); broker.destroy();
    vi.runOnlyPendingTimers();
    expect(published).toEqual(['reset', 'fatal', 'reset']);
  });
});
