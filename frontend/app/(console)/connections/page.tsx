import type { Metadata } from "next";
import { ConnectionsView } from "@/components/account/connections";

export const metadata: Metadata = {
  title: "Connected clients — Mentis",
  robots: { index: false, follow: false },
};
export default function ConnectionsPage() {
  return <ConnectionsView />;
}
