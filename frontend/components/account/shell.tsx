"use client";

import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Cable,
  FlaskConical,
  LockKeyhole,
  LogOut,
  PanelLeft,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Brand, PreviewNotice } from "@/components/account/shared";
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
import { useAccountPreview } from "@/lib/account-preview";

const links = [
  { href: "/account", title: "Account", icon: UserRound },
  { href: "/connections", title: "Connected clients", icon: Cable },
  { href: "/account/security", title: "Security", icon: LockKeyhole },
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
  const preview = useAccountPreview();
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
          <h1>Your workspace starts here.</h1>
          <p>Sign in to view your account and connected clients.</p>
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
          <Button
            variant="secondary"
            className="account-button"
            onClick={preview.start}
          >
            <FlaskConical aria-hidden="true" /> Open workspace preview
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
        <div className="workspace-switch">
          <span className="workspace-avatar">
            {accountInitials(account.name)}
          </span>
          <div>
            <strong>Personal workspace</strong>
            <span>
              {session.isPreview
                ? "Private · Example account"
                : "Private · Google account"}
            </span>
          </div>
        </div>
        <AccountNav />
        <div className="sidebar-bottom">
          <Link href="/#setup">
            <BookOpen size={17} aria-hidden="true" /> Setup guide{" "}
            <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
          <div className="sidebar-identity">
            <span className="account-avatar">
              {accountInitials(account.name)}
            </span>
            <div>
              <strong>{account.name}</strong>
              <span>Google account</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              disabled={session.busy}
              aria-label={
                session.isPreview ? "Sign out of preview" : "Sign out"
              }
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
                <SheetTitle>Mentis account</SheetTitle>
                <SheetDescription>
                  Personal workspace{session.isPreview ? " · UI preview" : ""}
                </SheetDescription>
              </SheetHeader>
              <AccountNav mobile />
              <Button variant="ghost" onClick={signOut} disabled={session.busy}>
                <LogOut aria-hidden="true" />{" "}
                {session.isPreview ? "Sign out of preview" : "Sign out"}
              </Button>
            </SheetContent>
          </Sheet>
          <div className="console-breadcrumb">
            Personal workspace <span>/</span>
            <strong>
              {links.find((link) => link.href === path)?.title ?? "Account"}
            </strong>
          </div>
          <span className="private-label">
            <LockKeyhole size={13} aria-hidden="true" /> Private workspace
          </span>
        </header>
        {session.isPreview && <PreviewNotice />}
        {session.error && (
          <div className="inline-alert" role="alert">
            {session.error}
          </div>
        )}
        <main id="main-content" className="console-main">
          {children}
        </main>
        <footer className="console-footer">
          <span>Memory for your coding agent.</span>
          <Link href="/">
            mentis <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </div>
  );
}
