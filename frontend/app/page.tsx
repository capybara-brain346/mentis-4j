import { ArrowDown } from "lucide-react";
import Image from "next/image";
import { Demo } from "@/components/demo";
import { MemoryGraph } from "@/components/memory-graph";
import { Navigation } from "@/components/navigation";
import { Setup } from "@/components/setup";
import { Button } from "@/components/ui/button";

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
              Memory for your
              <br />
              coding agent.
            </h1>
            <p>
              Keep what your agent tried, what happened, and which checks
              passed. Mentis gives developers a record of earlier work that
              their agents can use again.
            </p>
            <div className="hero-actions">
              <Button asChild className="pill">
                <a href="#setup">
                  Get started <ArrowDown size={16} aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>
        </section>
        <section
          className="memory-intro container"
          aria-labelledby="memory-heading"
        >
          <div className="how-intro">
            <h2 id="memory-heading">
              Each task has a history.
              <br />
              Each attempt has evidence.
            </h2>
            <p>
              Your agent sends records through MCP. Mentis stores them in Neo4j,
              linked by repository and task. Failed attempts stay beside
              successful ones, so the next agent can see what happened.
            </p>
          </div>
          <MemoryGraph />
          <div className="memory-boundaries">
            <div>
              <h3>What it keeps</h3>
              <p>
                Actions, observations, affected file names, and code context.
                Add an inference, evidence references, Git state, or a check
                result when available. A check that did not run stays
                unverified.
              </p>
            </div>
            <div>
              <h3>What it does not collect</h3>
              <p>
                Mentis does not scan your files or copy your conversation. It
                stores only what your agent sends. Keep secrets out of records.
                Search queries and attempt text go to OpenRouter for search
                processing.
              </p>
            </div>
          </div>
        </section>
        <section
          className="example-section container"
          aria-labelledby="example-heading"
        >
          <div className="example-intro">
            <h2 id="example-heading">
              See the memory
              <br />
              your agent can use.
            </h2>
          </div>
          <div className="hero-stage">
            <Image
              src="/images/valley.webp"
              alt=""
              fill
              sizes="(max-width: 700px) 100vw, 1300px"
              className="stage-image"
            />
            <Demo />
          </div>
        </section>
        <section
          id="setup"
          className="setup-section"
          aria-labelledby="setup-heading"
        >
          <div className="container setup-layout">
            <div className="setup-copy">
              <h2 id="setup-heading">Connect your agent.</h2>
              <p>
                Choose your agent and copy its setup. Sign in with Google when
                you connect. No local server or database is required.
              </p>
            </div>
            <Setup />
          </div>
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
          <p className="creator-credit">
            Built by <a href="https://piyushc.com">Piyush Choudhari</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
