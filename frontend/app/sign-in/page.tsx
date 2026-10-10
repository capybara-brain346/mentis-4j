import type { Metadata } from "next";
import { SignInView } from "@/components/account/sign-in";

export const metadata: Metadata = {
  title: "Sign in — Mentis",
  robots: { index: false, follow: false },
};
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <SignInView error={typeof params.error === "string" ? params.error : ""} />
  );
}
