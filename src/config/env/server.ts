import "server-only";

import { type AppEnvironment, parseEnvironment } from "@/config/env/schema";

export function getServerEnvironment(): AppEnvironment {
  return parseEnvironment({
    APP_ENV: process.env.APP_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    RELEASE_SHA: process.env.RELEASE_SHA,
    MAINTENANCE_MODE: process.env.MAINTENANCE_MODE,
  });
}
