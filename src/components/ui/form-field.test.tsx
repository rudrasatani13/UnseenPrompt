import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function describedByIds(element: HTMLElement): readonly string[] {
  return (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
}

describe("FormField", () => {
  it("associates its visible label with the rendered control", () => {
    render(
      <FormField label="Project name">{(controlProps) => <Input {...controlProps} />}</FormField>,
    );

    const control = screen.getByRole("textbox", { name: "Project name" });

    expect(control).toHaveAttribute("id");
    expect(screen.getByText("Project name")).toHaveAttribute("for", control.id);
  });

  it("uses a caller-supplied id when one is provided", () => {
    render(
      <FormField id="project-name" label="Project name">
        {(controlProps) => <Input {...controlProps} />}
      </FormField>,
    );

    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveAttribute(
      "id",
      "project-name",
    );
  });

  it("describes the control with its helper description", () => {
    render(
      <FormField label="Project name" description="Used only inside this preview.">
        {(controlProps) => <Input {...controlProps} />}
      </FormField>,
    );

    const control = screen.getByRole("textbox", { name: "Project name" });
    const description = screen.getByText("Used only inside this preview.");

    expect(describedByIds(control)).toContain(description.id);
  });

  it("renders a persistent error as a live alert and marks the control invalid", () => {
    render(
      <FormField label="Project name" error="Enter a project name.">
        {(controlProps) => <Input {...controlProps} />}
      </FormField>,
    );

    const control = screen.getByRole("textbox", { name: "Project name" });
    const error = screen.getByRole("alert");

    expect(error).toHaveTextContent("Enter a project name.");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(describedByIds(control)).toContain(error.id);
  });

  it("keeps description, count, and error all referenced at the same time", () => {
    render(
      <FormField
        label="Project summary"
        description="Describe the outcome you want."
        error="Summary is too short."
        currentLength={42}
        maxLength={200}
      >
        {(controlProps) => <Textarea {...controlProps} />}
      </FormField>,
    );

    const control = screen.getByRole("textbox", { name: "Project summary" });
    const ids = describedByIds(control);

    expect(ids).toContain(screen.getByText("Describe the outcome you want.").id);
    expect(ids).toContain(screen.getByRole("alert").id);
    expect(ids).toContain(screen.getByText("42 / 200 characters").id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows a visible character count", () => {
    render(
      <FormField label="Project summary" currentLength={42} maxLength={200}>
        {(controlProps) => <Textarea {...controlProps} />}
      </FormField>,
    );

    expect(screen.getByText("42 / 200 characters")).toBeVisible();
  });

  it("omits invalid state when no error is supplied", () => {
    render(
      <FormField label="Project name">{(controlProps) => <Input {...controlProps} />}</FormField>,
    );

    expect(screen.getByRole("textbox", { name: "Project name" })).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("composes native disabled and read-only state supplied by the caller", () => {
    render(
      <>
        <FormField label="Disabled field">
          {(controlProps) => <Input {...controlProps} disabled />}
        </FormField>
        <FormField label="Read-only field">
          {(controlProps) => <Input {...controlProps} readOnly defaultValue="locked" />}
        </FormField>
      </>,
    );

    expect(screen.getByRole("textbox", { name: "Disabled field" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Read-only field" })).toHaveAttribute("readonly");
  });

  it.each([
    { currentLength: 1.5, maxLength: 200 },
    { currentLength: -1, maxLength: 200 },
    { currentLength: 10, maxLength: 0 },
    { currentLength: 201, maxLength: 200 },
    { currentLength: Number.NaN, maxLength: 200 },
    { currentLength: 10, maxLength: Number.POSITIVE_INFINITY },
  ])("rejects the invalid count %o with a RangeError", ({ currentLength, maxLength }) => {
    expect(() =>
      render(
        <FormField label="Project summary" currentLength={currentLength} maxLength={maxLength}>
          {(controlProps) => <Textarea {...controlProps} />}
        </FormField>,
      ),
    ).toThrow(RangeError);
  });

  it("requires both count props together", () => {
    expect(() =>
      render(
        <FormField label="Project summary" currentLength={10}>
          {(controlProps) => <Textarea {...controlProps} />}
        </FormField>,
      ),
    ).toThrow(RangeError);
  });

  it("has no axe violations across its states", async () => {
    const { container } = render(
      <main>
        <h1>Form field states</h1>
        <FormField label="Plain field">{(controlProps) => <Input {...controlProps} />}</FormField>
        <FormField label="Described field" description="Helper text.">
          {(controlProps) => <Input {...controlProps} />}
        </FormField>
        <FormField
          label="Counted field"
          description="Helper text."
          error="Something is wrong."
          currentLength={42}
          maxLength={200}
        >
          {(controlProps) => <Textarea {...controlProps} />}
        </FormField>
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
