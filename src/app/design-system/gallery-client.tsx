"use client";

import { FolderOpenIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CORE_COMPONENTS,
  GALLERY_FIXTURES,
  GALLERY_SECTIONS,
  PRODUCT_COMPONENTS,
} from "@/app/design-system/gallery-data";
import { ConfirmationCard } from "@/components/product/confirmation-card";
import { EmptyState } from "@/components/product/empty-state";
import { EvidenceLabel } from "@/components/product/evidence-label";
import { FileItem } from "@/components/product/file-item";
import { LifecycleSteps } from "@/components/product/lifecycle-steps";
import { PromptPanel } from "@/components/product/prompt-panel";
import { QuestionChoice } from "@/components/product/question-choice";
import { RiskWarning } from "@/components/product/risk-warning";
import { ToolSelector, type CodingTool } from "@/components/product/tool-selector";
import { UsageMeter } from "@/components/product/usage-meter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TOKEN_SWATCHES = [
  { name: "canvas", hex: "#FEFAF8", role: "Page background" },
  { name: "surface", hex: "#FFFFFF", role: "Raised surface" },
  { name: "surface-muted", hex: "#FAF4F5", role: "Muted surface / active nav" },
  { name: "text-primary", hex: "#2B2426", role: "Primary text" },
  { name: "text-secondary", hex: "#6F6266", role: "Secondary text" },
  { name: "brand-primary", hex: "#A64763", role: "Primary action" },
  { name: "border-control", hex: "#8F8185", role: "Control border" },
  { name: "border-subtle", hex: "#E9DFE1", role: "Subtle border" },
  { name: "success-foreground", hex: "#17623A", role: "Success text" },
  { name: "warning-foreground", hex: "#7A4A00", role: "Warning text" },
  { name: "danger-foreground", hex: "#8F2037", role: "Danger text" },
  { name: "info-foreground", hex: "#1F4E79", role: "Info text" },
] as const;

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="grid gap-4">
      <h2 id={`${id}-heading`} className="text-2xl font-semibold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Specimen({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Card data-gallery-component={title}>
      <CardHeader>
        <CardTitle>
          <h3 className="text-base font-semibold">{title}</h3>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

function CoreGallery() {
  return (
    <div className="grid gap-6">
      <Specimen title="Button" description="Normal, disabled, and loading-busy states.">
        <div className="flex flex-wrap gap-2">
          <Button type="button">Default</Button>
          <Button type="button" variant="secondary">
            Secondary
          </Button>
          <Button type="button" variant="outline">
            Outline
          </Button>
          <Button type="button" variant="ghost">
            Ghost
          </Button>
          <Button type="button" variant="destructive">
            Destructive
          </Button>
          <Button type="button" disabled>
            Disabled
          </Button>
          <Button type="button" aria-busy="true">
            Loading
          </Button>
        </div>
      </Specimen>

      <Specimen title="Input">
        <div className="grid max-w-md gap-3">
          <Input aria-label="Normal input" placeholder="Normal" />
          <Input aria-label="Disabled input" placeholder="Disabled" disabled />
          <Input aria-label="Invalid input" placeholder="Invalid" aria-invalid />
          <Input aria-label="Read-only input" defaultValue="Read only" readOnly />
        </div>
      </Specimen>

      <Specimen title="Textarea">
        <Textarea
          aria-label="Long text specimen"
          defaultValue={GALLERY_FIXTURES.longText}
          rows={4}
        />
      </Specimen>

      <Specimen title="Card">
        <Card className="max-w-md border-subtle">
          <CardHeader>
            <CardTitle>Nested card</CardTitle>
            <CardDescription>Surface elevation specimen.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink-muted">Warm Editorial panel surface.</p>
          </CardContent>
        </Card>
      </Specimen>

      <Specimen title="Badge">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="info">Info</Badge>
        </div>
      </Specimen>

      <Specimen title="Separator">
        <div className="max-w-md">
          <p className="text-sm">Above</p>
          <Separator className="my-3" />
          <p className="text-sm">Below</p>
        </div>
      </Specimen>

      <Specimen title="Tooltip" description="Keyboard focus reveals supplementary content.">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="outline">
              Focus for tip
            </Button>
          </TooltipTrigger>
          <TooltipContent>Synthetic tooltip content</TooltipContent>
        </Tooltip>
      </Specimen>

      <Specimen title="ScrollArea">
        <ScrollArea className="h-32 max-w-md rounded-md border border-subtle p-3">
          <div className="grid gap-2 pr-3 text-sm">
            {Array.from({ length: 12 }, (_, index) => (
              <p key={index}>Scrollable line {index + 1}</p>
            ))}
          </div>
        </ScrollArea>
      </Specimen>

      <Specimen title="Tabs" description="ArrowRight/ArrowLeft move selection; Home/End jump.">
        <Tabs defaultValue="one" className="max-w-md">
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
            <TabsTrigger value="three">Three</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First panel</TabsContent>
          <TabsContent value="two">Second panel</TabsContent>
          <TabsContent value="three">Third panel</TabsContent>
        </Tabs>
      </Specimen>

      <Specimen title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              Open dialog
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gallery dialog</DialogTitle>
              <DialogDescription>Escape closes and restores trigger focus.</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-ink-muted">Synthetic dialog body.</p>
          </DialogContent>
        </Dialog>
      </Specimen>

      <Specimen title="AlertDialog">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive">
              Open alert dialog
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm gallery action</AlertDialogTitle>
              <AlertDialogDescription>
                Explicit confirm or cancel is required. No automatic acknowledgement.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Specimen>

      <Specimen title="Sheet">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline">
              Open sheet
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(88vw,320px)]">
            <SheetHeader>
              <SheetTitle>Gallery sheet</SheetTitle>
              <SheetDescription>Focus stays inside until Escape or close.</SheetDescription>
            </SheetHeader>
            <p className="px-4 text-sm text-ink-muted">Synthetic sheet content.</p>
          </SheetContent>
        </Sheet>
      </Specimen>

      <Specimen title="DropdownMenu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline">
              Open menu
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>First item</DropdownMenuItem>
            <DropdownMenuItem>Second item</DropdownMenuItem>
            <DropdownMenuItem disabled>Disabled item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Specimen>

      <Specimen title="Progress">
        <Progress value={42} aria-label="Gallery progress" className="max-w-md" />
      </Specimen>

      <Specimen title="FileItem" description="Error state with retry; no real upload.">
        <div className="grid max-w-xl gap-3">
          <FileItem
            name="gallery-brief.pdf"
            fileType="PDF"
            sizeBytes={2048}
            status="ready"
            errorMessage={null}
            onRetry={null}
            onRemove={null}
          />
          <FileItem
            name="gallery-brief.pdf"
            fileType="PDF"
            sizeBytes={2048}
            status="error"
            errorMessage={GALLERY_FIXTURES.errorMessage}
            onRetry={() => {
              toast.message("Synthetic retry invoked");
            }}
            onRemove={() => {
              toast.message("Synthetic remove invoked");
            }}
          />
        </div>
      </Specimen>

      <Specimen title="Skeleton">
        <div className="grid max-w-md gap-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Specimen>

      <Specimen title="EmptyState">
        <EmptyState
          icon={<FolderOpenIcon aria-hidden="true" />}
          title="No gallery projects"
          description="Synthetic empty state. The action below is local demo only."
          action={
            <Button
              type="button"
              onClick={() => {
                toast.message("Synthetic empty-state action");
              }}
            >
              Demo action
            </Button>
          }
        />
      </Specimen>

      <Specimen title="Alert">
        <div className="grid max-w-xl gap-3">
          <Alert variant="info">
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>Synthetic information message.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>Synthetic warning message.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{GALLERY_FIXTURES.errorMessage}</AlertDescription>
          </Alert>
        </div>
      </Specimen>

      <Specimen title="Toast" description="Transient confirmation only; not for form errors.">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            toast.success("Synthetic toast confirmation");
          }}
        >
          Show toast
        </Button>
      </Specimen>
    </div>
  );
}

function ProductGallery() {
  const [tool, setTool] = useState<CodingTool>("claude-code");
  const [choice, setChoice] = useState<"a" | "b" | "c">("a");
  const [confirmBusy, setConfirmBusy] = useState(false);

  return (
    <div className="grid gap-6">
      <Specimen title="LifecycleSteps">
        <LifecycleSteps
          label="Gallery lifecycle"
          steps={[
            {
              id: "one",
              label: "Capture context",
              description: "Synthetic complete step",
              state: "complete",
            },
            {
              id: "two",
              label: "Confirm constraints",
              description: "Synthetic current step",
              state: "current",
            },
            {
              id: "three",
              label: "Generate prompt",
              description: null,
              state: "pending",
            },
            {
              id: "four",
              label: "Blocked review",
              description: "Synthetic blocked step",
              state: "blocked",
            },
          ]}
        />
      </Specimen>

      <Specimen title="ConfirmationCard">
        <ConfirmationCard
          title="Apply gallery change"
          summary="Synthetic confirmation summary for the gallery."
          details={["No real mutation occurs", "Labels stay stable while busy"]}
          confirmLabel="Confirm"
          rejectLabel="Reject"
          busy={confirmBusy}
          onConfirm={() => {
            setConfirmBusy(true);
            window.setTimeout(() => {
              setConfirmBusy(false);
              toast.message("Synthetic confirm");
            }, 400);
          }}
          onReject={() => {
            toast.message("Synthetic reject");
          }}
        />
      </Specimen>

      <Specimen title="EvidenceLabel">
        <div className="flex flex-wrap gap-2">
          <EvidenceLabel state="claimed" />
          <EvidenceLabel state="evidence-supplied" />
          <EvidenceLabel state="user-confirmed" />
          <EvidenceLabel state="verified" />
        </div>
      </Specimen>

      <Specimen title="PromptPanel">
        <PromptPanel
          prompt={GALLERY_FIXTURES.prompt}
          metadata="Gallery fixture"
          expectedResult={GALLERY_FIXTURES.expectedResult}
          acceptanceCriteria={GALLERY_FIXTURES.acceptance}
          copyText={async (text) => {
            await navigator.clipboard.writeText(text);
          }}
        />
      </Specimen>

      <Specimen title="QuestionChoice">
        <QuestionChoice
          name="gallery-choice"
          legend="Pick a synthetic option"
          value={choice}
          onValueChange={setChoice}
          options={[
            {
              value: "a",
              label: "Option A",
              description: "First synthetic choice",
              disabled: false,
            },
            {
              value: "b",
              label: "Option B",
              description: "Second synthetic choice",
              disabled: false,
            },
            {
              value: "c",
              label: "Option C",
              description: "Disabled synthetic choice",
              disabled: true,
            },
          ]}
        />
      </Specimen>

      <Specimen title="ToolSelector">
        <ToolSelector value={tool} onValueChange={setTool} />
      </Specimen>

      <Specimen title="UsageMeter">
        <div className="grid max-w-md gap-4">
          <UsageMeter label="Gallery credits" used={3} limit={10} unit="credits" />
          <UsageMeter label="Empty meter" used={0} limit={5} unit="runs" />
          <UsageMeter label="Full meter" used={5} limit={5} unit="runs" />
        </div>
      </Specimen>

      <Specimen title="RiskWarning">
        <div className="grid max-w-xl gap-4">
          <RiskWarning
            level="warning"
            title="Synthetic warning"
            description="Display-only warning with no confirmation."
            confirmation={null}
          />
          <RiskWarning
            level="danger"
            title="Synthetic danger"
            description="Requires explicit confirmation before the callback runs."
            confirmation={{
              triggerLabel: "Review danger",
              confirmLabel: "I understand",
              cancelLabel: "Cancel",
              onConfirm: () => {
                toast.message("Synthetic danger confirmed");
              },
            }}
          />
        </div>
      </Specimen>
    </div>
  );
}

/**
 * Interactive design-system gallery. State is local demo only.
 * No network, persistence, or production data.
 */
export function DesignSystemGallery() {
  return (
    <div
      data-slot="design-system-gallery"
      className="mx-auto grid w-full max-w-[960px] gap-10 px-4 py-10 md:px-6 lg:px-10"
    >
      <header className="grid gap-3">
        <p className="text-sm font-medium text-brand uppercase">Internal</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-5xl">
          Design System
        </h1>
        <p className="max-w-prose text-base text-ink-muted">
          Warm Editorial inventory for UnseenPrompt. This gallery contains no production data and is
          hidden in production.
        </p>
        <ul className="grid gap-3 text-sm">
          {GALLERY_SECTIONS.map((section) => (
            <li key={section.id} className="grid gap-1">
              <a
                href={`#${section.id}`}
                className="w-fit font-medium text-brand underline underline-offset-2"
              >
                {section.title}
              </a>
              {section.keyboardNote ? (
                <p className="text-ink-muted">{section.keyboardNote}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </header>

      <Section id="tokens" title="Tokens">
        <Specimen title="TokenSwatches">
          <ul className="grid gap-3 sm:grid-cols-2">
            {TOKEN_SWATCHES.map((token) => (
              <li
                key={token.name}
                className="flex items-center gap-3 rounded-md border border-subtle p-3"
              >
                <span
                  aria-hidden="true"
                  className="size-10 shrink-0 rounded-md border border-subtle"
                  style={{ backgroundColor: token.hex }}
                />
                <div className="min-w-0">
                  <p className="font-mono text-sm text-ink">{token.name}</p>
                  <p className="font-mono text-xs text-ink-muted">{token.hex}</p>
                  <p className="text-xs text-ink-muted">{token.role}</p>
                </div>
              </li>
            ))}
          </ul>
        </Specimen>
        <Specimen title="Typography">
          <div className="grid gap-2">
            <p className="text-5xl font-semibold">44px display</p>
            <p className="text-3xl font-semibold">32px title</p>
            <p className="text-2xl font-semibold">24px heading</p>
            <p className="text-lg">18px large</p>
            <p className="text-base">16px body</p>
            <p className="text-sm">14px small</p>
            <p className="text-xs">12px caption</p>
          </div>
        </Specimen>
        <Specimen title="Spacing">
          <div className="flex flex-wrap items-end gap-2">
            {[4, 8, 12, 16, 24, 32, 40, 48, 64, 96].map((size) => (
              <div key={size} className="grid justify-items-center gap-1">
                <div className="bg-brand/30" style={{ width: size, height: size }} />
                <span className="text-xs text-ink-muted">{size}</span>
              </div>
            ))}
          </div>
        </Specimen>
        <Specimen title="Radius">
          <ul className="flex flex-wrap gap-3">
            {[
              ["4px", "rounded-xs"],
              ["8px", "rounded-sm"],
              ["12px", "rounded-md"],
              ["16px", "rounded-lg"],
              ["pill", "rounded-pill"],
            ].map(([label, className]) => (
              <li key={label} className="grid justify-items-center gap-1">
                <div
                  aria-hidden="true"
                  className={`size-16 border border-control bg-surface-muted ${className}`}
                />
                <span className="text-xs text-ink-muted">Radius {label}</span>
              </li>
            ))}
          </ul>
        </Specimen>
        <Specimen title="Elevation">
          <div className="flex flex-wrap gap-4">
            <div className="rounded-md bg-surface p-6 shadow-panel">Panel shadow</div>
            <div className="rounded-md bg-surface p-6 shadow-overlay">Overlay shadow</div>
          </div>
        </Specimen>
        <Specimen title="Focus">
          <Button type="button" variant="outline">
            Tab to see 2px focus ring
          </Button>
          <p className="text-sm text-ink-muted">
            Forced-colors and reduced-motion rules live in theme.css. Prefer prefers-reduced-motion
            OS settings when validating motion specimens.
          </p>
        </Specimen>
      </Section>

      <Section id="core" title="Core components">
        <p className="text-sm text-ink-muted">
          Inventory: {CORE_COMPONENTS.join(", ")}. Interaction notes: Tabs, Dialog, Sheet, Dropdown,
          and radio groups follow keyboard contracts in the section index.
        </p>
        <CoreGallery />
      </Section>

      <Section id="product" title="Product components">
        <p className="text-sm text-ink-muted">Inventory: {PRODUCT_COMPONENTS.join(", ")}.</p>
        <ProductGallery />
      </Section>
    </div>
  );
}
