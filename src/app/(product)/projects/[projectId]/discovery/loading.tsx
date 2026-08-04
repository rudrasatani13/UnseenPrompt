import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      data-slot="discovery-loading"
      role="status"
      aria-label="Loading project discovery"
      className="grid w-full max-w-3xl gap-8"
    >
      <div className="grid gap-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-12 w-full max-w-2xl" />
        <Skeleton className="h-5 w-full max-w-xl" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-5 rounded-lg border border-subtle bg-surface p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-full max-w-2xl" />
        <Skeleton className="h-5 w-full max-w-xl" />
        <div className="grid gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-11 w-36" />
        </div>
      </div>
    </div>
  );
}
