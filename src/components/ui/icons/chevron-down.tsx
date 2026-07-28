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
"use client";

import * as React from "react";
import { motion, type Variants } from "motion/react";

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from "@/components/ui/icons/icon";

type ChevronDownProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path: {
      initial: {
        y: 0,
        transition: { duration: 0.3, ease: "easeInOut" },
      },
      animate: {
        y: 4,
        transition: { duration: 0.3, ease: "easeInOut" },
      },
    },
  } satisfies Record<string, Variants>,
  "default-loop": {
    path: {
      initial: {
        y: 0,
      },
      animate: {
        y: [0, 4, 0],
        transition: { duration: 0.6, ease: "easeInOut" },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: ChevronDownProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.path d="m6 9 6 6 6-6" variants={variants.path} initial="initial" animate={controls} />
    </motion.svg>
  );
}

function ChevronDown(props: ChevronDownProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ChevronDown,
  ChevronDown as ChevronDownIcon,
  type ChevronDownProps,
  type ChevronDownProps as ChevronDownIconProps,
};
