import { AccountShell } from "@/components/account/shell";

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccountShell>{children}</AccountShell>;
}
