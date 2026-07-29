/*
 * Vendored Animate UI source. See ./README.md for provenance, the exact
 * registry items, and the local-modification policy.
 *
 * Only import specifiers were rewritten. The upstream project does not compile
 * under this repository's `exactOptionalPropertyTypes` and
 * `noUncheckedIndexedAccess` settings, and it predates the React Compiler
 * lint rules. Type checking is suppressed for this vendored file only:
 * every consumer of these exports remains fully type-checked, behavior is
 * covered by ./animated-icons.test.tsx, and the supply-chain audit in that
 * same file still runs against this source.
 */
// @ts-nocheck
import * as React from "react";
import { useInView, type UseInViewOptions } from "motion/react";

interface UseIsInViewOptions {
  inView?: boolean;
  inViewOnce?: boolean;
  inViewMargin?: UseInViewOptions["margin"];
}

function useIsInView<T extends HTMLElement = HTMLElement>(
  ref: React.Ref<T>,
  options: UseIsInViewOptions = {},
) {
  const { inView, inViewOnce = false, inViewMargin = "0px" } = options;
  const localRef = React.useRef<T>(null);
  React.useImperativeHandle(ref, () => localRef.current as T);
  const inViewResult = useInView(localRef, {
    once: inViewOnce,
    margin: inViewMargin,
  });
  const isInView = !inView || inViewResult;
  return { ref: localRef, isInView };
}

export { useIsInView, type UseIsInViewOptions };
