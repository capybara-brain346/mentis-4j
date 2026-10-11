"use client";

import { ArrowRight, LockKeyhole, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/account/shared";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/account";

export function AccountShell({ children }: { children: React.ReactNode }) {
  const session = useAccount();
  const account = session.account;
  const router = useRouter();
  async function signOut() {
    try {
      await session.signOut();
      router.push("/sign-in");
    } catch {
      // The account provider shows the failure and keeps the current session.
    }
  }
  if (!session.ready)
    return (
      <div
        className="account-ui account-loading"
        role="status"
        aria-label="Loading account"
      >
        <Brand />
        <div className="account-skeleton" />
        <div className="account-skeleton short" />
        <span>Loading account…</span>
      </div>
    );
  if (!account)
    return (
      <div className="account-ui account-gate">
        <Brand />
        <main>
          <LockKeyhole size={28} aria-hidden="true" />
          <h1>Sign in to Mentis.</h1>
          <p>Sign in to view your connected clients.</p>
          {session.error && (
            <div className="inline-alert" role="alert">
              {session.error}
              <Button variant="outline" onClick={() => void session.refresh()}>
                Try again
              </Button>
            </div>
          )}
          <Button asChild className="account-button">
            <Link href="/sign-in">
              Go to sign-in <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </main>
      </div>
    );
  return (
    <div className="account-ui console-layout">
      <a href="#main-content" className="account-skip">
        Skip to content
      </a>
      <header className="console-topbar">
        <Brand />
        <div className="console-identity">
          <span>{account.name}</span>
          <Button
            variant="ghost"
            className="account-button"
            onClick={signOut}
            disabled={session.busy}
          >
            <LogOut size={17} aria-hidden="true" /> Sign out
          </Button>
        </div>
      </header>
      <div className="console-body">
        {session.error && (
          <div className="inline-alert" role="alert">
            {session.error}
          </div>
        )}
        <main id="main-content" className="console-main">
          {children}
        </main>
      </div>
    </div>
  );
}
