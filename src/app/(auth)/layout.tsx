import type { ReactNode } from "react";

import { BrandLockup } from "@/components/brand/brand-lockup";

/**
 * Minimal centered auth chrome: no application shell and no navigation, so a signed-out visitor
 * is never shown links they cannot follow.
 */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-canvas px-4 py-16">
      <BrandLockup variant="full" priority />
      <main className="flex w-full justify-center">{children}</main>
    </div>
  );
}
