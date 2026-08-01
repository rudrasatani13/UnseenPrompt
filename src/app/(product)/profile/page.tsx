import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { noIndexMetadata } from "@/app/metadata";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerEnvironment } from "@/config/env/server";
import { DeletionRequestCard } from "@/features/account/deletion-request-card";
import { PreferencesForm } from "@/features/account/preferences-form";
import { ProfileForm } from "@/features/account/profile-form";
import { SignOutButton } from "@/features/account/sign-out-button";
import { createSupabaseAccountRepository } from "@/lib/account/supabase-account-repository";
import { isProductSurfaceEnabled } from "@/lib/security/product-surface";
import { getAuthenticatedContext } from "@/lib/supabase/require-user";

export const metadata: Metadata = {
  title: "Profile",
  ...noIndexMetadata,
};

export const dynamic = "force-dynamic";

/** The authoritative server gate protects profile data even if proxy redirects are bypassed. */
export default async function ProfilePage() {
  if (!isProductSurfaceEnabled(getServerEnvironment())) {
    notFound();
  }

  const context = await getAuthenticatedContext();
  if (!context) {
    redirect("/sign-in?next=%2Fprofile");
  }

  const repository = createSupabaseAccountRepository(context.supabase);
  const [profile, preferences] = await Promise.all([
    repository.getProfile(context.user.id),
    repository.getPreferences(context.user.id),
  ]);

  if (!profile || !profile.onboardingCompletedAt || !preferences) {
    redirect("/onboarding");
  }

  return (
    <div className="grid w-full max-w-3xl gap-8">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Profile</h1>
        <p className="text-sm text-ink-muted">Manage only the details you choose to save.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
          <CardDescription>
            These settings control language, time zone, and how we address you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Change the defaults used when you start a project.</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm preferences={preferences} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Export your structured state or end this browser session.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <a href="/api/account/export" download="unseenprompt-export.json">
              Export account data
            </a>
          </Button>
          <SignOutButton />
        </CardContent>
      </Card>
      <DeletionRequestCard deletionRequestedAt={profile.deletionRequestedAt} />
    </div>
  );
}
