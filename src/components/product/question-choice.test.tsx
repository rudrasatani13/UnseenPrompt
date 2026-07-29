import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { QuestionChoice, type ChoiceOption } from "@/components/product/question-choice";

type Scope = "minimal" | "standard" | "detailed";

const options = [
  { value: "minimal", label: "Minimal scope", description: "One page only.", disabled: false },
  {
    value: "standard",
    label: "Standard scope",
    description: "A small multi-page application.",
    disabled: false,
  },
  {
    value: "detailed",
    label: "Detailed scope",
    description: "Not available in this preview.",
    disabled: true,
  },
] as const satisfies readonly ChoiceOption<Scope>[];

function ControlledChoice({ initial = "minimal" as Scope }: { initial?: Scope }) {
  const [value, setValue] = useState<Scope>(initial);

  return (
    <QuestionChoice
      name="scope"
      legend="How much scope should the prompt cover?"
      value={value}
      options={options}
      onValueChange={setValue}
    />
  );
}

describe("QuestionChoice", () => {
  it("renders a labelled radio group with a visible legend", () => {
    render(<ControlledChoice />);

    expect(
      screen.getByRole("radiogroup", { name: "How much scope should the prompt cover?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("How much scope should the prompt cover?")).toBeVisible();
  });

  it("reflects the selected value supplied by props", () => {
    render(
      <QuestionChoice<Scope>
        name="scope"
        legend="How much scope should the prompt cover?"
        value="standard"
        options={options}
        onValueChange={() => {}}
      />,
    );

    expect(screen.getByRole("radio", { name: /Standard scope/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Minimal scope/ })).not.toBeChecked();
  });

  it("does not change selection without the caller updating props", async () => {
    const user = userEvent.setup();
    const seen: Scope[] = [];

    render(
      <QuestionChoice<Scope>
        name="scope"
        legend="How much scope should the prompt cover?"
        value="minimal"
        options={options}
        onValueChange={(next) => seen.push(next)}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /Standard scope/ }));

    expect(seen).toEqual(["standard"]);
    expect(screen.getByRole("radio", { name: /Minimal scope/ })).toBeChecked();
  });

  it("moves selection forward with ArrowDown and ArrowRight", async () => {
    const user = userEvent.setup();

    render(<ControlledChoice />);
    screen.getByRole("radio", { name: /Minimal scope/ }).focus();

    await user.keyboard("{ArrowDown>}");
    expect(screen.getByRole("radio", { name: /Standard scope/ })).toBeChecked();
    await user.keyboard("{/ArrowDown}");

    await user.keyboard("{ArrowRight>}");
    expect(screen.getByRole("radio", { name: /Minimal scope/ })).toBeChecked();
    await user.keyboard("{/ArrowRight}");
  });

  it("moves selection backward with ArrowUp and ArrowLeft", async () => {
    const user = userEvent.setup();

    render(<ControlledChoice initial="standard" />);
    screen.getByRole("radio", { name: /Standard scope/ }).focus();

    await user.keyboard("{ArrowUp>}");
    expect(screen.getByRole("radio", { name: /Minimal scope/ })).toBeChecked();
    await user.keyboard("{/ArrowUp}");

    await user.keyboard("{ArrowLeft>}");
    expect(screen.getByRole("radio", { name: /Standard scope/ })).toBeChecked();
    await user.keyboard("{/ArrowLeft}");
  });

  it("skips a disabled option and never reports it as selected", async () => {
    const user = userEvent.setup();
    const seen: Scope[] = [];

    render(
      <QuestionChoice<Scope>
        name="scope"
        legend="How much scope should the prompt cover?"
        value="minimal"
        options={options}
        onValueChange={(next) => seen.push(next)}
      />,
    );

    const disabled = screen.getByRole("radio", { name: /Detailed scope/ });

    expect(disabled).toBeDisabled();

    await user.click(disabled);

    expect(seen).toEqual([]);
  });

  it("associates each description with its own radio", () => {
    render(<ControlledChoice />);

    const minimal = screen.getByRole("radio", { name: /Minimal scope/ });
    const describedBy = minimal.getAttribute("aria-describedby") ?? "";

    expect(describedBy).not.toBe("");
    expect(document.getElementById(describedBy)).toHaveTextContent("One page only.");
  });

  it("rejects an empty option set", () => {
    expect(() =>
      render(
        <QuestionChoice<Scope>
          name="scope"
          legend="How much scope should the prompt cover?"
          value="minimal"
          options={[]}
          onValueChange={() => {}}
        />,
      ),
    ).toThrow(/QuestionChoice.*at least one option/s);
  });

  it("rejects duplicate option values", () => {
    expect(() =>
      render(
        <QuestionChoice<Scope>
          name="scope"
          legend="How much scope should the prompt cover?"
          value="minimal"
          options={[
            { value: "minimal", label: "First", description: null, disabled: false },
            { value: "minimal", label: "Second", description: null, disabled: false },
          ]}
          onValueChange={() => {}}
        />,
      ),
    ).toThrow(/QuestionChoice.*duplicate.*minimal/s);
  });

  it("keeps long labels and descriptions fully visible", () => {
    const longLabel =
      "A deliberately long option label that describes the entire scope of the requested project in one line";
    const longDescription =
      "A deliberately long option description that keeps explaining the consequences of the choice without ever truncating";

    render(
      <QuestionChoice<Scope>
        name="scope"
        legend="How much scope should the prompt cover?"
        value="minimal"
        options={[
          { value: "minimal", label: longLabel, description: longDescription, disabled: false },
        ]}
        onValueChange={() => {}}
      />,
    );

    expect(screen.getByText(longLabel).className).not.toMatch(/truncate|line-clamp/);
    expect(screen.getByText(longDescription).className).not.toMatch(/truncate|line-clamp/);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <h1>Choices</h1>
        <ControlledChoice />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
