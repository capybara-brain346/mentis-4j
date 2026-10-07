import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://127.0.0.1:3000"),
  title: "Mentis — Memory for your coding agent",
  description:
    "Record coding attempts. Find related tasks. Inspect what happened. Mentis stores the evidence behind your agent's work.",
  openGraph: {
    title: "Mentis — Memory for your coding agent",
    description:
      "Record coding attempts. Find related tasks. Inspect what happened.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mentis — Memory for your coding agent",
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
      <body>{children}</body>
    </html>
  );
}
