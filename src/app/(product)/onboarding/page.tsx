import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { noIndexMetadata } from "@/app/metadata";
import { getServerEnvironment } from "@/config/env/server";
import type { Profile } from "@/domain/account/contracts";
import { OnboardingFlow } from "@/features/account/onboarding-flow";
import { createSupabaseAccountRepository } from "@/lib/account/supabase-account-repository";
import { isProductSurfaceEnabled } from "@/lib/security/product-surface";
import { getAuthenticatedContext } from "@/lib/supabase/require-user";

export const metadata: Metadata = {
  title: "Set up your account",
  ...noIndexMetadata,
};

export const dynamic = "force-dynamic";

/**
 * Authoritative gate. The proxy already steers sessionless browsers away, but it only reads
 * cookies optimistically; this page revalidates the session and the onboarding state itself.
 */
export default async function OnboardingPage() {
  if (!isProductSurfaceEnabled(getServerEnvironment())) {
    notFound();
  }

  const context = await getAuthenticatedContext();
  if (!context) {
    redirect("/sign-in?next=%2Fonboarding");
  }

  let profile: Profile | null = null;

  try {
    profile = await createSupabaseAccountRepository(context.supabase).getProfile(context.user.id);
  } catch {
    // An unreadable profile keeps the user on onboarding: the completion endpoint is idempotent,
    // so re-answering costs nothing, while a hard failure here would lock the account out.
    profile = null;
  }

  if (profile?.onboardingCompletedAt) {
    redirect("/profile");
  }

  return <OnboardingFlow />;
}
