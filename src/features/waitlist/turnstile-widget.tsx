"use client";

import { useEffect, useId, useRef } from "react";

export interface TurnstileWidgetHandle {
  execute: () => Promise<string | null>;
  reset: () => void;
}

export interface TurnstileWidgetProps {
  readonly siteKey: string;
  readonly onReady?: (handle: TurnstileWidgetHandle) => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          theme: "light";
          appearance: "interaction-only";
          execution: "execute";
          action: "waitlist_request";
          callback: (token: string) => void;
          "error-callback": () => void;
          "expired-callback": () => void;
        },
      ) => string;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Managed Turnstile widget. Loads the official script once and exposes execute/reset.
 */
export function TurnstileWidget({ siteKey, onReady }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const resolveTokenRef = useRef<((token: string | null) => void) | null>(null);
  const hostId = useId();

  useEffect(() => {
    let cancelled = false;

    function attach() {
      if (cancelled || !containerRef.current || !window.turnstile) {
        return;
      }

      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "light",
        appearance: "interaction-only",
        execution: "execute",
        action: "waitlist_request",
        callback: (token) => {
          resolveTokenRef.current?.(token);
          resolveTokenRef.current = null;
        },
        "error-callback": () => {
          resolveTokenRef.current?.(null);
          resolveTokenRef.current = null;
        },
        "expired-callback": () => {
          resolveTokenRef.current?.(null);
          resolveTokenRef.current = null;
        },
      });

      onReady?.({
        execute: () =>
          new Promise((resolve) => {
            if (!window.turnstile || !widgetIdRef.current) {
              resolve(null);
              return;
            }
            resolveTokenRef.current = resolve;
            window.turnstile.execute(widgetIdRef.current);
          }),
        reset: () => {
          if (window.turnstile && widgetIdRef.current) {
            window.turnstile.reset(widgetIdRef.current);
          }
        },
      });
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (window.turnstile) {
      attach();
    } else if (existing) {
      existing.addEventListener("load", attach, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", attach, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [onReady, siteKey]);

  return <div id={hostId} ref={containerRef} data-slot="turnstile-widget" className="min-h-0" />;
}
