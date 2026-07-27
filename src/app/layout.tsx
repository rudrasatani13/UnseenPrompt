import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getServerEnvironment } from "@/config/env/server";

import "./globals.css";

const environment = getServerEnvironment();

export const metadata: Metadata = {
  metadataBase: new URL(environment.NEXT_PUBLIC_APP_URL),
  title: {
    default: "UnseenPrompt",
    template: "%s · UnseenPrompt",
  },
  description: "Stateful Project Copilot for AI-assisted web development.",
  applicationName: "UnseenPrompt",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
