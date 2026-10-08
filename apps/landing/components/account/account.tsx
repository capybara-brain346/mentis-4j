"use client";

import {
  ArrowRight,
  Cable,
  Check,
  Fingerprint,
  LockKeyhole,
  LogOut,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyButton, GoogleMark } from "@/components/account/shared";
import { Button } from "@/components/ui/button";
import { accountInitials, useAccount } from "@/lib/account";

export function AccountView() {
  const { connections, account } = useAccount();
  if (!account) return null;
  const count = connections.filter(
    (client) => client.status === "active",
  ).length;
  return (
    <>
      <div className="page-heading">
        <h1>Your account</h1>
        <p>Your identity, workspace, and agent access in one place.</p>
      </div>
      <section className="profile-summary" aria-label="Google account">
        <span className="profile-avatar">{accountInitials(account.name)}</span>
        <div>
          <h2>{account.name}</h2>
          <p>{account.email}</p>
          <span className="identity-provider">
            <GoogleMark /> Signed in with Google{" "}
            <Check size={14} aria-hidden="true" />
          </span>
        </div>
        <span className="status-badge active">Active account</span>
      </section>
      <section className="settings-section">
        <div className="section-heading">
          <h2>Account details</h2>
          <p>Your profile comes from your Google account.</p>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Display name</dt>
            <dd>{account.name}</dd>
          </div>
          <div>
            <dt>Email address</dt>
            <dd>
              {account.email}
              <span className="verified-label">
                <ShieldCheck size={14} aria-hidden="true" /> Verified
              </span>
            </dd>
          </div>
          <div>
            <dt>Sign-in method</dt>
            <dd>
              <GoogleMark /> Google
            </dd>
          </div>
        </dl>
        <p className="section-note">
          To change your name or email, update your Google account.
        </p>
      </section>
      <section className="settings-section">
        <div className="section-heading">
          <h2>Your workspace</h2>
          <p>Each account has one private workspace.</p>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Workspace name</dt>
            <dd>{account.workspace}</dd>
          </div>
          <div>
            <dt>Workspace ID</dt>
            <dd>
              <code>{account.workspaceId}</code>
              <CopyButton value={account.workspaceId} label="Copy ID" />
            </dd>
          </div>
          <div>
            <dt>Visibility</dt>
            <dd>
              <LockKeyhole size={15} aria-hidden="true" /> Private to your
              account
            </dd>
          </div>
        </dl>
      </section>
      <section className="connected-summary">
        <Cable size={22} aria-hidden="true" />
        <div>
          <h2>
            {count === 0
              ? "No clients have access"
              : `${count} connected ${count === 1 ? "client" : "clients"}`}
          </h2>
          <p>
            Review which coding agents can read, write, and delete your memory.
          </p>
        </div>
        <Button asChild variant="outline" className="account-button">
          <Link href="/connections">
            Manage clients <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
    </>
  );
}

export function SecurityView() {
  const session = useAccount();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  if (!session.account) return null;
  async function signOut() {
    try {
      await session.signOut();
      router.push("/sign-in");
    } catch {
      // The account provider shows the failure and keeps the current session.
    }
  }
  return (
    <>
      <div className="page-heading">
        <h1>Security</h1>
        <p>Understand how sign-in and client access work.</p>
      </div>
      <section className="settings-section first-section">
        <div className="section-heading">
          <h2>Google sign-in</h2>
          <p>
            Google verifies your identity. Mentis does not store a Google
            password.
          </p>
        </div>
        <div className="security-method">
          <GoogleMark />
          <div>
            <strong>{session.account.email}</strong>
            <span>Your account’s sign-in method</span>
          </div>
          <span className="verified-label">
            <ShieldCheck size={15} aria-hidden="true" /> Verified
          </span>
        </div>
      </section>
      <section className="settings-section">
        <div className="section-heading">
          <h2>Browser session</h2>
          <p>
            Signing out ends this browser session. Connected clients keep their
            access.
          </p>
        </div>
        <div className="session-row">
          <Monitor size={23} aria-hidden="true" />
          <div>
            <strong>This browser</strong>
            <span>
              {session.isPreview
                ? "Example session · No live authentication"
                : `Session ends ${new Date(session.account.expiresAt ?? "").toLocaleString()}`}
            </span>
          </div>
          <span className="status-badge active">Current</span>
        </div>
        {confirm ? (
          <div
            className="inline-confirm"
            role="group"
            aria-label="Confirm sign-out"
          >
            <p>
              Sign out of this {session.isPreview ? "preview" : "browser"}?
              Connected clients will keep their access.
            </p>
            <div>
              <Button
                variant="secondary"
                className="account-button"
                onClick={() => setConfirm(false)}
              >
                Keep session
              </Button>
              <Button
                className="account-button"
                onClick={signOut}
                disabled={session.busy}
              >
                {session.busy
                  ? "Signing out…"
                  : session.isPreview
                    ? "Sign out of preview"
                    : "Sign out"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="account-button"
            onClick={() => setConfirm(true)}
          >
            <LogOut aria-hidden="true" /> Sign out of this browser
          </Button>
        )}
      </section>
      <section className="settings-section">
        <div className="section-heading">
          <h2>MCP access</h2>
          <p>
            Each client receives access to this workspace after you approve it.
          </p>
        </div>
        <div className="security-facts">
          <div>
            <Fingerprint size={20} aria-hidden="true" />
            <div>
              <h3>Short access tokens</h3>
              <p>
                An access token lasts 10 minutes. A client can refresh access
                within its grant period.
              </p>
            </div>
          </div>
          <div>
            <Cable size={20} aria-hidden="true" />
            <div>
              <h3>Seven-day grant period</h3>
              <p>
                The period starts at the first token exchange. Refreshing a
                token does not extend it.
              </p>
            </div>
          </div>
          <div>
            <LockKeyhole size={20} aria-hidden="true" />
            <div>
              <h3>Disconnect when needed</h3>
              <p>
                Disconnect a client to stop its future access and token refresh.
                This does not delete your stored memory.
              </p>
            </div>
          </div>
        </div>
        <Link href="/connections" className="text-action">
          Manage connected clients <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}
