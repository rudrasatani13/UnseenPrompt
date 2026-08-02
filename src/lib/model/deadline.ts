import "server-only";

/** A small clock/timer seam keeps deadline and retry tests deterministic in Workers and Vitest. */
export interface DeadlineTimer {
  readonly setTimeout: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof globalThis.setTimeout>;
  readonly clearTimeout: (handle: ReturnType<typeof globalThis.setTimeout>) => void;
}

export const DEFAULT_DEADLINE_TIMER: DeadlineTimer = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

export type AttemptAbortReason = "caller" | "deadline" | "attempt_timeout";

export interface CombinedAttemptSignal {
  readonly signal: AbortSignal;
  readonly reason: () => AttemptAbortReason | null;
  readonly cleanup: () => void;
}

function boundedDelay(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** Return the caller-shortened total deadline; callers may never extend configuration. */
export function effectiveDeadlineMs(configuredMs: number, callerMs: number | undefined): number {
  if (!Number.isSafeInteger(configuredMs) || configuredMs <= 0) return 0;
  if (callerMs === undefined) return configuredMs;
  if (!Number.isSafeInteger(callerMs) || callerMs <= 0) return 0;
  return Math.min(configuredMs, callerMs);
}

export function remainingDeadlineMs(deadlineAtMs: number, nowMs: number): number {
  if (!Number.isFinite(deadlineAtMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.floor(deadlineAtMs - nowMs));
}

/**
 * Combine caller cancellation, the total deadline, and one per-attempt timeout into the exact
 * signal sent to an adapter. The first source to fire wins, and every timer/listener is cleaned up
 * by `cleanup` after the adapter settles.
 */
export function createCombinedAttemptSignal(options: {
  readonly callerSignal?: AbortSignal;
  readonly totalRemainingMs: number;
  readonly attemptTimeoutMs: number;
  readonly timer?: DeadlineTimer;
}): CombinedAttemptSignal {
  const timer = options.timer ?? DEFAULT_DEADLINE_TIMER;
  const controller = new AbortController();
  let abortReason: AttemptAbortReason | null = null;
  let cleaned = false;
  const handles: Array<ReturnType<typeof globalThis.setTimeout>> = [];

  const abort = (reason: AttemptAbortReason): void => {
    if (abortReason !== null) return;
    abortReason = reason;
    controller.abort(reason);
  };

  const callerSignal = options.callerSignal;
  const onCallerAbort = (): void => abort("caller");

  if (callerSignal?.aborted === true) {
    abort("caller");
  } else if (callerSignal !== undefined) {
    callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }

  const totalRemainingMs = boundedDelay(options.totalRemainingMs);
  const attemptTimeoutMs = boundedDelay(options.attemptTimeoutMs);

  if (abortReason === null && totalRemainingMs <= 0) {
    abort("deadline");
  } else if (abortReason === null) {
    // Install the total timer first. When both values are equal, total deadline wins.
    const totalHandle = timer.setTimeout(() => abort("deadline"), totalRemainingMs);
    handles.push(totalHandle);

    if (attemptTimeoutMs < totalRemainingMs) {
      const attemptHandle = timer.setTimeout(() => abort("attempt_timeout"), attemptTimeoutMs);
      handles.push(attemptHandle);
    }
  }

  return {
    signal: controller.signal,
    reason: () => abortReason,
    cleanup: (): void => {
      if (cleaned) return;
      cleaned = true;
      if (callerSignal !== undefined) callerSignal.removeEventListener("abort", onCallerAbort);
      for (const handle of handles) timer.clearTimeout(handle);
    },
  };
}

/** Abortable bounded delay used for transport backoff and Retry-After. */
export function abortableDelay(
  delayMs: number,
  signal?: AbortSignal,
  timer: DeadlineTimer = DEFAULT_DEADLINE_TIMER,
): Promise<void> {
  const delay = boundedDelay(delayMs);
  if (signal?.aborted === true) {
    return Promise.reject(signal.reason ?? new DOMException("aborted", "AbortError"));
  }
  if (delay === 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let handle: ReturnType<typeof globalThis.setTimeout> | null = null;

    const cleanup = (): void => {
      if (handle !== null) timer.clearTimeout(handle);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = (): void => {
      finish(() => reject(signal?.reason ?? new DOMException("aborted", "AbortError")));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    handle = timer.setTimeout(() => finish(resolve), delay);
  });
}
