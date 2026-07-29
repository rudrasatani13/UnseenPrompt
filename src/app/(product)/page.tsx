import { ProductPreview } from "@/components/product/product-preview";
import { getServerEnvironment } from "@/config/env/server";
import { ComingSoonLanding } from "@/features/waitlist/coming-soon-landing";

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
