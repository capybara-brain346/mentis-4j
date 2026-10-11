import type { Metadata } from "next";
import { CONFIG } from "../../src/config/config.ts";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import "./account.css";
import "./memory.css";
import "./graph.css";
import "./inspect.css";
import { AccountProvider } from "@/lib/account";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.FRONTEND_BASE_URL ?? CONFIG.frontend.defaultBaseUrl,
  ),
  title: "Home",
  description:
    "Record coding attempts. Find related tasks. Inspect what happened. Mentis stores the evidence behind your agent's work.",
  openGraph: {
    title: "Home",
    description:
      "Record coding attempts. Find related tasks. Inspect what happened.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Home",
    description:
      "Record coding attempts. Find related tasks. Inspect what happened.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AccountProvider>{children}</AccountProvider>
      </body>
    </html>
  );
}
