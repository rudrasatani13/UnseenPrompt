const ROOT_PATH = "/";

/**
 * Open-redirect guard for the `next` parameter. Anything that is not an unambiguous same-origin
 * absolute path resolves to `/`: a browser must never be steered off-origin by a query string,
 * and a rejected candidate is never echoed back to the caller.
 */
export function resolveNextPath(candidate: string | null | undefined): string {
  if (typeof candidate !== "string") {
    return ROOT_PATH;
  }

  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return ROOT_PATH;
  }

  // Printable ASCII only: excludes whitespace, control characters, and header-splitting bytes.
  if (!/^[\x21-\x7e]+$/u.test(candidate)) {
    return ROOT_PATH;
  }

  if (candidate.includes("\\")) {
    return ROOT_PATH;
  }

  const [pathname = ""] = candidate.split(/[?#]/u);
  if (pathname.split("/").includes("..")) {
    return ROOT_PATH;
  }

  return candidate;
}
