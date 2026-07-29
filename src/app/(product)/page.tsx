import { ProductPreview } from "@/components/product/product-preview";
import { getServerEnvironment } from "@/config/env/server";
import { ComingSoonLanding } from "@/features/waitlist/coming-soon-landing";

// The route depends on runtime Cloudflare environment bindings. Prerendering would
// bake preview/test values into the production homepage and its cache.
export const dynamic = "force-dynamic";

/**
 * Environment-owned home route. Production serves the coming-soon waitlist;
 * every other environment serves the Phase 2 product preview.
 */
export default function HomePage() {
  const environment = getServerEnvironment();

  if (environment.APP_ENV === "production") {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) {
      throw new Error("NEXT_PUBLIC_TURNSTILE_SITE_KEY is required in production");
    }
    return <ComingSoonLanding turnstileSiteKey={siteKey} />;
  }

  return <ProductPreview />;
}
