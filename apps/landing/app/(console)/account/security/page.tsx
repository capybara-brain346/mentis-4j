import type { Metadata } from "next";
import { SecurityView } from "@/components/account/account";

export const metadata: Metadata = {
  title: "Security — Mentis",
  robots: { index: false, follow: false },
};
export default function SecurityPage() {
  return <SecurityView />;
}
