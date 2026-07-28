import Image from "next/image";

export interface BrandLockupProps {
  readonly variant: "compact" | "full";
  readonly priority?: boolean;
}

/**
 * Local brand presentation for shell chrome.
 *
 * Uses the approved public PNG only. Compact mode names the mark through alt
 * text; full mode shows the wordmark and leaves the image decorative.
 */
export function BrandLockup({ variant, priority = false }: BrandLockupProps) {
  const showWordmark = variant === "full";

  return (
    <div
      data-slot="brand-lockup"
      data-variant={variant}
      className="flex items-center gap-3"
    >
      <Image
        src="/brand/icon-192.png"
        alt={showWordmark ? "" : "UnseenPrompt"}
        width={32}
        height={32}
        priority={priority}
        unoptimized
        className="size-8 shrink-0 rounded-sm"
      />
      {showWordmark ? (
        <span className="text-base font-semibold tracking-tight text-ink">UnseenPrompt</span>
      ) : null}
    </div>
  );
}
