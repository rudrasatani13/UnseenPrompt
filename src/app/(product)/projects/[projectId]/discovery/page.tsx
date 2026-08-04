import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { noIndexMetadata } from "@/app/metadata";
import { getServerEnvironment } from "@/config/env/server";
import { DiscoveryFlow } from "@/features/discovery/discovery-flow";
import { createSupabaseAccountRepository } from "@/lib/account/supabase-account-repository";
import type { DiscoverySnapshotV1 } from "@/domain/discovery/contracts";
import { createDiscoveryRuntime } from "@/lib/discovery/runtime";
import { isProductSurfaceEnabled } from "@/lib/security/product-surface";
import { getAuthenticatedContext } from "@/lib/supabase/require-user";

export const metadata: Metadata = {
  title: "Project discovery",
  ...noIndexMetadata,
};

export const dynamic = "force-dynamic";

export interface DiscoveryPageProps {
  readonly params: { readonly projectId: string } | Promise<{ readonly projectId: string }>;
}

function errorCode(error: unknown): unknown {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return (error as { readonly code?: unknown }).code;
}

/** Authoritative project boundary: gate, session, onboarding, then owner-scoped snapshot. */
export default async function DiscoveryPage({ params }: DiscoveryPageProps) {
  if (!isProductSurfaceEnabled(getServerEnvironment())) {
    notFound();
  }

  const { projectId } = await params;
  const context = await getAuthenticatedContext();
  if (!context) {
    redirect(`/sign-in?next=${encodeURIComponent(`/projects/${projectId}/discovery`)}`);
  }

  const profile = await createSupabaseAccountRepository(context.supabase).getProfile(
    context.user.id,
  );
  if (!profile?.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  if (!z.uuid().safeParse(projectId).success) {
    notFound();
  }

  let snapshot: DiscoverySnapshotV1;
  try {
    snapshot = await createDiscoveryRuntime(context.supabase).getSnapshot(projectId);
  } catch (error) {
    if (errorCode(error) === "project_not_found" || errorCode(error) === "discovery_not_found") {
      notFound();
    }
    throw error;
  }

  return <DiscoveryFlow initialSnapshot={snapshot} />;
}
