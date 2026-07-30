import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/mona-sans/wdth.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

import { buildRootMetadata } from "@/app/metadata";
import { AppProviders } from "@/components/providers/app-providers";
import { getServerEnvironment } from "@/config/env/server";

import "./globals.css";

const environment = getServerEnvironment();

export const metadata: Metadata = buildRootMetadata(environment);

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
