import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const buttonVariants = ["default", "secondary", "outline", "ghost", "destructive"] as const;
const buttonSizes = ["default", "sm", "lg", "icon"] as const;

describe("Button", () => {
  it.each(buttonVariants)("renders the %s variant as an accessible button", (variant) => {
    render(<Button variant={variant}>Continue</Button>);

    const button = screen.getByRole("button", { name: "Continue" });

    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("data-variant", variant);
  });

  it.each(buttonSizes)("renders the %s size", (size) => {
    render(
      <Button size={size} aria-label="Continue">
        {size === "icon" ? <svg aria-hidden="true" focusable="false" /> : "Continue"}
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute("data-size", size);
  });

  it("exposes disabled through native semantics rather than styling alone", () => {
    render(<Button disabled>Confirm</Button>);

    const button = screen.getByRole("button", { name: "Confirm" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("disabled");
  });

  it("announces an in-flight action with aria-busy", () => {
    render(
      <Button aria-busy disabled>
        Saving
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Saving" })).toHaveAttribute("aria-busy", "true");
  });

  it("gives an icon-only button an explicit accessible name", () => {
    render(
      <Button size="icon" aria-label="Copy prompt">
        <svg aria-hidden="true" focusable="false" />
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Copy prompt" })).toBeInTheDocument();
  });

  it("invokes its handler exactly once per activation", async () => {
    const user = userEvent.setup();
    let activations = 0;

    render(<Button onClick={() => (activations += 1)}>Retry</Button>);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(activations).toBe(1);
  });
});

describe("Input and Textarea", () => {
  it("exposes disabled, read-only, and invalid state through native attributes", () => {
    render(
      <>
        <Label htmlFor="disabled-input">Disabled input</Label>
        <Input id="disabled-input" disabled />
        <Label htmlFor="readonly-input">Read-only input</Label>
        <Input id="readonly-input" readOnly defaultValue="locked" />
        <Label htmlFor="invalid-input">Invalid input</Label>
        <Input id="invalid-input" aria-invalid />
      </>,
    );

    expect(screen.getByRole("textbox", { name: "Disabled input" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Read-only input" })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "Invalid input" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("exposes the same states for a textarea", () => {
    render(
      <>
        <Label htmlFor="disabled-area">Disabled area</Label>
        <Textarea id="disabled-area" disabled />
        <Label htmlFor="readonly-area">Read-only area</Label>
        <Textarea id="readonly-area" readOnly defaultValue="locked" />
        <Label htmlFor="invalid-area">Invalid area</Label>
        <Textarea id="invalid-area" aria-invalid />
      </>,
    );

    expect(screen.getByRole("textbox", { name: "Disabled area" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Read-only area" })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "Invalid area" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

describe("Presentation primitives", () => {
  it("renders card structure with a heading and description", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Project context</CardTitle>
          <CardDescription>Nothing is stored in this phase.</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByText("Project context")).toBeInTheDocument();
    expect(screen.getByText("Nothing is stored in this phase.")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });

  it("renders a badge as readable text", () => {
    render(<Badge>Preview</Badge>);

    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("renders a decorative separator outside the accessibility tree", () => {
    const { container } = render(<Separator />);
    const separator = container.querySelector('[data-slot="separator"]');

    expect(separator).not.toBeNull();
    expect(separator).toHaveAttribute("data-orientation", "horizontal");
  });

  it("renders an alert with a title and description", () => {
    render(
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>This preview accepts no input.</AlertDescription>
      </Alert>,
    );

    const alert = screen.getByRole("alert");

    expect(alert).toHaveTextContent("Heads up");
    expect(alert).toHaveTextContent("This preview accepts no input.");
  });

  it("requires the consumer to name a progress bar", () => {
    render(<Progress value={40} aria-label="Prompt allowance used" />);

    expect(screen.getByRole("progressbar", { name: "Prompt allowance used" })).toBeInTheDocument();
  });

  it("reserves final content dimensions in a skeleton without a looping transform", () => {
    const { container } = render(<Skeleton className="h-4 w-24" />);
    const skeleton = container.querySelector('[data-slot="skeleton"]');

    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain("h-4");
    expect(skeleton?.className).toContain("w-24");
    expect(skeleton?.className).not.toMatch(/animate-bounce|animate-spin|animate-ping/);
  });
});

describe("RadioGroup", () => {
  it("moves selection with arrow keys", async () => {
    const user = userEvent.setup();

    render(
      <RadioGroup defaultValue="claude-code" aria-label="Coding tool">
        <Label htmlFor="tool-claude">Claude Code</Label>
        <RadioGroupItem id="tool-claude" value="claude-code" />
        <Label htmlFor="tool-codex">OpenAI Codex</Label>
        <RadioGroupItem id="tool-codex" value="codex" />
        <Label htmlFor="tool-cursor">Cursor</Label>
        <RadioGroupItem id="tool-cursor" value="cursor" />
      </RadioGroup>,
    );

    const first = screen.getByRole("radio", { name: "Claude Code" });

    expect(first).toBeChecked();

    first.focus();

    /*
     * Radix defers roving focus with `setTimeout` and clears its arrow-key flag
     * on `keyup`. `user-event` fires keydown and keyup back to back, so the key
     * is held here to reproduce real key timing. Task 14 repeats this in
     * Chromium with genuine key presses.
     */
    await user.keyboard("{ArrowDown>}");

    expect(screen.getByRole("radio", { name: "OpenAI Codex" })).toBeChecked();

    await user.keyboard("{/ArrowDown}{ArrowUp>}");

    expect(screen.getByRole("radio", { name: "Claude Code" })).toBeChecked();

    await user.keyboard("{/ArrowUp}");
  });
});

describe("primitive accessibility", () => {
  it("has no axe violations for a representative mounted set", async () => {
    const { container } = render(
      <main>
        <h1>Primitives</h1>
        <Button>Continue</Button>
        <Button variant="destructive">Delete</Button>
        <Button size="icon" aria-label="Copy prompt">
          <svg aria-hidden="true" focusable="false" />
        </Button>
        <Label htmlFor="axe-input">Project name</Label>
        <Input id="axe-input" />
        <Label htmlFor="axe-area">Project summary</Label>
        <Textarea id="axe-area" />
        <Card>
          <CardHeader>
            <CardTitle>Card</CardTitle>
            <CardDescription>Description</CardDescription>
          </CardHeader>
          <CardContent>Content</CardContent>
        </Card>
        <Badge>Preview</Badge>
        <Separator />
        <Progress value={25} aria-label="Progress" />
        <Skeleton className="h-4 w-24" />
        <Alert>
          <AlertTitle>Notice</AlertTitle>
          <AlertDescription>Detail</AlertDescription>
        </Alert>
        <RadioGroup defaultValue="a" aria-label="Options">
          <Label htmlFor="axe-a">Option A</Label>
          <RadioGroupItem id="axe-a" value="a" />
          <Label htmlFor="axe-b">Option B</Label>
          <RadioGroupItem id="axe-b" value="b" />
        </RadioGroup>
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
