import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import Image from "next/image";
import { Corrections } from "@/components/corrections";
import { Demo } from "@/components/demo";
import { Navigation } from "@/components/navigation";
import { Setup } from "@/components/setup";
import { Button } from "@/components/ui/button";
import { sourceUrl } from "@/lib/demo";

export default function Home() {
  return (
    <div id="top">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Navigation />
      <main id="main">
        <section className="hero container" aria-labelledby="hero-heading">
          <div className="hero-copy">
            <h1 id="hero-heading">
              Keep the evidence
              <br />
              for the next attempt.
            </h1>
            <p>
              Record coding attempts. Find related tasks.
              <br className="desktop-break" />
              Inspect what happened.
            </p>
            <div className="hero-actions">
              <Button asChild className="pill">
                <a href="#setup">
                  Connect your agent <ArrowDown size={16} aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="secondary" className="pill">
                <a href={sourceUrl}>
                  View source <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>
          <div className="hero-stage">
            <Demo />
          </div>
          <div className="hero-caption">
            <span>A task. Every attempt. The evidence.</span>
            <span>Local demonstration data. No database connection.</span>
          </div>
        </section>

        <section
          id="how-it-works"
          className="how-intro container"
          aria-labelledby="how-heading"
        >
          <h2 id="how-heading">A failed check stays in the record.</h2>
          <div>
            <p>
              For this login task, the redirect change failed. A later attempt
              retained the session cookie and passed its browser check. Select
              an attempt above to inspect its evidence.
            </p>
            <p>
              Observation and inference remain separate. A missing check is
              unverified. Search requires a repository; similarity does not show
              success.
            </p>
            <a
              className="text-link"
              href={`${sourceUrl}/blob/main/src/lib/tools.ts`}
            >
              Read the tool contracts{" "}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section
          className="correction-section container"
          aria-labelledby="correct-heading"
        >
          <div className="feature-copy">
            <h2 id="correct-heading">
              Correct a conclusion.
              <br />
              Keep its evidence.
            </h2>
            <p>
              Mark an inference outdated when new evidence changes it. The
              original action, observation, inference, and check remain
              available.
            </p>
            <p>
              Need to remove an attempt? Forget removes that attempt and its
              embedding from the live graph. Other attempts remain. Prior
              responses and backups are not removed.
            </p>
          </div>
          <Corrections />
        </section>

        <section
          id="setup"
          className="setup-section"
          aria-labelledby="setup-heading"
        >
          <div className="container setup-layout">
            <div className="setup-copy">
              <h2 id="setup-heading">
                Give your agent
                <br />a memory.
              </h2>
              <p>Connect your coding agent to the hosted Mentis Worker.</p>
              <ul className="requirements">
                <li>A trusted MCP client with HTTP and OAuth support</li>
                <li>A Google account</li>
              </ul>
              <p className="setup-note">
                Search queries and attempt text go to OpenRouter. Keep secrets
                out of records. Use recall with trusted agents.
              </p>
              <a className="text-link" href={sourceUrl}>
                Open the repository{" "}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
            <Setup />
          </div>
        </section>

        <section className="closing container">
          <h2>
            The next attempt
            <br />
            starts with what you know.
          </h2>
          <Button asChild className="pill">
            <a href="#setup">
              Get started <ArrowRight size={16} aria-hidden="true" />
            </a>
          </Button>
        </section>
      </main>
      <footer className="site-footer">
        <div className="container footer-top">
          <a href="#top" className="wordmark">
            <Image
              src="/images/mentis-logo.png"
              alt=""
              width={32}
              height={32}
            />
            <span>mentis</span>
          </a>
          <p>Memory for your coding agent.</p>
          <nav aria-label="Footer navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#setup">Setup</a>
            <a href={sourceUrl}>
              View source <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </nav>
        </div>
        <div className="container footer-bottom">
          <span>Built around the evidence.</span>
          <span>Next.js · Neo4j · MCP</span>
        </div>
      </footer>
    </div>
  );
}
