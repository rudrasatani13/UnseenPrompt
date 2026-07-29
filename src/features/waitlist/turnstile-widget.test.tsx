import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TurnstileWidget, type TurnstileWidgetHandle } from "@/features/waitlist/turnstile-widget";

describe("TurnstileWidget", () => {
  afterEach(() => {
    delete window.turnstile;
    document
      .querySelectorAll('script[src*="challenges.cloudflare.com/turnstile"]')
      .forEach((node) => {
        node.remove();
      });
  });

  it("renders a host container for the Managed widget", () => {
    render(<TurnstileWidget siteKey="1x00000000000000000000AA" />);
    expect(document.querySelector('[data-slot="turnstile-widget"]')).toBeInTheDocument();
  });

  it("removes a pending script load listener when unmounted", () => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    document.head.appendChild(script);
    const removeEventListener = vi.spyOn(script, "removeEventListener");

    const { unmount } = render(<TurnstileWidget siteKey="1x00000000000000000000AA" />);
    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("load", expect.any(Function));
  });

  it("settles an in-flight challenge when unmounted", async () => {
    let handle: TurnstileWidgetHandle | undefined;
    window.turnstile = {
      render: vi.fn(() => "widget-id"),
      execute: vi.fn(),
      reset: vi.fn(),
      remove: vi.fn(),
    };

    const { unmount } = render(
      <TurnstileWidget
        siteKey="1x00000000000000000000AA"
        onReady={(readyHandle) => {
          handle = readyHandle;
        }}
      />,
    );

    const result = handle?.execute();
    unmount();

    await waitFor(async () => {
      await expect(result).resolves.toBeNull();
    });
  });
});
