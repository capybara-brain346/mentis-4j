import type { Metadata } from "next";
import { AccountView } from "@/components/account/account";

export const metadata: Metadata = {
  title: "Your account — Mentis",
  robots: { index: false, follow: false },
};
export default function AccountPage() {
  return <AccountView />;
}
