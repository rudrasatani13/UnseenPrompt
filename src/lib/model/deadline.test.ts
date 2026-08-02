import { describe, expect, it, vi } from "vitest";

import {
  abortableDelay,
  createCombinedAttemptSignal,
  effectiveDeadlineMs,
  remainingDeadlineMs,
  type DeadlineTimer,
} from "@/lib/model/deadline";

function fakeTimer() {
  let next = 0;
  const callbacks = new Map<number, () => void>();
  const timer: DeadlineTimer = {
    setTimeout(callback) {
      const id = ++next;
      callbacks.set(id, callback);
      return id as unknown as ReturnType<typeof globalThis.setTimeout>;
    },
    clearTimeout(handle) {
      callbacks.delete(handle as unknown as number);
    },
  };
  return {
    timer,
    fire(id: number) {
      callbacks.get(id)?.();
      callbacks.delete(id);
    },
    pending: () => callbacks.size,
  };
}

describe("deadline helpers", () => {
  it("only lets a caller shorten the configured total", () => {
    expect(effectiveDeadlineMs(30_000, undefined)).toBe(30_000);
    expect(effectiveDeadlineMs(30_000, 10_000)).toBe(10_000);
    expect(effectiveDeadlineMs(30_000, 40_000)).toBe(30_000);
    expect(effectiveDeadlineMs(30_000, 0)).toBe(0);
  });

  it("clamps remaining time at zero", () => {
    expect(remainingDeadlineMs(100, 40)).toBe(60);
    expect(remainingDeadlineMs(100, 100)).toBe(0);
    expect(remainingDeadlineMs(100, 120)).toBe(0);
  });

  it("distinguishes caller, attempt, and total deadline cancellation", () => {
    const caller = new AbortController();
    const first = fakeTimer();
    const combined = createCombinedAttemptSignal({
      callerSignal: caller.signal,
      totalRemainingMs: 100,
      attemptTimeoutMs: 20,
      timer: first.timer,
    });
    expect(first.pending()).toBe(2);
    first.fire(2);
    expect(combined.signal.aborted).toBe(true);
    expect(combined.reason()).toBe("attempt_timeout");
    combined.cleanup();
    expect(first.pending()).toBe(0);

    const second = fakeTimer();
    const callerCombined = createCombinedAttemptSignal({
      callerSignal: caller.signal,
      totalRemainingMs: 100,
      attemptTimeoutMs: 50,
      timer: second.timer,
    });
    caller.abort();
    expect(callerCombined.reason()).toBe("caller");
    callerCombined.cleanup();

    const third = fakeTimer();
    const totalCombined = createCombinedAttemptSignal({
      totalRemainingMs: 30,
      attemptTimeoutMs: 50,
      timer: third.timer,
    });
    third.fire(1);
    expect(totalCombined.reason()).toBe("deadline");
    totalCombined.cleanup();
  });

  it("rejects a delay on cancellation and cleans its timer", async () => {
    const controller = new AbortController();
    const fake = fakeTimer();
    const promise = abortableDelay(100, controller.signal, fake.timer);
    expect(fake.pending()).toBe(1);
    controller.abort();
    await expect(promise).rejects.toBeDefined();
    expect(fake.pending()).toBe(0);
  });

  it("resolves a delay through the injected timer", async () => {
    const fake = fakeTimer();
    const promise = abortableDelay(250, undefined, fake.timer);
    fake.fire(1);
    await expect(promise).resolves.toBeUndefined();
    expect(vi.isMockFunction(globalThis.setTimeout)).toBe(false);
  });
});
