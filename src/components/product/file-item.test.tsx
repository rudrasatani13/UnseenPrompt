import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { FileItem, type FileItemStatus } from "@/components/product/file-item";

const statusLabels = {
  ready: "Ready",
  uploading: "Uploading",
  processing: "Processing",
  error: "Error",
  complete: "Complete",
} as const satisfies Record<FileItemStatus, string>;

const baseProps = {
  name: "project-brief.pdf",
  fileType: "PDF",
  sizeBytes: 1024,
  errorMessage: null,
  onRetry: null,
  onRemove: null,
} as const;

describe("FileItem", () => {
  it.each(Object.entries(statusLabels) as [FileItemStatus, string][])(
    "renders %s with visible status text and an icon",
    (status, label) => {
      const { container } = render(
        <FileItem
          {...baseProps}
          status={status}
          errorMessage={status === "error" ? "Upload failed" : null}
        />,
      );

      expect(screen.getByText(label)).toBeVisible();
      expect(container.querySelector("svg")).not.toBeNull();
      expect(container.querySelector('[data-slot="file-item"]')).toHaveAttribute(
        "data-status",
        status,
      );
    },
  );

  it("shows the filename, file type, and deterministic IEC byte size", () => {
    render(<FileItem {...baseProps} status="ready" sizeBytes={1024} />);

    expect(screen.getByText("project-brief.pdf")).toBeVisible();
    expect(screen.getByText("PDF")).toBeVisible();
    expect(screen.getByText("1 KiB")).toBeVisible();
  });

  it("formats common IEC sizes without inventing percentages", () => {
    const { rerender } = render(<FileItem {...baseProps} status="ready" sizeBytes={0} />);
    expect(screen.getByText("0 B")).toBeVisible();

    rerender(<FileItem {...baseProps} status="ready" sizeBytes={512} />);
    expect(screen.getByText("512 B")).toBeVisible();

    rerender(<FileItem {...baseProps} status="ready" sizeBytes={1_048_576} />);
    expect(screen.getByText("1 MiB")).toBeVisible();
  });

  it("lets the full filename wrap, including its extension", () => {
    render(
      <FileItem
        {...baseProps}
        status="ready"
        name="very-long-project-architecture-brief-for-review.pdf"
      />,
    );

    const name = screen.getByText("very-long-project-architecture-brief-for-review.pdf");

    expect(name.className).not.toMatch(/truncate|line-clamp|ellipsis/);
  });

  it("surfaces an error message as a persistent alert", () => {
    render(
      <FileItem
        {...baseProps}
        status="error"
        errorMessage="The file could not be read."
        onRetry={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("The file could not be read.");
  });

  it("shows retry only for error with a non-null callback", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    const { rerender } = render(
      <FileItem {...baseProps} status="error" errorMessage="Failed" onRetry={null} />,
    );

    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();

    rerender(<FileItem {...baseProps} status="ready" errorMessage={null} onRetry={onRetry} />);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();

    rerender(<FileItem {...baseProps} status="error" errorMessage="Failed" onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows remove only when a non-null callback is provided", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    const { rerender } = render(<FileItem {...baseProps} status="ready" onRemove={null} />);
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();

    rerender(<FileItem {...baseProps} status="ready" onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("exposes accessible progress wording for uploading and processing", () => {
    const { rerender } = render(<FileItem {...baseProps} status="uploading" />);
    expect(screen.getByText("Uploading")).toBeVisible();
    expect(screen.getByText(/in progress/i)).toBeVisible();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();

    rerender(<FileItem {...baseProps} status="processing" />);
    expect(screen.getByText("Processing")).toBeVisible();
    expect(screen.getByText(/in progress/i)).toBeVisible();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("rejects non-finite, fractional, or negative sizeBytes", () => {
    for (const sizeBytes of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1] as const) {
      expect(() =>
        render(<FileItem {...baseProps} status="ready" sizeBytes={sizeBytes} />),
      ).toThrow(RangeError);
    }
  });

  it("does not embed file inputs, object URLs, or upload APIs", () => {
    const { container } = render(<FileItem {...baseProps} status="ready" />);
    const source = container.innerHTML;

    expect(container.querySelector("input[type='file']")).toBeNull();
    expect(source).not.toMatch(/blob:|createObjectURL|FormData|XMLHttpRequest/);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <h1>Files</h1>
        <FileItem
          {...baseProps}
          status="error"
          errorMessage="The file could not be read."
          onRetry={() => {}}
          onRemove={() => {}}
        />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
