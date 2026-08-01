import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerEnvironment = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/config/env/server", () => ({ getServerEnvironment }));
vi.mock("next/navigation", () => ({ notFound }));

import { ProductSurfaceLayout } from "@/app/_shared/product-surface-layout";

describe("ProductSurfaceLayout", () => {
  beforeEach(() => {
    getServerEnvironment.mockReset().mockReturnValue({ APP_ENV: "local" });
    notFound.mockClear();
  });

  it("renders its protected route before production", () => {
    render(
      <ProductSurfaceLayout>
        <p>Protected content</p>
      </ProductSurfaceLayout>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("synchronously returns a hard not-found in production", () => {
    getServerEnvironment.mockReturnValue({ APP_ENV: "production" });

    expect(() =>
      ProductSurfaceLayout({
        children: <p>Protected content</p>,
      }),
    ).toThrow("NEXT_NOT_FOUND");
  });
});
