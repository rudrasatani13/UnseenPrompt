import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { buildRootMetadata } from "@/app/metadata";
import { AppProviders } from "@/components/providers/app-providers";
import { getServerEnvironment } from "@/config/env/server";

import "./globals.css";

const environment = getServerEnvironment();

/**
 * `next/font/google` downloads Manrope at build time and serves it from
 * `/_next/static`. No font request leaves the origin at runtime.
 */
const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = buildRootMetadata(environment);

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} font-sans antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
