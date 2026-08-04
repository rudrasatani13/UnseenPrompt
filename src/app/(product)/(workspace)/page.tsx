import { redirect } from "next/navigation";

import { getServerEnvironment } from "@/config/env/server";
import { HomeComposer } from "@/features/discovery/home-composer";
import { ComingSoonLanding } from "@/features/waitlist/coming-soon-landing";
import { createSupabaseAccountRepository } from "@/lib/account/supabase-account-repository";
import { isProductSurfaceEnabled } from "@/lib/security/product-surface";
import { getAuthenticatedContext } from "@/lib/supabase/require-user";

// The route depends on runtime Cloudflare environment bindings. Prerendering would
// bake preview/test values into the production homepage and its cache.
export const dynamic = "force-dynamic";

/**
 * Environment-owned home route. Production serves the coming-soon waitlist;
 * every other environment serves the authenticated Phase 7 composer.
 */
export default async function HomePage() {
  const environment = getServerEnvironment();

  if (environment.APP_ENV === "production") {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) {
      throw new Error("NEXT_PUBLIC_TURNSTILE_SITE_KEY is required in production");
    }
    return <ComingSoonLanding turnstileSiteKey={siteKey} />;
  }

  // The product layout owns the maintenance presentation. Do not authenticate or redirect from
  // the page while it is active, otherwise anonymous maintenance visits would be redirected
  // before the layout can replace the product child.
  if (environment.MAINTENANCE_MODE === "on") {
    return null;
  }

  if (!isProductSurfaceEnabled(environment)) {
    redirect("/sign-in?next=%2F");
  }

  const context = await getAuthenticatedContext();
  if (!context) {
    redirect("/sign-in?next=%2F");
  }

  let profile;
  try {
    profile = await createSupabaseAccountRepository(context.supabase).getProfile(context.user.id);
  } catch {
    profile = null;
  }
  if (!profile?.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  return <HomeComposer />;
}
