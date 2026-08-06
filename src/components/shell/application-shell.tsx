"use client";

import { useState, type ReactNode } from "react";

import { BrandLockup } from "@/components/brand/brand-lockup";
import type { ShellNavigationItem } from "@/components/shell/navigation";
import { ShellNavigation } from "@/components/shell/shell-navigation";
import { ShellRecent } from "@/components/shell/shell-recent";
import { Menu } from "@/components/ui/icons/menu";
import { PanelLeftClose } from "@/components/ui/icons/panel-left-close";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export interface ApplicationShellProps {
  readonly navigation: readonly ShellNavigationItem[];
  readonly children: ReactNode;
}

/**
 * Responsive product frame: fixed desktop sidebar, mobile sheet navigation,
 * skip link, and a centered main workspace. Breakpoint behavior lives in CSS.
 */
export function ApplicationShell({ navigation, children }: ApplicationShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div data-slot="application-shell" className="min-h-dvh bg-canvas text-ink">
      <a
        href="#main-workspace"
        className="bg-brand text-surface focus:outline-brand sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:px-4 focus:py-2 focus:outline-2 focus:outline-offset-2"
      >
        Skip to main content
      </a>

      <aside
        data-slot="shell-sidebar"
        className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-subtle bg-surface lg:flex"
      >
        <div className="border-b border-subtle px-4 py-5">
          <BrandLockup variant="full" priority />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <ShellNavigation navigation={navigation} id="desktop-shell-navigation" />
          <ShellRecent />
        </div>
      </aside>

      <header
        data-slot="shell-mobile-header"
        className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-subtle bg-surface px-3 lg:hidden"
      >
        <BrandLockup variant="compact" priority />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-md text-ink outline-none hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              aria-label="Open navigation"
            >
              {mobileOpen ? (
                <PanelLeftClose aria-hidden="true" focusable="false" size={20} animate />
              ) : (
                <Menu aria-hidden="true" focusable="false" size={20} />
              )}
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[min(88vw,320px)] max-w-[min(88vw,320px)] gap-0 p-0 sm:max-w-[min(88vw,320px)]"
          >
            <SheetHeader className="border-b border-subtle">
              <SheetTitle className="sr-only">Product navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Navigate UnseenPrompt product areas. Unavailable destinations are marked Soon.
              </SheetDescription>
              <BrandLockup variant="full" />
            </SheetHeader>
            <div className="px-3 py-4">
              <ShellNavigation
                navigation={navigation}
                id="mobile-shell-navigation"
                onNavigate={() => {
                  setMobileOpen(false);
                }}
              />
              <ShellRecent />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <div className="lg:pl-[232px]">
        <main
          id="main-workspace"
          data-slot="main-workspace"
          tabIndex={-1}
          className="min-h-dvh outline-none pt-14 lg:pt-0"
        >
          <div className="mx-auto w-full max-w-[960px] px-4 py-6 md:px-6 lg:px-10 lg:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
