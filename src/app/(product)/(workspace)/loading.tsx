import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shell-shaped loading placeholder. It is scoped to the workspace homepage so a protected
 * account route can return a hard production 404 before any fallback commits a 200 response.
 */
export default function Loading() {
  return (
    <div
      data-slot="app-loading"
      role="status"
      aria-label="Loading workspace"
      className="min-h-dvh bg-canvas"
    >
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-[232px] lg:flex-col lg:border-r lg:border-subtle lg:bg-surface lg:p-4">
        <Skeleton className="mb-6 h-8 w-36" />
        <div className="grid gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="lg:pl-[232px]">
        <div className="mx-auto w-full max-w-[960px] space-y-4 px-4 py-10 md:px-6 lg:px-10">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-3/4 max-w-xl" />
          <Skeleton className="h-40 w-full max-w-[800px]" />
        </div>
      </div>
    </div>
  );
}
