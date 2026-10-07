import Image from "next/image";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileCode2,
  GitBranch,
  Network,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navigation } from "@/components/navigation";
import {
  AttemptHistory,
  Demo,
  RecordFields,
  SearchResult,
} from "@/components/demo";
import { Corrections } from "@/components/corrections";
import { Setup } from "@/components/setup";
import { exampleSearch, sourceUrl } from "@/lib/demo";

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
              Record coding attempts. Find related tasks.
              <br className="desktop-break" />
              Inspect what happened.
            </p>
            <div className="hero-actions">
              <Button asChild className="pill">
                <a href="#setup">
                  Get started <ArrowDown size={16} aria-hidden="true" />
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
            <Image
              src="/images/valley.webp"
              alt=""
              fill
              priority
              sizes="(max-width: 700px) 100vw, 1300px"
              className="stage-image"
            />
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
          <h2 id="how-heading">
            Give the next attempt
            <br />a place to start.
          </h2>
          <p>
            A coding task has a history. Mentis keeps the actions, observations,
            and checks together, so your agent can inspect the work that came
            before.
          </p>
        </section>

        <section
          id="record"
          className="feature container"
          aria-labelledby="record-heading"
        >
          <div className="feature-copy">
            <h2 id="record-heading">
              Record the attempt.
              <br />
              Keep the evidence.
            </h2>
            <p>
              Store what the agent did and what it observed. Keep its inference
              separate. Add the result of the check that actually ran.
            </p>
            <p>A check that did not run is unverified.</p>
            <a className="text-link" href="#setup">
              Start recording <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="feature-visual record-visual">
            <Image
              src="/images/layers.webp"
              alt="Painted layers of amber and stone beside a green river."
              fill
              sizes="(max-width: 800px) 100vw, 850px"
              className="stage-image"
            />
            <div className="record-mini product-surface">
              <div className="mini-title">
                <FileCode2 size={15} aria-hidden="true" />
                <code>record_attempt</code>
              </div>
              <RecordFields compact />
              <div className="mini-footer">
                <Check size={14} aria-hidden="true" />
                Demonstration data
              </div>
            </div>
          </div>
        </section>

        <section
          id="find"
          className="feature feature-reversed container"
          aria-labelledby="find-heading"
        >
          <div className="feature-copy">
            <h2 id="find-heading">
              Find related work.
              <br />
              Within your repository.
            </h2>
            <p>
              Search with the problem you have now. Mentis returns related tasks
              from the repository you specify.
            </p>
            <p>
              A similar attempt can contain a failed check. Inspect its history
              before you use the conclusion.
            </p>
            <a className="text-link" href="#inspect">
              See the attempt history{" "}
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="feature-visual find-visual">
            <div className="search-mini product-surface">
              <div className="mini-title">
                <Search size={15} aria-hidden="true" />
                <code>search</code>
              </div>
              <div className="search-repository">
                <GitBranch size={14} aria-hidden="true" />
                <span>example / river-app</span>
              </div>
              <p className="search-query">{exampleSearch.query}</p>
              <SearchResult />
              <div className="mini-footer">Demonstration data</div>
            </div>
            <div
              className="task-graph"
              aria-label="One repository contains a task with two attempts"
            >
              <div className="graph-node">
                <Network size={17} aria-hidden="true" />
                <span>Repository</span>
              </div>
              <div className="graph-connector" />
              <div className="graph-node">
                <FileCode2 size={17} aria-hidden="true" />
                <span>Task</span>
              </div>
              <div className="graph-connector" />
              <div className="graph-attempts">
                <span>Failed attempt</span>
                <span>Passed attempt</span>
              </div>
            </div>
          </div>
        </section>

        <section
          id="inspect"
          className="feature container"
          aria-labelledby="inspect-heading"
        >
          <div className="feature-copy">
            <h2 id="inspect-heading">
              Inspect what happened.
              <br />
              Including what failed.
            </h2>
            <p>
              Use recall to read a task&apos;s attempts. See the action,
              observation, check result, and the Git state reported by the
              agent.
            </p>
            <p>The evidence stays available, even when an attempt fails.</p>
            <a
              className="text-link"
              href={`${sourceUrl}/blob/main/src/lib/tools.ts`}
            >
              Read the tool contracts{" "}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="feature-visual inspect-visual">
            <Image
              src="/images/strata.webp"
              alt="A painted amber seam runs through layers of stone beside a river."
              fill
              sizes="(max-width: 800px) 100vw, 850px"
              className="stage-image"
            />
            <div className="history-mini product-surface">
              <div className="mini-title">
                <GitBranch size={15} aria-hidden="true" />
                <code>recall</code>
              </div>
              <h3>Login cookie investigation</h3>
              <AttemptHistory />
              <div className="mini-footer">
                Demonstration data · Agent-reported Git state
              </div>
            </div>
          </div>
        </section>

        <section
          className="correction-section container"
          aria-labelledby="correct-heading"
        >
          <div className="feature-copy">
            <h2 id="correct-heading">
              Let a conclusion change.
              <br />
              Keep the original evidence.
            </h2>
            <p>
              Mark an inference outdated when new evidence changes it. The
              original action, observation, inference, and check remain
              available.
            </p>
            <p>
              Need to remove an attempt? Forget removes that attempt and its
              embedding from the live graph. Other attempts remain.
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
              <p>Run Mentis locally. Connect your coding agent through MCP.</p>
              <ul className="requirements">
                <li>Node.js 22 or later</li>
                <li>Docker Compose and Neo4j</li>
                <li>An OpenRouter API key</li>
                <li>A trusted MCP client</li>
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
            <Network size={25} aria-hidden="true" />
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
