import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

describe("Tooltip", () => {
  it("reveals supplementary content on keyboard focus without replacing the trigger name", async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>Copy prompt</Button>
          </TooltipTrigger>
          <TooltipContent>Copies the example prompt text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Copy prompt" });

    await user.tab();

    expect(trigger).toHaveFocus();
    await waitFor(() => {
      expect(screen.getAllByText("Copies the example prompt text").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("button", { name: "Copy prompt" })).toBe(trigger);
  });
});

describe("Tabs", () => {
  function renderTabs() {
    return render(
      <Tabs defaultValue="tokens">
        <TabsList aria-label="Gallery sections">
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="core">Core</TabsTrigger>
          <TabsTrigger value="product">Product</TabsTrigger>
        </TabsList>
        <TabsContent value="tokens">Token specimens</TabsContent>
        <TabsContent value="core">Core components</TabsContent>
        <TabsContent value="product">Product components</TabsContent>
      </Tabs>,
    );
  }

  it("exposes list, tab, and panel semantics", () => {
    renderTabs();

    expect(screen.getByRole("tablist", { name: "Gallery sections" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Token specimens");
  });

  it("moves selection with ArrowRight and ArrowLeft", async () => {
    const user = userEvent.setup();

    renderTabs();
    screen.getByRole("tab", { name: "Tokens" }).focus();

    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Core" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}");

    expect(screen.getByRole("tab", { name: "Tokens" })).toHaveAttribute("aria-selected", "true");
  });

  it("selects the first and last tab with Home and End", async () => {
    const user = userEvent.setup();

    renderTabs();
    screen.getByRole("tab", { name: "Tokens" }).focus();

    await user.keyboard("{End}");

    expect(screen.getByRole("tab", { name: "Product" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");

    expect(screen.getByRole("tab", { name: "Tokens" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("Dialog", () => {
  function renderDialog() {
    return render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open details</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prompt details</DialogTitle>
            <DialogDescription>Read-only example content.</DialogDescription>
          </DialogHeader>
          <Button>Acknowledge</Button>
        </DialogContent>
      </Dialog>,
    );
  }

  it("opens from its trigger and places focus inside", async () => {
    const user = userEvent.setup();

    renderDialog();
    await user.click(screen.getByRole("button", { name: "Open details" }));

    const dialog = await screen.findByRole("dialog", { name: "Prompt details" });

    expect(dialog).toBeInTheDocument();
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it("always offers a visible close control in addition to Escape", async () => {
    const user = userEvent.setup();

    renderDialog();
    await user.click(screen.getByRole("button", { name: "Open details" }));

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();

    renderDialog();

    const trigger = screen.getByRole("button", { name: "Open details" });

    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });
});

describe("AlertDialog", () => {
  function renderAlertDialog(onConfirm: () => void) {
    return render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">Delete project</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep project</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Delete project</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
  }

  it("requires an explicit confirm and restores focus", async () => {
    const user = userEvent.setup();
    let confirmations = 0;

    renderAlertDialog(() => (confirmations += 1));

    const trigger = screen.getByRole("button", { name: "Delete project" });

    await user.click(trigger);

    const dialog = await screen.findByRole("alertdialog", { name: "Delete this project?" });

    expect(confirmations).toBe(0);

    await user.click(within(dialog).getByRole("button", { name: "Delete project" }));

    expect(confirmations).toBe(1);
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("cancels without confirming", async () => {
    const user = userEvent.setup();
    let confirmations = 0;

    renderAlertDialog(() => (confirmations += 1));
    await user.click(screen.getByRole("button", { name: "Delete project" }));

    const dialog = await screen.findByRole("alertdialog");

    await user.click(within(dialog).getByRole("button", { name: "Keep project" }));

    expect(confirmations).toBe(0);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});

describe("Sheet", () => {
  function renderSheet() {
    return render(
      <Sheet>
        <SheetTrigger asChild>
          <Button>Open navigation</Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Move between product areas.</SheetDescription>
          </SheetHeader>
          <Link href="/">New Project</Link>
        </SheetContent>
      </Sheet>,
    );
  }

  it("opens, traps focus, and exposes a visible close control", async () => {
    const user = userEvent.setup();

    renderSheet();
    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    const sheet = await screen.findByRole("dialog", { name: "Navigation" });

    await waitFor(() => {
      expect(sheet.contains(document.activeElement)).toBe(true);
    });

    expect(within(sheet).getByRole("button", { name: /close/i })).toBeInTheDocument();

    await user.tab();
    expect(sheet.contains(document.activeElement)).toBe(true);
    await user.tab();
    expect(sheet.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(sheet.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape and restores focus", async () => {
    const user = userEvent.setup();

    renderSheet();

    const trigger = screen.getByRole("button", { name: "Open navigation" });

    await user.click(trigger);
    await screen.findByRole("dialog", { name: "Navigation" });
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("closes from its explicit close control and restores focus", async () => {
    const user = userEvent.setup();

    renderSheet();

    const trigger = screen.getByRole("button", { name: "Open navigation" });

    await user.click(trigger);

    const sheet = await screen.findByRole("dialog", { name: "Navigation" });

    await user.click(within(sheet).getByRole("button", { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });
});

describe("DropdownMenu", () => {
  it("opens with the keyboard and activates an item", async () => {
    const user = userEvent.setup();
    let activations = 0;

    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Prompt actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => (activations += 1)}>Copy prompt</DropdownMenuItem>
          <DropdownMenuItem>Show acceptance criteria</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    screen.getByRole("button", { name: "Prompt actions" }).focus();
    await user.keyboard("{Enter}");

    const menu = await screen.findByRole("menu");

    await waitFor(() => {
      expect(within(menu).getByRole("menuitem", { name: "Copy prompt" })).toHaveFocus();
    });

    await user.keyboard("{Enter}");

    expect(activations).toBe(1);
  });
});

describe("ScrollArea", () => {
  it("keeps its content in the accessibility tree", () => {
    render(
      <ScrollArea className="h-24">
        <ul>
          <li>First item</li>
          <li>Second item</li>
        </ul>
      </ScrollArea>,
    );

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("overlay accessibility", () => {
  it("has no axe violations for a representative closed state", async () => {
    const { container } = render(
      <TooltipProvider delayDuration={0}>
        <main>
          <h1>Overlays</h1>
          <Tabs defaultValue="one">
            <TabsList aria-label="Sections">
              <TabsTrigger value="one">One</TabsTrigger>
              <TabsTrigger value="two">Two</TabsTrigger>
            </TabsList>
            <TabsContent value="one">First panel</TabsContent>
            <TabsContent value="two">Second panel</TabsContent>
          </Tabs>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button>Hover me</Button>
            </TooltipTrigger>
            <TooltipContent>Extra detail</TooltipContent>
          </Tooltip>
          <ScrollArea className="h-24">
            <p>Scrollable copy</p>
          </ScrollArea>
        </main>
      </TooltipProvider>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations for an open dialog", async () => {
    const user = userEvent.setup();
    const { baseElement } = render(
      <main>
        <h1>Dialog</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Title</DialogTitle>
              <DialogDescription>Description</DialogDescription>
            </DialogHeader>
            <p>Body copy</p>
          </DialogContent>
        </Dialog>
      </main>,
    );

    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");

    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
