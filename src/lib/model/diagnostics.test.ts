import { describe, expect, it, vi } from "vitest";

import {
  NOOP_DIAGNOSTIC_LOGGER,
  createDiagnosticLogger,
  emitDiagnostic,
  sanitizeDiagnosticEvent,
} from "@/lib/model/diagnostics";

const event = {
  event: "model.gateway.call",
  correlationId: "00000000-0000-4000-8000-000000000000",
  provider: "openai" as const,
  model: "safe-model",
  kind: "primary" as const,
  attempt: 1,
  durationMs: 12,
  status: 200,
  code: "success" as const,
  retryCount: 0,
  validationResult: "passed" as const,
  usedFallback: false,
  usedRepair: false,
  usedReviewer: false,
  prompt: "secret-prompt",
  rawBody: "secret-provider-body",
};

describe("allowlisted diagnostics", () => {
  it("defaults to a no-op and strips sensitive extra fields", () => {
    expect(() => NOOP_DIAGNOSTIC_LOGGER.log(event)).not.toThrow();
    const safe = sanitizeDiagnosticEvent(event);
    expect(Object.isFrozen(safe)).toBe(true);
    expect(safe).not.toHaveProperty("prompt");
    expect(safe).not.toHaveProperty("rawBody");
    expect(JSON.stringify(safe)).not.toContain("secret-");
  });

  it("passes a frozen safe copy to an injected sink", () => {
    const sink = vi.fn();
    const logger = createDiagnosticLogger(sink);
    emitDiagnostic(logger, event);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(sink.mock.calls[0]?.[0])).toBe(true);
  });
});
