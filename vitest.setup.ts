import "@testing-library/jest-dom/vitest";
import "vitest-axe/extend-expect";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

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
