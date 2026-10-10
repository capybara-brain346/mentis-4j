"use client";

import {
  ArrowRight,
  Cable,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  PanelLeft,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Brand } from "@/components/account/shared";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { accountInitials, useAccount } from "@/lib/account";

const links = [
  { href: "/dashboard", title: "Dashboard", icon: LayoutDashboard },
  { href: "/connections", title: "Connected clients", icon: Cable },
];

function AccountNav({ mobile = false }: { mobile?: boolean }) {
  const path = usePathname();
  return (
    <nav
      className="account-nav"
      aria-label={mobile ? "Mobile account navigation" : "Account navigation"}
    >
      {links.map(({ href, title, icon: Icon }) => {
        const link = (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
          >
            <Icon size={18} aria-hidden="true" />
            {title}
          </Link>
        );
        return mobile ? (
          <SheetClose key={href} asChild>
            {link}
          </SheetClose>
        ) : (
          link
        );
      })}
    </nav>
  );
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  const session = useAccount();
  const account = session.account;
  const router = useRouter();
  const path = usePathname();
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
          <p>Sign in to view your dashboard and connected clients.</p>
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
      <aside className="console-sidebar">
        <Brand />
        <AccountNav />
        <div className="sidebar-bottom">
          <div className="sidebar-identity">
            <span className="account-avatar">
              {accountInitials(account.name)}
            </span>
            <div>
              <strong>{account.name}</strong>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              disabled={session.busy}
              aria-label="Sign out"
            >
              <LogOut size={17} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </aside>
      <div className="console-body">
        <header className="console-topbar">
          <div className="console-mobile-brand">
            <Brand />
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="console-mobile-menu"
                aria-label="Open account navigation"
              >
                <PanelLeft aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="account-ui account-mobile-sheet"
            >
              <SheetHeader>
                <SheetTitle>Dashboard</SheetTitle>
                <SheetDescription>
                  Dashboard and connected clients
                </SheetDescription>
              </SheetHeader>
              <AccountNav mobile />
              <Button variant="ghost" onClick={signOut} disabled={session.busy}>
                <LogOut aria-hidden="true" /> Sign out
              </Button>
            </SheetContent>
          </Sheet>
          <div className="console-breadcrumb">
            <strong>
              {links.find((link) => link.href === path)?.title ?? "Dashboard"}
            </strong>
          </div>
        </header>
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
