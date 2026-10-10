"use client";

import {
  ArrowRight,
  Check,
  CircleAlert,
  ExternalLink,
  LockKeyhole,
} from "lucide-react";
import Image from "next/image";
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
          <h1>
            A little memory.
            <br />A better next step.
          </h1>
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
        <aside
          className="sign-in-scene"
          aria-label="Mentis workspace introduction"
        >
          <Image
            src="/images/valley.webp"
            alt="A painted mountain valley with a river and forest"
            fill
            priority
            sizes="(max-width: 800px) 100vw, 50vw"
          />
          <div className="scene-caption">
            <span className="scene-caption-title">
              Keep the evidence.
              <br />
              Carry it forward.
            </span>
            <p>
              A private place for what your agent tried, observed, and learned.
            </p>
            <div>
              <Check size={16} aria-hidden="true" /> One account. One private
              workspace.
            </div>
          </div>
        </aside>
      </main>
    </AccessFrame>
  );
}
