export interface Phase7AuthSession {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
  readonly expires_at?: number;
  readonly token_type: string;
  readonly user: {
    readonly id: string;
  };
}

export interface Phase7StorageCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: "/";
  readonly httpOnly: false;
  readonly secure: false;
  readonly sameSite: "Lax";
  readonly expires: number;
}

export interface Phase7StorageState {
  readonly cookies: readonly Phase7StorageCookie[];
  readonly origins: readonly [];
}

const phase7BrowserCookieDomain = "127.0.0.1";

/**
 * Build the host-scoped Supabase session cookie consumed by the local Playwright app target.
 * Playwright storage-state cookies must use either `url` or `domain`/`path`, never both.
 */
export function buildPhase7StorageState(
  supabaseUrl: string,
  session: Phase7AuthSession,
  nowMilliseconds = Date.now(),
): Phase7StorageState {
  const supabaseHostPrefix = new URL(supabaseUrl).hostname.split(".")[0];
  const encodedSession = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;

  return {
    cookies: [
      {
        name: `sb-${supabaseHostPrefix}-auth-token`,
        value: encodedSession,
        domain: phase7BrowserCookieDomain,
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
        expires: Math.floor(nowMilliseconds / 1000) + session.expires_in,
      },
    ],
    origins: [],
  };
}
