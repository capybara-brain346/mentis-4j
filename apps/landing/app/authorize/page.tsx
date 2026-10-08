import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsentView } from "@/components/account/consent";
import { backendOrigin } from "@/lib/auth-proxy";

export const metadata: Metadata = {
  title: "Client access — Mentis",
  robots: { index: false, follow: false },
};
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (
    params.preview !== "1" &&
    params.client_id &&
    process.env.MENTIS_BACKEND_URL
  ) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value))
        for (const item of value) query.append(key, item);
      else if (value !== undefined) query.set(key, value);
    }
    redirect(`${backendOrigin()}/authorize?${query}`);
  }
  return (
    <ConsentView
      isPreview={params.preview === "1"}
      clientId={
        params.client === "claude"
          ? "claude"
          : params.client === "codex"
            ? "codex"
            : "cursor"
      }
      expired={params.state === "expired"}
    />
  );
}
