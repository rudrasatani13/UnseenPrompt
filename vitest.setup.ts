import "@testing-library/jest-dom/vitest";
import "vitest-axe/extend-expect";

import { cleanup } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";

vi.mock("server-only", () => ({}));

/*
 * `vitest-axe@0.1.0` ships an empty `extend-expect` build and augments the
 * legacy `Vi` namespace, so the matcher is registered and typed explicitly
 * against the installed Vitest version.
 */
expect.extend(axeMatchers);

declare module "vitest" {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
  interface Assertion<T = any> extends axeMatchers.AxeMatchers {}
  interface AsymmetricMatchersContaining extends axeMatchers.AxeMatchers {}
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
}

/*
 * Testing Library only self-registers cleanup when Vitest globals are enabled.
 * This project uses explicit imports, so unmount between tests here.
 */
afterEach(() => {
  cleanup();
});

/*
 * Minimal jsdom shims required by Radix primitives. Each one is the smallest
 * no-op that lets a component mount; none of them assert behavior. Real
 * pointer, layout, and motion behavior is verified in Chromium (Task 14).
 */
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

/*
 * Motion's useInView always constructs an IntersectionObserver, including for
 * icons that only animate on an explicit prop. The shim is a no-op so unit
 * tests can mount; real viewport behavior is covered in Chromium.
 */
if (!("IntersectionObserver" in globalThis)) {
  globalThis.IntersectionObserver = class {
    readonly root: Element | Document | null = null;
    readonly rootMargin = "0px";
    readonly scrollMargin = "0px";
    readonly thresholds: ReadonlyArray<number> = [];

    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as typeof globalThis.IntersectionObserver;
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = function scrollIntoView(): void {};
}

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
    return false;
  };
}

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = function setPointerCapture(): void {};
}

if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = function releasePointerCapture(): void {};
}
