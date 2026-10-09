"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FilePenLine,
  Search,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ClientMark } from "@/components/account/client-mark";
import { AccessFrame, GoogleMark } from "@/components/account/shared";
import { Button } from "@/components/ui/button";
import {
  type ClientId,
  previewAccount,
  useAccountPreview,
} from "@/lib/account-preview";

const clientNames: Record<ClientId, string> = {
  cursor: "Cursor",
  claude: "Claude Code",
  codex: "Codex",
};

export function ConsentView({
  isPreview,
  clientId,
  expired,
}: {
  isPreview: boolean;
  clientId: ClientId;
  expired: boolean;
}) {
  const preview = useAccountPreview();
  const [step, setStep] = useState<
    "review" | "sign-in" | "complete" | "denied"
  >("review");
  const [signInError, setSignInError] = useState(false);
  const name = clientNames[clientId];
  function allow() {
    if (preview.enabled) {
      preview.connect(clientId);
      setStep("complete");
    } else setStep("sign-in");
  }
  function finishPreview() {
    preview.start();
    preview.connect(clientId);
    setStep("complete");
  }
  return (
    <AccessFrame>
      <main id="main-content" className="consent-main">
        {isPreview && (
          <div className="consent-preview-label">
            UI preview · No access tokens are issued
          </div>
        )}
        <section className="consent-panel">
          {!isPreview || expired ? (
            <div className="consent-result">
              <Clock3 size={35} aria-hidden="true" />
              <h1>
                {expired
                  ? "This request has expired."
                  : "Start from your MCP client."}
              </h1>
              <p>
                {expired
                  ? "Return to your coding agent and start a new connection request."
                  : "This landing app cannot process live OAuth requests. Start sign-in from a client connected to your Mentis server."}
              </p>
              <Button asChild className="account-button">
                <Link href="/authorize?preview=1&client=cursor">
                  Preview a consent request <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Link href="/connections" className="subtle-link">
                Go to connected clients
              </Link>
            </div>
          ) : step === "complete" ? (
            <div className="consent-result">
              <CheckCircle2
                size={39}
                className="result-success"
                aria-hidden="true"
              />
              <h1>{name} is connected.</h1>
              <p>
                The example client now has access to your example workspace. In
                the live flow, Mentis returns you to your coding agent.
              </p>
              <div className="result-account">
                <span className="account-avatar">AM</span>
                <div>
                  <strong>{previewAccount.name}</strong>
                  <span>{previewAccount.email}</span>
                </div>
                <Check size={17} aria-hidden="true" />
              </div>
              <Button asChild className="account-button">
                <Link href="/connections">
                  View connected clients <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <p className="result-note">
                Preview only. No Google sign-in or token exchange occurred.
              </p>
            </div>
          ) : step === "denied" ? (
            <div className="consent-result">
              <XCircle size={38} aria-hidden="true" />
              <h1>Access was not granted.</h1>
              <p>
                {name} has not received any new access to your workspace. You
                can close this page or review the request again.
              </p>
              <Button
                variant="secondary"
                className="account-button"
                onClick={() => setStep("review")}
              >
                <ArrowLeft aria-hidden="true" /> Review request
              </Button>
              <Link href="/connections" className="subtle-link">
                Go to connected clients
              </Link>
            </div>
          ) : step === "sign-in" ? (
            <div className="consent-sign-in">
              <div className="consent-app-link">
                <ClientMark name={name} />
                <ArrowRight size={20} aria-hidden="true" />
                <ShieldCheck size={29} aria-hidden="true" />
              </div>
              <h1>Continue with your account.</h1>
              <p>
                You approved {name}’s request. Sign in with Google to choose the
                account and workspace for this connection.
              </p>
              <Button
                variant="outline"
                className="google-button"
                onClick={() => setSignInError(true)}
              >
                <GoogleMark /> Continue with Google{" "}
                <ArrowRight aria-hidden="true" />
              </Button>
              {signInError && (
                <div className="inline-alert" role="alert">
                  <CircleAlert size={18} aria-hidden="true" />
                  <p>
                    Google sign-in is not connected to this UI preview. Use the
                    example account below.
                  </p>
                </div>
              )}
              <Button className="account-button" onClick={finishPreview}>
                Continue with example account <ArrowRight aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                className="account-button"
                onClick={() => setStep("denied")}
              >
                Cancel connection
              </Button>
            </div>
          ) : (
            <>
              <div className="consent-app-link">
                <ClientMark name={name} />
                <span className="consent-link-line" />
                <ShieldCheck size={30} aria-hidden="true" />
              </div>
              <h1>Allow {name} to use Mentis?</h1>
              <p className="consent-intro">
                Give this coding agent access to the memory in your private
                workspace.
              </p>
              <div className="consent-account">
                {preview.enabled ? (
                  <>
                    <span className="account-avatar">AM</span>
                    <div>
                      <strong>{previewAccount.name}</strong>
                      <span>{previewAccount.email}</span>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/sign-in">Switch account</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <GoogleMark />
                    <p>
                      After approval, continue to Google sign-in. Access applies
                      to the account you select.
                    </p>
                  </>
                )}
              </div>
              <h2>This client will be able to</h2>
              <ul className="consent-permissions">
                <li>
                  <Search size={20} aria-hidden="true" />
                  <div>
                    <strong>Search and read memory</strong>
                    <span>
                      Find related tasks and inspect recorded attempts.
                    </span>
                  </div>
                  <Check size={16} aria-hidden="true" />
                </li>
                <li>
                  <FilePenLine size={20} aria-hidden="true" />
                  <div>
                    <strong>Write and update memory</strong>
                    <span>
                      Record attempts and mark conclusions as outdated.
                    </span>
                  </div>
                  <Check size={16} aria-hidden="true" />
                </li>
                <li>
                  <Trash2 size={20} aria-hidden="true" />
                  <div>
                    <strong>Delete memory</strong>
                    <span>Remove attempts from the live workspace graph.</span>
                  </div>
                  <Check size={16} aria-hidden="true" />
                </li>
              </ul>
              <details className="consent-request-details">
                <summary>Client and redirect details</summary>
                <dl>
                  <div>
                    <dt>Client name</dt>
                    <dd>
                      {name}{" "}
                      <span>
                        Example self-registered client; name is not verified.
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Redirect host</dt>
                    <dd>
                      <code>127.0.0.1</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Requested scopes</dt>
                    <dd>
                      <code>mcp</code>{" "}
                      <span>
                        Example scope. All listed operations are included.
                      </span>
                    </dd>
                  </div>
                </dl>
              </details>
              <div className="consent-warning">
                <CircleAlert size={18} aria-hidden="true" />
                <p>
                  This example sends access to an app on your computer. Continue
                  only if you started sign-in from that app.
                </p>
              </div>
              <p className="consent-expiry">
                <Clock3 size={16} aria-hidden="true" /> Access lasts seven days
                from the first token exchange. Disconnect the client at any
                time.
              </p>
              <div className="consent-actions">
                <Button
                  variant="secondary"
                  className="account-button"
                  onClick={() => setStep("denied")}
                >
                  Cancel
                </Button>
                <Button
                  className="account-button"
                  onClick={allow}
                  disabled={!preview.ready}
                >
                  {preview.enabled ? "Allow access" : "Allow and continue"}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
              <p className="consent-end-note">
                Only allow clients you trust.{" "}
                <Link href="/connections">Manage connected clients</Link>
              </p>
            </>
          )}
        </section>
      </main>
    </AccessFrame>
  );
}
