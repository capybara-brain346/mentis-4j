"use client";

import {
  ArrowRight,
  CircleAlert,
  ExternalLink,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccessFrame, GoogleMark } from "@/components/account/shared";
import { Button } from "@/components/ui/button";
import { useAccountPreview } from "@/lib/account-preview";

export function SignInView({ error = "" }: { error?: string }) {
  const preview = useAccountPreview();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  function openPreview() {
    preview.start();
    router.push("/account");
  }
  return (
    <AccessFrame>
      <main className="sign-in-layout" id="main-content">
        <section className="sign-in-form">
          <h1>Sign in to Mentis.</h1>
          <p className="sign-in-intro">
            Sign in to manage your private workspace and the coding agents that
            can use it.
          </p>
          <Button
            className="google-button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              preview.signOut();
              setPending(true);
              window.location.assign("/api/auth/sign-in");
            }}
          >
            <GoogleMark />{" "}
            {pending ? "Opening Google…" : "Continue with Google"}{" "}
            <ArrowRight aria-hidden="true" />
          </Button>
          {error && (
            <div className="inline-alert" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              <div>
                <strong>
                  {error === "cancelled"
                    ? "Sign-in was cancelled."
                    : "Google sign-in could not finish."}
                </strong>
                <p>Try again. The workspace preview does not sign you in.</p>
              </div>
            </div>
          )}
          <p className="sign-in-note">
            <LockKeyhole size={14} aria-hidden="true" /> Google verifies your
            identity. Mentis stores your agent’s memory.
          </p>
          <div className="sign-in-divider" />
          <div className="preview-entry">
            <span>Take a look around</span>
            <p>Use an example account. No Google account is required.</p>
            <Button
              variant="secondary"
              className="account-button"
              onClick={openPreview}
            >
              Open workspace preview <ArrowRight aria-hidden="true" />
            </Button>
          </div>
          <p className="access-help">
            Connecting an MCP client?{" "}
            <Link href="/authorize?preview=1&client=cursor">
              Preview the consent screen{" "}
              <ExternalLink size={12} aria-hidden="true" />
            </Link>
          </p>
        </section>
        <aside className="sign-in-access" aria-label="Workspace access">
          <h2>Your workspace. Your access.</h2>
          <p>
            Google verifies your identity. You choose which coding agents can
            use your memory.
          </p>
          <dl>
            <div>
              <dt>Account</dt>
              <dd>Your Google identity</dd>
            </div>
            <div>
              <dt>Workspace</dt>
              <dd>Private memory for your agents</dd>
            </div>
            <div>
              <dt>Client access</dt>
              <dd>
                Read, write, and delete memory. Review permissions before
                approval.
              </dd>
            </div>
          </dl>
          <p>
            Disconnect a client to stop its access. Stored memory remains in
            Mentis.
          </p>
        </aside>
      </main>
    </AccessFrame>
  );
}
