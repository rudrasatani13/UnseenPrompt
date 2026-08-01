import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { noIndexMetadata } from "@/app/metadata";
import { getServerEnvironment } from "@/config/env/server";
import { resolveNextPath } from "@/domain/account/redirect";
import { SignInPanel } from "@/features/auth/sign-in-panel";
import { isProductSurfaceEnabled } from "@/lib/security/product-surface";

export const metadata: Metadata = {
  title: "Sign in",
  ...noIndexMetadata,
};

type SearchParamValue = string | string[] | undefined;

export interface SignInPageProps {
  readonly searchParams: Promise<Record<string, SearchParamValue>>;
}

/** A repeated query parameter is a smuggling attempt, not a preference. */
function singleValue(value: SearchParamValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  if (!isProductSurfaceEnabled(getServerEnvironment())) {
    notFound();
  }

  const params = await searchParams;
  const errorCode = singleValue(params.error);

  return (
    <SignInPanel
      nextPath={resolveNextPath(singleValue(params.next))}
      {...(errorCode === undefined ? {} : { errorCode })}
    />
  );
}
