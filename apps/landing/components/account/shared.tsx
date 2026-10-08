"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccountPreview } from "@/lib/account-preview";

export function Brand() {
  return (
    <Link href="/" className="wordmark" aria-label="Mentis home">
      <Image
        src="/images/mentis-logo.png"
        alt=""
        width={32}
        height={32}
        priority
      />
      <span>mentis</span>
    </Link>
  );
}

export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.5-.1-3-.4-4.5H24v8.5h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.4Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.1-1.8 13.5-5l-6.7-5.2c-1.8 1.2-4.1 2-6.8 2-5.3 0-9.8-3.6-11.4-8.4H5.7v5.3A20.4 20.4 0 0 0 24 44Z"
      />
      <path
        fill="#FBBC05"
        d="M12.6 27.4a12.2 12.2 0 0 1 0-7.8v-5.3H5.7a20 20 0 0 0 0 18.4l6.9-5.3Z"
      />
      <path
        fill="#EA4335"
        d="M24 11.2c3 0 5.6 1 7.7 3l5.8-5.8A19.4 19.4 0 0 0 24 3a20.4 20.4 0 0 0-18.3 11.3l6.9 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z"
      />
    </svg>
  );
}

export function PreviewNotice() {
  const preview = useAccountPreview();
  return (
    <div className="preview-notice">
      <FlaskConical size={15} aria-hidden="true" />
      <span>
        UI preview{" "}
        <span className="preview-notice-detail">
          · Example account and local actions
        </span>
      </span>
      <Link href="/sign-in" onClick={preview.signOut}>
        Exit preview <ArrowUpRight size={13} aria-hidden="true" />
      </Link>
    </div>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [result, setResult] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setResult("copied");
    } catch {
      setResult("error");
    }
  }
  return (
    <div className={`copy-control ${className}`}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copy}
        aria-label={`${label} ${value}`}
      >
        {result === "copied" ? (
          <Check aria-hidden="true" />
        ) : (
          <Copy aria-hidden="true" />
        )}
        {result === "copied" ? "Copied" : label}
      </Button>
      <span
        className={result === "error" ? "field-error" : "sr-only"}
        role="status"
      >
        {result === "error"
          ? "Copy failed. Select and copy the text."
          : result === "copied"
            ? "Copied to clipboard."
            : ""}
      </span>
    </div>
  );
}

export function AccessFooter() {
  return (
    <footer className="access-footer">
      <span>
        <ShieldCheck size={15} aria-hidden="true" /> Your workspace. Your
        access.
      </span>
      <Link href="/">
        Back to Mentis <ArrowUpRight size={13} aria-hidden="true" />
      </Link>
    </footer>
  );
}

export function AccessFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="account-ui access-page">
      <header className="access-header">
        <Brand />
        <Link href="/" className="subtle-link">
          <ArrowLeft size={15} aria-hidden="true" /> Back to home
        </Link>
      </header>
      {children}
      <AccessFooter />
    </div>
  );
}
