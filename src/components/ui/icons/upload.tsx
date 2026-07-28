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

type UploadProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: {
        y: 0,
        transition: { duration: 0.3, ease: "easeInOut" },
      },
      animate: {
        y: -2,
        transition: { duration: 0.3, ease: "easeInOut" },
      },
    },
    path1: {},
    path2: {},
    path3: {},
  } satisfies Record<string, Variants>,
  "default-loop": {
    group: {
      initial: {
        y: 0,
        transition: { duration: 0.6, ease: "easeInOut" },
      },
      animate: {
        y: [0, -2, 0],
        transition: { duration: 0.6, ease: "easeInOut" },
      },
    },
    path1: {},
    path2: {},
    path3: {},
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: UploadProps) {
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
      <motion.g variants={variants.group} initial="initial" animate={controls}>
        <motion.path d="M12 3v12" variants={variants.path1} initial="initial" animate={controls} />
        <motion.path
          d="m17 8-5-5-5 5"
          variants={variants.path2}
          initial="initial"
          animate={controls}
        />
      </motion.g>
      <motion.path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        variants={variants.path3}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function Upload(props: UploadProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Upload,
  Upload as UploadIcon,
  type UploadProps,
  type UploadProps as UploadIconProps,
};
