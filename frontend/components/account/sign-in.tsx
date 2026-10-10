"use client";

import { ArrowRight, CircleAlert } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { AccessFrame, GoogleMark } from "@/components/account/shared";
import { Button } from "@/components/ui/button";

export function SignInView({ error = "" }: { error?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <AccessFrame>
      <main className="sign-in-layout" id="main-content">
        <section className="sign-in-form">
          <h1>
            A little memory.
            <br />A better next step.
          </h1>
          <p className="sign-in-intro">
            Sign in to connect your coding agents and manage their access.
          </p>
          <Button
            className="google-button"
            variant="outline"
            disabled={pending}
            onClick={() => {
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
                <p>Try again.</p>
              </div>
            </div>
          )}
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
            <p>Keep what your agent tried, observed, and checked.</p>
          </div>
        </aside>
      </main>
    </AccessFrame>
  );
}
