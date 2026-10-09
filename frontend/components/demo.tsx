"use client";

import {
  Check,
  CircleCheck,
  FileCode2,
  GitBranch,
  Pause,
  Play,
  Search,
  X,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  exampleRepository,
  exampleSearch,
  failedAttempt,
  passedAttempt,
} from "@/lib/demo";
import { PUBLIC_CONFIG } from "../../src/config/config.ts";
import type { RecordAttemptInput } from "../../src/lib/graph";

function subscribeToMotion(callback: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export function Status({
  result,
}: {
  result: "passed" | "failed" | "unverified";
}) {
  return (
    <span className={`status status-${result}`}>
      {result === "passed" ? (
        <Check size={13} aria-hidden="true" />
      ) : result === "failed" ? (
        <X size={13} aria-hidden="true" />
      ) : null}
      {result === "passed"
        ? "Check passed"
        : result === "failed"
          ? "Check failed"
          : "Unverified"}
    </span>
  );
}

export function RecordFields({ attempt }: { attempt: RecordAttemptInput }) {
  return (
    <dl className="record-fields">
      <div>
        <dt>Action</dt>
        <dd>{attempt.action}</dd>
      </div>
      <div>
        <dt>Observation</dt>
        <dd>{attempt.observation}</dd>
      </div>
      <div>
        <dt>Inference</dt>
        <dd>{attempt.inference ?? "No inference recorded"}</dd>
      </div>
      <div>
        <dt>Check</dt>
        <dd>
          <span>{attempt.check?.method ?? "No check recorded"}</span>
          <Status result={attempt.check?.result ?? "unverified"} />
        </dd>
      </div>
    </dl>
  );
}

export function AttemptHistory() {
  return (
    <ol className="attempt-history">
      <li>
        <div className="history-heading">
          <span>Change the login redirect</span>
          <Status result="failed" />
        </div>
        <p>{failedAttempt.observation}.</p>
        <div className="git-state">
          <GitBranch size={13} aria-hidden="true" />
          <code>a8c3f2</code>
          <span>Uncommitted changes</span>
        </div>
      </li>
      <li>
        <div className="history-heading">
          <span>Retain the session cookie</span>
          <Status result="passed" />
        </div>
        <p>{passedAttempt.observation}.</p>
        <div className="git-state">
          <GitBranch size={13} aria-hidden="true" />
          <span>Git state not reported</span>
        </div>
      </li>
    </ol>
  );
}

export function SearchResult() {
  return (
    <div className="search-result">
      <div className="result-top">
        <FileCode2 size={17} aria-hidden="true" />
        <span>Related task</span>
        <span className="result-score">Similarity 0.92</span>
      </div>
      <h3>Login cookie investigation</h3>
      <p>{passedAttempt.observation}.</p>
      <div className="result-bottom">
        <code>src/Login.tsx</code>
        <Status result="passed" />
      </div>
      <p className="result-note">
        Example score. Similarity does not show success.
      </p>
    </div>
  );
}

export function Demo() {
  const [stage, setStage] = useState("record");
  const [paused, setPaused] = useState(true);
  const [selected, setSelected] = useState<"failed" | "passed">("failed");
  const reducedMotion = useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setInterval(
      () =>
        setStage((current) =>
          current === "record"
            ? "find"
            : current === "find"
              ? "inspect"
              : "record",
        ),
      PUBLIC_CONFIG.frontend.demoIntervalMs,
    );
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  return (
    <div
      className="demo-window"
      role="group"
      aria-label="Mentis product demonstration"
    >
      <header className="demo-heading">
        <div>
          <h2>Login cookie investigation</h2>
          <p className="demo-repository">{exampleRepository}</p>
        </div>
        <span className="demo-label">Demonstration data</span>
      </header>
      <div className="demo-layout">
        <Tabs
          value={stage}
          onValueChange={(value) => {
            setStage(value);
            setPaused(true);
          }}
          className="demo-tabs"
        >
          <div className="demo-toolbar">
            <TabsList
              className="demo-tab-list"
              aria-label="Demonstration steps"
            >
              <TabsTrigger value="record">Record</TabsTrigger>
              <TabsTrigger value="find">Find</TabsTrigger>
              <TabsTrigger value="inspect">Inspect</TabsTrigger>
            </TabsList>
            <Button
              variant="ghost"
              size="icon"
              className="play-control"
              disabled={reducedMotion}
              aria-label={
                reducedMotion
                  ? "Playback disabled by reduced motion preference"
                  : paused
                    ? "Play demo"
                    : "Pause demo"
              }
              title={
                reducedMotion
                  ? "Use the tabs with reduced motion"
                  : paused
                    ? "Play demo"
                    : "Pause demo"
              }
              onClick={() => setPaused(!paused)}
            >
              {paused || reducedMotion ? (
                <Play aria-hidden="true" size={14} />
              ) : (
                <Pause aria-hidden="true" size={14} />
              )}
            </Button>
          </div>
          <TabsContent value="record" className="demo-content">
            <div className="tool-call">
              <code>record_attempt</code>
              <span>New attempt</span>
            </div>
            <h2>Compare the two attempts.</h2>
            <div
              className="attempt-choices"
              role="group"
              aria-label="Select an attempt"
            >
              <Button
                variant="ghost"
                className="attempt-choice"
                aria-pressed={selected === "failed"}
                onClick={() => setSelected("failed")}
              >
                <span>Change the login redirect</span>
                <Status result="failed" />
              </Button>
              <Button
                variant="ghost"
                className="attempt-choice"
                aria-pressed={selected === "passed"}
                onClick={() => setSelected("passed")}
              >
                <span>Retain the session cookie</span>
                <Status result="passed" />
              </Button>
            </div>
            <div
              className="selected-evidence"
              role="region"
              aria-label="Selected attempt evidence"
              aria-live="polite"
            >
              <RecordFields
                attempt={selected === "failed" ? failedAttempt : passedAttempt}
              />
            </div>
            <p className="history-note">
              A passed check does not prove the earlier inference. Both records
              remain available.
            </p>
            <footer className="record-confirmation">
              Demonstration data · No database connection
            </footer>
          </TabsContent>
          <TabsContent value="find" className="demo-content">
            <div className="tool-call">
              <code>search</code>
              <span>One repository</span>
            </div>
            <h2>Find the related investigation.</h2>
            <div className="example-query">
              <Search size={16} aria-hidden="true" />
              <span>{exampleSearch.query}</span>
            </div>
            <SearchResult />
          </TabsContent>
          <TabsContent value="inspect" className="demo-content">
            <div className="tool-call">
              <code>recall</code>
              <span>Task history</span>
            </div>
            <h2>See what each attempt found.</h2>
            <AttemptHistory />
            <p className="history-note">Git state is reported by the agent.</p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
