import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TurnstileWidget } from "@/features/waitlist/turnstile-widget";

describe("TurnstileWidget", () => {
  it("renders a host container for the Managed widget", () => {
    render(<TurnstileWidget siteKey="1x00000000000000000000AA" />);
    expect(document.querySelector('[data-slot="turnstile-widget"]')).toBeInTheDocument();
  });
});
